// STILL HERE render spike (Story 2.2). Isolated diagnostic page: it proves the VAT figures, haze
// paths and tier invariants. It is not the production renderer (src/render) and owns only this
// page's single requestAnimationFrame loop. The slab below is throwaway inspection geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { tokens } from '../../src/generated/tokens.ts';
import { wrapLoopSeconds } from './vat-core.js';
import { createFigureGeometry, createFigureMaterial, loadVat, verifyGpuSampling } from './vat-gpu.js';
import { HazePass } from './haze-pass.js';

/** Fixed tier table. Only pixel ratio, bloom passes and haze samples/path differ. */
const TIERS = Object.freeze({
  high: Object.freeze({ pixelRatioCap: 2, bloomLevels: 8, hazePath: 'raymarch', hazeSamples: 48 }),
  medium: Object.freeze({ pixelRatioCap: 1.25, bloomLevels: 6, hazePath: 'raymarch', hazeSamples: 28 }),
  low: Object.freeze({ pixelRatioCap: 0.75, bloomLevels: 4, hazePath: 'screen-space-shafts', hazeSamples: 8 }),
});
const CAPACITY = Object.freeze({ standing: 1520, wheelchair: 80 });
const CAMERAS = Object.freeze({ under: -35, level: 5, above: 65 });
const FRAME_CLAMP_SECONDS = 0.1;
const params = new URLSearchParams(location.search);
const seed = Number.parseInt(params.get('seed') ?? '20260924', 10) >>> 0;
const $ = selector => document.querySelector(selector);
if (params.has('clean')) document.body.classList.add('clean');

const api = { ready: false, error: null };
window.vatSpike = api;
const errors = [];
addEventListener('error', event => errors.push(String(event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason)));

function stream(streamSeed) {
  let state = streamSeed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fail(error) {
  api.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  $('#state').textContent = 'Spike failed';
  $('#error').textContent = api.error;
}

try {
  await start();
} catch (error) {
  fail(error);
}

async function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  } catch (error) {
    throw new Error(`WebGL2 unavailable: ${error.message}`, { cause: error });
  }
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(new THREE.Color(tokens.colors.background), 1);
  renderer.debug.checkShaderErrors = true;
  document.body.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const environment = {
    userAgent: navigator.userAgent,
    threeRevision: THREE.REVISION,
    webglVersion: gl.getParameter(gl.VERSION),
    renderer: rendererName,
    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    devicePixelRatio,
    softwareRenderer: /swiftshader|llvmpipe|software|basic render|softpipe/i.test(rendererName),
    automated: navigator.webdriver === true,
  };
  // Software rasterizers (SwiftShader, llvmpipe) can never stand in for target-hardware timing.
  environment.diagnosticOnly = environment.softwareRenderer;

  const vat = await loadVat('/vat/', renderer);
  const { manifest } = vat;
  environment.capabilities = vat.caps;

  // ---- Throwaway slab sized from tokens and the baked figure height ----------------------------
  const light = new THREE.Color(tokens.colors['scene-light']);
  const tone = scale => light.clone().multiplyScalar(scale);
  const figureHeight = manifest.variants.standing.clips['stand-sway'].bounds[1][1];
  const [aspectW, aspectH] = tokens.render['slab-aspect'].split('/').map(Number);
  const shortEdge = figureHeight / Number(tokens.render['figure-height-ratio']);
  const longEdge = shortEdge * aspectW / aspectH;
  const thickness = shortEdge * Number(tokens.render['slab-thickness-ratio']);
  const edgeZ = shortEdge / 2;
  const scene = new THREE.Scene();
  const SLAB_LAYER = 1;
  const steel = new THREE.MeshBasicMaterial({ color: tone(0.018) });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(longEdge, thickness, shortEdge), [steel, steel, new THREE.MeshBasicMaterial({ color: tone(3) }), steel, steel, steel]);
  slab.position.y = -thickness / 2;
  const ribParts = [];
  const seamParts = [];
  const underside = -thickness;
  for (let i = 0; i <= 8; i++) ribParts.push(new THREE.BoxGeometry(0.28, 0.4, shortEdge).translate(-longEdge / 2 + longEdge * i / 8, underside - 0.2, 0));
  for (let j = 0; j <= 4; j++) ribParts.push(new THREE.BoxGeometry(longEdge, 0.3, 0.22).translate(0, underside - 0.15, -edgeZ + shortEdge * j / 4));
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      const cx = -longEdge / 2 + longEdge * (i + 0.5) / 8;
      const cz = -edgeZ + shortEdge * (j + 0.5) / 4;
      seamParts.push(new THREE.BoxGeometry(longEdge / 8 * 0.7, 0.02, 0.05).translate(cx, underside - 0.01, cz - shortEdge / 16));
      seamParts.push(new THREE.BoxGeometry(longEdge / 8 * 0.7, 0.02, 0.05).translate(cx, underside - 0.01, cz + shortEdge / 16));
    }
  }
  const ribs = new THREE.Mesh(mergeGeometries(ribParts), new THREE.MeshBasicMaterial({ color: tone(0.05) }));
  const seams = new THREE.Mesh(mergeGeometries(seamParts), new THREE.MeshBasicMaterial({ color: tone(2.2) }));
  const cableParts = [];
  for (const sx of [-0.42, 0, 0.42]) for (const sz of [-0.46, 0.46]) cableParts.push(new THREE.CylinderGeometry(0.05, 0.05, 90, 6).translate(sx * longEdge, 45, sz * shortEdge));
  const cables = new THREE.Mesh(mergeGeometries(cableParts), new THREE.MeshBasicMaterial({ color: tone(0.06) }));
  for (const object of [slab, ribs, seams, cables]) {
    object.layers.enable(SLAB_LAYER);
    scene.add(object);
  }

  // ---- Figures: exactly two instanced VAT meshes at fixed capacity ----------------------------
  const layoutRandom = stream(seed ^ 0x9e3779b9);
  const swayRandom = stream(seed ^ 0x85ebca6b);
  const actors = {
    standing: { arrive: [-8.6, 6.4], fall: [5.2, edgeZ + 0.14] },
    wheelchair: { arrive: [-6.6, 6.4], fall: [7.4, edgeZ + 0.4] },
  };
  const beams = [
    { name: 'arrival', x: -7.6, z: 6.4, radius: 1.9 },
    { name: 'edge', x: 6.3, z: edgeZ, radius: 1.9 },
    { name: 'pit', x: longEdge / 2 + 6, z: -3, radius: 1.5 },
  ];
  const cols = 62;
  const rows = 26;
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -longEdge / 2 + 0.6 + (longEdge - 1.2) * (c + 0.5) / cols + (layoutRandom() - 0.5) * 0.3;
      const z = -edgeZ + 0.7 + (shortEdge - 1.4) * (r + 0.5) / rows + (layoutRandom() - 0.5) * 0.3;
      const clear = Object.values(actors).every(set => Object.values(set).every(([ax, az]) => Math.hypot(ax - x, az - z) > 1.3));
      if (clear) slots.push({ x, z, key: layoutRandom() });
    }
  }
  slots.sort((a, b) => a.key - b.key);
  const crowdTotal = CAPACITY.standing + CAPACITY.wheelchair - 4;
  if (slots.length < crowdTotal) throw new Error(`layout produced ${slots.length} slots for ${crowdTotal} figures`);
  const crowd = slots.slice(0, crowdTotal);
  const placements = { standing: [], wheelchair: [] };
  crowd.forEach((slot, i) => (i < CAPACITY.wheelchair - 2 ? placements.wheelchair : placements.standing).push(slot));

  const figureColor = tone(1.4);
  const meshes = {};
  const drawCount = { standing: 0, wheelchair: 0 };
  const matrix = new THREE.Object3D();
  const idleClip = manifest.variants.standing.clips['stand-sway'];
  for (const name of ['standing', 'wheelchair']) {
    const variant = vat.variants[name];
    const geometry = createFigureGeometry(variant.data, variant.record.vertexCount);
    const count = CAPACITY[name];
    const clipAttr = new Float32Array(count);
    const phaseAttr = new Float32Array(count);
    const mesh = new THREE.InstancedMesh(geometry, createFigureMaterial({ manifest, variantName: name, clips: variant.clips, color: figureColor }), count);
    placements[name].forEach((slot, i) => {
      matrix.position.set(slot.x, 0, slot.z);
      matrix.rotation.set(0, (layoutRandom() - 0.5) * 0.7, 0);
      matrix.updateMatrix();
      mesh.setMatrixAt(i, matrix.matrix);
      phaseAttr[i] = swayRandom() * idleClip.durationMs / 1000;
    });
    [['arrive', 1], ['fall', 2]].forEach(([role, clip], k) => {
      const i = count - 2 + k;
      const [x, z] = actors[name][role];
      matrix.position.set(x, 0, z);
      matrix.rotation.set(0, 0, 0);
      matrix.updateMatrix();
      mesh.setMatrixAt(i, matrix.matrix);
      clipAttr[i] = clip;
    });
    geometry.setAttribute('actorClip', new THREE.InstancedBufferAttribute(clipAttr, 1));
    geometry.setAttribute('actorPhase', new THREE.InstancedBufferAttribute(phaseAttr, 1));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false; // keep the full geometry submission in every view and tier
    mesh.onBeforeRender = () => { drawCount[name]++; };
    mesh.name = name;
    scene.add(mesh);
    meshes[name] = mesh;
  }

  // ---- Light-side occlusion: orthographic depth of the slab from above -----------------------
  const volumeMin = new THREE.Vector3(-longEdge / 2 - 22, -46, -edgeZ - 22);
  const volumeMax = new THREE.Vector3(longEdge / 2 + 22, 26, edgeZ + 22);
  const lightCamera = new THREE.OrthographicCamera(volumeMin.x, volumeMax.x, volumeMax.z, volumeMin.z, 1, 200);
  lightCamera.position.set(0, 100, 0);
  lightCamera.up.set(0, 0, -1);
  lightCamera.lookAt(0, 0, 0);
  lightCamera.layers.set(SLAB_LAYER);
  lightCamera.updateMatrixWorld();
  const lightTarget = new THREE.WebGLRenderTarget(1024, 1024, { depthBuffer: true });
  lightTarget.depthTexture = new THREE.DepthTexture(1024, 1024, THREE.UnsignedIntType);
  let lightOcclusion = true;
  function renderLightDepth() {
    const hidden = lightOcclusion ? [] : [slab, ribs, seams, cables];
    hidden.forEach(object => { object.visible = false; });
    renderer.setRenderTarget(lightTarget);
    renderer.clear();
    renderer.render(scene, lightCamera);
    renderer.setRenderTarget(null);
    hidden.forEach(object => { object.visible = true; });
  }
  renderLightDepth();

  // ---- AD-7 pipeline: bloom, AgX, haze (grain is production tuning, not part of this spike) ----
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 600);
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.72, luminanceSmoothing: 0.18, intensity: 0.55, radius: 0.62, levels: 8 });
  const haze = new HazePass(camera, { volumeMin, volumeMax, hazeColor: tone(1), beams, beamTop: volumeMax.y, lightCamera, lightDepth: lightTarget.depthTexture });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX })));
  composer.addPass(haze);

  // ---- Camera presets: fixed target at slab centre, slab fitted inside a 15% margin ----------
  const corners = [];
  for (const x of [-longEdge / 2, longEdge / 2]) for (const y of [-thickness, figureHeight]) for (const z of [-edgeZ, edgeZ]) corners.push(new THREE.Vector3(x, y, z));
  let cameraName = 'under';
  function placeCamera() {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = 40;
    if (cameraName === 'figure') {
      const [x, z] = actors.standing.fall;
      camera.fov = 30;
      camera.position.set(x + 0.9, 0.2, z + 8.5);
      camera.lookAt(x + 0.9, -0.35, z);
    } else {
      const elevation = THREE.MathUtils.degToRad(CAMERAS[cameraName]);
      const direction = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
      const fits = distance => {
        camera.position.copy(direction).multiplyScalar(distance);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();
        return corners.every(corner => {
          const p = corner.clone().project(camera);
          return p.z < 1 && Math.abs(p.x) <= 0.7 && Math.abs(p.y) <= 0.7;
        });
      };
      let lo = 5;
      let hi = 600;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid; else lo = mid;
      }
      fits(hi);
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  // ---- Clock, tiers and the page's single frame loop ------------------------------------------
  // Showcase actors replay their whole 2400ms events every two event lengths (integer ms keeps the wrap exact).
  const eventCycleMs = 2 * tokens.motion.event;
  let tierName = TIERS[params.get('tier')] ? params.get('tier') : 'high';
  let sceneT = 0;
  let playing = false;
  let reducedMotion = false;
  let lastNow = null;
  let frames = 0;
  let lastFrameInfo = null;
  let measurement = null;

  function applyTier(name) {
    const tier = TIERS[name];
    if (!tier) throw new Error(`unknown tier: ${name}`);
    tierName = name;
    renderer.setPixelRatio(Math.min(devicePixelRatio, tier.pixelRatioCap));
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.mipmapBlurPass.levels = tier.bloomLevels;
    haze.configure({ path: tier.hazePath, samples: tier.hazeSamples });
    placeCamera();
  }

  function uniforms() {
    const loopSeconds = wrapLoopSeconds(sceneT, idleClip);
    const eventSeconds = ((((sceneT * 1000) % eventCycleMs) + eventCycleMs) % eventCycleMs) / 1000;
    for (const mesh of Object.values(meshes)) {
      const u = mesh.material.uniforms;
      u.loopSeconds.value = loopSeconds;
      u.eventSeconds.value = eventSeconds;
      u.reducedMotion.value = reducedMotion;
    }
    return { loopSeconds, eventSeconds };
  }

  function draw() {
    const clocks = uniforms();
    drawCount.standing = 0;
    drawCount.wheelchair = 0;
    renderer.info.autoReset = false;
    renderer.info.reset();
    composer.render();
    renderer.setRenderTarget(null);
    frames++;
    lastFrameInfo = { ...clocks, figureDraws: drawCount.standing + drawCount.wheelchair, drawsByVariant: { ...drawCount }, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    $('#state').textContent = `${cameraName} · ${tierName} · t ${sceneT.toFixed(3)}s · ${playing ? 'playing' : 'paused'}${reducedMotion ? ' · reduced motion' : ''}`;
  }

  function frame(now) {
    if (lastNow !== null && playing && !document.hidden) {
      const interval = now - lastNow;
      sceneT += Math.min(FRAME_CLAMP_SECONDS, Math.max(0, interval / 1000));
      if (measurement && ++measurement.seen > measurement.warmup) measurement.intervals.push(interval);
      if (measurement && now - measurement.start >= measurement.durationMs) {
        const done = measurement;
        measurement = null;
        playing = done.wasPlaying;
        done.resolve(summarise(done.intervals));
      }
    }
    lastNow = playing && !document.hidden ? now : null;
    if (playing && !document.hidden) draw();
    requestAnimationFrame(frame);
  }

  function summarise(intervals) {
    const sorted = [...intervals].sort((a, b) => a - b);
    const mean = intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length);
    const pick = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null;
    return { frames: intervals.length, meanFrameMs: mean, meanFps: intervals.length ? 1000 / mean : null, p50FrameMs: pick(0.5), p95FrameMs: pick(0.95), worstFrameMs: sorted.at(-1) ?? null };
  }

  function drawingBuffer() {
    return renderer.getDrawingBufferSize(new THREE.Vector2());
  }

  /** Mean RGB of a 5x5 block around a projected world point, read straight after a draw. */
  function probeWorld(point) {
    draw();
    const size = drawingBuffer();
    const p = new THREE.Vector3(...point).project(camera);
    const x = Math.round((p.x * 0.5 + 0.5) * size.x);
    const y = Math.round((p.y * 0.5 + 0.5) * size.y);
    const pixels = new Uint8Array(25 * 4);
    gl.readPixels(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let sum = 0;
    let spread = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      spread = Math.max(spread, Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]));
    }
    return { point, pixel: [x, y], onScreen: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1, mean: sum / 25, channelSpread: spread };
  }

  function hash(values) {
    let h = 0x811c9dc5;
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
    return h.toString(16);
  }

  function invariants() {
    return {
      seed,
      capacity: { standing: meshes.standing.count, wheelchair: meshes.wheelchair.count, total: meshes.standing.count + meshes.wheelchair.count },
      instancedMeshes: scene.children.filter(child => child.isInstancedMesh).length,
      vertices: { standing: meshes.standing.geometry.attributes.position.count, wheelchair: meshes.wheelchair.geometry.attributes.position.count },
      layoutHash: hash(new Float32Array([...meshes.standing.instanceMatrix.array, ...meshes.wheelchair.instanceMatrix.array])),
      swayHash: hash(new Float32Array([...meshes.standing.geometry.attributes.actorPhase.array, ...meshes.wheelchair.geometry.attributes.actorPhase.array])),
      slab: { longEdge, shortEdge, thickness },
      camera: { name: cameraName, position: camera.position.toArray().map(v => +v.toFixed(5)), fov: camera.fov },
      sceneT,
      eventCycleMs,
    };
  }

  function report() {
    const tier = TIERS[tierName];
    const size = drawingBuffer();
    return {
      environment: { ...environment },
      tier: tierName,
      tierConfig: { ...tier },
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: [size.x, size.y],
      effective: { bloomLevels: bloom.mipmapBlurPass.levels, hazeSamples: haze.fullscreenMaterial.uniforms.steps.value, hazePath: haze.fullscreenMaterial.uniforms.shaftMode.value === 0 ? 'raymarch' : 'screen-space-shafts' },
      invariants: invariants(),
      playing,
      reducedMotion,
      frames,
      lastFrame: lastFrameInfo,
      textures: Object.entries(vat.variants).flatMap(([variant, v]) => Object.entries(v.clips).map(([clip, c]) => ({ variant, clip, width: c.record.texture.width, height: c.record.texture.height, bytes: c.record.texture.bytes }))),
      errors: [...errors],
    };
  }

  const setTime = value => {
    if (!Number.isFinite(value)) throw new TypeError('scene time must be finite');
    sceneT = value;
    playing = false;
    draw();
  };
  const poses = { rest: 0, step: 1.017, fall: 1.45, dissolve: 2.1 };

  Object.assign(api, {
    manifest,
    tiers: TIERS,
    beams,
    actors,
    edgeZ,
    setCamera(name) {
      if (name !== 'figure' && !(name in CAMERAS)) throw new Error(`unknown camera: ${name}`);
      cameraName = name;
      placeCamera();
      draw();
    },
    setTier(name) { applyTier(name); draw(); },
    setPose(name) {
      if (!(name in poses)) throw new Error(`unknown pose: ${name}`);
      setTime(poses[name]);
    },
    setTime,
    setReducedMotion(value) { reducedMotion = !!value; draw(); },
    setLightOcclusion(value) { lightOcclusion = !!value; renderLightDepth(); draw(); },
    setHaze(value) { haze.fullscreenMaterial.uniforms.enabled.value = value ? 1 : 0; draw(); },
    play() { playing = true; lastNow = null; },
    pause() { playing = false; draw(); },
    verifyGpu() { const result = verifyGpuSampling(renderer, vat); draw(); return result; },
    probeWorld,
    report,
    measure({ seconds = 6, warmupFrames = 30 } = {}) {
      if (measurement) throw new Error('measurement already running');
      return new Promise(resolve => {
        measurement = { durationMs: seconds * 1000, warmup: warmupFrames, seen: 0, intervals: [], start: performance.now(), wasPlaying: playing, resolve };
        playing = true;
        lastNow = null;
      }).then(stats => ({ ...stats, tier: tierName, camera: cameraName, pixelRatio: renderer.getPixelRatio(), drawingBuffer: drawingBuffer().toArray(), renderer: environment.renderer, userAgent: environment.userAgent, diagnosticOnly: environment.diagnosticOnly, automated: environment.automated, note: environment.diagnosticOnly ? 'software renderer: diagnostic only, never target-hardware evidence' : `hardware GPU measurement on this device only${environment.automated ? ' (automated browser)' : ''}; no readback or capture during sampling` }));
    },
  });

  Object.defineProperty(api, 'sceneT', { enumerable: true, get: () => sceneT });

  for (const button of document.querySelectorAll('[data-camera]')) button.addEventListener('click', () => api.setCamera(button.dataset.camera));
  for (const button of document.querySelectorAll('[data-pose]')) button.addEventListener('click', () => api.setPose(button.dataset.pose));
  for (const button of document.querySelectorAll('[data-tier]')) button.addEventListener('click', () => api.setTier(button.dataset.tier));
  $('#play').addEventListener('click', () => (playing ? api.pause() : api.play()));
  $('#reduced').addEventListener('click', () => api.setReducedMotion(!reducedMotion));
  $('#measure').addEventListener('click', async () => { $('#stats').textContent = 'measuring…'; $('#stats').textContent = JSON.stringify(await api.measure(), null, 1); });
  $('#gpu-check').addEventListener('click', () => { $('#stats').textContent = JSON.stringify(api.verifyGpu(), null, 1); });
  document.addEventListener('visibilitychange', () => { lastNow = null; });
  addEventListener('resize', () => { applyTier(tierName); draw(); });

  cameraName = CAMERAS[params.get('camera')] !== undefined || params.get('camera') === 'figure' ? params.get('camera') : 'under';
  applyTier(tierName);
  draw();
  $('#identity').textContent = `${environment.renderer}${environment.diagnosticOnly ? ' · diagnostic only' : ''}`;
  api.ready = true;
  requestAnimationFrame(frame);
}


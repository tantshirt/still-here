import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { tokens } from '../generated/tokens';
import type { AppSelectors } from '../app';
import type { AppEvent } from '../app';
import type { SimSnapshot } from '../sim';
import { wrapLoopSeconds } from './vat-core';
import { createFigureGeometry, createFigureMaterial, loadVat } from './vat-gpu';
import { HazePass } from './haze-pass';
import { applyCameraPreset, type SlabBounds } from './camera-rig';
import { QualityGovernor, qualityTiers, type QualityTier } from './quality-governor';
import type { FrameOutput } from './frame-output';
export * from './frame-output';

const GPU_CAP = 1600;
const SLAB_LAYER = 1;

export interface RenderOptions {
  readonly mount: () => HTMLElement | null;
  readonly sendAppEvent: (event: AppEvent) => void;
}

export interface RenderPort {
  draw(snapshot: SimSnapshot, selectors: AppSelectors, dt: number): FrameOutput;
  dispose(): void;
  prepare(): Promise<void>;
  retry(): Promise<void>;
}

interface LoadedVat {
  manifest: Record<string, unknown>;
  variants: {
    standing: { data: { positions: number[]; indices: number[] }; record: { vertexCount: number }; clips: Record<string, unknown> };
    wheelchair: { data: { positions: number[]; indices: number[] }; record: { vertexCount: number }; clips: Record<string, unknown> };
  };
}

interface CrowdMeshes {
  standing: THREE.InstancedMesh;
  wheelchair: THREE.InstancedMesh;
}

export function createRenderer(options: RenderOptions): RenderPort {
  let renderer: THREE.WebGLRenderer | undefined;
  let composer: EffectComposer | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  let scene: THREE.Scene | undefined;
  let slabRoot: THREE.Group | undefined;
  let bounds: SlabBounds | undefined;
  let crowd: CrowdMeshes | undefined;
  let haze: HazePass | undefined;
  let bloom: BloomEffect | undefined;
  let idleClip: { durationMs: number; frameCount: number; loop: boolean } | undefined;
  let tier: QualityTier = 'high';
  let prepared = false;
  let lastWidth = 0;
  let lastHeight = 0;
  let smoothedFps = 60;
  const governor = new QualityGovernor();
  const dummy = new THREE.Object3D();

  function tone(scale: number, light: THREE.Color): THREE.Color {
    return light.clone().multiplyScalar(scale);
  }

  async function buildScene(): Promise<void> {
    if (!renderer) {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
      } catch {
        options.sendAppEvent({ type: 'FALLBACK', reason: 'noWebGL' });
        throw new Error('WebGL unavailable');
      }
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setClearColor(new THREE.Color(tokens.colors.background), 1);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.className = 'scene-canvas';
      const mount = options.mount();
      if (mount) mount.prepend(renderer.domElement);
      renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        options.sendAppEvent({ type: 'FALLBACK', reason: 'contextLost' });
      });
    }
    const vat = await loadVat('/vat/', renderer) as unknown as LoadedVat;
    const { manifest } = vat;
    const light = new THREE.Color(tokens.colors['scene-light']);
    const standSway = vat.variants.standing.clips['stand-sway'] as { bounds: [[number, number, number], [number, number, number]] };
    const figureHeight = standSway.bounds[1][1];
    const [aspectW, aspectH] = tokens.render['slab-aspect'].split('/').map(Number) as [number, number];
    const shortEdge = figureHeight / Number(tokens.render['figure-height-ratio']);
    const longEdge = shortEdge * aspectW / aspectH;
    const thickness = shortEdge * Number(tokens.render['slab-thickness-ratio']);
    const edgeZ = shortEdge / 2;
    bounds = { longEdge, shortEdge, thickness, figureHeight };
    scene = new THREE.Scene();
    slabRoot = new THREE.Group();
    const steel = new THREE.MeshBasicMaterial({ color: tone(0.018, light) });
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(longEdge, thickness, shortEdge),
      [steel, steel, new THREE.MeshBasicMaterial({ color: tone(3, light) }), steel, steel, steel],
    );
    slab.position.y = -thickness / 2;
    const ribParts: THREE.BoxGeometry[] = [];
    const seamParts: THREE.BoxGeometry[] = [];
    const underside = -thickness;
    for (let i = 0; i <= 8; i += 1) {
      ribParts.push(new THREE.BoxGeometry(0.28, 0.4, shortEdge).translate(-longEdge / 2 + (longEdge * i) / 8, underside - 0.2, 0));
    }
    for (let j = 0; j <= 4; j += 1) {
      ribParts.push(new THREE.BoxGeometry(longEdge, 0.3, 0.22).translate(0, underside - 0.15, -edgeZ + (shortEdge * j) / 4));
    }
    for (let i = 0; i < 8; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        const cx = -longEdge / 2 + (longEdge * (i + 0.5)) / 8;
        const cz = -edgeZ + (shortEdge * (j + 0.5)) / 4;
        seamParts.push(new THREE.BoxGeometry((longEdge / 8) * 0.7, 0.02, 0.05).translate(cx, underside - 0.01, cz - shortEdge / 16));
        seamParts.push(new THREE.BoxGeometry((longEdge / 8) * 0.7, 0.02, 0.05).translate(cx, underside - 0.01, cz + shortEdge / 16));
      }
    }
    const ribs = new THREE.Mesh(mergeGeometries(ribParts), new THREE.MeshBasicMaterial({ color: tone(0.05, light) }));
    const seams = new THREE.Mesh(mergeGeometries(seamParts), new THREE.MeshBasicMaterial({ color: tone(2.2, light) }));
    const cableParts: THREE.CylinderGeometry[] = [];
    for (const sx of [-0.42, 0, 0.42]) {
      for (const sz of [-0.46, 0.46]) {
        cableParts.push(new THREE.CylinderGeometry(0.05, 0.05, 90, 6).translate(sx * longEdge, 45, sz * shortEdge));
      }
    }
    const cables = new THREE.Mesh(mergeGeometries(cableParts), new THREE.MeshBasicMaterial({ color: tone(0.06, light) }));
    for (const object of [slab, ribs, seams, cables]) {
      object.layers.enable(SLAB_LAYER);
      slabRoot.add(object);
    }
    scene.add(slabRoot);
    const figureColor = tone(1.4, light);
    const standingGeometry = createFigureGeometry(vat.variants.standing.data, vat.variants.standing.record.vertexCount);
    const wheelchairGeometry = createFigureGeometry(vat.variants.wheelchair.data, vat.variants.wheelchair.record.vertexCount);
    crowd = {
      standing: new THREE.InstancedMesh(
        standingGeometry,
        createFigureMaterial({ manifest, variantName: 'standing', clips: vat.variants.standing.clips, color: figureColor }),
        GPU_CAP,
      ),
      wheelchair: new THREE.InstancedMesh(
        wheelchairGeometry,
        createFigureMaterial({ manifest, variantName: 'wheelchair', clips: vat.variants.wheelchair.clips, color: figureColor }),
        GPU_CAP,
      ),
    };
    for (const mesh of Object.values(crowd)) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }
    idleClip = (manifest.variants as LoadedVat['variants']).standing.clips['stand-sway'] as { durationMs: number; frameCount: number; loop: boolean };
    const clipAttrStanding = new Float32Array(GPU_CAP);
    const phaseAttrStanding = new Float32Array(GPU_CAP);
    standingGeometry.setAttribute('actorClip', new THREE.InstancedBufferAttribute(clipAttrStanding, 1));
    standingGeometry.setAttribute('actorPhase', new THREE.InstancedBufferAttribute(phaseAttrStanding, 1));
    const clipAttrWheel = new Float32Array(GPU_CAP);
    const phaseAttrWheel = new Float32Array(GPU_CAP);
    wheelchairGeometry.setAttribute('actorClip', new THREE.InstancedBufferAttribute(clipAttrWheel, 1));
    wheelchairGeometry.setAttribute('actorPhase', new THREE.InstancedBufferAttribute(phaseAttrWheel, 1));
    const volumeMin = new THREE.Vector3(-longEdge / 2 - 22, -46, -edgeZ - 22);
    const volumeMax = new THREE.Vector3(longEdge / 2 + 22, 26, edgeZ + 22);
    const beams = [
      { name: 'arrival', x: -7.6, z: 6.4, radius: 1.9 },
      { name: 'edge', x: 6.3, z: edgeZ, radius: 1.9 },
      { name: 'pit', x: longEdge / 2 + 6, z: -3, radius: 1.5 },
    ];
    const lightCamera = new THREE.OrthographicCamera(volumeMin.x, volumeMax.x, volumeMax.z, volumeMin.z, 1, 200);
    lightCamera.position.set(0, 100, 0);
    lightCamera.up.set(0, 0, -1);
    lightCamera.lookAt(0, 0, 0);
    lightCamera.layers.set(SLAB_LAYER);
    lightCamera.updateMatrixWorld();
    const lightTarget = new THREE.WebGLRenderTarget(1024, 1024, { depthBuffer: true });
    lightTarget.depthTexture = new THREE.DepthTexture(1024, 1024, THREE.UnsignedIntType);
    renderer.setRenderTarget(lightTarget);
    renderer.clear();
    for (const object of [slab, ribs, seams, cables]) object.visible = true;
    renderer.render(scene, lightCamera);
    renderer.setRenderTarget(null);
    camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
    composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.72, luminanceSmoothing: 0.18, intensity: 0.55, radius: 0.62, levels: 8 });
    haze = new HazePass(camera, { volumeMin, volumeMax, hazeColor: tone(1, light), beams, beamTop: volumeMax.y, lightCamera, lightDepth: lightTarget.depthTexture });
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, bloom, new ToneMappingEffect({ mode: ToneMappingMode.AGX })));
    composer.addPass(haze);
    applyTier(tier);
    resize();
    composer.render();
    prepared = true;
  }

  function applyTier(name: QualityTier): void {
    if (!renderer || !composer || !bloom || !haze || !camera || !bounds) return;
    tier = name;
    const config = qualityTiers[name];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.pixelRatioCap));
    resize();
    bloom.mipmapBlurPass.levels = config.bloomLevels;
    haze.configure({ path: config.hazePath, samples: config.hazeSamples });
    applyCameraPreset(camera, { camera: 'under' }, bounds, lastWidth || window.innerWidth, lastHeight || window.innerHeight);
  }

  function resize(): void {
    if (!renderer || !composer || !camera || !bounds) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    lastWidth = width;
    lastHeight = height;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    applyCameraPreset(camera, { camera: 'under' }, bounds, width, height);
  }

  function updateCrowd(snapshot: SimSnapshot, selectors: AppSelectors): void {
    if (!crowd || !bounds) return;
    const unitShort = 1 / Number(tokens.render['figure-height-ratio']);
    const scale = bounds.shortEdge / unitShort;
    const standingCount = snapshot.standing.slots.filter(slot => !slot.wheelchair).length;
    const wheelchairCount = snapshot.standing.slots.filter(slot => slot.wheelchair).length;
    crowd.standing.count = standingCount;
    crowd.wheelchair.count = wheelchairCount;
    let si = 0;
    let wi = 0;
    for (const slot of snapshot.standing.slots) {
      const mesh = slot.wheelchair ? crowd.wheelchair : crowd.standing;
      const index = slot.wheelchair ? wi++ : si++;
      const y = slot.tier ? 0.08 * scale : 0;
      dummy.position.set(slot.x * scale, y, slot.z * scale);
      dummy.rotation.set(0, (slot.seed / 0xffffffff - 0.5) * 0.7, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      const phaseAttr = mesh.geometry.getAttribute('actorPhase') as THREE.InstancedBufferAttribute | undefined;
      if (phaseAttr) phaseAttr.setX(index, slot.swayPhase);
    }
    crowd.standing.instanceMatrix.needsUpdate = true;
    crowd.wheelchair.instanceMatrix.needsUpdate = true;
    const loopSeconds = idleClip ? wrapLoopSeconds(snapshot.sceneT, idleClip) : 0;
    for (const mesh of [crowd.standing, crowd.wheelchair]) {
      const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms;
      if (uniforms.loopSeconds) uniforms.loopSeconds.value = loopSeconds;
      if (uniforms.eventSeconds) uniforms.eventSeconds.value = 0;
      if (uniforms.reducedMotion) uniforms.reducedMotion.value = selectors.reducedMotion;
    }
    void selectors;
  }

  function updateSlabMotion(snapshot: SimSnapshot, selectors: AppSelectors): void {
    if (!slabRoot || !bounds) return;
    if (selectors.reducedMotion) {
      slabRoot.rotation.set(0, 0, 0);
      slabRoot.position.y = 0;
      return;
    }
    const cycle = tokens.motion.drift / 1000;
    const phase = (snapshot.sceneT % cycle) / cycle;
    const tilt = Number(tokens.render['drift-tilt-max-deg']) * Math.sin(phase * Math.PI * 2) * (Math.PI / 180);
    const travel = bounds.shortEdge * Number(tokens.render['drift-travel-max-ratio']) * Math.sin(phase * Math.PI * 2);
    slabRoot.rotation.z = tilt;
    slabRoot.position.y = travel;
  }

  function releaseResources(): void {
    prepared = false;
    composer?.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
    renderer = undefined;
    composer = undefined;
    scene = undefined;
    crowd = undefined;
  }

  return {
    async prepare() {
      governor.reset();
      await buildScene();
    },
    async retry() {
      releaseResources();
      governor.reset();
      await buildScene();
    },
    draw(snapshot, selectors, dt) {
      if (!prepared || !composer || !renderer) return { teaserAnchor: null, fps: smoothedFps };
      updateCrowd(snapshot, selectors);
      updateSlabMotion(snapshot, selectors);
      if (selectors.camera && camera && bounds) {
        applyCameraPreset(camera, selectors, bounds, lastWidth, lastHeight);
      }
      composer.render();
      if (dt > 0) smoothedFps = 1 / dt;
      if (selectors.sceneActive && governor.step(dt, smoothedFps, true)) {
        options.sendAppEvent({ type: 'LOW_PERF' });
      }
      return { teaserAnchor: null, fps: smoothedFps };
    },
    dispose() {
      releaseResources();
    },
  };
}

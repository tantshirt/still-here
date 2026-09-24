// @ts-nocheck
// Three.js consumer for the still-here-vat/1 contract: verified upload, one shared GLSL sampler,
// and the instanced figure material. Spike code: isolated from src/render (production renderer).
import * as THREE from 'three';
import { assertManifest, halvesFromBytes, sampleVertex, sha256 as plainSha256, toHex, VARIANT_CLIPS, VatError } from './vat-core.ts';

/** The single GLSL sampling helper used by both the figure shader and the GPU readback check. */
export const VAT_GLSL = /* glsl */ `
uniform int vatWidth;
vec3 vatFetch(sampler2D map, int frame, int vertexId, int vertexCount) {
  int texel = frame * vertexCount + vertexId;
  return texelFetch(map, ivec2(texel % vatWidth, texel / vatWidth), 0).xyz;
}
vec3 vatSample(sampler2D map, float frame, int vertexId, int vertexCount, int lastFrame) {
  float f = clamp(frame, 0.0, float(lastFrame));
  int f0 = int(floor(f));
  int f1 = min(f0 + 1, lastFrame);
  return mix(vatFetch(map, f0, vertexId, vertexCount), vatFetch(map, f1, vertexId, vertexCount), f - float(f0));
}`;

/** Keep Screen 1 CSS animations responsive while multi-megabyte VAT assets upload. */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function fetchVerified(url, { bytes, sha256 }) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new VatError(`${url}: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== bytes) throw new VatError(`${url}: byte size ${buffer.byteLength} does not match manifest ${bytes}`);
  // crypto.subtle exists only in secure contexts; a LAN-served phone measurement falls back to plain JS.
  const digest = globalThis.crypto?.subtle ? toHex(await crypto.subtle.digest('SHA-256', buffer)) : plainSha256(buffer);
  if (digest !== sha256) throw new VatError(`${url}: sha256 mismatch`);
  return buffer;
}

/** Capabilities the VAT path needs; reported, never silently worked around. */
export function vatCapabilities(renderer) {
  const gl = renderer.getContext();
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  return {
    webgl2: isWebGL2,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    vertexTextureUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    floatColorBuffer: !!gl.getExtension('EXT_color_buffer_float'),
  };
}

export async function loadVat(baseUrl, renderer) {
  const caps = vatCapabilities(renderer);
  if (!caps.webgl2) throw new VatError('WebGL2 is required for texelFetch/RGBA16F VAT sampling');
  if (caps.vertexTextureUnits < 3) throw new VatError(`VAT needs 3 vertex texture units; this GPU exposes ${caps.vertexTextureUnits}`);
  const manifestResponse = await fetch(`${baseUrl}manifest.json`, { cache: 'no-store' });
  if (!manifestResponse.ok) throw new VatError(`manifest: HTTP ${manifestResponse.status}`);
  const manifest = assertManifest(await manifestResponse.json());
  const variants = {};
  for (const [name, variant] of Object.entries(manifest.variants)) {
    const geometryBuffer = await fetchVerified(baseUrl + variant.geometry.file, variant.geometry);
    await yieldToMain();
    const data = JSON.parse(new TextDecoder().decode(geometryBuffer));
    if (data.positions.length !== variant.vertexCount * 3 || data.indices.length !== variant.triangleCount * 3) throw new VatError(`${name}: geometry does not match manifest counts`);
    const clips = {};
    for (const [clipName, clip] of Object.entries(variant.clips)) {
      if (clip.texture.height > caps.maxTextureSize) throw new VatError(`${name}/${clipName}: texture height ${clip.texture.height} exceeds MAX_TEXTURE_SIZE ${caps.maxTextureSize}`);
      const buffer = await fetchVerified(baseUrl + clip.texture.file, clip.texture);
      await yieldToMain();
      const halves = halvesFromBytes(new Uint8Array(buffer));
      await yieldToMain();
      const texture = new THREE.DataTexture(halves, clip.texture.width, clip.texture.height, THREE.RGBAFormat, THREE.HalfFloatType);
      texture.internalFormat = 'RGBA16F';
      texture.minFilter = texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.NoColorSpace;
      texture.flipY = false;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      clips[clipName] = { record: clip, texture, halves };
      await yieldToMain();
    }
    variants[name] = { record: variant, data, clips };
    await yieldToMain();
  }
  return { manifest, variants, caps };
}

export function createFigureGeometry(data, vertexCount) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('vertexId', new THREE.Float32BufferAttribute(Float32Array.from({ length: vertexCount }, (_, i) => i), 1));
  geometry.setIndex(data.indices);
  return geometry;
}

/** Instanced, unlit, faceless silhouette. Clips: 0 idle loop, 1 arrival event, 2 fall event. */
export function createFigureMaterial({ manifest, variantName, clips, color }) {
  const names = VARIANT_CLIPS[variantName];
  const variant = manifest.variants[variantName];
  const idle = clips[names.idle].record;
  const event = clips[names.fall].record;
  const dissolve = manifest.eventPhasesMs.departure.find(phase => phase.name === 'dissolve');
  return new THREE.ShaderMaterial({
    name: `vat-${variantName}`,
    glslVersion: THREE.GLSL3,
    uniforms: {
      vatWidth: { value: manifest.texture.width },
      idleMap: { value: clips[names.idle].texture },
      arriveMap: { value: clips[names.arrive].texture },
      fallMap: { value: clips[names.fall].texture },
      vertexCount: { value: variant.vertexCount },
      idleLastFrame: { value: idle.frameCount - 1 },
      eventLastFrame: { value: event.frameCount - 1 },
      idlePeriod: { value: idle.durationMs / 1000 },
      fps: { value: manifest.fps },
      loopSeconds: { value: 0 },
      eventSeconds: { value: 0 },
      reducedMotion: { value: false },
      restFrame: { value: variant.restFrame },
      dissolveStart: { value: dissolve.start / 1000 },
      dissolveEnd: { value: dissolve.end / 1000 },
      figureColor: { value: color.clone() },
    },
    vertexShader: /* glsl */ `
      in float vertexId;
      in float actorClip;
      in float actorPhase;
      uniform sampler2D idleMap, arriveMap, fallMap;
      uniform int vertexCount, idleLastFrame, eventLastFrame, restFrame;
      uniform float idlePeriod, fps, loopSeconds, eventSeconds, dissolveStart, dissolveEnd;
      uniform bool reducedMotion;
      out float vOpacity;
      ${VAT_GLSL}
      void main() {
        int id = int(vertexId);
        vec3 p;
        vOpacity = 1.0;
        if (reducedMotion) {
          p = vatSample(idleMap, float(restFrame), id, vertexCount, idleLastFrame);
        } else if (actorClip < 0.5) {
          // loopSeconds and actorPhase are both < idlePeriod, so this stays precise for any session length.
          float frame = mod((loopSeconds + actorPhase) * fps, float(idleLastFrame));
          p = vatSample(idleMap, frame, id, vertexCount, idleLastFrame);
        } else {
          float evt = actorClip < 0.5 ? eventSeconds : actorPhase;
          float frame = clamp(evt * fps, 0.0, float(eventLastFrame));
          if (actorClip < 1.5) {
            p = vatSample(arriveMap, frame, id, vertexCount, eventLastFrame);
          } else {
            p = vatSample(fallMap, frame, id, vertexCount, eventLastFrame);
            vOpacity = 1.0 - smoothstep(dissolveStart, dissolveEnd, evt);
          }
        }
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 figureColor;
      in float vOpacity;
      out vec4 fragColor;
      void main() {
        if (vOpacity < 0.002) discard;
        fragColor = vec4(figureColor * vOpacity, 1.0);
      }`,
  });
}

/**
 * Renders the shared GLSL helper for chosen vertices/frames into a float target and compares the
 * readback with the independent CPU decoder. Diagnostic only: it stalls the GPU, so never run it
 * inside a performance measurement.
 */
export function verifyGpuSampling(renderer, vat) {
  const caps = vatCapabilities(renderer);
  if (!caps.floatColorBuffer) throw new VatError('EXT_color_buffer_float unavailable: GPU readback check cannot run');
  const camera = new THREE.Camera();
  const quad = new THREE.PlaneGeometry(2, 2);
  const checks = [];
  const previousTarget = renderer.getRenderTarget();
  for (const [name, variant] of Object.entries(vat.variants)) {
    const n = variant.record.vertexCount;
    const ids = [0, 1, 1023, 1024, Math.floor(n / 2), n - 2, n - 1];
    for (const [clipName, clip] of Object.entries(variant.clips)) {
      const last = clip.record.frameCount - 1;
      for (const frame of [0, 0.5, 18.51, 30.51, last - 0.25, last]) {
        const target = new THREE.WebGLRenderTarget(ids.length, 1, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
        const material = new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3,
          uniforms: { vatWidth: { value: vat.manifest.texture.width }, map: { value: clip.texture }, frame: { value: frame }, vertexCount: { value: n }, lastFrame: { value: last }, ids: { value: ids } },
          vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
          fragmentShader: `precision highp float; precision highp int;
            uniform sampler2D map; uniform float frame; uniform int vertexCount; uniform int lastFrame; uniform int ids[${ids.length}];
            out vec4 fragColor;
            ${VAT_GLSL}
            void main() { fragColor = vec4(vatSample(map, frame, ids[int(gl_FragCoord.x)], vertexCount, lastFrame), 1.0); }`,
        });
        const scene = new THREE.Scene();
        scene.add(new THREE.Mesh(quad, material));
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        const values = new Float32Array(ids.length * 4);
        renderer.readRenderTargetPixels(target, 0, 0, ids.length, 1, values);
        let maxError = 0;
        ids.forEach((id, i) => {
          const expected = sampleVertex(clip.halves, n, clip.record.frameCount, frame, id);
          for (let k = 0; k < 3; k++) maxError = Math.max(maxError, Math.abs(expected[k] - values[i * 4 + k]));
        });
        checks.push({ variant: name, clip: clipName, frame, probes: ids.length, maxErrorMetres: maxError, passed: maxError < 1e-5 });
        target.dispose();
        material.dispose();
      }
    }
  }
  quad.dispose();
  renderer.setRenderTarget(previousTarget);
  return { passed: checks.every(check => check.passed), positionsCompared: checks.reduce((sum, check) => sum + check.probes, 0), maxErrorMetres: Math.max(...checks.map(check => check.maxErrorMetres)), checks };
}

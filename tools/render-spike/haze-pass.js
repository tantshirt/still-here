// Pit haze for the render spike, as a postprocessing Pass that runs after bloom + AgX (AD-7 order).
// raymarch: integrates a bounded volume along each view ray up to the opaque depth (camera-side
//   occlusion) and tests every sample against a light-space depth map of the slab (light-side
//   occlusion), so the downlight shafts are cut by the slab and by anything nearer than the haze.
// shafts:   the permitted low-tier approximation. Per-pixel analytic beam in-scattering at the view
//   ray's closest approach to each downlight axis, clipped to the opaque depth, with light-side
//   occlusion traced in screen space (samples up the light direction tested against the depth
//   buffer). No volume integration and no light-space depth map.
import * as THREE from 'three';
import { Pass } from 'postprocessing';

export const MAX_BEAMS = 3;
const MAX_STEPS = 64;

const vertexShader = /* glsl */ `
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }`;

const fragmentShader = /* glsl */ `
precision highp float;
#define MAX_BEAMS ${MAX_BEAMS}
#define MAX_STEPS ${MAX_STEPS}
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
in vec2 vUv;
uniform sampler2D inputBuffer;
uniform sampler2D depthBuffer;
uniform sampler2D lightDepth;
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform mat4 viewProjection;
uniform mat4 lightViewProjection;
uniform vec3 volumeMin;
uniform vec3 volumeMax;
uniform vec3 hazeColor;
uniform float density;
uniform float ambient;
uniform float beamStrength;
uniform float beamTop;
uniform float beamDecay;
uniform vec3 beams[MAX_BEAMS];   // x, z, radius
uniform int steps;
uniform int shaftMode;           // 0 raymarch, 1 screen-space shafts
uniform float enabled;           // diagnostic toggle: 0 renders the opaque frame with no haze

vec3 worldAt(vec2 uv, float depth) {
  vec4 v = inverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return (cameraWorld * vec4(v.xyz / v.w, 1.0)).xyz;
}

// Soft bounds: the haze never shows a rectangular wall or a floor; it thins to black with depth.
float hazeDensity(vec3 p) {
  vec3 q = (p - volumeMin) / (volumeMax - volumeMin);
  if (any(lessThan(q, vec3(0.0))) || any(greaterThan(q, vec3(1.0)))) return 0.0;
  float sides = smoothstep(0.0, 0.4, q.x) * smoothstep(0.0, 0.4, 1.0 - q.x) * smoothstep(0.0, 0.4, q.z) * smoothstep(0.0, 0.4, 1.0 - q.z);
  return density * sides * smoothstep(0.0, 0.45, q.y) * smoothstep(0.0, 0.2, 1.0 - q.y);
}

float beamLight(vec3 p) {
  float light = 0.0;
  for (int i = 0; i < MAX_BEAMS; i++) {
    vec2 d = p.xz - beams[i].xy;
    float r = beams[i].z;
    light += exp(-2.0 * dot(d, d) / (r * r));
  }
  return light * beamStrength * exp(-max(0.0, beamTop - p.y) * beamDecay);
}

float lightVisibility(vec3 p) {
  vec4 c = lightViewProjection * vec4(p, 1.0);
  vec3 q = c.xyz / c.w * 0.5 + 0.5;
  if (any(lessThan(q.xy, vec2(0.0))) || any(greaterThan(q.xy, vec2(1.0)))) return 1.0;
  return step(q.z - 0.0005, texture(lightDepth, q.xy).r);
}

bool volumeSegment(vec3 ro, vec3 rd, out float t0, out float t1) {
  vec3 inv = 1.0 / rd;
  vec3 a = (volumeMin - ro) * inv;
  vec3 b = (volumeMax - ro) * inv;
  vec3 lo = min(a, b);
  vec3 hi = max(a, b);
  t0 = max(max(lo.x, lo.y), max(lo.z, 0.0));
  t1 = min(min(hi.x, hi.y), hi.z);
  return t1 > t0;
}

// Interleaved gradient noise (Jimenez 2014): a fixed per-pixel start offset that hides step banding
// as fine, static texture; no temporal shimmer and nothing particle-like.
float stepOffset(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

vec3 raymarch(vec3 ro, vec3 rd, float surface, out float transmittance) {
  transmittance = 1.0;
  float t0, t1;
  if (!volumeSegment(ro, rd, t0, t1)) return vec3(0.0);
  t1 = min(t1, surface);
  if (t1 <= t0) return vec3(0.0);
  float ds = (t1 - t0) / float(steps);
  float offset = stepOffset(gl_FragCoord.xy);
  float radiance = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= steps) break;
    vec3 p = ro + rd * (t0 + (float(i) + offset) * ds);
    float sigma = hazeDensity(p);
    float att = exp(-sigma * ds);
    float lit = ambient + beamLight(p) * lightVisibility(p);
    radiance += transmittance * (1.0 - att) * lit;
    transmittance *= att;
  }
  return hazeColor * radiance;
}

vec3 shafts(vec3 ro, vec3 rd, float surface, out float transmittance) {
  transmittance = 1.0;
  float t0, t1;
  if (!volumeSegment(ro, rd, t0, t1)) return vec3(0.0);
  t1 = min(t1, surface);
  if (t1 <= t0) return vec3(0.0);
  vec3 mid = ro + rd * 0.5 * (t0 + t1);
  transmittance = exp(-hazeDensity(mid) * (t1 - t0));
  float light = ambient * (1.0 - transmittance);
  float horizontal = max(1e-4, length(rd.xz));
  for (int b = 0; b < MAX_BEAMS; b++) {
    // Analytic in-scattering at the view ray's closest approach to the vertical beam axis,
    // clipped to the visible (depth-limited) segment: camera-side occlusion comes from depth.
    float t = clamp(dot(beams[b].xy - ro.xz, rd.xz) / (horizontal * horizontal), t0, t1);
    vec3 p = ro + rd * t;
    vec2 d = p.xz - beams[b].xy;
    float r = beams[b].z;
    float inScatter = hazeDensity(p) * exp(-2.0 * dot(d, d) / (r * r)) * r * 1.2533 / horizontal;
    inScatter *= beamStrength * exp(-max(0.0, beamTop - p.y) * beamDecay);
    if (inScatter < 1e-5) continue;
    // Light-side occlusion traced in screen space: jittered samples up the light direction from p
    // are projected and tested against the opaque depth buffer; visibility is the unoccluded share.
    // Off-screen samples are unknown and count as lit.
    float offset = stepOffset(gl_FragCoord.xy + float(b) * 17.0);
    float tested = 0.0;
    float blocked = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= steps) break;
      vec3 q = vec3(p.x, mix(p.y, beamTop, (float(i) + offset) / float(steps)), p.z);
      vec4 c = viewProjection * vec4(q, 1.0);
      if (c.w <= 0.0) continue;
      vec2 uv = c.xy / c.w * 0.5 + 0.5;
      if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
      tested += 1.0;
      blocked += step(texture(depthBuffer, uv).r, c.z / c.w * 0.5 + 0.5 - 1e-6);
    }
    float open = tested > 0.0 ? 1.0 - blocked / tested : 1.0;
    float visible = open * open; // one occluder on the light path should dominate a thin slab
    light += inScatter * visible;
  }
  return hazeColor * light;
}

void main() {
  vec3 base = texture(inputBuffer, vUv).rgb;
  float depth = texture(depthBuffer, vUv).r;
  vec3 ro = cameraWorld[3].xyz;
  vec3 rd = normalize(worldAt(vUv, 1.0) - ro);
  float surface = depth < 1.0 ? distance(worldAt(vUv, depth), ro) : 1e6;
  float transmittance;
  vec3 haze = shaftMode == 0 ? raymarch(ro, rd, surface, transmittance) : shafts(ro, rd, surface, transmittance);
  gl_FragColor = vec4(mix(base, base * transmittance + haze, enabled), 1.0);
  #include <colorspace_fragment>
}`;

export class HazePass extends Pass {
  constructor(camera, { volumeMin, volumeMax, hazeColor, beams, beamTop, lightCamera, lightDepth }) {
    super('HazePass');
    this.needsDepthTexture = true;
    this.viewCamera = camera;
    this.lightCamera = lightCamera;
    const beamValues = beams.map(beam => new THREE.Vector3(beam.x, beam.z, beam.radius));
    while (beamValues.length < MAX_BEAMS) beamValues.push(new THREE.Vector3(1e4, 1e4, 1));
    this.fullscreenMaterial = new THREE.ShaderMaterial({
      name: 'haze',
      glslVersion: THREE.GLSL3,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        inputBuffer: { value: null },
        depthBuffer: { value: null },
        lightDepth: { value: lightDepth },
        inverseProjection: { value: new THREE.Matrix4() },
        cameraWorld: { value: new THREE.Matrix4() },
        viewProjection: { value: new THREE.Matrix4() },
        lightViewProjection: { value: new THREE.Matrix4() },
        volumeMin: { value: volumeMin.clone() },
        volumeMax: { value: volumeMax.clone() },
        hazeColor: { value: hazeColor.clone() },
        density: { value: 0.006 },
        ambient: { value: 0.0015 },
        beamStrength: { value: 4 },
        beamTop: { value: beamTop },
        beamDecay: { value: 0.028 },
        beams: { value: beamValues },
        steps: { value: 48 },
        shaftMode: { value: 0 },
        enabled: { value: 1 },
      },
      vertexShader,
      fragmentShader,
    });
  }

  configure({ path, samples }) {
    if (path !== 'raymarch' && path !== 'screen-space-shafts') throw new Error(`unknown haze path: ${path}`);
    if (!Number.isInteger(samples) || samples < 1 || samples > MAX_STEPS) throw new Error(`haze samples out of range: ${samples}`);
    this.fullscreenMaterial.uniforms.shaftMode.value = path === 'raymarch' ? 0 : 1;
    this.fullscreenMaterial.uniforms.steps.value = samples;
  }

  setDepthTexture(depthTexture) {
    this.fullscreenMaterial.uniforms.depthBuffer.value = depthTexture;
  }

  render(renderer, inputBuffer, outputBuffer) {
    const u = this.fullscreenMaterial.uniforms;
    const camera = this.viewCamera;
    camera.updateMatrixWorld();
    u.inputBuffer.value = inputBuffer.texture;
    u.inverseProjection.value.copy(camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(camera.matrixWorld);
    u.viewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.lightViewProjection.value.multiplyMatrices(this.lightCamera.projectionMatrix, this.lightCamera.matrixWorldInverse);
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }
}

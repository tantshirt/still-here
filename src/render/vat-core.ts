// @ts-nocheck
// Pure VAT contract helpers shared by the Node validator, unit tests and the browser spike.
// No DOM, no Three.js: the CPU decoder here is independent of the GPU sampling path.

export const VAT_SCHEMA = 'still-here-vat/1';
export const VAT_WIDTH = 1024;
export const VARIANT_CLIPS = Object.freeze({
  standing: Object.freeze({ idle: 'stand-sway', arrive: 'arrive-step', fall: 'fall' }),
  wheelchair: Object.freeze({ idle: 'stand-sway', arrive: 'arrive', fall: 'fall' }),
});

export class VatError extends Error {
  constructor(message) { super(message); this.name = 'VatError'; }
}

const fail = message => { throw new VatError(message); };
const isInt = (value, min = 0) => Number.isInteger(value) && value >= min;
const isSha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

/** Structural manifest check. Throws VatError naming the first violation. */
export function assertManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') fail('manifest must be an object');
  if (manifest.schema !== VAT_SCHEMA) fail(`unsupported VAT schema: ${manifest.schema}`);
  if (manifest.generator?.tool !== 'Blender' || manifest.generator?.version !== '4.5.14 LTS') fail('manifest must record the Blender 4.5.14 LTS generator');
  if (manifest.fps !== 30) fail('fps must be 30');
  const cs = manifest.coordinateSystem ?? {};
  if (cs.handedness !== 'right' || cs.up !== '+Y' || cs.forward !== '+Z' || cs.units !== 'metres') fail('coordinate system must be right-handed, +Y up, +Z forward, metres');
  const tex = manifest.texture ?? {};
  if (tex.format !== 'RGBA16F' || tex.width !== VAT_WIDTH || tex.packing !== 'frame-major' || tex.filter !== 'nearest'
    || tex.mipmaps !== false || tex.colorSpace !== 'none' || tex.flipY !== false || !/little-endian/.test(tex.encoding ?? '')) fail('texture contract must be raw little-endian RGBA16F, width 1024, frame-major, nearest, no mipmaps/colour conversion/flip');
  if (tex.texelIndex !== 'frame * vertexCount + vertexId') fail('texel index formula mismatch');
  for (const key of ['clock', 'interpolation', 'loop', 'event', 'reducedMotion', 'rootMotion']) if (typeof manifest.playback?.[key] !== 'string') fail(`playback.${key} must be documented`);
  const names = Object.keys(manifest.variants ?? {}).sort();
  if (names.join() !== 'standing,wheelchair') fail(`variants must be exactly standing and wheelchair, got ${names.join()}`);
  for (const [name, variant] of Object.entries(manifest.variants)) {
    if (!isInt(variant.vertexCount, 3) || !isInt(variant.triangleCount, 1)) fail(`${name}: vertex/triangle counts must be positive integers`);
    if (!isSha(variant.topologySHA256)) fail(`${name}: topology hash missing`);
    const geometry = variant.geometry ?? {};
    if (typeof geometry.file !== 'string' || !isInt(geometry.bytes, 1) || !isSha(geometry.sha256)) fail(`${name}: geometry file/bytes/sha256 required`);
    const expected = VARIANT_CLIPS[name];
    const clipNames = Object.keys(variant.clips ?? {}).sort();
    if (clipNames.join() !== Object.values(expected).sort().join()) fail(`${name}: clips must be ${Object.values(expected).join(', ')}`);
    if (variant.restClip !== expected.idle || variant.restFrame !== 0) fail(`${name}: rest must be ${expected.idle} frame 0`);
    for (const [clipName, clip] of Object.entries(variant.clips)) {
      const where = `${name}/${clipName}`;
      if (clip.endpointIncluded !== true) fail(`${where}: endpoint must be included`);
      if (!isInt(clip.durationMs, 1) || clip.frameCount !== clip.durationMs / 1000 * manifest.fps + 1) fail(`${where}: frameCount must equal durationMs * fps + 1`);
      if (clip.loop !== (clipName === 'stand-sway')) fail(`${where}: only stand-sway loops`);
      if (!clip.loop && clip.durationMs !== 2400) fail(`${where}: event clips span the whole 2400ms`);
      const t = clip.texture ?? {};
      if (typeof t.file !== 'string' || t.width !== VAT_WIDTH || !isInt(t.height, 1) || !isSha(t.sha256)) fail(`${where}: texture file/width/height/sha256 required`);
      if (t.height !== Math.ceil(variant.vertexCount * clip.frameCount / VAT_WIDTH)) fail(`${where}: texture height must be ceil(vertexCount * frameCount / width)`);
      if (t.bytes !== t.width * t.height * 8) fail(`${where}: bytes must equal width * height * 8`);
    }
  }
  return manifest;
}

/** Look up a clip; unknown variants/clips are rejected rather than substituted. */
export function resolveClip(manifest, variantName, clipName) {
  const variant = Object.hasOwn(manifest.variants, variantName) ? manifest.variants[variantName] : fail(`unknown VAT variant: ${variantName}`);
  const clip = Object.hasOwn(variant.clips, clipName) ? variant.clips[clipName] : fail(`unknown VAT clip: ${variantName}/${clipName}`);
  return { variant, clip };
}

/**
 * Fractional frame for an unscaled clip-local clock in seconds.
 * Loops wrap over frameCount - 1 (the duplicate endpoint equals frame 0); events clamp across
 * the whole clip; reduced motion holds the rest frame.
 */
export function clipFrame(clip, seconds, fps, { reducedMotion = false, restFrame = 0 } = {}) {
  if (!Number.isFinite(seconds)) throw new TypeError('clip clock must be finite');
  if (reducedMotion) return restFrame;
  const last = clip.frameCount - 1;
  const raw = seconds * fps;
  return clip.loop ? ((raw % last) + last) % last : Math.min(last, Math.max(0, raw));
}

/** Wrap a long-running unscaled clock into one loop period using double precision (keeps GPU floats small). */
export function wrapLoopSeconds(sceneT, clip) {
  if (!Number.isFinite(sceneT)) throw new TypeError('scene clock must be finite');
  const period = clip.durationMs / 1000;
  return ((sceneT % period) + period) % period;
}

export function texelCoord(texelIndex, width = VAT_WIDTH) {
  return [texelIndex % width, Math.floor(texelIndex / width)];
}

/** IEEE 754 binary16 to number, written out explicitly (independent of Three.js DataUtils). */
export function halfToFloat(bits) {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? Number.NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

/** Read one texel's xyz from a Uint16Array of little-endian halves (host order is little-endian on every WebGL platform). */
export function decodeVertex(halves, vertexCount, frame, vertexId) {
  const base = (frame * vertexCount + vertexId) * 4;
  return [halfToFloat(halves[base]), halfToFloat(halves[base + 1]), halfToFloat(halves[base + 2])];
}

/** CPU reference for the shader: nearest texels at the two adjacent integer frames, linearly interpolated. */
export function sampleVertex(halves, vertexCount, frameCount, frame, vertexId) {
  const last = frameCount - 1;
  const f = Math.min(last, Math.max(0, frame));
  const f0 = Math.floor(f);
  const f1 = Math.min(last, f0 + 1);
  const blend = f - f0;
  const a = decodeVertex(halves, vertexCount, f0, vertexId);
  const b = decodeVertex(halves, vertexCount, f1, vertexId);
  return a.map((value, i) => value + (b[i] - value) * blend);
}

/** Decode a little-endian byte buffer into halves regardless of host endianness. */
export function halvesFromBytes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Uint16Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}

/** Lower-case hex of a digest buffer (e.g. from crypto.subtle.digest). */
export function toHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Plain SHA-256 for pages served without a secure context (e.g. a phone measuring the spike over
 * the LAN), where crypto.subtle does not exist. Returns lower-case hex.
 */
export function sha256(buffer) {
  const bytes = new Uint8Array(buffer);
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map(x => x.toString(16).padStart(8, '0')).join('');
}

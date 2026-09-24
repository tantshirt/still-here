import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  assertManifest, clipFrame, decodeVertex, halfToFloat, halvesFromBytes, resolveClip, sampleVertex, sha256, texelCoord, VatError, wrapLoopSeconds,
} from './render-spike/vat-core.js';
import { validateVat } from './validate-vat.mjs';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(join(root, 'public/vat/manifest.json'), 'utf8'));
const clone = () => structuredClone(manifest);

test('tracked manifest satisfies the versioned contract', () => {
  assert.equal(assertManifest(clone()).schema, 'still-here-vat/1');
});

test('manifest mutations are rejected, never substituted', () => {
  const cases = [
    [m => { m.schema = 'still-here-vat/2'; }, /schema/],
    [m => { m.generator.version = '4.2 LTS'; }, /Blender 4\.5\.14/],
    [m => { m.coordinateSystem.up = '+Z'; }, /coordinate/],
    [m => { m.texture.filter = 'linear'; }, /texture contract/],
    [m => { m.variants.standing.clips['stand-sway'].frameCount = 300; }, /frameCount/],
    [m => { m.variants.wheelchair.clips.fall.texture.bytes += 8; }, /bytes/],
    [m => { m.variants.standing.clips.fall.loop = true; }, /loops/],
    [m => { m.variants.standing.restFrame = 3; }, /rest/],
    [m => { m.variants.crutch = m.variants.standing; }, /variants/],
    [m => { delete m.playback.reducedMotion; }, /reducedMotion/],
  ];
  for (const [mutate, pattern] of cases) {
    const m = clone();
    mutate(m);
    assert.throws(() => assertManifest(m), error => error instanceof VatError && pattern.test(error.message));
  }
});

test('unknown variants and clips are rejected', () => {
  assert.equal(resolveClip(manifest, 'wheelchair', 'arrive').clip.frameCount, 73);
  assert.throws(() => resolveClip(manifest, 'standing', 'arrive'), /unknown VAT clip/);
  assert.throws(() => resolveClip(manifest, 'wheelchair', 'arrive-step'), /unknown VAT clip/);
  assert.throws(() => resolveClip(manifest, 'toString', 'fall'), /unknown VAT variant/);
});

test('loop wraps over frameCount - 1 with an exact seam', () => {
  const clip = manifest.variants.standing.clips['stand-sway'];
  assert.equal(clipFrame(clip, 0, 30), 0);
  assert.equal(clipFrame(clip, 10, 30), 0);
  assert.equal(clipFrame(clip, 5, 30), 150);
  assert.ok(Math.abs(clipFrame(clip, 9.999, 30) - 299.97) < 1e-9);
  assert.equal(clipFrame(clip, -1, 30), 270);
  assert.ok(Math.abs(wrapLoopSeconds(36_000.25, clip) - 0.25) < 1e-9, 'long sessions wrap in double precision');
});

test('events clamp across the complete 2400ms clip', () => {
  const clip = manifest.variants.standing.clips.fall;
  assert.equal(clipFrame(clip, -0.5, 30), 0);
  assert.equal(clipFrame(clip, 0.2, 30), 6);
  assert.equal(clipFrame(clip, 1.2, 30), 36);
  assert.equal(clipFrame(clip, 2.4, 30), 72);
  assert.equal(clipFrame(clip, 99, 30), 72);
});

test('reduced motion holds rest and non-finite clocks are rejected', () => {
  const clip = manifest.variants.wheelchair.clips['stand-sway'];
  assert.equal(clipFrame(clip, 4.321, 30, { reducedMotion: true, restFrame: 0 }), 0);
  for (const bad of [Number.NaN, Infinity, -Infinity]) {
    assert.throws(() => clipFrame(clip, bad, 30), /finite/);
    assert.throws(() => wrapLoopSeconds(bad, clip), /finite/);
  }
});

test('half decoding and texel addressing follow the frame-major layout', () => {
  assert.equal(halfToFloat(0x3c00), 1);
  assert.equal(halfToFloat(0xc000), -2);
  assert.equal(halfToFloat(0x0001), 2 ** -24);
  assert.equal(halfToFloat(0x7c00), Infinity);
  assert.ok(Number.isNaN(halfToFloat(0x7e00)));
  assert.deepEqual(texelCoord(1023), [1023, 0]);
  assert.deepEqual(texelCoord(1024), [0, 1]);
  const halves = halvesFromBytes(new Uint8Array([0x00, 0x3c, 0x00, 0x40, 0x00, 0x42, 0x00, 0x3c, 0x00, 0x40, 0x00, 0x44, 0x00, 0x46, 0x00, 0x3c]));
  assert.deepEqual(decodeVertex(halves, 1, 0, 0), [1, 2, 3]);
  assert.deepEqual(decodeVertex(halves, 1, 1, 0), [2, 4, 6]);
  assert.deepEqual(sampleVertex(halves, 1, 2, 0.25, 0), [1.25, 2.5, 3.75]);
  assert.deepEqual(sampleVertex(halves, 1, 2, 7, 0), [2, 4, 6]);
});

test('plain SHA-256 fallback matches node:crypto', async () => {
  for (const input of [new Uint8Array(0), new TextEncoder().encode('abc'), new Uint8Array(1000).map((_, i) => i * 7), await readFile(join(root, 'public/vat/standing.fall.rgba16f'))]) {
    assert.equal(sha256(input), createHash('sha256').update(input).digest('hex'));
  }
});

test('validator passes on tracked outputs and fails closed on tampered bytes', async () => {
  const report = await validateVat();
  assert.equal(report.textureBytes, 12_173_312);
  assert.equal(report.variants.standing.clips['stand-sway'].loopSeamMetres, 0);
  const dir = await mkdtemp(join(tmpdir(), 'still-here-vat-'));
  try {
    await cp(join(root, 'public/vat'), dir, { recursive: true });
    const file = join(dir, manifest.variants.standing.clips.fall.texture.file);
    const bytes = await readFile(file);
    bytes[100] ^= 0xff;
    await writeFile(file, bytes);
    await assert.rejects(validateVat({ dir }), /standing\/fall sha256/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

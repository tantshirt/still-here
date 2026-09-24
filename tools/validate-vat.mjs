import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, 'public/vat');
const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
const provenance = JSON.parse(await readFile(resolve(root, 'assets-src/vat/provenance.json'), 'utf8'));
assert.equal(manifest.schema, 'still-here-vat/1');
assert.equal(manifest.productionReady, true);
assert.equal(manifest.blenderVersion, '4.5.14 LTS');
assert.equal(manifest.fps, 30);
assert.match(manifest.coordinateSystem, /right-handed Y-up metres|right-handed Y-up meters/);
assert.match(manifest.textureFormat, /RGBA16F little-endian/);
assert.deepEqual(Object.keys(manifest.variants).sort(), ['standing', 'wheelchair']);
for (const source of provenance.sources) {
  const bytes = await readFile(resolve(root, source.localBlend));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.trackedBlendSha256);
  await readFile(resolve(root, source.licenseEvidence));
}
await readFile(resolve(root, 'assets-src/vat/mannequin-wheelchair-source.blend'));
let totalBytes = 0;
for (const [variantName, variant] of Object.entries(manifest.variants)) {
  assert.ok(Number.isInteger(variant.vertexCount) && variant.vertexCount > 0);
  assert.ok(Number.isInteger(variant.triangleCount) && variant.triangleCount > 0);
  assert.equal(variant.restFrame, 0);
  const geometryBytes = await readFile(resolve(dir, variant.geometry));
  const geometry = JSON.parse(geometryBytes);
  assert.equal(geometry.positions.length, variant.vertexCount * 3, `${variantName} position count`);
  assert.equal(geometry.indices.length, variant.triangleCount * 3, `${variantName} index count`);
  for (const [clipName, clip] of Object.entries(variant.clips)) {
    assert.equal(clip.endpointIncluded, true);
    if (clip.loop) assert.equal(clip.frameCount, clip.durationMs / 1000 * manifest.fps + 1);
    else { assert.equal(clip.durationMs, 2400); assert.equal(clip.frameCount, 73); }
    const bytes = await readFile(resolve(dir, clip.texture.file));
    assert.equal(bytes.byteLength, clip.texture.bytes, `${variantName}/${clipName} bytes`);
    assert.equal(bytes.byteLength, clip.texture.width * clip.texture.height * 8);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.texture.sha256);
    assert.ok(clip.texture.width * clip.texture.height >= variant.vertexCount * clip.frameCount);
    totalBytes += bytes.byteLength;
  }
}
assert.equal(Object.values(manifest.variants).reduce((n, v) => n + Object.keys(v.clips).length, 0), 6);
console.log(`VAT validation passed: 2 variants, 6 textures, ${totalBytes} bytes`);

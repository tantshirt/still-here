// Validates the tracked VAT contract in public/vat using only tracked files (no Blender, no ignored caches).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertManifest, decodeVertex, halvesFromBytes, halfToFloat, VARIANT_CLIPS } from './render-spike/vat-core.js';

const root = resolve(import.meta.dirname, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export async function validateVat({ dir = resolve(root, 'public/vat'), sourceRoot = root } = {}) {
  const manifest = assertManifest(JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8')));
  const provenance = JSON.parse(await readFile(resolve(sourceRoot, 'assets-src/vat/provenance.json'), 'utf8'));
  for (const source of provenance.sources) {
    assert.equal(source.license, 'CC0-1.0', `${source.title} license`);
    assert.equal(sha(await readFile(resolve(sourceRoot, source.localBlend))), source.trackedBlendSha256, `${source.localBlend} hash`);
    await readFile(resolve(sourceRoot, source.licenseEvidence));
  }
  const bake = await readFile(resolve(sourceRoot, 'assets-src/vat/bake.py'), 'utf8');
  assert.match(bake, /Blender 4\.5\.14 LTS/, 'bake header records Blender 4.5.14 LTS');
  assert.doesNotMatch(bake, /\.bmad-loop|_bmad-output/, 'bake must not read ignored directories');

  const report = { variants: {}, textureBytes: 0, geometryBytes: 0 };
  const phase = name => Object.fromEntries(manifest.eventPhasesMs[name].map(p => [p.name, p]));
  const arrival = phase('arrival');
  const departure = phase('departure');
  for (const [name, variant] of Object.entries(manifest.variants)) {
    const n = variant.vertexCount;
    const geometryBytes = await readFile(resolve(dir, variant.geometry.file));
    assert.equal(geometryBytes.byteLength, variant.geometry.bytes, `${name} geometry bytes`);
    assert.equal(sha(geometryBytes), variant.geometry.sha256, `${name} geometry sha256`);
    report.geometryBytes += geometryBytes.byteLength;
    const geometry = JSON.parse(geometryBytes);
    assert.equal(geometry.vertexCount, n);
    assert.equal(geometry.positions.length, n * 3, `${name} position count`);
    assert.equal(geometry.indices.length, variant.triangleCount * 3, `${name} index count`);
    assert.ok(geometry.indices.every(i => Number.isInteger(i) && i >= 0 && i < n), `${name} index range`);
    const triangles = [];
    for (let i = 0; i < geometry.indices.length; i += 3) triangles.push(geometry.indices.slice(i, i + 3));
    assert.equal(sha(JSON.stringify(triangles)), variant.topologySHA256, `${name} topology hash`);
    // Signed volume > 0 confirms counter-clockwise outward winding after the Z-up -> Y-up conversion.
    let volume = 0;
    const p = i => geometry.positions.slice(i * 3, i * 3 + 3);
    for (const [a, b, c] of triangles) {
      const [A, B, C] = [p(a), p(b), p(c)];
      volume += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
    }
    assert.ok(volume > 0.02, `${name} winding must be outward (signed volume ${volume})`);

    const clipReport = {};
    for (const [clipName, clip] of Object.entries(variant.clips)) {
      const where = `${name}/${clipName}`;
      const bytes = await readFile(resolve(dir, clip.texture.file));
      assert.equal(bytes.byteLength, clip.texture.bytes, `${where} bytes`);
      assert.equal(sha(bytes), clip.texture.sha256, `${where} sha256`);
      report.textureBytes += bytes.byteLength;
      const halves = halvesFromBytes(bytes);
      const used = n * clip.frameCount * 4;
      for (let i = 0; i < used; i++) {
        const value = halfToFloat(halves[i]);
        assert.ok(Number.isFinite(value), `${where} non-finite texel component ${i}`);
        if (i % 4 === 3) assert.equal(value, 1, `${where} w must be 1`);
      }
      for (let i = used; i < halves.length; i++) assert.equal(halves[i], 0, `${where} padding must be zero`);
      const frame = f => Array.from({ length: n }, (_, v) => decodeVertex(halves, n, f, v));
      const maxDelta = (a, b) => a.reduce((m, x, i) => Math.max(m, distance(x, b[i])), 0);
      const first = frame(0);
      const last = frame(clip.frameCount - 1);
      const frameAt = ms => Math.round(ms / 1000 * manifest.fps);
      const entry = { frames: clip.frameCount, durationMs: clip.durationMs, bytes: bytes.byteLength };
      if (clip.loop) {
        entry.loopSeamMetres = maxDelta(first, last);
        assert.equal(entry.loopSeamMetres, 0, `${where} loop seam must be exact`);
        const rest = Array.from({ length: n }, (_, v) => p(v));
        entry.restQuantizationMetres = maxDelta(first, rest);
        assert.ok(entry.restQuantizationMetres < 0.001, `${where} rest geometry must match frame 0`);
        entry.maxIdleMotionMetres = Math.max(...Array.from({ length: clip.frameCount }, (_, f) => maxDelta(first, frame(f))));
        assert.ok(entry.maxIdleMotionMetres > 1e-4, `${where} idle must move`);
      } else if (clipName === VARIANT_CLIPS[name].fall) {
        assert.equal(maxDelta(first, frame(frameAt(departure.extinguish.end))), 0, `${where} extinguish holds still`);
        assert.equal(maxDelta(frame(frameAt(departure.fall.end)), last), 0, `${where} dissolve holds still`);
        for (let v = 0; v < n; v++) {
          assert.ok(Math.abs(first[v][0] - last[v][0]) < 0.002 && Math.abs(first[v][2] - last[v][2]) < 0.002, `${where} falls upright`);
          assert.ok(Math.abs(first[v][1] - last[v][1] - 4) < 0.004, `${where} falls 4 m`);
        }
        entry.fallMetres = 4;
      } else {
        assert.equal(maxDelta(first, frame(frameAt(arrival.light.end))), 0, `${where} light phase holds still`);
        assert.equal(maxDelta(frame(frameAt(arrival.step.end)), last), 0, `${where} settle holds still`);
        entry.stepMetres = last[0][2] - first[0][2];
        assert.ok(Math.abs(entry.stepMetres - 0.16) < 0.002, `${where} one 0.16 m step`);
      }
      clipReport[clipName] = entry;
    }
    report.variants[name] = { vertices: n, triangles: variant.triangleCount, clips: clipReport };
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await validateVat();
  console.log(`VAT validation passed: 2 variants, 6 textures, ${report.textureBytes} texture bytes, ${report.geometryBytes} geometry bytes`);
}

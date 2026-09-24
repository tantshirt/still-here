import test from 'node:test';
import assert from 'node:assert/strict';

function sampleFrame(clip, milliseconds, reducedMotion = false, restFrame = 0) {
  if (!Number.isFinite(milliseconds)) throw new TypeError('clock must be finite');
  if (reducedMotion) return restFrame;
  const frames = clip.frameCount - 1;
  const elapsed = milliseconds / 1000 * 30;
  return clip.loop ? ((elapsed % frames) + frames) % frames : Math.min(frames, Math.max(0, elapsed));
}

test('loop uses frameCount - 1 and has an exact seam', () => {
  const clip = { frameCount: 301, loop: true };
  assert.equal(sampleFrame(clip, 0), 0);
  assert.equal(sampleFrame(clip, 10_000), 0);
});

test('event spans and clamps over the complete 2400ms', () => {
  const clip = { frameCount: 73, loop: false };
  assert.equal(sampleFrame(clip, -1), 0);
  assert.equal(sampleFrame(clip, 1_200), 36);
  assert.equal(sampleFrame(clip, 2_400), 72);
  assert.equal(sampleFrame(clip, 99_000), 72);
});

test('reduced motion holds rest and invalid clocks are rejected', () => {
  assert.equal(sampleFrame({ frameCount: 301, loop: true }, 4_000, true, 0), 0);
  assert.throws(() => sampleFrame({ frameCount: 2, loop: true }, Number.NaN), /finite/);
});

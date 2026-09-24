import { expect, it } from 'vitest';
import { standingCount } from './population';

const PMAX = 10_289_315_244;
const WORLD_NOW = 8_300_678_396;

it('returns zero when population is zero', () => {
  expect(standingCount(0, 1600, PMAX)).toBe(0);
});

it('matches the approved formula for world now', () => {
  const expected = Math.min(1600, Math.max(1, Math.ceil(1600 * (WORLD_NOW / PMAX) ** 0.55)));
  expect(standingCount(WORLD_NOW, 1600, PMAX)).toBe(expected);
  expect(standingCount(WORLD_NOW, 800, PMAX)).toBe(
    Math.min(800, Math.max(1, Math.ceil(800 * (WORLD_NOW / PMAX) ** 0.55))),
  );
});

it('honors small populations with at least one figure when P > 0', () => {
  expect(standingCount(50_000, 1600, PMAX)).toBeGreaterThanOrEqual(1);
});

it('respects Pmax in the formula', () => {
  const n = standingCount(1_000_000, 1600, PMAX);
  expect(n).toBe(Math.min(1600, Math.max(1, Math.ceil(1600 * (1_000_000 / PMAX) ** 0.55))));
});

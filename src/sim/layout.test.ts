import { expect, it } from 'vitest';
import { createStream } from './rng';
import { buildStandingLayout } from './layout';

it('is deterministic for the same seed', () => {
  const a = buildStandingLayout({
    count: 120,
    budgetB: 800,
    layout: createStream(99, 'layout'),
    sway: createStream(99, 'sway'),
  });
  const b = buildStandingLayout({
    count: 120,
    budgetB: 800,
    layout: createStream(99, 'layout'),
    sway: createStream(99, 'sway'),
  });
  expect(a).toEqual(b);
});

it('marks the top fifteen percent of the budget as second tier', () => {
  const budgetB = 800;
  const layout = buildStandingLayout({
    count: 200,
    budgetB,
    layout: createStream(7, 'layout'),
    sway: createStream(7, 'sway'),
  });
  const tierCount = layout.filter(slot => slot.tier === 1).length;
  expect(tierCount).toBe(Math.ceil(budgetB * 0.15));
});

it('spreads wheelchairs without concentrating at the front', () => {
  const layout = buildStandingLayout({
    count: 400,
    budgetB: 1600,
    layout: createStream(3, 'layout'),
    sway: createStream(3, 'sway'),
  });
  const wheelchairs = layout.filter(slot => slot.wheelchair);
  expect(wheelchairs.length).toBeGreaterThan(0);
  const front = layout.slice(0, Math.floor(layout.length * 0.2));
  const frontWheelchairs = front.filter(slot => slot.wheelchair).length;
  expect(frontWheelchairs).toBeLessThan(wheelchairs.length);
});

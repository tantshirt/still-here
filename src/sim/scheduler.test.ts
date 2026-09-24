import { expect, it } from 'vitest';
import { createSession } from './rng';
import { standingCount } from './population';
import {
  annualRates,
  createScheduler,
  eventDuration,
  mergeStandingHidden,
  secondsInYear,
} from './scheduler';
import { buildStandingLayout } from './layout';

const Pmax = 10_289_315_244;
const rmax = 7.529912068746829;

function layoutSlots(population: number, budgetB: 800 | 1600 = 800) {
  const count = standingCount(population, budgetB, Pmax);
  const session = createSession(42);
  return buildStandingLayout({
    count,
    budgetB,
    layout: session.streams.layout,
    sway: session.streams.sway,
  });
}

function makeScheduler(seed = 42, rates = annualRates({ births: 139_577_077, deaths: 60_123_456 }, 2026), population = 8_300_678_396) {
  const session = createSession(seed);
  const slots = layoutSlots(population);
  const scheduler = createScheduler(session, rmax);
  scheduler.applySelection(rates, slots);
  return { session, scheduler, slots, rates };
}

function run(scheduler: ReturnType<typeof createScheduler>, slots: ReturnType<typeof layoutSlots>, dt: number, count: number) {
  const edges = [];
  for (let i = 0; i < count; i += 1) edges.push(...scheduler.step(dt, true, slots).started);
  return edges;
}

it('converts annual totals to per-second rates with Gregorian years', () => {
  expect(secondsInYear(2000)).toBe(366 * 86_400);
  expect(secondsInYear(2026)).toBe(365 * 86_400);
  expect(annualRates({ births: 0, deaths: 0 }, 2026)).toEqual({ birthsPerSecond: 0, deathsPerSecond: 0 });
  expect(() => annualRates({ births: Number.NaN, deaths: 1 }, 2026)).toThrow(/invalid annual totals/);
  expect(() => secondsInYear(2101)).toThrow(/unsupported year/);
});

it('keeps fractional schedule progress across speed changes', () => {
  const a = makeScheduler();
  const b = makeScheduler();
  run(a.scheduler, a.slots, 0.05, 10);
  run(b.scheduler, b.slots, 0.05, 10);
  a.scheduler.setSpeed(4);
  const fast = run(a.scheduler, a.slots, 0.05, 5);
  const slow = run(b.scheduler, b.slots, 0.05, 20);
  expect(fast.map(event => [event.id, event.kind])).toEqual(slow.map(event => [event.id, event.kind]));
  expect(Math.abs(a.scheduler.snapshot().clocks.scheduleT - b.scheduler.snapshot().clocks.scheduleT)).toBeLessThan(1e-8);
});

it('filters show without dropping scheduled ids', () => {
  const a = makeScheduler();
  const b = makeScheduler();
  a.scheduler.setShow('arrivals');
  const hidden = run(a.scheduler, a.slots, 0.1, 100);
  run(b.scheduler, b.slots, 0.1, 100);
  expect(hidden.every(event => event.kind === 'birth')).toBe(true);
  a.scheduler.setShow('both');
  expect(run(a.scheduler, a.slots, 0.1, 100).map(event => [event.id, event.kind, event.tStart]))
    .toEqual(run(b.scheduler, b.slots, 0.1, 100).map(event => [event.id, event.kind, event.tStart]));
});

it('marks standing slots occupied false during an active death', () => {
  const { scheduler, slots } = makeScheduler(42, { birthsPerSecond: 0, deathsPerSecond: 0.1 }, 8_300_678_396);
  let actor;
  for (let i = 0; i < 1100 && !actor; i += 1) actor = scheduler.step(0.01, true, slots).started[0];
  expect(actor?.kind).toBe('death');
  const merged = mergeStandingHidden(slots, scheduler.snapshot().hidden);
  expect(merged[actor!.standingIndex]?.occupied).toBe(false);
  while (scheduler.snapshot().clocks.sceneT < actor!.tStart + eventDuration + 0.01) scheduler.step(0.01, true, slots);
  expect(mergeStandingHidden(slots, scheduler.snapshot().hidden)[actor!.standingIndex]?.occupied).toBe(true);
});

it('does not drop events across seeds for a one-minute slice', () => {
  const rates = annualRates({ births: 139_577_077, deaths: 60_123_456 }, 2026);
  for (let seed = 0; seed < 8; seed += 1) {
    const session = createSession(seed);
    const slots = layoutSlots(8_300_678_396);
    const scheduler = createScheduler(session, rmax);
    scheduler.applySelection(rates, slots);
    const events = run(scheduler, slots, 0.05, 1200);
    expect(new Set(events.map(event => event.id)).size).toBe(events.length);
    expect(events.length).toBeGreaterThan(0);
  }
});

it('preserves cadence across dt partitions', () => {
  for (let seed = 0; seed < 4; seed += 1) {
    const a = makeScheduler(seed);
    const b = makeScheduler(seed);
    const coarse = run(a.scheduler, a.slots, 0.1, 200);
    const fine = run(b.scheduler, b.slots, 0.025, 800);
    expect(coarse.length).toBe(fine.length);
    for (let i = 0; i < coarse.length; i += 1) {
      expect(coarse[i]?.id).toBe(fine[i]?.id);
      expect(coarse[i]?.kind).toBe(fine[i]?.kind);
      expect(Math.abs((coarse[i]?.tStart ?? 0) - (fine[i]?.tStart ?? 0))).toBeLessThan(1e-8);
    }
  }
});

it('pauses without accumulating schedule time', () => {
  const a = makeScheduler();
  const b = makeScheduler();
  run(a.scheduler, a.slots, 0.1, 10);
  run(b.scheduler, b.slots, 0.1, 10);
  const before = a.scheduler.snapshot();
  expect(a.scheduler.step(10, false, a.slots).started).toEqual([]);
  expect(a.scheduler.snapshot().clocks).toEqual(before.clocks);
  expect(run(a.scheduler, a.slots, 0.1, 10).map(event => event.id)).toEqual(run(b.scheduler, b.slots, 0.1, 10).map(event => event.id));
});

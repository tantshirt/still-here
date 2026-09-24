import { tokens } from '../generated/tokens';
import type { SessionSeed } from './rng';
import type { Actor, EventKind, SelectionRates, Show, SimEvent, StandingSlot } from './types';

export const eventDuration = tokens.motion.event / 1000;

export function secondsInYear(year: number): number {
  if (!Number.isInteger(year) || year < 1950 || year > 2100) throw new Error('unsupported year');
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (leap ? 366 : 365) * 86_400;
}

export function annualRates(totals: { readonly births: number; readonly deaths: number }, year: number): SelectionRates {
  const seconds = secondsInYear(year);
  if (![totals.births, totals.deaths].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error('invalid annual totals');
  }
  return { birthsPerSecond: totals.births / seconds, deathsPerSecond: totals.deaths / seconds };
}

interface InternalRates {
  readonly birth: number;
  readonly death: number;
}

function toInternal(rates: SelectionRates): InternalRates {
  return { birth: rates.birthsPerSecond, death: rates.deathsPerSecond };
}

export interface SchedulerClocks {
  sceneT: number;
  scheduleT: number;
}

export interface SchedulerStepResult {
  readonly clocks: SchedulerClocks;
  readonly actors: readonly Actor[];
  readonly started: readonly SimEvent[];
  readonly hidden: readonly number[];
}

export interface SchedulerSnapshot {
  readonly clocks: SchedulerClocks;
  readonly actors: readonly Actor[];
  readonly hidden: readonly number[];
}

export function createScheduler(session: SessionSeed, rmax: number) {
  if (!Number.isFinite(rmax) || rmax <= 0) throw new Error('invalid rmax');
  const capacity = Math.ceil(rmax * 4 * eventDuration) + 2;
  let clocks: SchedulerClocks = { sceneT: 0, scheduleT: 0 };
  let speed: 0.25 | 1 | 4 = 1;
  let show: Show = 'both';
  let actors: Actor[] = [];
  let hidden: number[] = [];
  let next: { birth: number; death: number } = { birth: Infinity, death: Infinity };
  let currentRates: InternalRates = { birth: 0, death: 0 };
  let cursor = 0;

  const visible = (kind: EventKind) => show === 'both' || (show === 'arrivals' ? kind === 'birth' : kind === 'death');

  function restore(actor: Actor): void {
    if (actor.kind === 'death' && actor.standingIndex >= 0 && hidden[actor.standingIndex] !== undefined) {
      hidden[actor.standingIndex] = Math.max(0, hidden[actor.standingIndex]! - 1);
    }
  }

  function retire(time: number): void {
    actors = actors.filter(actor => {
      if (actor.tStart + eventDuration <= time + 1e-10) {
        restore(actor);
        return false;
      }
      return true;
    });
  }

  function resetHidden(slotCount: number): void {
    hidden = Array.from({ length: slotCount }, () => 0);
    cursor = 0;
  }

  function applySelection(rates: SelectionRates, slots: readonly StandingSlot[]): void {
    const internal = toInternal(rates);
    if (![internal.birth, internal.death].every(value => Number.isFinite(value) && value >= 0)
      || internal.birth + internal.death > rmax + 1e-10) {
      throw new Error('rates exceed global bound');
    }
    currentRates = { ...internal };
    actors = [];
    resetHidden(slots.length);
    clocks = { sceneT: 0, scheduleT: 0 };
    next = {
      birth: internal.birth ? clocks.scheduleT + session.streams.birthPhase() / internal.birth : Infinity,
      death: internal.death ? clocks.scheduleT + session.streams.deathPhase() / internal.death : Infinity,
    };
  }

  function resize(slots: readonly StandingSlot[]): void {
    actors = [];
    resetHidden(slots.length);
  }

  function setShow(value: Show): void {
    if (!['both', 'arrivals', 'departures'].includes(value)) throw new Error('invalid show');
    show = value;
    actors = actors.filter(actor => {
      if (!visible(actor.kind)) {
        restore(actor);
        return false;
      }
      return true;
    });
  }

  function setSpeed(value: 0.25 | 1 | 4): void {
    if (![0.25, 1, 4].includes(value)) throw new Error('invalid speed');
    speed = value;
  }

  function retry(slots: readonly StandingSlot[]): void {
    applySelection(
      { birthsPerSecond: currentRates.birth, deathsPerSecond: currentRates.death },
      slots,
    );
  }

  function snapshot(): SchedulerSnapshot {
    return { clocks: { ...clocks }, actors: actors.map(actor => ({ ...actor })), hidden: [...hidden] };
  }

  function step(rawDelta: number, active: boolean, slots: readonly StandingSlot[]): SchedulerStepResult {
    if (!Number.isFinite(rawDelta) || rawDelta < 0) throw new Error('invalid delta');
    const started: SimEvent[] = [];
    const dt = active ? Math.min(rawDelta, 0.1) : 0;
    if (dt === 0) {
      return { clocks: { ...clocks }, actors: actors.map(actor => ({ ...actor })), started, hidden: [...hidden] };
    }
    const end = clocks.scheduleT + dt * speed;
    while (Math.min(next.birth, next.death) <= end + 1e-10) {
      const kind: EventKind = next.birth <= next.death ? 'birth' : 'death';
      const at = next[kind];
      next[kind] += 1 / currentRates[kind];
      const tStart = clocks.sceneT + Math.max(0, (at - clocks.scheduleT) / speed);
      retire(tStart);
      const id = session.nextEventId++;
      if (!visible(kind)) continue;
      const used = new Set(actors.map(actor => actor.actorSlot));
      let actorSlot = 0;
      while (used.has(actorSlot)) actorSlot += 1;
      if (actorSlot >= capacity) throw new Error('actor capacity invariant violated');
      let standingIndex = slots.length ? cursor++ % slots.length : -1;
      if (kind === 'death' && slots.length) {
        const available = hidden.findIndex(count => count === 0);
        if (available >= 0) standingIndex = available;
        hidden[standingIndex] = (hidden[standingIndex] ?? 0) + 1;
      }
      const actor: Actor = {
        kind,
        id,
        actorId: session.nextActorId++,
        actorSlot,
        standingIndex,
        tStart,
      };
      actors.push(actor);
      started.push(actor);
    }
    clocks = { sceneT: clocks.sceneT + dt, scheduleT: end };
    retire(clocks.sceneT);
    return {
      clocks: { ...clocks },
      actors: actors.map(a => ({ ...a })),
      started,
      hidden: [...hidden],
    };
  }

  return {
    capacity,
    snapshot,
    applySelection,
    resize,
    retry,
    setShow,
    setSpeed,
    step,
  };
}

export function mergeStandingHidden(slots: readonly StandingSlot[], hidden: readonly number[]): readonly StandingSlot[] {
  return slots.map((slot, index) => Object.freeze({
    ...slot,
    occupied: (hidden[index] ?? 0) === 0,
  }));
}

import type { SessionSeed } from './rng';
import { buildStandingLayout } from './layout';
import { standingCount } from './population';
import { createScheduler, mergeStandingHidden } from './scheduler';
import type {
  FrameStats,
  Presentation,
  ReflectionReleaseReason,
  SelectionRates,
  Show,
  SimAppEvent,
  SimPort,
  SimSnapshot,
  SimStep,
} from './types';
export * from './types';
export * from './rng';
export * from './population';
export * from './layout';
export * from './clock';
export * from './scheduler';

function freezeSnapshot(snapshot: SimSnapshot): SimSnapshot {
  return Object.freeze({
    ...snapshot,
    standing: Object.freeze({ count: snapshot.standing.count, slots: Object.freeze(snapshot.standing.slots) }),
    actors: Object.freeze(snapshot.actors),
    started: Object.freeze(snapshot.started),
  });
}

export function createSimulation(session: SessionSeed): SimPort & { readonly session: SessionSeed } {
  let presentation: Presentation = { reducedMotion: false, budgetB: 800 };
  let population = 0;
  let pmax = 1;
  let rmax = 1;
  let rates: SelectionRates = { birthsPerSecond: 0, deathsPerSecond: 0 };
  let show: Show = 'both';
  let slots: SimSnapshot['standing']['slots'] = [];
  let scheduler = createScheduler(session, rmax);

  function ensureScheduler(nextRmax: number): void {
    if (nextRmax !== rmax) scheduler = createScheduler(session, nextRmax);
  }

  function repopulate(): void {
    const count = standingCount(population, presentation.budgetB, pmax);
    slots = buildStandingLayout({
      count,
      budgetB: presentation.budgetB,
      layout: session.streams.layout,
      sway: session.streams.sway,
    });
  }

  function buildSnapshot(
    actors: SimSnapshot['actors'],
    started: SimSnapshot['started'],
    hidden: readonly number[],
    clocks: { sceneT: number; scheduleT: number },
  ): SimSnapshot {
    return freezeSnapshot({
      sceneT: clocks.sceneT,
      scheduleT: clocks.scheduleT,
      standing: { count: slots.length, slots: mergeStandingHidden(slots, hidden) },
      actors,
      started,
    });
  }

  return {
    session,
    step(dt: number, frameStats: FrameStats): SimStep {
      const active = frameStats.active !== false;
      const result = scheduler.step(dt, active, slots);
      return {
        snapshot: buildSnapshot(result.actors, result.started, result.hidden, result.clocks),
        events: [] as readonly SimAppEvent[],
      };
    },
    applySelection(nextRates: SelectionRates, nextPopulation: number, nextPmax: number, nextRmax: number): void {
      rates = nextRates;
      population = nextPopulation;
      pmax = nextPmax;
      ensureScheduler(nextRmax);
      rmax = nextRmax;
      repopulate();
      scheduler.applySelection(rates, slots);
    },
    retry(): void {
      scheduler.retry(slots);
    },
    setPresentation(next: Presentation): void {
      const budgetChanged = next.budgetB !== presentation.budgetB;
      presentation = next;
      if (budgetChanged) {
        repopulate();
        scheduler.resize(slots);
      }
    },
    setShow(next: Show): void {
      show = next;
      scheduler.setShow(show);
    },
    setSpeed(next: 0.25 | 1 | 4): void {
      scheduler.setSpeed(next);
    },
    setAttentionPaused(_paused: boolean): void { void _paused; },
    releaseReflection(_reason: ReflectionReleaseReason): void { void _reason; },
  };
}

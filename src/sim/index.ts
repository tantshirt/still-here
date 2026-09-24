import type { SessionSeed } from './rng';
import { advanceClocks } from './clock';
import { buildStandingLayout } from './layout';
import { standingCount } from './population';
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

function freezeSnapshot(snapshot: SimSnapshot): SimSnapshot {
  return Object.freeze({
    ...snapshot,
    standing: Object.freeze({ count: snapshot.standing.count, slots: Object.freeze(snapshot.standing.slots) }),
    actors: Object.freeze(snapshot.actors),
    started: Object.freeze(snapshot.started),
  });
}

export function createSimulation(session: SessionSeed): SimPort & { readonly session: SessionSeed } {
  let clocks = { sceneT: 0, scheduleT: 0 };
  let presentation: Presentation = { reducedMotion: false, budgetB: 800 };
  let speed: 0.25 | 1 | 4 = 1;
  let population = 0;
  let pmax = 1;
  let slots: SimSnapshot['standing']['slots'] = [];

  function repopulate(): void {
    const count = standingCount(population, presentation.budgetB, pmax);
    slots = buildStandingLayout({
      count,
      budgetB: presentation.budgetB,
      layout: session.streams.layout,
      sway: session.streams.sway,
    });
  }

  function snapshot(): SimSnapshot {
    return freezeSnapshot({
      sceneT: clocks.sceneT,
      scheduleT: clocks.scheduleT,
      standing: { count: slots.length, slots },
      actors: [],
      started: [],
    });
  }

  return {
    session,
    step(dt: number, _frameStats: FrameStats): SimStep {
      void _frameStats;
      if (dt > 0) clocks = advanceClocks(clocks, dt, speed);
      return { snapshot: snapshot(), events: [] as readonly SimAppEvent[] };
    },
    applySelection(nextRates: SelectionRates, nextPopulation: number, nextPmax: number): void {
      void nextRates;
      population = nextPopulation;
      pmax = nextPmax;
      repopulate();
    },
    setPresentation(next: Presentation): void {
      const budgetChanged = next.budgetB !== presentation.budgetB;
      presentation = next;
      if (budgetChanged) repopulate();
    },
    setShow(_show: Show): void { void _show; },
    setSpeed(next: 0.25 | 1 | 4): void { speed = next; },
    setAttentionPaused(_paused: boolean): void { void _paused; },
    releaseReflection(_reason: ReflectionReleaseReason): void { void _reason; },
  };
}

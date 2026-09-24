import type { SessionSeed } from './rng';
import type { SimPort, SimSnapshot } from './types';
export * from './types';
export * from './rng';
const emptySnapshot: SimSnapshot = Object.freeze({
  sceneT: 0, scheduleT: 0,
  standing: Object.freeze({ count: 0, slots: Object.freeze([]) }),
  actors: Object.freeze([]), started: Object.freeze([]),
});
/** Intentionally inert scaffold. Scheduling and all commands arrive in later stories. */
export function createSimulation(session: SessionSeed): SimPort & { readonly session: SessionSeed } {
  return {
    session,
    step: () => ({ snapshot: emptySnapshot, events: [] }),
    applySelection() {}, setPresentation() {}, setShow() {}, setSpeed() {},
    setAttentionPaused() {}, releaseReflection() {},
  };
}

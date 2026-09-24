export type EventKind = 'birth' | 'death';
export interface SimEvent {
  readonly kind: EventKind;
  readonly id: number;
  readonly actorSlot: number;
  readonly standingIndex: number;
  readonly tStart: number;
}
export interface StandingSlot {
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly seed: number;
  readonly occupied: boolean;
  readonly tier: 0 | 1;
  readonly wheelchair: boolean;
  readonly swayPhase: number;
}
export interface Actor extends SimEvent { readonly actorId: number }
export interface SimSnapshot {
  readonly sceneT: number;
  readonly scheduleT: number;
  readonly standing: { readonly count: number; readonly slots: readonly StandingSlot[] };
  readonly actors: readonly Actor[];
  readonly started: readonly SimEvent[];
}
export type SimAppEvent =
  | { readonly type: 'REFLECTION_RESERVED'; readonly reflectionId: string; readonly actorId: number }
  | { readonly type: 'REFLECTION_READY'; readonly reflectionId: string }
  | { readonly type: 'FIRST_FALL_SEEN' }
  | { readonly type: 'KEY_CHANGE_FINISHED' };
export interface FrameStats { readonly fps: number }
export interface SimStep { readonly snapshot: SimSnapshot; readonly events: readonly SimAppEvent[] }
export interface SelectionRates { readonly birthsPerSecond: number; readonly deathsPerSecond: number }
export type Show = 'both' | 'arrivals' | 'departures';
export interface Presentation { readonly reducedMotion: boolean; readonly budgetB: 800 | 1600 }
export type ReflectionReleaseReason = 'dismissed' | 'selection' | 'overlay';
/** Synchronous commands only. Simulation owns scene truth; views never call this port. */
export interface SimPort {
  step(dt: number, frameStats: FrameStats): SimStep;
  applySelection(rates: SelectionRates, population: number, pmax: number): void;
  setPresentation(presentation: Presentation): void;
  setShow(show: Show): void;
  setSpeed(speed: 0.25 | 1 | 4): void;
  setAttentionPaused(paused: boolean): void;
  releaseReflection(reason: ReflectionReleaseReason): void;
}

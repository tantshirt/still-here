import type { SessionSeed, SimAppEvent, SelectionRates, Show } from '../sim';
export type When = { readonly kind: 'now' } | { readonly kind: 'year'; readonly year: number };
export interface Selection { readonly place: string; readonly when: When }
export type Camera = 'under' | 'level' | 'above';
export type FallbackReason = 'noWebGL' | 'lowPerf' | 'contextLost' | 'initTimeout' | 'noWorldData';
export type Reflection = { readonly kind: 'none' } | { readonly kind: 'teaser' | 'expanded'; readonly id: string };
export interface AppContext {
  readonly phase: 'opening' | 'cut' | 'preparing';
  readonly session: SessionSeed;
  readonly selection: Selection;
  readonly pending: Selection | null;
  readonly unavailable: readonly Selection[];
  readonly nowYear: number | null;
  readonly ready: boolean;
  readonly visible: boolean;
  readonly pausedByUser: boolean;
  readonly sound: boolean;
  readonly reducedMotion: boolean;
  readonly budgetB: 800 | 1600;
  readonly show: Show;
  readonly speed: 0.25 | 1 | 4;
  readonly camera: Camera;
  readonly overlay: 'none' | 'controls' | 'about';
  readonly reflection: Reflection;
  readonly fallback: FallbackReason | null;
}
export type AppEvent = SimAppEvent
  | { readonly type: 'ENTER' | 'RETRY' | 'SCENE_READY' | 'TOGGLE_PAUSE' | 'TOGGLE_SOUND' | 'RETURN_TO_NOW' | 'DISMISS_REFLECTION' }
  | { readonly type: 'VISIBILITY'; readonly visible: boolean }
  | { readonly type: 'SELECT_PLACE'; readonly place: string }
  | { readonly type: 'SELECT_YEAR'; readonly year: number }
  | { readonly type: 'SELECTION_LOADED'; readonly rates: SelectionRates; readonly population: number }
  | { readonly type: 'SELECTION_UNAVAILABLE' }
  | { readonly type: 'REDUCED_MOTION_CHANGED'; readonly enabled: boolean }
  | { readonly type: 'VIEWPORT_CLASS'; readonly value: 'compact' | 'wide' }
  | { readonly type: 'SELECT_SHOW'; readonly show: Show }
  | { readonly type: 'SELECT_SPEED'; readonly speed: 0.25 | 1 | 4 }
  | { readonly type: 'SELECT_CAMERA'; readonly camera: Camera }
  | { readonly type: 'HALT' }
  | { readonly type: 'FALLBACK'; readonly reason: FallbackReason };

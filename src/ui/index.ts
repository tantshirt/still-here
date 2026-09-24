import type { AppContext } from '../app';
import type { SimSnapshot } from '../sim';
// Structural presentation input is supplied by main; UI never imports render.
export interface UiFrame { readonly teaserAnchor: { readonly x: number; readonly y: number } | null; readonly fps: number }
export interface UiPort { update(snapshot: SimSnapshot, state: Omit<AppContext, 'session'>, frame: UiFrame): void; dispose(): void }
export function createUi(): UiPort { return { update() {}, dispose() {} }; }

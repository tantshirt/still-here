import type { SimEvent } from '../sim';
export interface AudioPort {
  unlock(): void;
  setEnabled(enabled: boolean): void;
  update(started: readonly SimEvent[]): void;
  dispose(): void;
}
/** Gesture seam exists; audio context and playback arrive in their stories. */
export function createAudio(): AudioPort { return { unlock() {}, setEnabled() {}, update() {}, dispose() {} }; }

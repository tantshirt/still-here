import type { SimEvent } from '../sim';
export interface AudioPort {
  unlock(): void;
  setEnabled(enabled: boolean): void;
  update(started: readonly SimEvent[]): void;
  dispose(): void;
}
/** The accepted gesture creates a context, but never a source or playback. */
export function createAudio(): AudioPort {
  let context: AudioContext | undefined;
  let attempted = false;
  let disposed = false;
  return {
    unlock() {
      if (attempted || disposed) return;
      attempted = true;
      try {
        if (typeof globalThis.AudioContext !== 'function') return;
        context = new AudioContext();
        if (context.state === 'suspended') void context.resume().catch(() => {});
      } catch { /* Audio availability must never block entry. */ }
    },
    setEnabled() {},
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      try { if (context && context.state !== 'closed') void context.close().catch(() => {}); }
      catch { /* A failed or already closed context needs no further cleanup. */ }
      context = undefined;
    },
  };
}

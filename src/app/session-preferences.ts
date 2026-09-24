export type PreferenceKey = 'sh.sound' | 'sh.pausedByUser';
type SessionStore = Pick<Storage, 'getItem' | 'setItem'>;
const approved = (key: unknown): key is PreferenceKey => key === 'sh.sound' || key === 'sh.pausedByUser';

/** Resolve storage lazily inside the guard: even the browser getter may throw. */
export function createSessionPreferences(getStorage: () => SessionStore = () => window.sessionStorage) {
  return {
    read(key: PreferenceKey, fallback = false): boolean {
      if (typeof fallback !== 'boolean') fallback = false;
      if (!approved(key)) return fallback;
      try {
        const value = getStorage().getItem(key);
        return value === 'true' ? true : value === 'false' ? false : fallback;
      } catch { return fallback; }
    },
    write(key: PreferenceKey, value: boolean): void {
      if (!approved(key) || typeof value !== 'boolean') return;
      try { getStorage().setItem(key, String(value)); } catch { /* Preferences are optional. */ }
    },
  };
}

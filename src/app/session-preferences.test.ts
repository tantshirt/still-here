import { describe, expect, it, vi } from 'vitest';
import { createSessionPreferences } from './session-preferences';
import type { PreferenceKey } from './session-preferences';

describe('session preferences', () => {
  it('round trips only approved booleans and defaults malformed or missing values', () => {
    const values = new Map<string, string>();
    const preferences = createSessionPreferences(() => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }));
    for (const key of ['sh.sound', 'sh.pausedByUser'] as const) {
      expect(preferences.read(key)).toBe(false);
      preferences.write(key, true); expect(preferences.read(key)).toBe(true);
      preferences.write(key, false); expect(preferences.read(key, true)).toBe(false);
      for (const value of ['1', 'null', 'TRUE', '{}', '']) {
        values.set(key, value); expect(preferences.read(key, true)).toBe(true);
      }
    }
  });
  it('catches getter, read and write failures', () => {
    for (const getStorage of [() => { throw Error('getter denied'); }, () => ({ getItem: () => { throw Error('read denied'); }, setItem: () => { throw Error('quota'); } })]) {
      const preferences = createSessionPreferences(getStorage);
      expect(preferences.read('sh.sound', true)).toBe(true);
      expect(() => preferences.write('sh.sound', true)).not.toThrow();
    }
    expect(createSessionPreferences().read('sh.sound')).toBe(false);
  });
  it('rejects invalid runtime keys and values before touching storage', () => {
    const getter = vi.fn(); const preferences = createSessionPreferences(getter);
    expect(preferences.read('other' as PreferenceKey, true)).toBe(true);
    preferences.write('other' as PreferenceKey, true);
    preferences.write('sh.sound', 'true' as unknown as boolean);
    expect(getter).not.toHaveBeenCalled();
    const runtimeFallback = createSessionPreferences(() => ({ getItem: () => null, setItem: () => undefined }));
    expect(runtimeFallback.read('sh.sound', 'true' as unknown as boolean)).toBe(false);
  });
});

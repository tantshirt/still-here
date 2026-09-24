import { reflectionsUrl, type ReflectionRecord } from '../generated/reflections';

let cache: Promise<readonly ReflectionRecord[]> | undefined;

function validate(value: unknown): readonly ReflectionRecord[] {
  if (!Array.isArray(value)) throw new Error('Malformed reflections');
  return value.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Malformed reflections[${index}]`);
    const record = raw as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.join('|') !== 'id|reflection|teaser') throw new Error(`Malformed reflections[${index}]`);
    for (const key of keys) {
      if (typeof record[key] !== 'string' || !(record[key] as string).trim()) {
        throw new Error(`Malformed reflections[${index}].${key}`);
      }
    }
    return Object.freeze({
      id: record.id as string,
      teaser: record.teaser as string,
      reflection: record.reflection as string,
    });
  });
}

export function loadReflections(): Promise<readonly ReflectionRecord[]> {
  if (!cache) {
    cache = fetch(new URL(reflectionsUrl, window.location.href).href)
      .then(response => {
        if (!response.ok) throw new Error(`Reflection request failed (${response.status})`);
        return response.json() as Promise<unknown>;
      })
      .then(validate)
      .catch(error => {
        cache = undefined;
        if (import.meta.env.DEV) console.warn('[still-here] reflections unavailable', error);
        throw error;
      });
  }
  return cache;
}

export function resetReflectionLoaderForTests(): void {
  cache = undefined;
}

export type { ReflectionRecord };

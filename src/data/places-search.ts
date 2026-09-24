import type { PlaceMetadata } from './types';

const groupOrder = { world: 0, region: 1, country: 2 } as const;

const fold = (value: string): string => value.normalize('NFC').toLowerCase();

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export type PlaceSearch = (query: string) => readonly PlaceMetadata[];

/** Case-insensitive contiguous name/alias match; preserves every source record. */
export function createPlaceSearch(places: readonly PlaceMetadata[]): PlaceSearch {
  if (!Array.isArray(places)) throw new TypeError('places must be an array');
  const seen = new Set<string>();
  const index = places.map(place => {
    if (
      !place
      || typeof place.id !== 'string'
      || !place.id
      || seen.has(place.id)
      || typeof place.name !== 'string'
      || !place.name
      || !Object.hasOwn(groupOrder, place.kind)
      || !Array.isArray(place.aliases)
      || place.aliases.some((alias: string) => typeof alias !== 'string')
    ) {
      throw new TypeError('invalid or duplicate place record');
    }
    seen.add(place.id);
    const record = Object.freeze({
      ...place,
      aliases: Object.freeze([...place.aliases]),
      coverage: Object.freeze({ ...place.coverage }),
    });
    return {
      record,
      name: fold(place.name),
      terms: [fold(place.name), ...place.aliases.map(fold)],
    };
  });
  return (query: string) => {
    if (typeof query !== 'string') throw new TypeError('query must be a string');
    const needle = fold(query.trim());
    return index
      .flatMap(entry => {
        const matches = entry.terms.filter(term => term.includes(needle));
        if (!matches.length) return [];
        const rank = needle
          ? Math.min(...matches.map(term => (term === needle ? 0 : term.startsWith(needle) ? 1 : 2)))
          : 0;
        return [{ ...entry, rank }];
      })
      .sort(
        (a, b) => groupOrder[a.record.kind as keyof typeof groupOrder] - groupOrder[b.record.kind as keyof typeof groupOrder]
          || a.rank - b.rank
          || compare(a.name, b.name)
          || compare(a.record.id, b.record.id),
      )
      .map(entry => entry.record);
  };
}

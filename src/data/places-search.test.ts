import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { PlaceMetadata } from './types';
import { createPlaceSearch } from './places-search';

const placesPath = fileURLToPath(new URL('../../public/data/places.ceebc9f4be6db4a3.json', import.meta.url));
const places = JSON.parse(readFileSync(placesPath, 'utf8')) as PlaceMetadata[];
const search = createPlaceSearch(places);

describe('createPlaceSearch', () => {
  it('lists World first, then regions and countries for empty query', () => {
    const all = search('');
    expect(all.length).toBe(273);
    expect(all[0]?.id).toBe('001');
    expect(all.slice(1, 36).every(place => place.kind === 'region')).toBe(true);
    expect(all.slice(36).every(place => place.kind === 'country')).toBe(true);
    expect(search('  \n ')).toEqual(all);
  });

  it('matches names and aliases case-insensitively', () => {
    const namibia = places.find(place => place.iso2 === 'NA');
    expect(namibia).toBeDefined();
    expect(search('NA').some(place => place.id === namibia!.id)).toBe(true);
    expect(search('world')[0]?.id).toBe('001');
  });

  it('returns empty results without injecting World', () => {
    expect(search('no_such_place_9834')).toEqual([]);
  });

  it('keeps ranking deterministic and records immutable', () => {
    const reversed = createPlaceSearch([...places].reverse());
    for (const query of ['', 'a', 'na', 'united']) {
      expect(reversed(query)).toEqual(search(query));
    }
    expect(() => {
      (search('')[0] as { name: string }).name = 'changed';
    }).toThrow();
  });

  it('rejects malformed inputs', () => {
    expect(() => createPlaceSearch([...places, places[0]!])).toThrow();
    expect(() => search(null as unknown as string)).toThrow();
  });
});

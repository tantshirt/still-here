import type { DataConstants, DataManifest, PlaceMetadata, PlaceSeries } from './types';
export type * from './types';
const requests = new Map<string, Promise<unknown>>();
function object(value: unknown, label: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Malformed ${label}`);
    }
    return value as Record<string, unknown>;
}
function fetchJSON(url: URL): Promise<unknown> {
    const key = url.href;
    const existing = requests.get(key);
    if (existing)
        return existing;
    const request = fetch(url)
        .then((response) => {
        if (!response.ok)
            throw new Error(`Data request failed (${response.status}): ${key}`);
        return response.json() as Promise<unknown>;
    })
        .catch((error: unknown) => {
        requests.delete(key);
        throw error;
    });
    requests.set(key, request);
    return request;
}
async function validated<T>(url: URL, validate: (value: unknown) => T): Promise<T> {
    try {
        return validate(await fetchJSON(url));
    }
    catch (error) {
        requests.delete(url.href);
        throw error;
    }
}
const baseURL = () => new URL('/data/', window.location.href);
function validateManifest(value: unknown): DataManifest {
    const manifest = object(value, 'data manifest');
    const files = object(manifest.files, 'manifest files');
    const source = object(manifest.source, 'manifest source');
    const requiredFiles = ['world.json', 'place/001.json', 'places.json', 'constants.json'];
    const hashedPath = /^(?:place\/)?[A-Za-z0-9_-]+\.[a-f0-9]{16}\.json$/;
    const sourceURL = (() => {
        try {
            return new URL(String(source.url));
        }
        catch {
            return null;
        }
    })();
    if (typeof manifest.revision !== 'string'
        || !/^\d{4}$/.test(manifest.revision)
        || source.variant !== 'Medium'
        || source.units !== 'persons'
        || source.sourceUnits !== 'thousands of persons'
        || typeof source.title !== 'string' || source.title.trim() === ''
        || typeof source.publisher !== 'string' || source.publisher.trim() === ''
        || sourceURL?.protocol !== 'https:'
        || typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256)
        || Object.values(files).some((file) => typeof file !== 'string')
        || !requiredFiles.every((key) => typeof files[key] === 'string' && hashedPath.test(files[key] as string))) {
        throw new Error('Malformed data manifest');
    }
    return value as DataManifest;
}
export function loadManifest(): Promise<DataManifest> {
    const url = new URL('data-manifest.json', baseURL());
    return validated(url, validateManifest);
}
async function logical<T>(name: string, validate: (value: unknown) => T): Promise<T> {
    const manifest = await loadManifest();
    const file = manifest.files[name];
    if (typeof file !== 'string' || !/^(?:place\/)?[A-Za-z0-9_-]+\.[a-f0-9]{16}\.json$/.test(file)) {
        throw new Error(`Unknown or malformed data resource: ${name}`);
    }
    return validated(new URL(file, baseURL()), validate);
}
function validateSeries(value: unknown, id: string): PlaceSeries {
    const item = object(value, 'place series');
    const years = object(item.years, 'place years');
    if (item.id !== id || Object.keys(years).length !== 151)
        throw new Error('Malformed place series');
    for (let year = 1950; year <= 2100; year += 1) {
        const entry = years[String(year)];
        if (entry === null)
            continue;
        const counts = object(entry, `year ${year}`);
        const valid = ['population', 'births', 'deaths'].every((key) => Number.isSafeInteger(counts[key]) && (counts[key] as number) >= 0);
        if (!valid)
            throw new Error(`Malformed year ${year}`);
    }
    return value as PlaceSeries;
}
export const loadWorld = () => logical('world.json', (value) => validateSeries(value, '001'));
export const loadPlace = (id: string) => logical(`place/${id}.json`, (value) => validateSeries(value, id));
function validatePlaces(value: unknown): readonly PlaceMetadata[] {
    if (!Array.isArray(value))
        throw new Error('Malformed places data');
    const ids = new Set<string>();
    const claimedAliases = new Set<string>();
    let worldCount = 0;
    for (const raw of value) {
        const place = object(raw, 'place metadata');
        const coverage = object(place.coverage, 'place coverage');
        const aliases = Array.isArray(place.aliases) ? place.aliases : [];
        const valid = typeof place.id === 'string'
            && /^(?:\d{3}|XKX)$/.test(place.id)
            && typeof place.name === 'string'
            && place.name.trim() === place.name
            && place.name.length > 0
            && Array.isArray(place.aliases)
            && aliases.every((alias) => typeof alias === 'string' && /^[A-Z]{2,3}$/.test(alias))
            && new Set(aliases).size === aliases.length
            && ['world', 'region', 'country'].includes(String(place.kind))
            && (place.iso2 === null || (typeof place.iso2 === 'string' && /^[A-Z]{2}$/.test(place.iso2)))
            && (place.iso2 === null || aliases.includes(place.iso2))
            && Number.isInteger(coverage.start)
            && Number.isInteger(coverage.end)
            && (coverage.start as number) >= 1950
            && (coverage.end as number) <= 2100
            && (coverage.start as number) <= (coverage.end as number);
        if (!valid)
            throw new Error('Malformed places data');
        const id = place.id as string;
        const kind = place.kind as string;
        if (ids.has(id) || aliases.some((alias) => ids.has(alias as string) || claimedAliases.has(alias as string)) || claimedAliases.has(id) || (kind === 'world') !== (id === '001'))
            throw new Error('Malformed places data');
        ids.add(id);
        aliases.forEach((alias) => claimedAliases.add(alias as string));
        if (kind === 'world')
            worldCount += 1;
    }
    if (worldCount !== 1)
        throw new Error('Malformed places data');
    return value as PlaceMetadata[];
}
export const loadPlaces = () => logical('places.json', validatePlaces);
function validateConstants(value: unknown): DataConstants {
    const constants = object(value, 'constants data');
    const range = object(constants.range, 'constants range');
    const valid = Number.isSafeInteger(constants.Pmax)
        && (constants.Pmax as number) > 0
        && typeof constants.rmax === 'number'
        && Number.isFinite(constants.rmax)
        && constants.rmax > 0
        && range.start === 1950
        && range.end === 2100;
    if (!valid)
        throw new Error('Malformed constants data');
    return value as unknown as DataConstants;
}
export const loadConstants = () => logical('constants.json', validateConstants);
export function resetDataLoaderForTests(): void {
    requests.clear();
}

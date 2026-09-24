import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConstants, loadManifest, loadPlace, loadPlaces, loadWorld, resetDataLoaderForTests, } from './index';
const years = Object.fromEntries(Array.from({ length: 151 }, (_, index) => [
    String(1950 + index),
    index === 76 ? null : { population: 1, births: 2, deaths: 3 },
]));
const source = {
    title: 'WPP',
    publisher: 'UN',
    variant: 'Medium',
    units: 'persons',
    sourceUnits: 'thousands of persons',
    url: 'https://example.test/source',
    sha256: 'a'.repeat(64),
};
const manifest = {
    revision: '2024',
    source,
    files: {
        'world.json': 'world.0123456789abcdef.json',
        'place/001.json': 'world.0123456789abcdef.json',
        'places.json': 'places.0123456789abcdef.json',
        'constants.json': 'constants.0123456789abcdef.json',
    },
};
afterEach(() => {
    vi.unstubAllGlobals();
    resetDataLoaderForTests();
});
function stubWindow(): void {
    vi.stubGlobal('window', { location: { href: 'https://example.test/' } });
}
function standardFetch(files: Record<string, string> = manifest.files) {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => ({
        ok: true,
        status: 200,
        json: async () => String(input).endsWith('data-manifest.json')
            ? { ...manifest, files }
            : { id: '001', years },
    }) as Response);
    stubWindow();
    vi.stubGlobal('fetch', fetcher);
    return fetcher;
}
describe('data loader', () => {
    it('deduplicates the manifest and physical World aliases while preserving null', async () => {
        const fetcher = standardFetch();
        const [world, alias] = await Promise.all([loadWorld(), loadPlace('001')]);
        expect(world).toBe(alias);
        expect(world.years['2026']).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('rejects a wrong-identity alias after World was loaded', async () => {
        const fetcher = standardFetch({
            ...manifest.files,
            'place/516.json': manifest.files['world.json'],
        });
        await expect(loadWorld()).resolves.toMatchObject({ id: '001' });
        await expect(loadPlace('516')).rejects.toThrow(/Malformed place series/);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('rejects a concurrent wrong-identity alias without failing World', async () => {
        const fetcher = standardFetch({
            ...manifest.files,
            'place/516.json': manifest.files['world.json'],
        });
        const [world, namibia] = await Promise.allSettled([loadWorld(), loadPlace('516')]);
        expect(world.status).toBe('fulfilled');
        expect(namibia.status).toBe('rejected');
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
    it('loads a non-World place through its own manifest mapping', async () => {
        const namibiaFile = 'place/516.0123456789abcdef.json';
        const fetcher = standardFetch({ ...manifest.files, 'place/516.json': namibiaFile });
        fetcher.mockImplementation(async (input: URL | RequestInfo) => ({
            ok: true,
            status: 200,
            json: async () => String(input).endsWith('data-manifest.json')
                ? { ...manifest, files: { ...manifest.files, 'place/516.json': namibiaFile } }
                : { id: '516', years },
        }) as Response);
        await expect(loadPlace('516')).resolves.toMatchObject({ id: '516' });
        expect(fetcher).toHaveBeenCalledWith(new URL(`https://example.test/data/${namibiaFile}`));
    });
    it('evicts structurally malformed payloads so a later request retries', async () => {
        let physicalAttempt = 0;
        stubWindow();
        vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => ({
            ok: true,
            status: 200,
            json: async () => String(input).endsWith('data-manifest.json')
                ? manifest
                : physicalAttempt++ === 0 ? { id: 'wrong', years } : { id: '001', years },
        }) as Response));
        await expect(loadWorld()).rejects.toThrow(/Malformed place series/);
        await expect(loadWorld()).resolves.toMatchObject({ id: '001' });
    });
    it('evicts malformed JSON so a later request retries', async () => {
        let manifestAttempt = 0;
        stubWindow();
        vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => ({
            ok: true,
            status: 200,
            json: async () => {
                if (String(input).endsWith('data-manifest.json') && manifestAttempt++ === 0) {
                    throw new SyntaxError('bad JSON');
                }
                return String(input).endsWith('data-manifest.json') ? manifest : { id: '001', years };
            },
        }) as Response));
        await expect(loadWorld()).rejects.toThrow(/bad JSON/);
        await expect(loadWorld()).resolves.toMatchObject({ id: '001' });
    });
    it('evicts non-OK responses so a later request retries', async () => {
        let manifestAttempt = 0;
        stubWindow();
        vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
            const isManifest = String(input).endsWith('data-manifest.json');
            if (isManifest && manifestAttempt++ === 0)
                return { ok: false, status: 503 } as Response;
            return {
                ok: true,
                status: 200,
                json: async () => isManifest ? manifest : { id: '001', years },
            } as Response;
        }));
        await expect(loadWorld()).rejects.toThrow(/503/);
        await expect(loadWorld()).resolves.toMatchObject({ id: '001' });
    });
    it('rejects noncanonical metadata and constants', async () => {
        stubWindow();
        vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
            const url = String(input);
            let value: unknown = { Pmax: 1.5, rmax: 2, range: { start: 1950, end: 2100 } };
            if (url.endsWith('data-manifest.json'))
                value = manifest;
            if (url.includes('places.')) {
                value = [{
                        id: '1', name: 'x', aliases: [], kind: 'world', iso2: null,
                        coverage: { start: 1949, end: 2100 },
                    }];
            }
            return { ok: true, status: 200, json: async () => value } as Response;
        }));
        await expect(loadPlaces()).rejects.toThrow(/Malformed places data/);
        await expect(loadConstants()).rejects.toThrow(/Malformed constants data/);
    });
    it.each([
        { revision: '24' },
        { source: { ...source, title: '' } },
        { source: { ...source, url: 'http://example.test/source' } },
        { source: { ...source, sha256: 'ABC' } },
        { files: { ...manifest.files, 'world.json': 'world.json' } },
    ])('rejects malformed manifest identity and core mappings', async (override) => {
        stubWindow();
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ ...manifest, ...override }),
        }) as Response));
        await expect(loadManifest()).rejects.toThrow(/Malformed data manifest/);
    });
    const world = { id: '001', name: 'World', aliases: ['WLD'], kind: 'world', iso2: null, coverage: { start: 1950, end: 2100 } };
    const namibia = { id: '516', name: 'Namibia', aliases: ['NA', 'NAM'], kind: 'country', iso2: 'NA', coverage: { start: 1950, end: 2100 } };
    const invalidMetadata = [
        { metadata: [world, { ...world, name: 'Again' }] },
        { metadata: [{ ...world, aliases: ['WLD', 'WLD'] }] },
        { metadata: [world, { ...namibia, aliases: ['WLD', 'NAM'] }] },
        { metadata: [{ ...namibia, kind: 'world' }] },
        { metadata: [{ ...world, kind: 'region' }] },
        { metadata: [namibia] },
    ];
    it.each(invalidMetadata)('rejects duplicate or inconsistent World/place metadata', async ({ metadata }) => {
        stubWindow();
        vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => ({
            ok: true,
            status: 200,
            json: async () => String(input).endsWith('data-manifest.json') ? manifest : metadata,
        }) as Response));
        await expect(loadPlaces()).rejects.toThrow(/Malformed places data/);
    });
    it('accepts one canonical World plus valid country metadata', async () => {
        stubWindow();
        vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => ({
            ok: true,
            status: 200,
            json: async () => String(input).endsWith('data-manifest.json') ? manifest : [world, namibia],
        }) as Response));
        await expect(loadPlaces()).resolves.toEqual([world, namibia]);
    });
    it('returns valid canonical constants unchanged', async () => {
        const constants = { Pmax: 10289315244, rmax: 7.529912068746829, range: { start: 1950, end: 2100 } };
        stubWindow();
        vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => ({
            ok: true,
            status: 200,
            json: async () => String(input).endsWith('data-manifest.json') ? manifest : constants,
        }) as Response));
        await expect(loadConstants()).resolves.toEqual(constants);
    });
});

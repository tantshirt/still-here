import { createReadStream } from 'node:fs';
import { mkdir, writeFile, rm, rename, stat, readdir, readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';
export const RANGE = Object.freeze({ start: 1950, end: 2100 });
const TYPES = new Set(['World', 'SDG region', 'Geographic region', 'Subregion', 'Country/Area']);
const COLUMNS = ['SDMX_code', 'ISO2_code', 'ISO3_code', 'LocTypeName', 'Location', 'Variant', 'Time', 'TPopulation1July', 'Births', 'Deaths'];
export const SOURCE_URL = 'https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export function stableJSON(value) {
    const sort = (x) => Array.isArray(x) ? x.map(sort) : x !== null && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])])) : x;
    return JSON.stringify(sort(value)) + '\n';
}
export function secondsInYear(year) {
    return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365) * 86400;
}
/** CSV parser streams chunks, including escaped quotes and quoted newlines across chunk boundaries. */
export async function* parseCSV(chunks) {
    let fields = [], field = '', quoted = false, closing = false, first = true;
    for await (let chunk of chunks) {
        if (first) {
            chunk = chunk.replace(/^\uFEFF/, '');
            first = false;
        }
        for (const ch of chunk) {
            if (quoted) {
                if (!closing) {
                    if (ch === '"')
                        closing = true;
                    else
                        field += ch;
                    continue;
                }
                if (ch === '"') {
                    field += '"';
                    closing = false;
                    continue;
                }
                quoted = false;
                closing = false;
                if (ch !== ',' && ch !== '\r' && ch !== '\n')
                    throw Error('Unexpected character after CSV closing quote');
            }
            else if (ch === '"') {
                if (field !== '')
                    throw Error('Quote inside unquoted CSV field');
                quoted = true;
                continue;
            }
            if (ch === ',') {
                fields.push(field);
                field = '';
            }
            else if (ch === '\n') {
                fields.push(field);
                yield fields;
                fields = [];
                field = '';
            }
            else if (ch !== '\r')
                field += ch;
        }
    }
    if (quoted && !closing)
        throw Error('Unterminated CSV quote');
    if (fields.length || field !== '') {
        fields.push(field);
        yield fields;
    }
}
export async function* recordsFromCSV(chunks) {
    let headers;
    for await (const fields of parseCSV(chunks)) {
        if (!headers) {
            headers = fields;
            if (new Set(headers).size !== headers.length)
                throw Error('Duplicate CSV header');
            for (const key of COLUMNS)
                if (!headers.includes(key))
                    throw Error(`Missing CSV column: ${key}`);
            continue;
        }
        if (fields.length === 1 && fields[0] === '')
            continue;
        if (fields.length !== headers.length)
            throw Error(`CSV width ${fields.length}; expected ${headers.length}`);
        yield Object.fromEntries(headers.map((key, i) => [key, fields[i]]));
    }
    if (!headers)
        throw Error('Empty CSV');
}
export function canonicalID(row) {
    // WPP uses source SDMX412 / ISO2XK for Kosovo. Never confuse ISO2 NA with null.
    if (row.ISO2_code === 'XK') {
        if (row.SDMX_code !== '412')
            throw Error('Unexpected Kosovo source identifier');
        return 'XKX';
    }
    if (!/^\d{1,3}$/.test(row.SDMX_code))
        throw Error(`Invalid SDMX code for ${row.Location}`);
    return row.SDMX_code.padStart(3, '0');
}
export function persons(raw, label) {
    if (raw === '')
        return null;
    if (!/^\d+(?:\.\d{1,3})?$/.test(raw))
        throw Error(`Invalid count ${label}: ${raw}`);
    const [whole, fraction = ''] = raw.split('.');
    // Exact decimal scaling avoids binary 3-decimal x1000 tails.
    const result = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
    if (!Number.isSafeInteger(result))
        throw Error(`Unsafe count ${label}`);
    return result;
}
export async function collect(records, { requireCountries = true, expectedPlaces } = {}) {
    const places = new Map();
    let parsed = 0, kept = 0, duplicates = 0;
    for await (const row of records) {
        parsed++;
        if (!TYPES.has(row.LocTypeName))
            continue;
        if (!/^\d{4}$/.test(row.Time))
            throw Error(`Invalid year: ${row.Time}`);
        const year = Number(row.Time);
        if (year < RANGE.start || year > RANGE.end)
            continue;
        if (row.Variant !== 'Medium')
            throw Error(`Expected Medium variant: ${row.Location}/${year}`);
        const id = canonicalID(row), name = row.Location.trim(), iso2 = row.ISO2_code || null;
        if (row.ISO3_code !== '' && !/^[A-Z]{3}$/.test(row.ISO3_code))
            throw Error(`Invalid ISO3 code for ${id}`);
        if (!name || (iso2 !== null && !/^[A-Z]{2}$/.test(iso2)))
            throw Error(`Invalid place metadata: ${id}`);
        const kind = row.LocTypeName === 'World' ? 'world' : row.LocTypeName === 'Country/Area' ? 'country' : 'region';
        if ((kind === 'world') !== (id === '001'))
            throw Error(`World identity mismatch: ${id}`);
        const population = persons(row.TPopulation1July, `${id}/${year}/population`);
        const births = persons(row.Births, `${id}/${year}/births`);
        const deaths = persons(row.Deaths, `${id}/${year}/deaths`);
        const triple = [population, births, deaths];
        const value = triple.includes(null) ? null : { population, births, deaths };
        let place = places.get(id);
        const aliases = [iso2, row.ISO3_code || null].filter(Boolean).sort();
        if (!place) {
            place = { id, name, kind, iso2, aliases, years: new Map(), triples: new Map() };
            places.set(id, place);
        }
        else if (stableJSON([place.name, place.kind, place.iso2, place.aliases]) !== stableJSON([name, kind, iso2, aliases]))
            throw Error(`Conflicting place metadata: ${id}`);
        if (place.years.has(year)) {
            if (stableJSON(place.triples.get(year)) !== stableJSON(triple))
                throw Error(`Conflicting duplicate: ${id}/${year}`);
            duplicates++;
            continue;
        }
        place.years.set(year, value);
        place.triples.set(year, triple);
        kept++;
    }
    const world = places.get('001');
    if (!world)
        throw Error('Missing World 001');
    for (let year = RANGE.start; year <= RANGE.end; year++)
        if (!world.years.get(year))
            throw Error(`World coverage missing: ${year}`);
    if (requireCountries && ![...places.values()].some(p => p.kind === 'country'))
        throw Error('No countries or areas');
    if (expectedPlaces !== undefined && places.size !== expectedPlaces)
        throw Error(`Place coverage ${places.size}; expected ${expectedPlaces}`);
    const index = [], series = new Map(), claimedAliases = new Map();
    let Pmax = 0, rmax = 0, rmaxAt = null, PmaxYear = null, missing = 0;
    for (const place of [...places.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
        const years = {}, valid = [];
        for (let year = RANGE.start; year <= RANGE.end; year++) {
            const value = place.years.get(year) ?? null;
            years[year] = value;
            if (value === null) {
                missing++;
                continue;
            }
            valid.push(year);
            if (place.id === '001' && value.population > Pmax) {
                Pmax = value.population;
                PmaxYear = year;
            }
            const rate = (value.births + value.deaths) / secondsInYear(year);
            if (rate > rmax) {
                rmax = rate;
                rmaxAt = { id: place.id, year };
            }
        }
        if (!valid.length)
            throw Error(`Place has no usable coverage: ${place.id}`);
        const { id, name, kind, iso2, aliases } = place;
        for (const alias of aliases) {
            const owner = claimedAliases.get(alias);
            if (owner && owner !== id)
                throw Error(`Conflicting place alias ${alias}: ${owner}/${id}`);
            claimedAliases.set(alias, id);
        }
        index.push({ id, name, aliases, kind, iso2, coverage: { start: valid[0], end: valid.at(-1) } });
        series.set(id, { id, years });
    }
    if (Pmax <= 0 || rmax <= 0)
        throw Error('Invalid global normalization constants');
    return { index, series, constants: { Pmax, rmax, range: RANGE }, stats: { parsed, kept, duplicates, places: index.length, missing, PmaxYear, rmaxAt } };
}
function safeOutput(out) {
    const resolved = path.resolve(out);
    const root = path.parse(resolved).root;
    const project = fileURLToPath(new globalThis.URL('..', import.meta.url)).replace(/[\\/]$/, '');
    if (resolved === root || resolved === project)
        throw Error(`Refusing unsafe output target: ${resolved}`);
    return resolved;
}
async function assertOwnedOutput(out) {
    try {
        const entries = await readdir(out);
        if (entries.length > 0 && !entries.includes('data-manifest.json'))
            throw Error(`Refusing non-data output target: ${out}`);
        if (entries.includes('data-manifest.json')) {
            const manifestPath = path.join(out, 'data-manifest.json');
            if (!(await stat(manifestPath)).isFile())
                throw Error(`Refusing non-data output target: ${out}`);
            let manifest;
            try {
                manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            }
            catch {
                throw Error(`Refusing non-data output target: ${out}`);
            }
            const legacyOwned = /^\d{4}$/.test(manifest.revision)
                && manifest.source?.publisher === 'United Nations, Department of Economic and Social Affairs, Population Division'
                && typeof manifest.files?.['world.json'] === 'string'
                && typeof manifest.files?.['places.json'] === 'string'
                && typeof manifest.files?.['constants.json'] === 'string';
            if (manifest.generator !== 'still-here/tools/build-data.mjs' && !legacyOwned)
                throw Error(`Refusing non-data output target: ${out}`);
        }
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return;
        if (error.code === 'ENOTDIR')
            throw Error(`Refusing non-data output target: ${out}`, { cause: error });
        throw error;
    }
}
async function exists(target) {
    try {
        await stat(target);
        return true;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return false;
        throw error;
    }
}
export async function publishDirectory(staging, out, { move = rename, remove = rm } = {}) {
    const backup = `${out}.backup-${randomUUID()}`;
    let backedUp = false, published = false;
    try {
        if (await exists(out)) {
            await move(out, backup);
            backedUp = true;
        }
        try {
            await move(staging, out);
            published = true;
        }
        catch (error) {
            if (backedUp) {
                await move(backup, out);
                backedUp = false;
            }
            throw error;
        }
    }
    finally {
        await remove(staging, { recursive: true, force: true });
        if (published)
            await remove(backup, { recursive: true, force: true });
    }
}
export function stagingPath(out) {
    return `${out}.staging-${randomUUID()}`;
}
export async function build({ input, out, revision, expectedPlaces, expectedSourceHash, io = {} }) {
    if (!/^\d{4}$/.test(revision ?? ''))
        throw Error('WPP revision is required as a four-digit year');
    const declaredRevision = path.basename(input).match(/^WPP(\d{4})_/);
    if (declaredRevision && declaredRevision[1] !== revision)
        throw Error('Input filename and WPP revision disagree');
    out = safeOutput(out);
    await assertOwnedOutput(out);
    const started = performance.now();
    const compressed = createReadStream(input), digest = createHash('sha256'), gunzip = createGunzip();
    compressed.on('data', chunk => digest.update(chunk));
    compressed.on('error', error => gunzip.destroy(error));
    compressed.pipe(gunzip);
    gunzip.setEncoding('utf8');
    let result;
    try {
        result = await collect(recordsFromCSV(gunzip), { expectedPlaces });
    }
    finally {
        compressed.destroy();
        gunzip.destroy();
    }
    const sourceHash = digest.digest('hex');
    if (expectedSourceHash && sourceHash !== expectedSourceHash)
        throw Error(`Source SHA-256 mismatch: ${sourceHash}`);
    const staging = stagingPath(out);
    await rm(staging, { recursive: true, force: true });
    const write = io.writeFile ?? writeFile;
    try {
        await mkdir(path.join(staging, 'place'), { recursive: true });
        const files = {};
        async function emit(logical, data) {
            const json = stableJSON(data), hash = sha256(json), target = logical.replace(/\.json$/, `.${hash.slice(0, 16)}.json`);
            await write(path.join(staging, target), json);
            files[logical] = target;
        }
        await emit('world.json', result.series.get('001'));
        for (const [id, series] of result.series)
            if (id !== '001')
                await emit(`place/${id}.json`, series);
        // World aliases the same hashed bytes instead of creating a second downloadable file.
        files['place/001.json'] = files['world.json'];
        await emit('places.json', result.index);
        await emit('constants.json', result.constants);
        const manifest = { generator: 'still-here/tools/build-data.mjs', revision, source: { title: `World Population Prospects ${revision}, Online Edition`, publisher: 'United Nations, Department of Economic and Social Affairs, Population Division', variant: 'Medium', units: 'persons', sourceUnits: 'thousands of persons', url: SOURCE_URL.replaceAll('2024', revision), sha256: sourceHash }, files };
        await write(path.join(staging, 'data-manifest.json'), stableJSON(manifest));
        await publishDirectory(staging, out);
        const report = { ...result.stats, ...result.constants, sourceHash, world2026: result.series.get('001').years[2026], world2026Rates: Object.fromEntries(['births', 'deaths'].map(key => [key, result.series.get('001').years[2026][key] / secondsInYear(2026)])), manifestHash: sha256(stableJSON(manifest)), elapsedMs: Math.round(performance.now() - started), peakRSSBytes: process.resourceUsage().maxRSS * 1024 };
        return report;
    }
    finally {
        await rm(staging, { recursive: true, force: true });
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const { values } = parseArgs({ options: { input: { type: 'string' }, out: { type: 'string' }, revision: { type: 'string' }, 'expected-places': { type: 'string' }, 'expected-source-hash': { type: 'string' } } });
    if (!values.input || !values.out)
        throw Error('--input and --out required');
    console.log(JSON.stringify(await build({ input: values.input, out: values.out, revision: values.revision, expectedPlaces: values['expected-places'] ? Number(values['expected-places']) : undefined, expectedSourceHash: values['expected-source-hash'] }), null, 2));
}

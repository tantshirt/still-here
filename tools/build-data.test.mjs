import test from 'node:test';
import assert from 'node:assert/strict';
import { collect, parseCSV, recordsFromCSV, persons, canonicalID, secondsInYear, stableJSON, build, publishDirectory, stagingPath } from './build-data.mjs';
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const row = (overrides = {}) => ({ SDMX_code: '1', ISO2_code: '', ISO3_code: '', LocTypeName: 'World', Location: 'World', Variant: 'Medium', Time: '2026', TPopulation1July: '100.001', Births: '2.503', Deaths: '1.017', ...overrides });
const world = () => Array.from({ length: 151 }, (_, i) => row({ Time: String(1950 + i) }));
const namibia = (overrides = {}) => row({ SDMX_code: '516', ISO2_code: 'NA', ISO3_code: 'NAM', LocTypeName: 'Country/Area', Location: 'Namibia', ...overrides });
const fixture = () => [...world(), namibia(), row({ SDMX_code: '412', ISO2_code: 'XK', ISO3_code: 'XKX', LocTypeName: 'Country/Area', Location: 'Kosovo (under UNSC res. 1244)' })];
const array = async (gen) => {
    const out = [];
    for await (const x of gen)
        out.push(x);
    return out;
};
test('source thousands convert exactly, including decimal tails and zero', () => {
    assert.equal(persons('8300678.396', 'x'), 8300678396);
    assert.equal(persons('100.001', 'x'), 100001);
    assert.equal(persons('1.1', 'x'), 1100);
    assert.equal(persons('0', 'x'), 0);
    assert.equal(persons('', 'x'), null);
    for (const bad of ['NA', 'NaN', 'Infinity', '-1', '1e3', ' 1', '1.0001'])
        assert.throws(() => persons(bad, 'x'));
});
test('canonical World/Namibia/Kosovo IDs preserve string iso2 NA', async () => {
    const data = await collect(fixture());
    assert.equal(canonicalID(row()), '001');
    assert.equal(data.index.find(p => p.id === '516').iso2, 'NA');
    assert(data.index.find(p => p.id === '516').aliases.includes('NAM'));
    assert(data.series.has('XKX'));
    assert.throws(() => canonicalID(row({ SDMX_code: '' })));
    assert.throws(() => canonicalID(row({ SDMX_code: '8', ISO2_code: 'XK' })));
});
test('rejects malformed nonblank ISO3 aliases', async () => {
    await assert.rejects(() => collect([...fixture(), namibia({ Time: '2027', ISO3_code: 'Nam' })]), /Invalid ISO3/);
});
test('rejects aliases claimed by more than one place', async () => {
    const conflicting = row({ SDMX_code: '999', ISO2_code: 'ZZ', ISO3_code: 'NAM', LocTypeName: 'Country/Area', Location: 'Conflict' });
    await assert.rejects(() => collect([...fixture(), conflicting]), /Conflicting place alias NAM/);
});
test('missing years are explicit null, internal gaps do not interpolate', async () => {
    const data = await collect([...fixture(), namibia({ Time: '2028' })]);
    const p = data.series.get('516');
    assert.equal(p.years['2027'], null);
    assert.equal(p.years['1950'], null);
    assert.equal(Object.keys(p.years).length, 151);
    assert.deepEqual(data.index.find(p => p.id === '516').coverage, { start: 2026, end: 2028 });
});
test('partial blank triples make year unavailable and malformed data fails', async () => {
    const rows = fixture();
    rows.push(namibia({ Time: '2027', Births: '' }));
    assert.equal((await collect(rows)).series.get('516').years['2027'], null);
    await assert.rejects(() => collect([...fixture(), namibia({ Time: '2027', Births: 'bad' })]), /Invalid count/);
});
test('identical SDG/UN region duplicates collapse and conflicts fail', async () => {
    const a = row({ SDMX_code: '53', Location: 'Australia/New Zealand', LocTypeName: 'SDG region' });
    const b = { ...a, LocTypeName: 'Subregion' };
    const data = await collect([...fixture(), a, b]);
    assert.equal(data.stats.duplicates, 1);
    assert.equal(data.index.filter(p => p.id === '053').length, 1);
    await assert.rejects(() => collect([...fixture(), a, { ...b, Births: '3' }]), /Conflicting duplicate/);
    await assert.rejects(() => collect([...fixture(), a, { ...b, Location: 'Different' }]), /Conflicting place metadata/);
    // Even if both partial rows become null, differing known counts must not dedupe.
    await assert.rejects(() => collect([...fixture(), { ...a, Deaths: '' }, { ...b, Deaths: '', Births: '3' }]), /Conflicting duplicate/);
});
test('coverage failures reject absent/incomplete World and empty countries', async () => {
    await assert.rejects(() => collect([namibia()]), /Missing World/);
    await assert.rejects(() => collect(fixture().filter(r => r.Time !== '1950')), /World coverage missing/);
    await assert.rejects(() => collect(world()), /No countries/);
    await assert.rejects(() => collect([...world(), namibia({ Births: '' })]), /no usable coverage/);
    await assert.rejects(() => collect(fixture(), { expectedPlaces: 273 }), /Place coverage/);
});
test('drop2101 and disallowed aggregates; invalid variant/year fail', async () => {
    const data = await collect([...fixture(), row({ Time: '2101' }), row({ LocTypeName: 'Income group', SDMX_code: '' })]);
    assert.equal(data.series.get('001').years['2101'], undefined);
    assert.equal(data.index.length, 3);
    await assert.rejects(() => collect([...fixture(), namibia({ Variant: 'Low' })]), /Expected Medium/);
    await assert.rejects(() => collect([...fixture(), namibia({ Time: '2026.5' })]), /Invalid year/);
});
test('Gregorian leap rules and World2026 rates', () => {
    assert.equal(secondsInYear(2000), 31622400);
    assert.equal(secondsInYear(2100), 31536000);
    assert.equal(secondsInYear(2024), 31622400);
    assert(Math.abs(persons('132503.469', 'births') / secondsInYear(2026) - 4.2016574391171995) < 1e-12);
    assert(Math.abs(persons('63637.314', 'deaths') / secondsInYear(2026) - 2.01792598934551) < 1e-12);
});
test('Pmax uses World alone; rmax uses combined annual rates in actual year', async () => {
    const rows = fixture();
    rows.push(namibia({ Time: '2024', TPopulation1July: '999999', Births: '100000', Deaths: '50000' }));
    const data = await collect(rows);
    assert.equal(data.constants.Pmax, 100001);
    assert.equal(data.constants.rmax, 150000000 / 31622400);
});
test('CSV quoted commas,newlines,escaped quotes,BOM,CRLF and chunk splits', async () => {
    const input = '\ufeffa,b,c\r\n"A, B","say ""hello""","two\nlines"\r\n1,2,3';
    const expected = [['a', 'b', 'c'], ['A, B', 'say "hello"', 'two\nlines'], ['1', '2', '3']];
    assert.deepEqual(await array(parseCSV([...input])), expected);
    assert.deepEqual(await array(parseCSV([input])), expected);
    await assert.rejects(() => array(parseCSV(['"unclosed'])), /Unterminated/);
    await assert.rejects(() => array(parseCSV(['"closed"bad'])), /Unexpected/);
    await assert.rejects(() => array(parseCSV(['bad"quote'])), /Quote inside/);
});
test('CSV missing/duplicate columns, width mismatch fail', async () => {
    await assert.rejects(() => array(recordsFromCSV(['bad,header\n1,2'])), /Missing CSV column/);
    await assert.rejects(() => array(recordsFromCSV(['bad,bad\n'])), /Duplicate CSV header/);
    const header = Object.keys(row()).join(',');
    await assert.rejects(() => array(recordsFromCSV([header + '\n1,2'])), /CSV width/);
});
test('output collection and canonical JSON are independent of input order', async () => {
    const a = await collect(fixture()), b = await collect(fixture().reverse());
    assert.equal(stableJSON(a.index), stableJSON(b.index));
    assert.equal(stableJSON([...a.series]), stableJSON([...b.series]));
    assert.equal(stableJSON({ b: 1, a: 2 }), '{"a":2,"b":1}\n');
});
test('revision mismatch fails before consuming source', async () => {
    await assert.rejects(() => build({ input: 'WPP2024_fixture.csv.gz', out: 'unused', revision: '2025' }), /revision disagree/);
});
test('rejects filesystem and project root output targets', async () => {
    await assert.rejects(() => build({ input: 'x', out: resolve('/'), revision: '2024' }), /unsafe output/);
    await assert.rejects(() => build({ input: 'x', out: resolve('.'), revision: '2024' }), /unsafe output/);
});
test('rejects and preserves unrelated nonempty output directories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'still-here-unrelated-'));
    const out = join(dir, 'other-product');
    await mkdir(out);
    await writeFile(join(out, 'keep.txt'), 'do not replace');
    await assert.rejects(() => build({ input: 'missing.gz', out, revision: '2024' }), /non-data output target/);
    assert.equal(await readFile(join(out, 'keep.txt'), 'utf8'), 'do not replace');
    assert.deepEqual(await readdir(dir), ['other-product']);
});
test('rejects a coincidental manifest filename without the pipeline ownership marker', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'still-here-unrelated-manifest-'));
    const out = join(dir, 'other-product');
    await mkdir(out);
    await writeFile(join(out, 'data-manifest.json'), '{}\n');
    await writeFile(join(out, 'keep.txt'), 'do not replace');
    await assert.rejects(() => build({ input: 'missing.gz', out, revision: '2024' }), /non-data output target/);
    assert.equal(await readFile(join(out, 'keep.txt'), 'utf8'), 'do not replace');
});
test('staging paths use collision-resistant unique nonces', () => {
    const paths = new Set(Array.from({ length: 1_000 }, () => stagingPath('/tmp/data')));
    assert.equal(paths.size, 1_000);
});
test('rejects the repository root when invoked from another working directory', async () => {
    const project = resolve(fileURLToPath(new globalThis.URL('..', import.meta.url)));
    const elsewhere = await mkdtemp(join(tmpdir(), 'still-here-cwd-'));
    const result = spawnSync(process.execPath, [
        join(project, 'tools/build-data.mjs'),
        '--input', 'missing.gz',
        '--out', project,
        '--revision', '2024',
    ], { cwd: elsewhere, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing unsafe output target/);
});
test('publication replaces stale output and leaves deterministic JSON only', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'still-here-data-')), input = join(dir, 'WPP2024_fixture.csv.gz'), out = join(dir, 'out');
    const rows = fixture(), header = Object.keys(rows[0]);
    await writeFile(input, gzipSync([header.join(','), ...rows.map(r => header.map(k => r[k]).join(','))].join('\n')));
    await mkdir(out);
    await writeFile(join(out, 'data-manifest.json'), '{"generator":"still-here/tools/build-data.mjs"}\n');
    await writeFile(join(out, 'stale.json'), 'x');
    await build({ input, out, revision: '2024', expectedPlaces: 3 });
    const first = await readFile(join(out, 'data-manifest.json'), 'utf8');
    assert(!(await readdir(out)).includes('stale.json'));
    await build({ input, out, revision: '2024', expectedPlaces: 3 });
    assert.equal(await readFile(join(out, 'data-manifest.json'), 'utf8'), first);
    assert((await readdir(dir)).every(x => !x.includes('.staging-') && !x.includes('.backup-')));
});
test('failed publication restores prior output and cleans staging/backup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'still-here-swap-')), out = join(dir, 'data'), staging = join(dir, 'data.staging-test');
    await mkdir(out);
    await mkdir(staging);
    await writeFile(join(out, 'old'), 'old');
    await writeFile(join(staging, 'new'), 'new');
    let moves = 0;
    const move = async (a, b) => {
        moves++;
        if (moves === 2)
            throw Error('publish failed');
        return (await import('node:fs/promises')).rename(a, b);
    };
    await assert.rejects(() => publishDirectory(staging, out, { move }), /publish failed/);
    assert.equal(await readFile(join(out, 'old'), 'utf8'), 'old');
    assert.deepEqual(await readdir(dir), ['data']);
});
test('pre-publication write failures clean staging and preserve old output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'still-here-emit-'));
    const input = join(dir, 'WPP2024_fixture.csv.gz');
    const out = join(dir, 'data');
    const rows = fixture();
    const header = Object.keys(rows[0]);
    await writeFile(input, gzipSync([
        header.join(','),
        ...rows.map(record => header.map(key => record[key]).join(',')),
    ].join('\n')));
    await mkdir(out);
    await writeFile(join(out, 'data-manifest.json'), '{"generator":"still-here/tools/build-data.mjs"}\n');
    await writeFile(join(out, 'old'), 'old');
    await assert.rejects(() => build({
        input,
        out,
        revision: '2024',
        expectedPlaces: 3,
        io: { writeFile: async () => { throw new Error('emit failed'); } },
    }), /emit failed/);
    assert.equal(await readFile(join(out, 'old'), 'utf8'), 'old');
    assert.deepEqual(await readdir(dir), ['WPP2024_fixture.csv.gz', 'data']);
});
test('rollback failure preserves the recoverable backup and cleans staging', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'still-here-rollback-'));
    const out = join(dir, 'data');
    const staging = join(dir, 'data.staging-test');
    await mkdir(out);
    await mkdir(staging);
    await writeFile(join(out, 'old'), 'old');
    let moves = 0;
    const move = async (from, to) => {
        moves += 1;
        if (moves >= 2)
            throw new Error(moves === 2 ? 'publish failed' : 'rollback failed');
        return (await import('node:fs/promises')).rename(from, to);
    };
    await assert.rejects(() => publishDirectory(staging, out, { move }), /rollback failed/);
    const entries = await readdir(dir);
    const backup = entries.find(name => name.startsWith('data.backup-'));
    assert(backup);
    assert.equal(await readFile(join(dir, backup, 'old'), 'utf8'), 'old');
    assert(!entries.includes('data.staging-test'));
});
test('tracked source regenerates byte-identical committed artifacts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'still-here-full-data-')), out = join(dir, 'data');
    const report = await build({ input: 'data-src/WPP2024_Demographic_Indicators_Medium.csv.gz', out, revision: '2024', expectedPlaces: 273, expectedSourceHash: '286ac36bb1415e2e1ade03acfef0a29f0e4c087e2f78e38c48f50c5df89082bc' });
    assert.deepEqual(report.world2026, { population: 8300678396, births: 132503469, deaths: 63637314 });
    assert.equal(report.Pmax, 10289315244);
    assert.equal(report.rmax, 7.529912068746829);
    const walk = async (root, prefix = '') => (await readdir(join(root, prefix), { withFileTypes: true })).flatMap(e => e.isDirectory() ? [] : [join(prefix, e.name)]);
    const top = await walk(out), nested = (await readdir(join(out, 'place'))).map(x => join('place', x)), files = [...top, ...nested].sort();
    const committed = [...await walk('public/data'), ...(await readdir('public/data/place')).map(x => join('place', x))].sort();
    assert.deepEqual(files, committed);
    for (const file of files)
        assert.deepEqual(await readFile(join(out, file)), await readFile(join('public/data', file)), file);
});

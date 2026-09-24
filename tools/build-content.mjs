import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const themes = ['postponement','connection','generosity','purpose','comparison','ordinary-joy','reconciliation','acceptance'];
const tones = ['regret','fulfilled','mixed'];
const activities = ['conversation','listening','playing','reading','resting','sharing','sitting','tending','walking','working'];
const props = ['bag','bench','book','cane','cup','instrument','plant','table','tools','wheelchair'];
export const forbidden = ['causeOfDeath','activityCues','propCues','lifeSketch','theme','tone','sourceRefs'];
const fields = ['id','teaser','reflection', ...forbidden];
function fail(path, message) { throw new Error(`${path}: ${message}`); }
function object(value,path) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path,'expected object'); }
function exact(value, keys,path) { object(value,path); if (Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail(path,'unexpected or missing fields'); }
function text(value,path) { if (typeof value !== 'string' || !value.trim() || value !== value.trim()) fail(path,'expected nonempty trimmed string'); }
function list(value, allowed,path) { if (!Array.isArray(value) || !value.length) fail(path,'expected nonempty array'); const seen=new Set(); for(const item of value) { if(typeof item !== 'string' || !allowed.has(item) || seen.has(item)) fail(path,'unknown or duplicate member'); seen.add(item); } }
export function parseJSON(raw,label) { try { return JSON.parse(raw); } catch { fail(label,'invalid JSON'); } }
export function validateAndStrip(input,registry) {
 exact(input,['schemaVersion','fictional','reflections'],'reflections');
 if(input.schemaVersion !== 1 || input.fictional !== true) fail('reflections','unsupported version or fictional flag');
 object(registry,'sources');
 if(registry.schemaVersion !== 1 || !Array.isArray(registry.sources) || !registry.sources.length) fail('sources','invalid registry');
 const sourceIds=new Set();
 for(const [index,source] of registry.sources.entries()) { object(source,`sources[${index}]`); text(source.id,`sources[${index}].id`); if(sourceIds.has(source.id)) fail('sources','invalid or duplicate ID'); sourceIds.add(source.id); }
 if(!Array.isArray(input.reflections) || input.reflections.length !== 48) fail('reflections','expected exactly 48 records');
 const expected=new Set(themes.flatMap(theme=>Array.from({length:6},(_,i)=>`${theme}-${String(i+1).padStart(2,'0')}`)));
 const fullTexts=new Set();
 return input.reflections.map((record,index)=>{
  const path=`reflections[${index}]`; exact(record,fields,path);
  for(const key of ['id','theme','tone','lifeSketch','teaser','reflection','causeOfDeath']) text(record[key],`${path}.${key}`);
  if(!themes.includes(record.theme) || !expected.delete(record.id) || !record.id.startsWith(`${record.theme}-`)) fail(path,'invalid, duplicated or theme-mismatched stable ID');
  if(!tones.includes(record.tone)) fail(path,'invalid tone');
  list(record.activityCues,new Set(activities),`${path}.activityCues`); list(record.propCues,new Set(props),`${path}.propCues`); list(record.sourceRefs,sourceIds,`${path}.sourceRefs`);
  const words=record.reflection.split(/\s+/).length;
  if(words<20 || words>60) fail(path,'reflection must have 20–60 whitespace-separated words');
  if(record.teaser.split(/\s+/).length>16) fail(path,'teaser exceeds 16 words');
  const first=record.reflection.match(/^.*?[.!?](?:[”’"']*)?(?=\s|$)/u)?.[0];
  if(!first || first !== record.teaser) fail(path,'teaser must equal the first complete sentence');
  if(fullTexts.has(record.reflection)) fail(path,'duplicate reflection text'); fullTexts.add(record.reflection);
  return {id:record.id,teaser:record.teaser,reflection:record.reflection};
 });
}
export function compile(input,registry) {
 const records=validateAndStrip(input,registry);
 const json=JSON.stringify(records)+'\n';
 const hash=createHash('sha256').update(json).digest('hex').slice(0,16);
 const filename=`reflections.${hash}.json`;
 const types=`export interface ReflectionRecord { readonly id: string; readonly teaser: string; readonly reflection: string }\nexport const reflectionsUrl = ${JSON.stringify('/content/'+filename)} as const;\n`;
 return {filename,json,types};
}
export async function build(source,registry,out) {
 const result=compile(parseJSON(await readFile(source,'utf8'),'reflections'),parseJSON(await readFile(registry,'utf8'),'sources'));
 await mkdir(out,{recursive:true});
 await writeFile(resolve(out,result.filename),result.json);
 return result;
}
export async function buildProduction({
 source='content/reflections.json',
 registry='content/sources.json',
 publicDir='public/content',
 generated='src/generated/reflections.ts',
}={}) {
 const result=await build(source,registry,publicDir);
 await writeFile(resolve(generated),result.types);
 const entries=await readdir(publicDir);
 await Promise.all(entries.map(async name=>{
  if(name.startsWith('reflections.')&&name.endsWith('.json')&&name!==result.filename) await rm(resolve(publicDir,name),{force:true});
 }));
 return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 const [source,registry,out]=process.argv.slice(2);
 if(!source || !registry || !out) throw new Error('usage: build-content.mjs reflections.json sources.json output-directory');
 const result=await build(source,registry,out); console.log(result.filename);
}

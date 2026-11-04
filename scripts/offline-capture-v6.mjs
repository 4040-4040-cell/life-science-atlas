import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.ATLAS_CAPTURE_ORIGIN||'http://127.0.0.1:3000';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Only explicitly local live API capture is authorized');
const cache=path.join(root,'scripts/offline-cache');
const output=path.join(cache,'snapshot_V6.json.gz');
try{await fs.access(output);throw new Error('Immutable snapshot_V6.json.gz already exists; never overwrite')}catch(e){if(e.code!=='ENOENT')throw e}
const seedBytes=await fs.readFile(path.join(root,'data/atlas-seed_V6.json.gz'));
const seed=JSON.parse(gunzipSync(seedBytes));
const manifestBytes=await fs.readFile(path.join(root,'data/presence-cash-corrections_V6.json'));
const manifest=JSON.parse(manifestBytes);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(seed.companies.length!==1276||manifest.seedVersion!==seed.version||sha(manifestBytes)!==seed.sourceHashes.presence_cash_corrections_V6)throw new Error('V6 immutable seed/manifest or identity bound differs');
async function get(endpoint){for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(`${base}/api/atlas${endpoint}`,{signal:AbortSignal.timeout(90000),headers:{Accept:'application/json'}});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error(`Live API capture ${endpoint}: HTTP ${r.status}`);return await r.json()}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,1000))}}}
const overview=await get('/overview'),coverage=await get('/coverage');
if(coverage.ingestionVersion!==seed.version||overview.totals.sites!==1652)throw new Error('V6 live ingestion not ready');
const regions=[];for(const r of seed.regions)regions.push(await get(`/regions/${encodeURIComponent(r.id)}`));
const summaries=[];for(let page=1;page<=6;page++){const j=await get(`/companies?limit=250&page=${page}`);if(j.total!==1276)throw new Error('Live company identity population differs');summaries.push(...j.items);if(summaries.length>=j.total)break}
const ids=new Set(seed.companies.map(c=>c.id));if(new Set(summaries.map(c=>c.id)).size!==1276||summaries.some(c=>!ids.has(c.id)))throw new Error('Exact V6 identity set mismatch');
let cursor=0,completed=0;const profiles=new Array(seed.companies.length);
await Promise.all(Array.from({length:6},async()=>{while(cursor<profiles.length){const index=cursor++;const c=seed.companies[index];const p=await get(`/profile/${encodeURIComponent(c.id)}`);if(p.id!==c.id)throw new Error('Profile identity mismatch');const correction=manifest.cash.find(r=>r.companyId===c.id);if(correction){const detailed=p.facts.find(f=>f.key==='cash_and_cash_equivalents');for(const f of [p.cash,detailed])if(JSON.stringify([f?.value,f?.unit,f?.asOf,[...(f?.sourceIds||[])].sort()])!==JSON.stringify([correction.after.value,correction.after.unit,correction.after.asOf,[...correction.after.sourceIds].sort()]))throw new Error(`Stale/mismatched headline or detailed cash ${c.id}`)}profiles[index]=p;completed++;if(completed%50===0)console.log(`V6 full-live capture ${completed}/${profiles.length}`,{flush:true})}}));
for(const r of regions){const expected=seed.sites.filter(s=>s.regionId===r.region.id);if(JSON.stringify(r.sites.map(s=>s.id).sort())!==JSON.stringify(expected.map(s=>s.id).sort()))throw new Error('Site preservation mismatch '+r.region.id);for(const frame of [...r.zones,...r.aerials]){const original=[...seed.zones,...seed.aerials].find(f=>f.id===frame.id&&(('imageUrl'in f)===('imageUrl'in frame)));if(!original||JSON.stringify([...original.siteIds].sort())!==JSON.stringify([...frame.siteIds].sort()))throw new Error('Source-safe membership mismatch '+frame.id)}}
const basel=regions.find(r=>r.region.id==='basel');const orbis=basel.companies.find(c=>c.id==='gco_d96230457ee4d556f0ff');if(orbis?.evidence!=='research'||!basel.sites.some(s=>s.id==='basel:site:orbis-allschwil'&&s.latitude===null&&s.evidence==='research'))throw new Error('Orbis research-lead preservation gate failed');
const snapshot={format:1,capturedAt:new Date().toISOString(),correctedSeed:{version:seed.version,sha256:sha(seedBytes)},correctionEvidence:{manifestSha256:sha(manifestBytes),researchFiles:manifest.researchFiles,policy:manifest.policy},overview,coverage,regions,summaries,profiles};
const bytes=gzipSync(JSON.stringify(snapshot),{level:9});await fs.writeFile(output,bytes,{flag:'wx'});await fs.writeFile(path.join(root,'data/snapshot-verification_V6.json'),JSON.stringify({version:seed.version,snapshotPath:output,sha256:sha(bytes),correctedSeedSha256:sha(seedBytes),manifestSha256:sha(manifestBytes),fullLiveProfiles:profiles.length,regions:regions.length,sites:overview.totals.sites,profileIdsPreserved:true,allCashHeadlinesEqualDetailed:true,OrbisResearchLeadPreserved:true,priorSnapshotNotOverwritten:true,capturedAt:snapshot.capturedAt},null,2)+'\n',{flag:'wx'});console.log(`V6 immutable capture complete: ${output} (${bytes.length} bytes)`);

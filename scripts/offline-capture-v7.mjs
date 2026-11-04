import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.ATLAS_CAPTURE_ORIGIN||'http://127.0.0.1:3000';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Only local live API capture authorized');
const output=path.join(root,'scripts/offline-cache/snapshot_V7.json.gz');
try{await fs.access(output);throw new Error('Immutable V7 snapshot exists; never overwrite')}catch(e){if(e.code!=='ENOENT')throw e}
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>v===undefined?'null':v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const same=(a,b)=>canonical(a)===canonical(b);
const priorBytes=await fs.readFile(path.join(root,'scripts/offline-cache/snapshot_V6.json.gz'));
const prior=JSON.parse(gunzipSync(priorBytes));
const seedBytes=await fs.readFile(path.join(root,'data/atlas-seed_V7.json.gz'));
const seed=JSON.parse(gunzipSync(seedBytes));
const mb=await fs.readFile(path.join(root,'data/location-presence-corrections_V7.json'));
const manifest=JSON.parse(mb);
const cashBytes=await fs.readFile(path.join(root,'data/presence-cash-corrections_V6.json'));
if(sha(priorBytes)!==manifest.baseSnapshotSha256||seed.sourceHashes.location_presence_corrections_V7!==sha(mb)||seed.version!==manifest.seedVersion)throw new Error('Immutable source hash mismatch');
async function get(endpoint){for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(`${base}/api/atlas${endpoint}`,{signal:AbortSignal.timeout(90000),headers:{Accept:'application/json'}});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error(`API ${endpoint}: ${r.status}`);return await r.json()}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,1000))}}}
const overview=await get('/overview'),coverage=await get('/coverage');
if(coverage.ingestionVersion!==seed.version||!same(overview.totals,prior.overview.totals))throw new Error('V7 not ready or baseline population drift');
if(coverage.totals.sourceRecords!==prior.coverage.totals.sourceRecords+1||coverage.totals.metricObservations!==prior.coverage.totals.metricObservations+2)throw new Error('Unbounded raw source/observation changes');
const changedSites=new Map(manifest.presence.map(c=>[c.siteId,c]));
const regions=[];
for(const old of prior.regions){const r=await get('/regions/'+encodeURIComponent(old.region.id));if(!same(r.companies,old.companies)||!same(r.zones,old.zones)||!same(r.aerials,old.aerials)||!same(r.region,old.region))throw new Error('Unexpected region/profile/frame change '+old.region.id);const oldSites=new Map(old.sites.map(s=>[s.id,s]));if(r.sites.length!==old.sites.length)throw new Error('Site IDs changed');for(const s of r.sites){const c=changedSites.get(s.id);if(!same(s,c?c.after:oldSites.get(s.id)))throw new Error('Unexpected canonical site change '+s.id);}regions.push(r);console.log('V7 bounded region '+r.region.id);}
const summaries=[];for(let page=1;page<=6;page++){const j=await get(`/companies?limit=250&page=${page}`);if(j.total!==1276)throw new Error('Company population changed');summaries.push(...j.items);if(summaries.length>=j.total)break;}
const priorSummary=new Map(prior.summaries.map(p=>[p.id,p]));
if(new Set(summaries.map(p=>p.id)).size!==1276||summaries.some(p=>!same(p,priorSummary.get(p.id))))throw new Error('Unrelated summary or identity drift');
const profiles=structuredClone(prior.profiles);
const profileIds=[...new Set(manifest.presence.map(c=>c.companyId)),'gco_859f011c4ffa88b7a469'];
const liveProfileDeltas=[];
for(const cid of profileIds){const p=await get('/profile/'+encodeURIComponent(cid));const index=profiles.findIndex(old=>old.id===cid);const old=profiles[index];if(!old||p.id!==cid)throw new Error('Profile identity mismatch');const expected=structuredClone(old);expected.sites=expected.sites.map(s=>changedSites.get(s.id)?.after||s);for(const c of manifest.presence.filter(c=>c.companyId===cid))for(const s of c.sources)if(!expected.sources.some(x=>x.id===s.id))expected.sources.push(s); // Peer context may change because another local site's evidence is preserved, but no master fields may drift.
if(!same(p,expected))throw new Error('Unexpected raw profile change '+cid);profiles[index]=p;liveProfileDeltas.push({companyId:cid,before:old,after:p});console.log('V7 bounded full profile '+cid);}
if(profiles.length!==1276||!same(profiles.map(p=>p.id),prior.profiles.map(p=>p.id)))throw new Error('Exact 1276 IDs not preserved');
const snapshot={...prior,capturedAt:new Date().toISOString(),correctedSeed:{version:seed.version,sha256:sha(seedBytes)},correctionEvidence:{...prior.correctionEvidence,manifestSha256:sha(mb),cashManifestSha256:sha(cashBytes),locationPresenceManifest:manifest,priorV6CorrectionEvidence:prior.correctionEvidence,policy:manifest.policy},overview,coverage,regions,summaries,profiles,priorSnapshot:{version:prior.correctedSeed.version,sha256:sha(priorBytes),capturedAt:prior.capturedAt},boundedApiDeltas:{profileIdsFetched:profileIds,allOther1273ProfilesPreserved:true,liveProfileDeltas,regionsFetched:regions.map(r=>r.region.id),companySummariesChecked:1276,apiCurrentAgreement:'All regions, summaries, overview/coverage and three affected full profiles checked; untouched full profiles retained from immutable V6, not recertified by a new full-live capture'}};
const bytes=gzipSync(JSON.stringify(snapshot),{level:9});
const verification={version:seed.version,snapshotPath:output,sha256:sha(bytes),correctedSeedSha256:sha(seedBytes),manifestSha256:sha(mb),cashManifestSha256:sha(cashBytes),baseSnapshotSha256:sha(priorBytes),fullLiveProfilesFetched:profileIds.length,profilesPreserved:profiles.length,regions:regions.length,sites:overview.totals.sites,baselineUniqueCompanies:overview.totals.baselineProfiles,baselineCompanyRegionMemberships:regions.reduce((n,r)=>n+r.region.baselineCompanies,0),profileIdsPreserved:true,allRawPriorFieldsRetained:true,boundedApiAgreement:true,priorSnapshotNotOverwritten:true,sourceRecordsDelta:1,metricObservationsDelta:2,capturedAt:snapshot.capturedAt};
await fs.writeFile(output,bytes,{flag:'wx'});await fs.writeFile(path.join(root,'data/snapshot-verification_V7.json'),JSON.stringify(verification,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(verification));

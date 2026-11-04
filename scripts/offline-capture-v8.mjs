import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=process.cwd(),base='http://127.0.0.1:3000';
const output=path.join(root,'scripts/offline-cache/snapshot_V8.json.gz');
try{await fs.access(output);throw new Error('Preserve earlier snapshots. V8 already exists.')}catch(e){if(e.code!=='ENOENT')throw e;}
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const equal=(a,b)=>canonical(a)===canonical(b);
const priorBytes=await fs.readFile(path.join(root,'scripts/offline-cache/snapshot_V7.json.gz'));
const prior=JSON.parse(gunzipSync(priorBytes));
const additions=JSON.parse(await fs.readFile(path.join(root,'data/baselCantonAerials_V3.json'),'utf8')).frames;
if(additions.length!==24||new Set(additions.map(f=>f.id)).size!==24)throw new Error('Unexpected verified additions.');
async function get(p){const r=await fetch(base+'/api/atlas'+p,{signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error(p+': '+r.status);return r.json();}
const regions=[];
for(const old of prior.regions){
 const next=await get('/regions/'+old.region.id);
 for(const key of ['sites','companies','zones'])if(!equal(next[key],old[key]))throw new Error('Unrelated master change: '+old.region.id+'/'+key);
 for(const key of Object.keys(old.region))if(!/aerial/i.test(key)&&!equal(old.region[key],next.region[key]))throw new Error('Unexpected region metadata: '+key);
 const priorFrames=new Map(old.aerials.map(a=>[a.id,a]));
 for(const [id,frame] of priorFrames)if(!equal(frame,next.aerials.find(a=>a.id===id)))throw new Error('Old native frame changed: '+id);
 const added=next.aerials.filter(a=>!priorFrames.has(a.id));
 if(old.region.id!=='basel'&&added.length)throw new Error('Unexpected outside-canton addition');
 for(const frame of added){
  const expected=additions.find(a=>a.id===frame.id);if(!expected)throw new Error('Unregistered frame '+frame.id);
  for(const key of ['imageUrl','imageBounds','bounds','nativeExtent3857','addressReferences'])if(expected[key]!==undefined&&!equal(expected[key],frame[key]))throw new Error('Native addition field mismatch: '+frame.id+'/'+key);
 }
 if(old.region.id==='basel'&&added.length!==24)throw new Error('Missing canton frames');
 regions.push(next);console.log('Captured immutable region',old.region.id);
}
const overview=await get('/overview'),coverage=await get('/coverage');
for(const [key,value] of Object.entries(prior.overview.totals))if(!/aerial/i.test(key)&&!equal(value,overview.totals[key]))throw new Error('Population drift '+key);
const summaries=[];for(let page=1;page<=6;page++){const r=await get('/companies?limit=250&page='+page);summaries.push(...r.items);if(summaries.length>=r.total)break;}
const oldSummaries=new Map(prior.summaries.map(s=>[s.id,s]));
if(summaries.length!==prior.summaries.length||summaries.some(s=>!equal(s,oldSummaries.get(s.id))))throw new Error('Summary identity/value drift');
for(const id of ['gco_98c2776a061ff24fea05','gco_7a1b3460a09f20347048']){
 const p=prior.profiles.find(p=>p.id===id);if(p&&!equal(p,await get('/profile/'+id)))throw new Error('Unexpected protected profile change '+id);
}
const snapshot={...prior,capturedAt:new Date().toISOString(),overview,coverage,regions,summaries,priorSnapshot:{sha256:sha(priorBytes),capturedAt:prior.capturedAt},cantonCompanion:{version:'V3',newAerials:24,companyMasterUnchanged:true},captureScope:'All 11 regions and summaries freshly checked; prior 1276 complete profiles preserved with protected live spot checks and unchanged-master receipt. Not a new company census.'};
const bytes=gzipSync(JSON.stringify(snapshot),{level:9});await fs.writeFile(output,bytes,{flag:'wx'});
const receipt={snapshotSha256:sha(bytes),priorSha256:sha(priorBytes),profiles:snapshot.profiles.length,regions:regions.length,sites:regions.reduce((n,r)=>n+r.sites.length,0),aerials:regions.reduce((n,r)=>n+r.aerials.length,0),newCantonAerials:24,priorFramesUnchanged:true,priorCompanyDataUnchanged:true,scope:snapshot.captureScope};
await fs.writeFile(path.join(root,'data/snapshot-verification_V8.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));

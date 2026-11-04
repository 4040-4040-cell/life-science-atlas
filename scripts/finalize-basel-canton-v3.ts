import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { canonicalJson, sha256, validateDocumentHash, validateSourceRefs } from '../server/atlas/canton-detail/contract';
import { prepareProducerV3, type ProducerEnvelope, type PublicAsset, type UploadedAsset } from '../server/atlas/canton-detail/aerial-producer';
import type { BaselCantonCompanion, BaselCantonDocument, CantonAerialFrame } from '../shared/baselCantonDetail';

const paths = {
  producer: '/home/ubuntu/life-science-atlas/basel_building_detail_V1/data/basel_client_aerial_DTOs_V2.json',
  manifest: '/home/ubuntu/life-science-atlas/basel_building_detail_V1/data/public_asset_manifest_V2.json',
  rawResearch: '/home/ubuntu/life-science-atlas/market_intelligence_V2/data/baselCantonDetail_V2.json',
  base: 'data/baselCantonDetail_offline_V2.json', uploads: 'data/baselCantonAssets_upload_receipt_V3.json',
  companion: 'data/baselCantonDetail_offline_V3.json', frames: 'data/baselCantonAerials_V3.json',
  receipt: 'data/baselCanton_execution_receipt_V3.json',
};
const expected = { producer: '24494b6369d0ba3cb9a6606b4874631a29416f8e1f9d91bbd0c5253383f39ce1', manifest: 'd9cd022fffba088cb4be1ec527b712791a5cb326354bc279b2aa592178e11b2d', rawResearch: 'aaa18b80a88edfa904a5c16857574e5edbec70d2e8342874dc26169331b2f07a', base: 'a7c0cd37f1fc87358b0773c9d5c10410842b19f649048054ddf1194cff90cfec' };
const parse = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
async function immutableWrite(path: string, value: unknown) {
  const text = JSON.stringify(value,null,2)+'\n';
  try { if (await readFile(path,'utf8') !== text) throw new Error('Different immutable output exists: '+path); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; await writeFile(path,text,{flag:'wx'}); }
  return sha256(text);
}
async function main() {
  const execute = process.argv.includes('--execute');
  if (process.argv.slice(2).some(a => a !== '--execute')) throw new Error('Usage: tsx scripts/finalize-basel-canton-v3.ts [--execute]');
  const inputs: Record<string,string> = {};
  for (const key of ['producer','manifest','rawResearch','base'] as const) {
    inputs[key] = sha256(await readFile(paths[key]));
    if (inputs[key] !== expected[key]) throw new Error('Designated input hash mismatch: '+key);
  }
  const base = JSON.parse(await readFile(paths.base,'utf8')) as BaselCantonCompanion;
  if (base.sourceHash !== expected.rawResearch) throw new Error('Original research hash drift');
  const producer = JSON.parse(await readFile(paths.producer,'utf8')) as ProducerEnvelope;
  const manifest = JSON.parse(await readFile(paths.manifest,'utf8')) as { assets: PublicAsset[] };
  const uploadReceipt = JSON.parse(await readFile(paths.uploads,'utf8')) as { complete: boolean; producerHash: string; manifestHash: string; assets: UploadedAsset[] };
  if (!uploadReceipt.complete || uploadReceipt.producerHash !== inputs.producer || uploadReceipt.manifestHash !== inputs.manifest || uploadReceipt.assets.length !== 48) throw new Error('Upload receipt incomplete or bound to different source');
  const prepared = prepareProducerV3(base,producer,manifest,uploadReceipt.assets,inputs.producer,inputs.manifest);
  const { companion, frames } = prepared;
  const docs = Object.values(companion.documents);
  for (const d of docs) if (!validateDocumentHash(d) || d.sourceHash !== expected.rawResearch) throw new Error('Invalid prepared document');
  const publicText = JSON.stringify({companion,frames});
  if (/file:|(?:^|[\s"'(])\/(?:home|mnt|tmp|Users|private)\//i.test(publicText)) throw new Error('Prohibited private path in public DTO');
  const companionHash = await immutableWrite(paths.companion,companion);
  const frameHash = await immutableWrite(paths.frames,{ version:'V3', producerHash:inputs.producer, manifestHash:inputs.manifest, frames });
  if (!execute) { console.log(JSON.stringify({mode:'prepare',companionHash,frameHash,frames:frames.length,sourceRecords:producer.addressReferences.length,restrictedRedactions:prepared.restrictedRedactions})); return; }
  if (!process.env.DATABASE_URL) throw new Error('Persistent DATABASE_URL required');
  const db = await mysql.createConnection({uri:process.env.DATABASE_URL,connectTimeout:30_000});
  let locked=false; let transaction=false;
  try {
    const [lock] = await db.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT('atlas-canton-detail:',DATABASE()),30) acquired");
    if (Number(lock[0]?.acquired)!==1) throw new Error('Canton write lock unavailable'); locked=true;
    const [ingestions] = await db.query<RowDataPacket[]>("SELECT version FROM atlas_ingestions WHERE status='complete'");
    if (!ingestions.length) throw new Error('Original atlas not ready');
    const masterFingerprint = async () => {
      const counts: Record<string,number> = {}; const hashes: Record<string,string> = {};
      for (const [table, columns] of [['atlas_companies','id,SHA2(CAST(summary AS CHAR),256) digest'],['atlas_profiles','company_id,SHA2(CAST(payload AS CHAR),256) digest'],['atlas_sites','id,SHA2(CAST(payload AS CHAR),256) digest'],['atlas_sources','source_key,SHA2(CAST(payload AS CHAR),256) digest']] as const) {
        const [rows] = await db.query<RowDataPacket[]>(`SELECT ${columns} FROM ${table} ORDER BY 1`);
        counts[table] = rows.length; hashes[table] = sha256(canonicalJson(rows));
      }
      return {counts,hashes};
    };
    const before=await masterFingerprint();
    if (before.counts.atlas_companies!==1276 || before.counts.atlas_profiles!==1276) throw new Error('Unexpected original company/profile count');
    const [companies] = await db.query<RowDataPacket[]>('SELECT id FROM atlas_companies');
    const [sites] = await db.query<RowDataPacket[]>('SELECT id,company_id,region_id FROM atlas_sites');
    const companyIds = new Set(companies.map(r=>r.id)); const siteIndex=new Map(sites.map(r=>[r.id,r]));
    for (const d of docs) {
      for (const id of d.supportedCompanyIds) if (!companyIds.has(id)) throw new Error('Unknown supported company ID: '+id);
      for (const ref of d.canonicalAddressReferences ?? []) {
        if (ref.companyId && !companyIds.has(ref.companyId)) throw new Error('Unknown producer company ID: '+ref.companyId);
        if (ref.siteId) { const site=siteIndex.get(ref.siteId); if (!site || site.region_id!=='basel' || ref.companyId && site.company_id!==ref.companyId) throw new Error('Exact site owner / region mismatch: '+ref.siteId); }
      }
      validateSourceRefs(d,new Set(d.sources.map(s=>s.id)));
    }
    const [oldAerials] = await db.query<RowDataPacket[]>('SELECT id,region_id,payload FROM atlas_aerials ORDER BY id');
    const originals = oldAerials.filter(a=>!a.id.startsWith('basel-canton-v3:'));
    const originalHash = sha256(canonicalJson(originals));
    if (new Set(frames.map(f=>f.id)).size!==24 || frames.some(f=>!f.id.startsWith('basel-canton-v3:') || f.regionId!=='basel' || originals.some(a=>a.id===f.id))) throw new Error('New aerial global IDs collide');
    await db.query(await readFile('drizzle/migrations/0004_atlas_canton_research_documents.sql','utf8'));
    await db.beginTransaction(); transaction=true;
    const [priorFrames] = await db.query<RowDataPacket[]>('SELECT id,region_id,payload FROM atlas_aerials WHERE id IN (?) FOR UPDATE',[frames.map(f=>f.id)]);
    if (priorFrames.length && priorFrames.length!==24) throw new Error('Partial V3 frame insertion requires review');
    for (const old of priorFrames) {
      const frame=frames.find(f=>f.id===old.id)!;
      if (old.region_id!=='basel' || canonicalJson(parse<CantonAerialFrame>(old.payload))!==canonicalJson(frame)) throw new Error('Existing stable aerial has different immutable content');
    }
    const [priorDocs] = await db.query<RowDataPacket[]>('SELECT * FROM atlas_canton_research_documents WHERE version=? FOR UPDATE',['V3']);
    if (priorDocs.length && priorDocs.length!==2) throw new Error('Partial immutable V3 canton version requires review');
    for (const old of priorDocs) {
      const d=docs.find(d=>d.id===old.id); const payload=parse<BaselCantonDocument>(old.payload);
      if (!d || old.source_hash!==d.sourceHash || old.content_hash!==d.contentHash || !validateDocumentHash(payload) || canonicalJson(payload)!==canonicalJson(d)) throw new Error('Existing immutable V3 doc differs; stopped');
    }
    if (!priorFrames.length) for (const f of frames) await db.query('INSERT INTO atlas_aerials (id,region_id,payload) VALUES (?,?,?)',[f.id,'basel',JSON.stringify(f)]);
    const [readyFrames] = await db.query<RowDataPacket[]>('SELECT id,region_id FROM atlas_aerials WHERE id IN (?)',[frames.map(f=>f.id)]);
    if (readyFrames.length!==24 || readyFrames.some(f=>f.region_id!=='basel')) throw new Error('New frame readiness failed');
    for (const d of docs) for (const c of d.clusters) for (const id of c.aerialIds) if (!readyFrames.some(f=>f.id===id)) throw new Error('Missing V3 cluster aerial');
    if (!priorDocs.length) for (const d of docs) await db.query('INSERT INTO atlas_canton_research_documents (id,canton_id,version,source_hash,content_hash,as_of,payload) VALUES (?,?,?,?,?,?,?)',[d.id,d.cantonId,d.version,d.sourceHash,d.contentHash,d.asOf,JSON.stringify(d)]);
    const after = await masterFingerprint();
    if (canonicalJson(before)!==canonicalJson(after)) throw new Error('Master fingerprint changed during isolated insertion; rollback');
    const [afterAerials] = await db.query<RowDataPacket[]>('SELECT id,region_id,payload FROM atlas_aerials ORDER BY id');
    if (sha256(canonicalJson(afterAerials.filter(a=>!a.id.startsWith('basel-canton-v3:'))))!==originalHash) throw new Error('Original aerial payloads changed; rollback');
    await db.commit(); transaction=false;
    for (const key of ['producer','manifest','rawResearch','base'] as const) if (sha256(await readFile(paths[key]))!==inputs[key]) throw new Error('Original source file changed during import');
    const [versions] = await db.query<RowDataPacket[]>('SELECT id,canton_id,version,source_hash,content_hash FROM atlas_canton_research_documents ORDER BY version,canton_id');
    const receipt = { status:'persisted', executedAt:new Date().toISOString(), version:'V3', inputPaths:paths, inputHashes:inputs, outputHashes:{companion:companionHash,frames:frameHash},
      insertedFrames:priorFrames.length?0:24, insertedDocuments:priorDocs.length?0:2, skippedExactExisting:!!priorFrames.length && !!priorDocs.length,
      dbCountsBefore:before.counts, dbCountsAfter:after.counts, masterFingerprintBefore:before.hashes, masterFingerprintAfter:after.hashes,
      originalAerialCount:originals.length, originalAerialHash:originalHash, globalAerialCount:afterAerials.length, baselAerialCount:afterAerials.filter(a=>a.region_id==='basel').length,
      exactNewAerialIds:frames.map(f=>f.id), documents:versions, sourceResearchHash:expected.rawResearch,
      sourceRecords:producer.addressReferences.length, acceptedPostalReferences:producer.addressReferences.filter(r=>r.geocodeStatus==='matched').length,
      unresolvedReferences:producer.addressReferences.filter(r=>r.geocodeStatus!=='matched').length,
      exactCanonicalBindings:docs.reduce((n,d)=>n+(d.canonicalAddressReferences??[]).filter(r=>r.canonicalRecordId).length,0),
      restrictedRedactions:prepared.restrictedRedactions, companyMasterWrites:0, profileMasterWrites:0, siteMasterWrites:0, sourceMasterWrites:0,
      companionPath:paths.companion, framePath:paths.frames, uploadReceiptPath:paths.uploads };
    const receiptPath = receipt.skippedExactExisting ? 'data/baselCanton_idempotency_receipt_V3.json' : paths.receipt;
    await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt,null,2));
  } catch(e) { if(transaction) await db.rollback();throw e; }
  finally { if(locked) await db.query("SELECT RELEASE_LOCK(CONCAT('atlas-canton-detail:',DATABASE()))").catch(()=>{}); await db.end(); }
}
main().catch(e=>{console.error(e instanceof Error?e.message:'V3 finalization failed');process.exitCode=1;});

import 'dotenv/config';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import type { AtlasSeed, MapSite, Source } from '../shared/atlas';
import type { LocationPresenceManifest } from '../shared/locationPresenceCorrections';
import { keyHash } from '../server/atlas/ingest';
import { equalValues } from '../server/atlas/presence-cash-corrections';
import { sourceSignature } from '../server/atlas/financial-corrections';
import { assertLocationCorrection, locationCorrectionDecision } from '../server/atlas/location-presence-corrections';
const parse = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
async function main() {
  const mb = await readFile('data/location-presence-corrections_V7.json');
  const manifest = JSON.parse(mb.toString()) as LocationPresenceManifest;
  const sb = await readFile('data/atlas-seed_V7.json');
  const seed = JSON.parse(sb.toString()) as AtlasSeed;
  const baseBytes = await readFile('data/atlas-seed_V6.json.gz');
  if (seed.version !== manifest.seedVersion || seed.sourceHashes.location_presence_corrections_V7 !== hash(mb) || hash(baseBytes) !== manifest.baseSeedSha256 || seed.companies.length !== 1276 || seed.sites.length !== 1652 || manifest.presence.length !== 2 || manifest.counts.newCompanyIds !== 0 || manifest.counts.baselineUniqueCompaniesBefore !== manifest.counts.baselineUniqueCompaniesAfter || manifest.counts.baselineCompanyRegionMembershipsBefore !== manifest.counts.baselineCompanyRegionMembershipsAfter) throw new Error('V7 immutable population/source bound differs');
  for (const file of manifest.reviewFiles) if (hash(await readFile(file.file)) !== file.sha256) throw new Error('Actual final review witness drift');
  for (const correction of manifest.presence) {
    assertLocationCorrection(correction);
    if (hash(await readFile(String(correction.witness.file))) !== correction.witness.sha256) throw new Error('Retained source witness drift');
    if (!equalValues(seed.sites.find(s => s.id === correction.siteId), correction.after)) throw new Error('Seed/correction mismatch');
  }
  const resultPath = 'data/location-presence-import-result_V7.json';
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL!, connectTimeout: 30000 });
  const result = { version: seed.version, siteCorrections: 0, sourcesAdded: 0, observationsAdded: 0, rawCompanyProfilesRewritten: 0, companyRegionMembershipsChanged: 0, guardsSkipped: [] as { target: string; reason: string }[], skipped: false };
  try {
    const [locks] = await db.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT('atlas-seed:', DATABASE()),30) acquired");
    if (Number(locks[0]?.acquired) !== 1) throw new Error('Atlas ingestion lock unavailable');
    await db.query(`CREATE TABLE IF NOT EXISTS atlas_v7_preservation_audit (id varchar(64) PRIMARY KEY,target_type varchar(64) NOT NULL,target_id varchar(191) NOT NULL,ingestion_version varchar(191) NOT NULL,payload json NOT NULL,created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX atlas_v7_audit_target_idx(target_type,target_id))`);
    await db.beginTransaction();
    const [versions] = await db.query<RowDataPacket[]>('SELECT * FROM atlas_ingestions WHERE version=? FOR UPDATE',[seed.version]);
    if (versions.length) {
      if (versions[0].content_hash !== hash(sb) || versions[0].status !== 'complete') throw new Error('Different/incomplete immutable V7 ingestion');
      await db.rollback(); result.skipped=true; console.log(JSON.stringify(result)); return;
    }
    try { await access(resultPath); throw new Error('Immutable V7 result exists without matching ingestion'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    const [base] = await db.query<RowDataPacket[]>('SELECT status FROM atlas_ingestions WHERE version=?',[manifest.baseVersion]);
    if (base[0]?.status !== 'complete') throw new Error('V6 ingestion witness unavailable');
    const [ids] = await db.query<RowDataPacket[]>('SELECT id FROM atlas_companies');
    if (!equalValues(ids.map(r=>r.id).sort(),seed.companies.map(p=>p.id).sort())) throw new Error('Exact company identity set changed');
    const [siteIds] = await db.query<RowDataPacket[]>('SELECT id FROM atlas_sites');
    if (!equalValues(siteIds.map(r=>r.id).sort(),seed.sites.map(s=>s.id).sort())) throw new Error('Exact site identity set changed');
    const [countsBefore] = await db.query<RowDataPacket[]>('SELECT (SELECT COUNT(*) FROM atlas_sources) sources,(SELECT COUNT(*) FROM atlas_observations) observations,(SELECT COUNT(*) FROM atlas_company_regions) memberships');
    await db.query("INSERT INTO atlas_ingestions(version,content_hash,as_of,source_hashes,status) VALUES (?,?,?,?,'writing')",[seed.version,hash(sb),seed.asOf,JSON.stringify(seed.sourceHashes)]);
    for (const c of manifest.presence) {
      const [rows] = await db.query<RowDataPacket[]>('SELECT payload,evidence,`precision`,city,zone FROM atlas_sites WHERE id=? FOR UPDATE',[c.siteId]);
      const row=rows[0]; const current=row ? parse<MapSite>(row.payload) : undefined;
      const [sourceRows] = await db.query<RowDataPacket[]>('SELECT payload FROM atlas_sources WHERE company_id=?',[c.companyId]);
      const retainedSources=sourceRows.map(r=>parse<Source>(r.payload));
      const decision=locationCorrectionDecision(c,current,{evidence:row?.evidence,precision:row?.precision,city:row?.city,zone:row?.zone},retainedSources);
      if (decision !== 'apply') {result.guardsSkipped.push({target:c.siteId,reason:decision});continue;}
      const [rawProfiles] = await db.query<RowDataPacket[]>('SELECT payload FROM atlas_profiles WHERE company_id=?',[c.companyId]);
      const [rawCompanies] = await db.query<RowDataPacket[]>('SELECT summary FROM atlas_companies WHERE id=?',[c.companyId]);
      await db.query('INSERT INTO atlas_v7_preservation_audit(id,target_type,target_id,ingestion_version,payload) VALUES (?,?,?,?,?)',[keyHash('v7-preservation',seed.version,c.siteId),'physical_site',c.siteId,seed.version,JSON.stringify({before:current,after:c.after,originalProfile:parse(rawProfiles[0].payload),originalSummary:parse(rawCompanies[0].summary),retainedSources,decision:c.decision,witness:c.witness})]);
      for (const source of c.sources.filter(s=>!retainedSources.some(old=>old.id===s.id))) {
        const key=keyHash(c.companyId,source.id);
        const [collision]=await db.query<RowDataPacket[]>('SELECT payload FROM atlas_sources WHERE source_key=?',[key]);
        if(collision.length && sourceSignature(parse<Source>(collision[0].payload))!==sourceSignature(source))throw new Error('V7 source ID collision');
        if(!collision.length){await db.query('INSERT INTO atlas_sources(source_key,source_id,company_id,evidence,payload) VALUES (?,?,?,?,?)',[key,source.id,c.companyId,c.after.evidence,JSON.stringify(source)]);result.sourcesAdded++;}
      }
      const a=c.after;
      const [updated]=await db.query<mysql.ResultSetHeader>('UPDATE atlas_sites SET payload=? WHERE id=? AND payload=CAST(? AS JSON) AND evidence=? AND `precision`=? AND city=? AND zone <=> ?',[JSON.stringify(a),a.id,JSON.stringify(current),row.evidence,row.precision,row.city,row.zone]);
      if(updated.affectedRows!==1)throw new Error('Concurrent client site edit rejected by SQL full-payload guard');
      result.siteCorrections++;
      for(const fact of c.newFacts){await db.query('INSERT INTO atlas_observations(id,company_id,observation_id,site_id,metric,section,evidence,missing,payload) VALUES (?,?,NULL,?,?,?,?,?,?)',[keyHash('v7-site-observation',seed.version,a.id,fact.key),a.profileId,a.id,fact.key,fact.section,a.evidence,fact.value===null?1:0,JSON.stringify(fact)]);result.observationsAdded++;}
    }
    if(result.guardsSkipped.length)throw new Error('V7 client/source guards skipped; entire transaction rolled back: '+JSON.stringify(result.guardsSkipped));
    const [countsAfter]=await db.query<RowDataPacket[]>('SELECT (SELECT COUNT(*) FROM atlas_sources) sources,(SELECT COUNT(*) FROM atlas_observations) observations,(SELECT COUNT(*) FROM atlas_company_regions) memberships');
    if(Number(countsAfter[0].sources)-Number(countsBefore[0].sources)!==result.sourcesAdded || Number(countsAfter[0].observations)-Number(countsBefore[0].observations)!==result.observationsAdded || countsAfter[0].memberships!==countsBefore[0].memberships)throw new Error('Unbounded raw input count change');
    await db.query("UPDATE atlas_ingestions SET status='complete',completed_at=CURRENT_TIMESTAMP WHERE version=? AND status='writing'",[seed.version]);
    await db.commit();
    await writeFile(resultPath,JSON.stringify({...result,rawCountsBefore:countsBefore[0],rawCountsAfter:countsAfter[0],manifestSha256:hash(mb)},null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(result));
  } catch(e){await db.rollback();throw e;}
  finally {await db.query("SELECT RELEASE_LOCK(CONCAT('atlas-seed:', DATABASE()))").catch(()=>{});await db.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

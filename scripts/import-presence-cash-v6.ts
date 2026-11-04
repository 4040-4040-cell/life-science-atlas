import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";
import type { AtlasSeed, CompanyProfile, CompanySummary, Fact, MapSite, Source } from "../shared/atlas";
import { keyHash } from "../server/atlas/ingest";
import { retainedFacts, projectFactObservations, sameFact } from "../server/atlas/facts";
import { assertCashCorrection, cashCorrectionDecision, equalValues, type CashCorrection, type CorrectiveProjection, type CorrectiveValues } from "../server/atlas/presence-cash-corrections";
import { sourceSignature } from "../server/atlas/financial-corrections";
import type { AtlasFactObservation } from "../drizzle/atlas-schema";
const parse = <T>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
interface Manifest {
  seedVersion: string; baseVersion: string; asOf: string; counts: { profileCountBefore: number; profileCountAfter: number; siteCountBefore: number; siteCountAfter: number; newCompanyIds: number };
  cash: CashCorrection[];
  presence: { companyId: string; globalCompanyId: string; siteId: string; before: MapSite | null; after: MapSite; sources: Source[]; decision: string; gaps: string[] }[];
  profileChanges: { companyId: string; beforeSummary: CompanySummary; afterSummary: CompanySummary; beforeProfile: CompanyProfile; afterProfile: CompanyProfile }[];
  regionChanges: { regionId: string; before: unknown; after: unknown }[];
  zoneAdditions: AtlasSeed["zones"];
}
async function main() {
  const manifestBytes = await readFile(resolve("data/presence-cash-corrections_V6.json"));
  const manifest = JSON.parse(manifestBytes.toString()) as Manifest;
  const seedBytes = await readFile(resolve("data/atlas-seed_V6.json"));
  const seed = JSON.parse(seedBytes.toString()) as AtlasSeed;
  if (seed.version !== manifest.seedVersion || seed.sourceHashes.presence_cash_corrections_V6 !== hash(manifestBytes) || seed.companies.length !== 1276 || manifest.counts.newCompanyIds !== 0 || manifest.counts.profileCountBefore !== manifest.counts.profileCountAfter || manifest.counts.siteCountAfter !== manifest.counts.siteCountBefore + 4) throw new Error("Immutable V6 seed/manifest population or hash mismatch");
  for (const c of manifest.cash) assertCashCorrection(c, manifest.asOf);
  const seedIds = new Set(seed.companies.map(c => c.id));
  for (const p of manifest.presence) if (p.companyId !== p.globalCompanyId || p.after.profileId !== p.companyId || !seedIds.has(p.companyId) || p.after.latitude != null && p.after.precision !== "official_address_point" || p.after.physicalStatus.startsWith("planned") && (p.after.latitude != null || p.after.evidence !== "research")) throw new Error("V6 presence identity/coordinate gate failed");
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL!, connectTimeout: 30000 });
  const result = { version: seed.version, skipped: false, summaryProjections: 0, cashCorrections: 0, newFactObservations: 0, sitesAdded: 0, siteCorrections: 0, regionCorrections: 0, zonesAdded: 0, guardsSkipped: [] as { target: string; reason: string }[] };
  try {
    const [lock] = await db.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT('atlas-seed:', DATABASE()), 30) AS acquired");
    if (Number(lock[0]?.acquired) !== 1) throw new Error("Atlas ingestion lock unavailable");
    // Additive tables only. No migration mutates or deletes a prior evidence table.
    await db.query(`CREATE TABLE IF NOT EXISTS atlas_v6_corrective_projections (
      id varchar(64) PRIMARY KEY, target_type varchar(64) NOT NULL, target_id varchar(191) NOT NULL,
      ingestion_version varchar(191) NOT NULL, payload json NOT NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX atlas_v6_projection_target_idx (target_type,target_id,created_at)
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS atlas_v6_preservation_audit (
      id varchar(64) PRIMARY KEY, target_type varchar(64) NOT NULL, target_id varchar(191) NOT NULL,
      ingestion_version varchar(191) NOT NULL, payload json NOT NULL,
      created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX atlas_v6_audit_target_idx (target_type,target_id)
    )`);
    await db.beginTransaction();
    const [versions] = await db.query<RowDataPacket[]>("SELECT * FROM atlas_ingestions WHERE version = ? FOR UPDATE", [seed.version]);
    if (versions.length) {
      if (versions[0].content_hash !== hash(seedBytes)) throw new Error("V6 ingestion version already has different immutable content");
      if (versions[0].status === "complete") { await db.rollback(); result.skipped = true; console.log(JSON.stringify(result)); return; }
      throw new Error("Incomplete V6 ingestion must be reviewed, not silently resumed");
    }
    const [ids] = await db.query<RowDataPacket[]>("SELECT id FROM atlas_companies");
    if (ids.length !== 1276 || ids.some(r => !seedIds.has(r.id))) throw new Error("Persistent company identity set changed; no new IDs may be added");
    const [baseVersion] = await db.query<RowDataPacket[]>("SELECT status FROM atlas_ingestions WHERE version=?", [manifest.baseVersion]);
    if (baseVersion[0]?.status !== "complete") throw new Error("V5 preservation witness is not complete");
    await db.query("INSERT INTO atlas_ingestions (version,content_hash,as_of,source_hashes,status) VALUES (?,?,?,?, 'writing')", [seed.version,hash(seedBytes),seed.asOf,JSON.stringify(seed.sourceHashes)]);
    const audit = async (type: string, id: string, payload: unknown) => {
      await db.query("INSERT INTO atlas_v6_preservation_audit (id,target_type,target_id,ingestion_version,payload) VALUES (?,?,?,?,?)", [keyHash("v6-preservation",seed.version,type,id),type,id,seed.version,JSON.stringify(payload)]);
    };
    // Source association IDs are new V6 IDs, except retained witnesses. Existing
    // source rows never update. Actual source URLs/dates must compare exactly.
    for (const change of manifest.profileChanges) {
      const added = change.afterProfile.sources.filter(s => !change.beforeProfile.sources.some(old => old.id === s.id));
      for (const source of added) {
        const key = keyHash(change.companyId, source.id);
        const [existing] = await db.query<RowDataPacket[]>("SELECT payload FROM atlas_sources WHERE source_key=?",[key]);
        if (existing.length && sourceSignature(parse<Source>(existing[0].payload)) !== sourceSignature(source)) throw new Error("New V6 source ID collision");
        if (!existing.length) await db.query("INSERT INTO atlas_sources (source_key,source_id,company_id,evidence,payload) VALUES (?,?,?,?,?)",[key,source.id,change.companyId,change.afterSummary.evidence,JSON.stringify(source)]);
      }
    }
    for (const change of manifest.profileChanges) {
      const [companyRows] = await db.query<RowDataPacket[]>("SELECT summary FROM atlas_companies WHERE id=? FOR UPDATE",[change.companyId]);
      const rawSummary = parse<CompanySummary>(companyRows[0].summary);
      const [profileRows] = await db.query<RowDataPacket[]>("SELECT payload FROM atlas_profiles WHERE company_id=? FOR UPDATE",[change.companyId]);
      const profile = parse<CompanyProfile>(profileRows[0].payload);
      const [originalRows] = await db.query<RowDataPacket[]>("SELECT payload FROM atlas_observations WHERE company_id=? AND observation_id IS NULL AND site_id IS NULL",[change.companyId]);
      const originals = originalRows.map(r => parse<Fact>(r.payload));
      const [observationRows] = await db.query<RowDataPacket[]>("SELECT fo.payload FROM atlas_fact_observations fo JOIN atlas_ingestions i ON i.version=fo.ingestion_version WHERE fo.company_id=? AND i.status='complete' ORDER BY i.completed_at DESC,fo.ingestion_version DESC",[change.companyId]);
      const baseFacts = retainedFacts(profile.facts, originals);
      const currentFacts = projectFactObservations(baseFacts,observationRows.map(r=>parse<AtlasFactObservation>(r.payload)));
      const before: CorrectiveValues = {}, after: CorrectiveValues = {};
      for (const key of ["cash","cities","kind","evidence","occupancyReason"] as const) if (!equalValues(change.beforeSummary[key],change.afterSummary[key])) {
        if (!equalValues(rawSummary[key],change.beforeSummary[key])) { result.guardsSkipped.push({target:change.companyId+"/"+key,reason:"SKIP_CLIENT_EDITS"}); continue; }
        if (key === "cash") {
          const correction = manifest.cash.find(c=>c.companyId===change.companyId);
          if (!correction) throw new Error("Missing V6 cash source manifest");
          const [sources] = await db.query<RowDataPacket[]>("SELECT payload FROM atlas_sources WHERE company_id=?",[change.companyId]);
          const decision = cashCorrectionDecision(correction,currentFacts.find(f=>f.key===correction.before.key),baseFacts.find(f=>f.key===correction.before.key),originals,rawSummary.cash,change.beforeProfile.sources.filter(s=>correction.before.sourceIds.includes(s.id)),sources.map(r=>parse<Source>(r.payload)));
          if (decision !== "apply") { result.guardsSkipped.push({target:change.companyId+"/cash",reason:decision}); continue; }
          result.cashCorrections++;
        }
        Object.assign(before,{[key]:change.beforeSummary[key]});Object.assign(after,{[key]:change.afterSummary[key]});
      }
      const projection: CorrectiveProjection & { profileMetadata?: unknown } = {version:seed.version,before,after};
      if (equalValues(profile.gaps,change.beforeProfile.gaps)) projection.profileMetadata = {beforeGaps:profile.gaps,afterGaps:change.afterProfile.gaps};
      // Snapshot original profile + source selection before any preferred display.
      await audit("company_profile",change.companyId,{before:profile,expectedSummary:change.beforeSummary,projection,afterProfileResearch:change.afterProfile});
      if (Object.keys(after).length || projection.profileMetadata) {
        await db.query("INSERT INTO atlas_v6_corrective_projections (id,target_type,target_id,ingestion_version,payload) VALUES (?,?,?,?,?)",[keyHash("v6-summary",seed.version,change.companyId),"company_summary",change.companyId,seed.version,JSON.stringify(projection)]);result.summaryProjections++;
      }
      for (const fact of change.afterProfile.facts) {
        const previous = change.beforeProfile.facts.find(f=>f.key===fact.key);
        if (previous && sameFact(previous,fact)) continue;
        if (fact.key === "cash_and_cash_equivalents" && !("cash" in after)) continue;
        const base = baseFacts.find(f=>f.key===fact.key);
        if (fact.key !== "cash_and_cash_equivalents" && (base || currentFacts.some(f=>f.key===fact.key))) {result.guardsSkipped.push({target:change.companyId+"/"+fact.key,reason:"SKIP_CLIENT_EDITS"});continue;}
        const observation = {version:seed.version,before:base??null,after:fact};
        await db.query("INSERT INTO atlas_fact_observations (id,company_id,ingestion_version,metric,section,evidence,missing,payload) VALUES (?,?,?,?,?,?,?,?)",[keyHash("fact-observation",seed.version,change.companyId,fact.key),change.companyId,seed.version,fact.key,fact.section,change.afterSummary.evidence,fact.value===null?1:0,JSON.stringify(observation)]);result.newFactObservations++;
      }
      for (const event of change.afterProfile.events.filter(e=>!change.beforeProfile.events.some(old=>old.id===e.id))) await db.query("INSERT INTO atlas_events (id,event_id,company_id,date,type,payload) VALUES (?,?,?,?,?,?)",[keyHash(change.companyId,event.id),event.id,change.companyId,event.date,event.type,JSON.stringify(event)]);
    }
    for (const correction of manifest.presence) {
      const [rows] = await db.query<RowDataPacket[]>("SELECT payload,evidence,`precision` FROM atlas_sites WHERE id=? FOR UPDATE",[correction.siteId]);
      const current = rows.length ? parse<MapSite>(rows[0].payload) : null;
      if (!equalValues(current,correction.before)) { result.guardsSkipped.push({target:correction.siteId,reason:"SKIP_CLIENT_EDITS"});continue; }
      await audit("physical_site",correction.siteId,{before:current,after:correction.after,decision:correction.decision,sources:correction.sources});
      const a=correction.after;
      if (!current) {await db.query("INSERT INTO atlas_sites (id,company_id,region_id,city,zone,`precision`,evidence,payload) VALUES (?,?,?,?,?,?,?,?)",[a.id,a.profileId,a.regionId,a.city,a.zone,a.precision,a.evidence,JSON.stringify(a)]);result.sitesAdded++;}
      else {
        // Guard the complete old public payload AND indexed evidence/precision.
        const [updated] = await db.query<mysql.ResultSetHeader>("UPDATE atlas_sites SET city=?,zone=?,`precision`=?,evidence=?,payload=? WHERE id=? AND payload=CAST(? AS JSON) AND evidence=? AND `precision`=?",[a.city,a.zone,a.precision,a.evidence,JSON.stringify(a),a.id,JSON.stringify(current),rows[0].evidence,rows[0].precision]);
        if (updated.affectedRows!==1) throw new Error("Concurrent site edit rejected by SQL old-value guard");result.siteCorrections++;
      }
      for (const f of (a.facts??[]).filter(f=>!(current?.facts??[]).some(old=>old.key===f.key))) await db.query("INSERT INTO atlas_observations (id,company_id,observation_id,site_id,metric,section,evidence,missing,payload) VALUES (?,?,NULL,?,?,?,?,?,?)",[keyHash("v6-site-observation",seed.version,a.id,f.key),a.profileId,a.id,f.key,f.section,a.evidence,f.value===null?1:0,JSON.stringify(f)]);
      // Orbis's original baseline observation remains in the audit and original
      // observations, while unsupported current Basel residency becomes research.
      if (correction.companyId === "gco_d96230457ee4d556f0ff") {
        const [membership] = await db.query<RowDataPacket[]>("SELECT evidence FROM atlas_company_regions WHERE company_id=? AND region_id='basel' FOR UPDATE",[a.profileId]);
        if (membership[0]?.evidence !== "baseline") throw new Error("Orbis regional classification old-value guard failed");
        await audit("company_region",a.profileId+"/basel",{before:{evidence:"baseline"},after:{evidence:"research"},reason:"Retained operator-reported lead; actual Basel operating occupancy unresolved. Not closure."});
        await db.query("UPDATE atlas_company_regions SET evidence='research' WHERE company_id=? AND region_id='basel' AND evidence='baseline'",[a.profileId]);
      }
    }
    for (const correction of manifest.regionChanges) {
      const [rows] = await db.query<RowDataPacket[]>("SELECT payload FROM atlas_regions WHERE id=? FOR UPDATE",[correction.regionId]);
      const old=parse(rows[0].payload);
      if (!equalValues(old,correction.before)) {result.guardsSkipped.push({target:correction.regionId,reason:"SKIP_CLIENT_EDITS"});continue;}
      await audit("region",correction.regionId,correction);
      const [updated]=await db.query<mysql.ResultSetHeader>("UPDATE atlas_regions SET payload=? WHERE id=? AND payload=CAST(? AS JSON)",[JSON.stringify(correction.after),correction.regionId,JSON.stringify(correction.before)]);
      if(updated.affectedRows!==1)throw new Error("Concurrent region edit rejected by SQL guard");result.regionCorrections++;
    }
    for(const z of manifest.zoneAdditions){const [old]=await db.query<RowDataPacket[]>("SELECT id FROM atlas_zones WHERE id=? FOR UPDATE",[z.id]);if(old.length)throw new Error("New Fricktal analytical-zone ID already exists");await db.query("INSERT INTO atlas_zones (id,region_id,payload) VALUES (?,?,?)",[z.id,z.regionId,JSON.stringify(z)]);result.zonesAdded++;}
    const [countRows]=await db.query<RowDataPacket[]>("SELECT (SELECT COUNT(*) FROM atlas_companies) companies,(SELECT COUNT(*) FROM atlas_sites) sites");
    if (Number(countRows[0].companies)!==1276 || Number(countRows[0].sites)<1648) throw new Error("V6 population preservation check failed");
    await db.query("UPDATE atlas_ingestions SET status='complete',completed_at=CURRENT_TIMESTAMP WHERE version=? AND status='writing'",[seed.version]);
    await db.commit();
    await writeFile(resolve("data/presence-cash-import-result_V6.json"),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
    console.log(JSON.stringify(result));
  } catch(e) { await db.rollback();throw e; }
  finally { await db.query("SELECT RELEASE_LOCK(CONCAT('atlas-seed:', DATABASE()))").catch(()=>{});await db.end(); }
}
main().catch(e=>{console.error(e instanceof Error?e.message:"V6 import failed");process.exitCode=1;});

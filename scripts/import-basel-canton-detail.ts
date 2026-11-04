import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { canonicalJson, prepareCantonCompanion, sha256, validateDocumentHash } from '../server/atlas/canton-detail/contract';
import type { BaselCantonDocument } from '../shared/baselCantonDetail';

const flags = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i]; const value = process.argv[i + 1];
  if (!['--input', '--sha256', '--version', '--as-of', '--mode', '--offline-out'].includes(flag) || !value || flags.has(flag)) throw new Error('Usage: tsx scripts/import-basel-canton-detail.ts --input FILE --sha256 EXACT_SOURCE_SHA256 --version V1 --as-of YYYY-MM-DD --mode prepare|import [--offline-out NEW_VERSIONED_JSON]');
  flags.set(flag, value);
}
const parse = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
async function main() {
  const input = flags.get('--input'); const expected = flags.get('--sha256');
  const version = flags.get('--version'); const asOf = flags.get('--as-of'); const mode = flags.get('--mode') ?? 'prepare';
  if (!input || !expected || !version || !asOf || !['prepare', 'import'].includes(mode)) throw new Error('Input, exact source hash, version, date and valid mode are required.');
  const bytes = await readFile(resolve(input));
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256(bytes) !== expected) throw new Error('Exact source-byte hash mismatch.');
  const companion = prepareCantonCompanion(JSON.parse(bytes.toString('utf8')) as unknown, version, asOf, expected);
  const docs = Object.values(companion.documents);
  const serialized = JSON.stringify(companion, null, 2) + '\n';
  if (/file:|(?:^|[\s"'(])\/(?:home|mnt|tmp|Users|private)\/|\u2014|cbre/i.test(serialized)) throw new Error('Public companion contains prohibited content.');
  const output = flags.get('--offline-out');
  // Never overwrite an earlier offline/research deliverable. Reuse exact content only.
  if (output) {
    try { const old = await readFile(resolve(output), 'utf8'); if (old !== serialized) throw new Error('Offline output exists with different immutable content. Use a new version.'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; await writeFile(resolve(output), serialized, { flag: 'wx' }); }
  }
  if (mode === 'prepare') {
    console.log(JSON.stringify({ mode, version, asOf, sourceHash: expected, offlineHash: sha256(serialized),
      documents: docs.map(d => ({ id: d.id, cantonId: d.cantonId, contentHash: d.contentHash, clusters: d.clusters.length,
        supportedCompanyIds: d.supportedCompanyIds.length, sources: d.sources.length,
        inventoryRows: d.clusters.reduce((n, c) => n + c.companySites.length, 0),
        residentReferences: d.clusters.reduce((n, c) => n + c.residentReferences.length, 0),
        excludedOrUnresolvedLeads: d.clusters.reduce((n, c) => n + c.excludedOrUnresolvedLeads.length, 0),
        buildingSchedule: d.clusters.reduce((n, c) => n + c.buildingSchedule.length, 0),
        propertyEvidence: d.clusters.reduce((n, c) => n + c.propertyEvidence.length, 0),
        developmentPipeline: d.clusters.reduce((n, c) => n + c.developmentPipeline.length, 0),
        availabilityEvidence: d.clusters.reduce((n, c) => n + c.availabilityEvidence.length, 0) })),
      offlineOutput: output ?? null })); return;
  }
  if (!process.env.DATABASE_URL) throw new Error('Persistent DATABASE_URL is required for import.');
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, connectTimeout: 30000 });
  let locked = false; let transaction = false;
  try {
    const [lock] = await db.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT('atlas-canton-detail:', DATABASE()), 30) AS acquired");
    if (Number(lock[0]?.acquired) !== 1) throw new Error('Canton import lock unavailable.'); locked = true;
    const [ingestions] = await db.query<RowDataPacket[]>("SELECT version FROM atlas_ingestions WHERE status='complete' LIMIT 1");
    if (!ingestions.length) throw new Error('Baseline persistent ingestion is not ready.');
    const [companies, sites, aerials] = await Promise.all([
      db.query<RowDataPacket[]>('SELECT id FROM atlas_companies'),
      db.query<RowDataPacket[]>('SELECT id, company_id, region_id FROM atlas_sites'),
      db.query<RowDataPacket[]>('SELECT id, region_id FROM atlas_aerials'),
    ]);
    const companyIds = new Set(companies[0].map(r => r.id)); const siteIds = new Map(sites[0].map(r => [r.id, r])); const aerialIds = new Map(aerials[0].map(r => [r.id, r.region_id]));
    for (const doc of docs) for (const id of doc.supportedCompanyIds) if (!companyIds.has(id)) throw new Error(`Unknown conservative existing company ID: ${id}`);
    for (const doc of docs) for (const cluster of doc.clusters) {
      for (const row of cluster.companySites) {
        if (row.companyId && !companyIds.has(row.companyId)) throw new Error(`Unknown global company ID: ${row.companyId}`);
        if (row.siteId) { const site = siteIds.get(row.siteId); if (!site || site.region_id !== 'basel' || row.companyId && site.company_id !== row.companyId) throw new Error(`Exact retained site ID/owner mismatch: ${row.siteId}`); }
      }
      for (const id of cluster.aerialIds) if (aerialIds.get(id) !== 'basel') throw new Error(`Missing retained Basel aerial ID: ${id}. Import supplied aerial metadata first.`);
    }
    await db.query(await readFile(resolve('drizzle/migrations/0004_atlas_canton_research_documents.sql'), 'utf8'));
    await db.beginTransaction(); transaction = true;
    const [existing] = await db.query<RowDataPacket[]>('SELECT * FROM atlas_canton_research_documents WHERE version=? FOR UPDATE', [version]);
    if (existing.length) {
      if (existing.length !== 2) throw new Error('Partial immutable canton version requires review.');
      for (const d of docs) {
        const old = existing.find(r => r.canton_id === d.cantonId); const payload = old ? parse<BaselCantonDocument>(old.payload) : null;
        if (!old || old.id !== d.id || old.source_hash !== expected || old.content_hash !== d.contentHash || !payload || !validateDocumentHash(payload) || canonicalJson(payload) !== canonicalJson(d)) throw new Error('Existing immutable version has different source/content. Use a new version.');
      }
      await db.rollback(); transaction = false;
      console.log(JSON.stringify({ mode, version, skipped: true, sourceHash: expected })); return;
    }
    for (const d of docs) await db.query('INSERT INTO atlas_canton_research_documents (id,canton_id,version,source_hash,content_hash,as_of,payload) VALUES (?,?,?,?,?,?,?)', [d.id, d.cantonId, version, expected, d.contentHash, asOf, JSON.stringify(d)]);
    await db.commit(); transaction = false;
    console.log(JSON.stringify({ mode, version, skipped: false, insertedDocuments: 2, companyMasterWrites: 0, siteMasterWrites: 0, sourceHash: expected, contentHashes: docs.map(d => ({ cantonId: d.cantonId, contentHash: d.contentHash })) }));
  } catch (e) { if (transaction) await db.rollback(); throw e; }
  finally { if (locked) await db.query("SELECT RELEASE_LOCK(CONCAT('atlas-canton-detail:', DATABASE()))").catch(() => {}); await db.end(); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Canton detail import failed'); process.exitCode = 1; });

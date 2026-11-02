import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { count, eq, inArray, and, sql } from "drizzle-orm";
import type { CompanyProfile } from "../shared/atlas";
import * as t from "../drizzle/atlas-schema";
import { getAtlasDb, closeAtlasDb } from "../server/atlas/connection";
import { sameFact } from "../server/atlas/facts";
import type { FinancialCorrections } from "../server/atlas/financial-corrections";

async function main() {
  const manifest: FinancialCorrections = JSON.parse(await readFile("data/financial-corrections_V5.json", "utf8"));
  const db = getAtlasDb();
  const ids = manifest.corrections.map(c => c.companyId);
  const originals = await db.select().from(t.atlasObservations).where(and(inArray(t.atlasObservations.companyId, ids), eq(t.atlasObservations.metric, "operating_cash_flow"), sql`${t.atlasObservations.observationId} is null`, sql`${t.atlasObservations.siteId} is null`));
  const profiles = await db.select().from(t.atlasProfiles).where(inArray(t.atlasProfiles.companyId, ids));
  const observations = await db.select().from(t.atlasFactObservations).where(eq(t.atlasFactObservations.ingestionVersion, manifest.seedVersion));
  const priorClinical = await db.select({ total: count() }).from(t.atlasFactObservations).where(eq(t.atlasFactObservations.ingestionVersion, manifest.baseVersion));
  const profileCount = await db.select({ total: count() }).from(t.atlasProfiles);
  const siteCount = await db.select({ total: count() }).from(t.atlasSites);
  const versions = await db.select({ version: t.atlasIngestions.version, status: t.atlasIngestions.status }).from(t.atlasIngestions);
  assert.equal(observations.length, 91);
  assert.equal(Number(priorClinical[0].total), 1361);
  assert.equal(Number(profileCount[0].total), 1276);
  assert.equal(Number(siteCount[0].total), 1648);
  const verified: { companyId: string; name: string; value: number; unit: string; periodStart: string; periodEnd: string; sourceIds: string[]; runway: unknown }[] = [];
  // Bounded serial reads: no external SEC queries or census expansion.
  for (const c of manifest.corrections) {
    assert(originals.some(o => o.companyId === c.companyId && sameFact(o.payload, c.before)), `Original evidence changed: ${c.companyId}`);
    assert(sameFact(profiles.find(p => p.companyId === c.companyId)!.payload.facts.find(f => f.key === "operating_cash_flow"), c.before), `Original profile changed: ${c.companyId}`);
    const observation = observations.find(o => o.companyId === c.companyId)!;
    assert(sameFact(observation.payload.before, c.before));
    assert(sameFact(observation.payload.after, c.after));
    const response = await fetch(`http://127.0.0.1:3000/api/atlas/profile/${c.companyId}`);
    assert.equal(response.status, 200);
    const p: CompanyProfile = await response.json();
    assert(sameFact(p.facts.find(f => f.key === "operating_cash_flow"), c.after), `Live CFO differs: ${c.companyId}`);
    assert.equal(p.runway?.value ?? null, null);
    if (c.companyId === "gco_83cf6169ad5cf8eb3372") assert.equal(p.cash?.value, 332.4);
    verified.push({ companyId: c.companyId, name: p.name, value: Number(c.after.value), unit: c.after.unit!, periodStart: c.after.periodStart!, periodEnd: c.after.asOf!, sourceIds: c.after.sourceIds, runway: p.runway?.value ?? null });
  }
  const result = { asOf: new Date().toISOString(), version: manifest.seedVersion, liveCfoVerified: verified.length, financialCorrectionsAdded: observations.length, financialSkips: [], repeatImport: "completed version no-op; verified during upgrade", profiles: Number(profileCount[0].total), sites: Number(siteCount[0].total), originalProfilesAndObservationsPreserved: true, priorV4ClinicalAndFinancingObservationsPreserved: Number(priorClinical[0].total), versions, verified };
  const path = "data/financial-verification_V5.json";
  // A receipt is immutable; reruns print fresh checks without replacing it.
  try { await writeFile(path, JSON.stringify(result, null, 2) + "\n", { flag: "wx" }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  console.log(JSON.stringify({ ...result, verified: verified.filter(v => /Neurocrine|Gilead|Vertex|Janux/.test(v.name)) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closeAtlasDb);

import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import type { Connection, RowDataPacket } from "mysql2/promise";
import type { AtlasSeed, Fact } from "../../shared/atlas";
import * as t from "../../drizzle/atlas-schema";
import { toSummary } from "./validation";
import { assertRetainedFact, projectFactObservations, retainedFacts, sameFact } from "./facts";

export const keyHash = (...parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
export function numericMetric(fact: Fact | null): number | null {
  if (!fact || typeof fact.value !== "number" || !Number.isFinite(fact.value)) return null;
  const unit = (fact.unit ?? "").trim().toLowerCase();
  const multiplier = /billion|(?:^|\s|\$)bn(?:$|\s)/.test(unit) ? 1e9 : /million|(?:^|\s|\$)m(?:$|\s)/.test(unit) ? 1e6 : /thousand|(?:^|\s|\$)k(?:$|\s)/.test(unit) ? 1e3 : 1;
  return fact.value * multiplier;
}
// A stable no-op conflict policy deliberately preserves original evidence and all
// later edits. New versions may add records; changing an existing ID requires an
// explicitly reviewed future update workflow, never a default seed upsert.
export async function ingestAtlas(connection: Connection, seed: AtlasSeed, contentHash: string) {
  const [lockRows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT('atlas-seed:', DATABASE()), 30) AS acquired");
  if (Number(lockRows[0]?.acquired) !== 1) throw new Error("Another Atlas ingestion holds the database lock. Retry later.");
  try {
    const db = drizzle(connection, { schema: t, mode: "default" });
    return await db.transaction(async tx => {
      const [existing] = await tx.select().from(t.atlasIngestions).where(eq(t.atlasIngestions.version, seed.version)).limit(1);
      if (existing?.contentHash !== undefined && existing.contentHash !== contentHash) throw new Error("This ingestion version already has different contents. Assign a new version; existing rows will not be overwritten.");
      if (existing?.status === "complete") return { version: seed.version, skipped: true, companies: seed.companies.length, sites: seed.sites.length };
      await tx.insert(t.atlasIngestions).values({ version: seed.version, asOf: seed.asOf, contentHash, sourceHashes: seed.sourceHashes, status: "writing" }).onDuplicateKeyUpdate({ set: { version: sql`version` } });

      // Bound statement sizes, including large research JSON payloads.
      const chunks = <T>(rows: T[], size = 50): T[][] => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
      for (const rows of chunks(seed.regions.map(r => ({ id: r.id, name: r.name, payload: r, ingestionVersion: seed.version })))) await tx.insert(t.atlasRegions).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      const parents = [...new Set(seed.companies.map(c => c.parent).filter((v): v is string => !!v))].map(name => ({ id: keyHash("parent", name), name }));
      const priorCompanies = new Map((await tx.select({ id: t.atlasCompanies.id, summary: t.atlasCompanies.summary }).from(t.atlasCompanies)).map(c => [c.id, c.summary]));
      const priorProfiles = new Map((await tx.select().from(t.atlasProfiles)).map(p => [p.companyId, p.payload]));
      const originalFacts = await tx.select({ companyId: t.atlasObservations.companyId, payload: t.atlasObservations.payload }).from(t.atlasObservations).where(and(sql`${t.atlasObservations.observationId} is null`, sql`${t.atlasObservations.siteId} is null`));
      const priorFactObservations = await tx.select({ companyId: t.atlasFactObservations.companyId, payload: t.atlasFactObservations.payload }).from(t.atlasFactObservations).innerJoin(t.atlasIngestions, eq(t.atlasIngestions.version, t.atlasFactObservations.ingestionVersion)).where(eq(t.atlasIngestions.status, "complete")).orderBy(desc(t.atlasIngestions.completedAt), desc(t.atlasFactObservations.ingestionVersion));
      const factObservations: (typeof t.atlasFactObservations.$inferInsert)[] = [];
      for (const c of seed.companies) {
        const prior = priorProfiles.get(c.id);
        if (!prior) continue;
        const originals = originalFacts.filter(f => f.companyId === c.id).map(f => f.payload);
        const base = retainedFacts(prior.facts, originals);
        const current = new Map(projectFactObservations(base, priorFactObservations.filter(f => f.companyId === c.id).map(f => f.payload)).map(f => [f.key, f]));
        const baseByKey = new Map(base.map(f => [f.key, f]));
        for (const fact of c.facts) {
          if (sameFact(current.get(fact.key), fact)) continue;
          const before = baseByKey.get(fact.key);
          assertRetainedFact(before, originals, c.id);
          factObservations.push({ id: keyHash("fact-observation", seed.version, c.id, fact.key), companyId: c.id, ingestionVersion: seed.version, metric: fact.key, section: fact.section, evidence: c.evidence, missing: fact.value === null ? 1 : 0, payload: { version: seed.version, before: before ?? null, after: fact } });
        }
      }
      for (const rows of chunks(factObservations)) await tx.insert(t.atlasFactObservations).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      const overlays: (typeof t.atlasCompanyOverlays.$inferInsert)[] = [];
      for (const c of seed.companies) {
        const prior = priorCompanies.get(c.id);
        if (!prior || !c.facts.some(f => f.status === "analyst_assumption")) continue;
        const before = { priority: prior.priority, score: prior.score, coverage: prior.coverage };
        const after = { priority: c.priority, score: c.score, coverage: c.coverage };
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        overlays.push({ id: keyHash("model-overlay", seed.version, c.id), companyId: c.id, ingestionVersion: seed.version, basePriority: before.priority, baseScore: before.score, baseCoverage: before.coverage, priority: after.priority, score: after.score, coverage: after.coverage, payload: { version: seed.version, before, after, assumption: true } });
      }
      for (const rows of chunks(overlays)) await tx.insert(t.atlasCompanyOverlays).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      for (const rows of chunks(parents)) await tx.insert(t.atlasParents).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      for (const rows of chunks(seed.companies.map(c => ({ id: c.id, name: c.name, evidence: c.evidence, category: c.category, priority: c.priority, parentId: c.parent ? keyHash("parent", c.parent) : null, score: c.score, cashValue: numericMetric(c.cash), employeeValue: numericMetric(c.employees), summary: toSummary(c), ingestionVersion: seed.version })))) await tx.insert(t.atlasCompanies).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      for (const rows of chunks(seed.companies.map(c => ({ companyId: c.id, payload: { ...c, sites: seed.sites.filter(s => s.profileId === c.id), peers: undefined } })), 10)) await tx.insert(t.atlasProfiles).values(rows).onDuplicateKeyUpdate({ set: { companyId: sql`company_id` } });
      for (const rows of chunks(seed.companies.flatMap(c => c.regionIds.map(regionId => ({ companyId: c.id, regionId, evidence: seed.sites.some(s => s.profileId === c.id && s.regionId === regionId && s.evidence === "baseline") ? "baseline" as const : "research" as const }))))) await tx.insert(t.atlasCompanyRegions).values(rows).onDuplicateKeyUpdate({ set: { companyId: sql`company_id` } });
      for (const rows of chunks(seed.sites.map(s => ({ id: s.id, companyId: s.profileId, regionId: s.regionId, city: s.city, zone: s.zone, precision: s.precision, evidence: s.evidence, payload: s })))) await tx.insert(t.atlasSites).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      const sources: (typeof t.atlasSources.$inferInsert)[] = [];
      const observations: (typeof t.atlasObservations.$inferInsert)[] = [];
      const events: (typeof t.atlasEvents.$inferInsert)[] = [];
      function facts(companyId: string, values: Fact[], evidence: "baseline" | "research", observationId: string | null = null, siteId: string | null = null) {
        for (const [index, fact] of values.entries()) observations.push({ id: keyHash(companyId, observationId, siteId, fact.key, index), companyId, observationId, siteId, metric: fact.key, section: fact.section, evidence, missing: fact.value === null ? 1 : 0, payload: fact });
      }
      for (const c of seed.companies) {
        for (const s of c.sources) sources.push({ key: keyHash(c.id, s.id), sourceId: s.id, companyId: c.id, evidence: c.evidence, payload: s });
        // Existing profile facts, including additions/corrections, are handled
        // by the append-only versioned table above; never create a second
        // unversioned assertion merely because a seed changed array positions.
        if (!priorProfiles.has(c.id)) facts(c.id, c.facts, c.evidence);
        // Summary headline facts may be absent from the detailed fact array.
        const known = new Set(c.facts.map(f => f.key));
        facts(c.id, [c.cash, c.runway, c.employees].filter((f): f is Fact => !!f && !known.has(f.key)), c.evidence, "summary");
        for (const o of c.imported) {
          facts(c.id, o.facts, "research", o.id);
          for (const s of o.sources) sources.push({ key: keyHash(c.id, o.id, s.id), sourceId: s.id, companyId: c.id, evidence: "research", payload: s });
        }
        for (const e of c.events) events.push({ id: keyHash(c.id, e.id), eventId: e.id, companyId: c.id, date: e.date, type: e.type, payload: e });
      }
      for (const s of seed.sites) facts(s.profileId, s.facts ?? [], s.evidence, null, s.id);
      for (const a of seed.aerials) for (const s of a.sources) sources.push({ key: keyHash("aerial", a.id, s.id), sourceId: s.id, companyId: null, evidence: "baseline", payload: s });
      for (const rows of chunks(sources)) await tx.insert(t.atlasSources).values(rows).onDuplicateKeyUpdate({ set: { key: sql`source_key` } });
      for (const rows of chunks(observations)) await tx.insert(t.atlasObservations).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      for (const rows of chunks(events)) await tx.insert(t.atlasEvents).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      for (const rows of chunks(seed.aerials.map(a => ({ id: a.id, regionId: a.regionId, payload: a })))) await tx.insert(t.atlasAerials).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      for (const rows of chunks(seed.zones.map(z => ({ id: z.id, regionId: z.regionId, payload: z })))) await tx.insert(t.atlasZones).values(rows).onDuplicateKeyUpdate({ set: { id: sql`id` } });
      await tx.update(t.atlasIngestions).set({ status: "complete", completedAt: new Date() }).where(eq(t.atlasIngestions.version, seed.version));
      return { version: seed.version, skipped: false, companies: seed.companies.length, sites: seed.sites.length, factObservationsAdded: factObservations.length };
    });
  } finally { await connection.query("SELECT RELEASE_LOCK(CONCAT('atlas-seed:', DATABASE()))"); }
}

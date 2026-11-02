import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { count, eq, sql } from "drizzle-orm";
import type { AtlasSeed } from "../../shared/atlas";
import * as t from "../../drizzle/atlas-schema";
import { closeAtlasDb, getAtlasDb } from "./connection";
import { getCompanies, getCoverage, getExportRows, getOverview, getProfile, getRegion } from "./repository";
import { parseFilters } from "./validation";
import { companiesCsv } from "./csv";
import { factHash } from "./facts";

describe.runIf(process.env.ATLAS_DB_INTEGRATION === "1")("real persistent Atlas (read-only)", () => {
  let seed: AtlasSeed;
  beforeAll(() => {
    const path = ["data/atlas-seed_V5.json", "data/atlas-seed_V5.json.gz", "data/atlas-seed_V4.json", "data/atlas-seed_V4.json.gz", "data/atlas-seed_V3.json", "data/atlas-seed_V3.json.gz", "data/atlas-seed_V2.json", "data/atlas-seed_V2.json.gz"].find(existsSync)!;
    const buffer = readFileSync(path);
    seed = JSON.parse((path.endsWith(".gz") ? gunzipSync(buffer) : buffer).toString("utf8"));
  });
  afterAll(closeAtlasDb);
  it("persists all profiles, sites, aerials and completed ingestion versions", async () => {
    const db = getAtlasDb();
    const [profiles, sites, aerials, versions] = await Promise.all([db.select({ total: count() }).from(t.atlasProfiles), db.select({ total: count() }).from(t.atlasSites), db.select({ total: count() }).from(t.atlasAerials), db.select().from(t.atlasIngestions)]);
    expect(Number(profiles[0].total)).toBe(seed.companies.length);
    expect(Number(sites[0].total)).toBe(seed.sites.length);
    expect(Number(aerials[0].total)).toBe(seed.aerials.length);
    expect(versions.find(v => v.version === seed.version)?.status).toBe("complete");
  });
  it("matches all eleven approved regional counts and excludes institution references from company totals", async () => {
    const overview = await getOverview();
    expect(overview.regions).toHaveLength(seed.regions.length);
    expect(overview.totals.baselineProfiles).toBe(seed.companies.filter(c => c.evidence === "baseline" && c.kind !== "institution_reference").length);
    expect(overview.totals.researchProfiles).toBe(seed.companies.filter(c => c.evidence === "research").length);
    for (const r of seed.regions) expect(overview.regions.find(x => x.id === r.id)).toMatchObject({ baselineCompanies: r.baselineCompanies, researchCompanies: r.researchCompanies, sites: r.sites, preciseSites: r.preciseSites, aerialCount: r.aerialCount });
  });
  it("preserves regional research evidence on a globally baseline company", async () => {
    const match = seed.companies.flatMap(c => c.evidence !== "baseline" ? [] : c.regionIds.filter(regionId => seed.sites.some(s => s.profileId === c.id && s.regionId === regionId && s.evidence === "research") && !seed.sites.some(s => s.profileId === c.id && s.regionId === regionId && s.evidence === "baseline")).map(regionId => ({ c, regionId })))[0];
    expect(match).toBeDefined();
    const region = await getRegion(match.regionId);
    expect(region.companies.find(c => c.id === match.c.id)?.evidence).toBe("research");
    const result = await getCompanies(parseFilters({ region: match.regionId, q: match.c.name, evidence: "research", limit: "250" }));
    expect(result.items.find(c => c.id === match.c.id)?.evidence).toBe("research");
  });
  it("includes mixed regional memberships in both layers with the same CSV IDs and original fact statuses", async () => {
    const id = "gco_48272715346d6e3b4674";
    const original = seed.companies.find(c => c.id === id)!;
    for (const evidence of ["baseline", "research"] as const) {
      const filters = parseFilters({ region: "biotech-beach", q: "Amgen", evidence, limit: "250" });
      const [list, exported] = await Promise.all([getCompanies(filters), getExportRows(filters)]);
      expect(list.items.find(c => c.id === id)?.evidence).toBe(evidence);
      expect(exported.map(r => r.summary.id)).toEqual(list.items.map(c => c.id));
      expect(exported.find(r => r.summary.id === id)?.summary.cash?.status).toBe(original.cash?.status);
      expect(companiesCsv(exported, seed.asOf)).toContain(id);
    }
    const profile = await getProfile(id);
    expect(profile.sites.find(s => s.id === "claude_csv:5c6eedfb4fa8:site:501")).toMatchObject({ evidence: "research", precision: "provider_unchecked_street" });
  });
  it("filters all mixed company-region memberships by observation presence without changing census counts", async () => {
    const mixed = new Map<string, Set<string>>();
    for (const c of seed.companies) for (const regionId of c.regionIds) {
      const sites = seed.sites.filter(s => s.profileId === c.id && s.regionId === regionId);
      if (sites.some(s => s.evidence === "baseline") && sites.some(s => s.evidence === "research")) {
        if (!mixed.has(regionId)) mixed.set(regionId, new Set());
        mixed.get(regionId)!.add(c.id);
      }
    }
    expect([...mixed.values()].reduce((n, ids) => n + ids.size, 0)).toBe(302);
    for (const [region, ids] of mixed) {
      const found = new Set<string>();
      let page = 1;
      while (true) {
        const list = await getCompanies(parseFilters({ region, evidence: "research", limit: "250", page: String(page++) }));
        list.items.forEach(c => { expect(c.evidence).toBe("research"); found.add(c.id); });
        if (found.size >= list.total) break;
      }
      for (const id of ids) expect(found.has(id)).toBe(true);
    }
  }, 60_000);
  it("conjoins accepted frame site IDs and site evidence identically for companies and CSV", async () => {
    const frames = [seed.zones.find(z => z.id === "beach-carmel-core")!, seed.zones.find(z => z.regionId === "genetown" && z.siteIds.length > 3)!, seed.zones.find(z => z.regionId === "basel" && z.siteIds.length > 3)!];
    for (const frame of frames) for (const evidence of ["all", "baseline", "research"] as const) {
      const accepted = new Set(seed.sites.filter(s => s.regionId === frame.regionId && frame.siteIds.includes(s.id) && (evidence === "all" || s.evidence === evidence)).map(s => s.profileId));
      const expected = [...accepted].sort();
      const filters = parseFilters({ region: frame.regionId, frame: frame.id, evidence, limit: "250" });
      const [list, exported] = await Promise.all([getCompanies(filters), getExportRows(filters)]);
      expect(list.items.map(c => c.id).sort()).toEqual(expected);
      expect(list.total).toBe(expected.length);
      expect(exported.map(r => r.summary.id).sort()).toEqual(expected);
      if (evidence !== "all") for (const c of list.items) expect(c.evidence).toBe(evidence);
    }
    await expect(getCompanies(parseFilters({ region: "basel", frame: "beach-carmel-core" }))).rejects.toMatchObject({ status: 400, code: "FRAME_REGION_MISMATCH" });
    await expect(getExportRows(parseFilters({ region: "biotech-beach", frame: "does-not-exist" }))).rejects.toMatchObject({ status: 404, code: "FRAME_NOT_FOUND" });
  });
  it("persists and exposes every V4 retained program and precise financing correction without overwriting original evidence", async () => {
    const v4: AtlasSeed = JSON.parse(readFileSync("data/atlas-seed_V4.json", "utf8"));
    const v3: AtlasSeed = JSON.parse(readFileSync("data/atlas-seed_V3.json", "utf8"));
    const changed = v4.companies.filter(c => {
      const prior = v3.companies.find(p => p.id === c.id)!;
      return c.facts.some(f => !prior.facts.some(p => p.key === f.key && factHash(p) === factHash(f)));
    });
    const observations = await getAtlasDb().select().from(t.atlasFactObservations).where(eq(t.atlasFactObservations.ingestionVersion, v4.version));
    expect(observations).toHaveLength(1361);
    expect(observations.filter(o => o.payload.before === null)).toHaveLength(1330);
    expect(observations.filter(o => o.payload.before !== null)).toHaveLength(31);
    for (const company of changed) {
      const profile = await getProfile(company.id);
      const expected = new Map(seed.companies.find(c => c.id === company.id)!.facts.map(f => [f.key, factHash(f)]));
      for (const f of profile.facts) if (expected.has(f.key)) expect(factHash(f)).toBe(expected.get(f.key));
      expect(company.facts.every(f => profile.facts.some(p => p.key === f.key))).toBe(true);
    }
    const id = "gco_0d960be72ef4b0c28f47";
    const [base] = await getAtlasDb().select().from(t.atlasProfiles).where(eq(t.atlasProfiles.companyId, id));
    expect(base.payload.facts.find(f => f.key === "funding_0")?.scope).toBe("Companywide dated financing; not current cash or committed local space");
    const projected = (await getProfile(id)).facts.find(f => f.key === "funding_0")!;
    expect(projected).toMatchObject({ value: 193, scope: "combined Series A and B financings", status: "verified" });
    expect(projected.notes).toContain("equity_financing");
    const retainedOriginals = await getAtlasDb().select().from(t.atlasObservations).where(eq(t.atlasObservations.companyId, id));
    expect(retainedOriginals.some(o => o.metric === "funding_0" && o.payload.scope === "Companywide dated financing; not current cash or committed local space")).toBe(true);
  }, 60_000);
  it("serves model assumptions and the explicit overlay without replacing original profiles", async () => {
    const modelCompany = seed.companies.find(c => c.score !== null && c.facts.some(f => f.status === "analyst_assumption"))!;
    expect(modelCompany).toBeDefined();
    const profile = await getProfile(modelCompany.id);
    expect(profile.score).toBe(modelCompany.score); expect(profile.coverage).toBe(modelCompany.coverage); expect(profile.priority).toBe(modelCompany.priority);
    expect(profile.facts.filter(f => f.status === "analyst_assumption").length).toBeGreaterThan(0);
    expect(profile.peerContext.formalPeers).toBe(false); expect(profile.peerContext.label).toContain("not formal peers");
    const scored = await getCompanies(parseFilters({ sort: "score", limit: "5" }));
    expect(scored.items.some(c => c.id === modelCompany.id)).toBe(true);
    const [base] = await getAtlasDb().select({ score: t.atlasCompanies.score }).from(t.atlasCompanies).where(eq(t.atlasCompanies.id, modelCompany.id));
    expect(base.score).not.toBe(modelCompany.score);
  });
  it("returns source-aware coverage and all filtered CSV rows", async () => {
    const coverage = await getCoverage(); expect(coverage.ingestionVersion).toBe(seed.version);
    expect(coverage.totals.metricObservations).toBeGreaterThan(0); expect(coverage.totals.sourceRecords).toBeGreaterThan(0);
    const filters = parseFilters({ region: "basel", page: "2", limit: "1" });
    const rows = await getExportRows(filters); expect(rows.length).toBeGreaterThan(1);
    const csv = companiesCsv(rows, seed.asOf);
    expect(csv).toContain('"source_urls"'); expect(csv).not.toContain("/home/ubuntu/"); expect(csv).not.toContain("mysql://");
  });
  it("retains all 57 approved image extents without changing analytical bounds or image URLs", async () => {
    const rows = await getAtlasDb().select({ payload: t.atlasAerials.payload }).from(t.atlasAerials);
    for (const view of seed.aerials) {
      const stored = rows.find(r => r.payload.id === view.id)!.payload;
      expect(stored.imageBounds).toEqual(view.imageBounds);
      expect(stored.bounds).toEqual(view.bounds);
      expect(stored.imageUrl).toBe(view.imageUrl);
    }
  });
});

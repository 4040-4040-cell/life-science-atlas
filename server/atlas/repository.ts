import { and, asc, count, desc, eq, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import type { AtlasRegion, CompanyListResponse, CompanyProfile, CompanySummary, OverviewResponse, RegionResponse } from "../../shared/atlas";
import * as t from "../../drizzle/atlas-schema";
import { getAtlasDb } from "./connection";
import { AtlasError, type CompanyFilters } from "./validation";
import { keyHash } from "./ingest";
import { applyModelOverlay, effectivePriority, effectiveScore, modelOverlaySelection } from "./overlays";
import { projectFactObservations, retainedFacts } from "./facts";

export const METHODOLOGY = "Source-supported baseline records and imported research observations remain separate evidence layers. Companywide financials are not local capital or guaranteed lease credit. Missing facts remain unknown. City reference and unchecked research coordinates are not verified site pins. Nearby/city context is not a formal peer group. Analytical aerial zones are not official submarket boundaries. Cash sorting normalizes disclosed million/billion units but does not apply currency conversion.";

export async function readyIngestion() {
  const db = getAtlasDb();
  const [version] = await db.select({ version: t.atlasIngestions.version, asOf: t.atlasIngestions.asOf, completedAt: t.atlasIngestions.completedAt }).from(t.atlasIngestions).where(eq(t.atlasIngestions.status, "complete")).orderBy(desc(t.atlasIngestions.completedAt), desc(t.atlasIngestions.version)).limit(1);
  if (!version) throw new AtlasError(503, "ATLAS_NOT_READY", "Atlas ingestion has not completed. No partial or in-memory dataset is served.");
  return version;
}
export async function requireRegion(id: string) {
  const [region] = await getAtlasDb().select().from(t.atlasRegions).where(eq(t.atlasRegions.id, id)).limit(1);
  if (!region) throw new AtlasError(404, "REGION_NOT_FOUND", "Region not found.");
  return region.payload;
}
async function regionsWithCounts(): Promise<AtlasRegion[]> {
  const db = getAtlasDb();
  const [regions, companyCounts, siteCounts, aerialCounts] = await Promise.all([
    db.select({ payload: t.atlasRegions.payload }).from(t.atlasRegions).orderBy(asc(t.atlasRegions.name)),
    db.select({ regionId: t.atlasCompanyRegions.regionId, baseline: sql<number>`sum(case when ${t.atlasCompanyRegions.evidence} = 'baseline' then 1 else 0 end)`, research: sql<number>`sum(case when ${t.atlasCompanyRegions.evidence} = 'research' then 1 else 0 end)` }).from(t.atlasCompanyRegions).innerJoin(t.atlasCompanies, eq(t.atlasCompanies.id, t.atlasCompanyRegions.companyId)).where(sql`json_unquote(json_extract(${t.atlasCompanies.summary}, '$.kind')) != 'institution_reference'`).groupBy(t.atlasCompanyRegions.regionId),
    db.select({ regionId: t.atlasSites.regionId, total: count(), precise: sql<number>`sum(case when ${t.atlasSites.precision} in ('address_range_interpolation', 'official_address_point', 'campus_reference_address', 'address_matched', 'address-matched', 'rooftop', 'exact', 'verified', 'precise') and json_unquote(json_extract(${t.atlasSites.payload}, '$.latitude')) != 'null' and json_unquote(json_extract(${t.atlasSites.payload}, '$.longitude')) != 'null' then 1 else 0 end)` }).from(t.atlasSites).groupBy(t.atlasSites.regionId),
    db.select({ regionId: t.atlasAerials.regionId, total: count() }).from(t.atlasAerials).groupBy(t.atlasAerials.regionId),
  ]);
  return regions.map(({ payload: r }) => { const c = companyCounts.find(c => c.regionId === r.id); const s = siteCounts.find(s => s.regionId === r.id); const a = aerialCounts.find(a => a.regionId === r.id); return { ...r, baselineCompanies: Number(c?.baseline ?? 0), researchCompanies: Number(c?.research ?? 0), sites: Number(s?.total ?? 0), preciseSites: Number(s?.precise ?? 0), aerialCount: Number(a?.total ?? 0) }; });
}
export async function getOverview(): Promise<OverviewResponse> {
  const ingestion = await readyIngestion();
  const db = getAtlasDb();
  const [regions, companyCounts, siteCount, aerialCount] = await Promise.all([
    regionsWithCounts(), db.select({ evidence: t.atlasCompanies.evidence, total: count() }).from(t.atlasCompanies).where(sql`json_unquote(json_extract(${t.atlasCompanies.summary}, '$.kind')) != 'institution_reference'`).groupBy(t.atlasCompanies.evidence), db.select({ total: count() }).from(t.atlasSites), db.select({ total: count() }).from(t.atlasAerials),
  ]);
  return { regions, totals: { baselineProfiles: Number(companyCounts.find(c => c.evidence === "baseline")?.total ?? 0), researchProfiles: Number(companyCounts.find(c => c.evidence === "research")?.total ?? 0), sites: Number(siteCount[0].total), aerialViews: Number(aerialCount[0].total) }, asOf: ingestion.asOf, methodology: METHODOLOGY };
}
export async function getRegion(id: string): Promise<RegionResponse> {
  await readyIngestion();
  await requireRegion(id);
  const db = getAtlasDb();
  const [regions, companies, sites, aerials, zones] = await Promise.all([
    regionsWithCounts(),
    db.select({ summary: t.atlasCompanies.summary, modelOverlay: modelOverlaySelection(), evidence: t.atlasCompanyRegions.evidence }).from(t.atlasCompanies).innerJoin(t.atlasCompanyRegions, eq(t.atlasCompanyRegions.companyId, t.atlasCompanies.id)).where(eq(t.atlasCompanyRegions.regionId, id)).orderBy(asc(t.atlasCompanies.name), asc(t.atlasCompanies.id)),
    db.select({ payload: t.atlasSites.payload }).from(t.atlasSites).where(eq(t.atlasSites.regionId, id)),
    db.select({ payload: t.atlasAerials.payload }).from(t.atlasAerials).where(eq(t.atlasAerials.regionId, id)),
    db.select({ payload: t.atlasZones.payload }).from(t.atlasZones).where(eq(t.atlasZones.regionId, id)),
  ]);
  return { region: regions.find(r => r.id === id)!, companies: companies.map(c => ({ ...applyModelOverlay(c.summary, c.modelOverlay), evidence: c.evidence })), sites: sites.map(s => s.payload), aerials: aerials.map(a => a.payload), zones: zones.map(z => z.payload) };
}
export function regionEvidence(region?: string): SQL<"baseline" | "research"> {
  return region ? sql`(select ${t.atlasCompanyRegions.evidence} from ${t.atlasCompanyRegions} where ${t.atlasCompanyRegions.companyId} = ${t.atlasCompanies.id} and ${t.atlasCompanyRegions.regionId} = ${region} limit 1)` : sql`${t.atlasCompanies.evidence}`;
}
// Evidence presence is independent of the collapsed baseline/research-only census
// classification. One master company may occur in both regional evidence layers.
export function evidencePresence(evidence: "baseline" | "research", region?: string): SQL {
  return sql`exists (select 1 from ${t.atlasSites} where ${t.atlasSites.companyId} = ${t.atlasCompanies.id} and ${t.atlasSites.evidence} = ${evidence}${region ? sql` and ${t.atlasSites.regionId} = ${region}` : sql``})`;
}
function projectedEvidence(f: CompanyFilters): SQL<"baseline" | "research"> {
  return f.evidence === "all" ? regionEvidence(f.region) : sql`${f.evidence}`;
}
export async function requireFrame(f: CompanyFilters) {
  if (!f.frame) return;
  if (!f.region) throw new AtlasError(400, "FRAME_REQUIRES_REGION", "A frame filter requires its selected region.");
  const db = getAtlasDb();
  const [zone] = await db.select({ regionId: t.atlasZones.regionId }).from(t.atlasZones).where(eq(t.atlasZones.id, f.frame)).limit(1);
  const [aerial] = zone ? [] : await db.select({ regionId: t.atlasAerials.regionId }).from(t.atlasAerials).where(eq(t.atlasAerials.id, f.frame)).limit(1);
  const frame = zone ?? aerial;
  if (!frame) throw new AtlasError(404, "FRAME_NOT_FOUND", "Analytical frame not found.");
  if (frame.regionId !== f.region) throw new AtlasError(400, "FRAME_REGION_MISMATCH", "The analytical frame does not belong to the selected region.");
}
export function companyWhere(f: CompanyFilters): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];
  if (f.region) clauses.push(sql`exists (select 1 from ${t.atlasCompanyRegions} where ${t.atlasCompanyRegions.companyId} = ${t.atlasCompanies.id} and ${t.atlasCompanyRegions.regionId} = ${f.region})`);
  if (!f.frame && f.evidence !== "all") clauses.push(evidencePresence(f.evidence, f.region));
  // Membership uses source-accepted site IDs only, never a coordinate/bounds test.
  // Prefer the analytical zone when its ID is shared with an aerial exhibit.
  // When a frame is selected, evidence must occur on that SAME accepted site;
  // another unchecked regional observation cannot promote a company into it.
  if (f.frame) clauses.push(sql`exists (select 1 from ${t.atlasSites} where ${t.atlasSites.companyId} = ${t.atlasCompanies.id} and ${t.atlasSites.regionId} = ${f.region}${f.evidence !== "all" ? sql` and ${t.atlasSites.evidence} = ${f.evidence}` : sql``} and (
    exists (select 1 from ${t.atlasZones} where ${t.atlasZones.id} = ${f.frame} and ${t.atlasZones.regionId} = ${f.region} and json_contains(json_extract(${t.atlasZones.payload}, '$.siteIds'), json_quote(${t.atlasSites.id})))
    or (not exists (select 1 from ${t.atlasZones} where ${t.atlasZones.id} = ${f.frame}) and exists (select 1 from ${t.atlasAerials} where ${t.atlasAerials.id} = ${f.frame} and ${t.atlasAerials.regionId} = ${f.region} and json_contains(json_extract(${t.atlasAerials.payload}, '$.siteIds'), json_quote(${t.atlasSites.id}))))
  ))`);
  if (f.category) clauses.push(eq(t.atlasCompanies.category, f.category));
  if (f.priority) clauses.push(sql`${effectivePriority()} = ${f.priority}`);
  if (f.q) {
    // SQL wildcards are escaped; parameter binding protects against SQL injection.
    const term = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push(or(like(t.atlasCompanies.name, term), sql`json_unquote(json_extract(${t.atlasCompanies.summary}, '$.ticker')) like ${term}`, sql`json_unquote(json_extract(${t.atlasCompanies.summary}, '$.cities')) like ${term}`));
  }
  return and(...clauses);
}
function ordering(f: CompanyFilters) {
  const field = f.sort === "cash" ? t.atlasCompanies.cashValue : f.sort === "employees" ? t.atlasCompanies.employeeValue : effectiveScore();
  return f.sort === "name" ? [asc(t.atlasCompanies.name), asc(t.atlasCompanies.id)] : [desc(f.sort === "score" ? sql`effective_score` : field), asc(t.atlasCompanies.name), asc(t.atlasCompanies.id)];
}
export async function getCompanies(f: CompanyFilters): Promise<CompanyListResponse> {
  await readyIngestion();
  if (f.region) await requireRegion(f.region);
  await requireFrame(f);
  const db = getAtlasDb(); const where = companyWhere(f);
  const [rows, counts] = await Promise.all([db.select({ summary: t.atlasCompanies.summary, sortScore: effectiveScore().as("effective_score"), modelOverlay: modelOverlaySelection(), evidence: projectedEvidence(f) }).from(t.atlasCompanies).where(where).orderBy(...ordering(f)).limit(f.limit).offset((f.page - 1) * f.limit), db.select({ total: count() }).from(t.atlasCompanies).where(where)]);
  return { items: rows.map(r => ({ ...applyModelOverlay(r.summary, r.modelOverlay), evidence: r.evidence })), total: Number(counts[0].total), page: f.page, limit: f.limit };
}
export type ProfileResponse = CompanyProfile & { peerContext: { label: string; basis: string; formalPeers: false } };
async function completedFactObservations(companyIds: string[]) {
  return getAtlasDb().select({ companyId: t.atlasFactObservations.companyId, payload: t.atlasFactObservations.payload }).from(t.atlasFactObservations).innerJoin(t.atlasIngestions, eq(t.atlasIngestions.version, t.atlasFactObservations.ingestionVersion)).where(and(inArray(t.atlasFactObservations.companyId, companyIds), eq(t.atlasIngestions.status, "complete"))).orderBy(desc(t.atlasIngestions.completedAt), desc(t.atlasFactObservations.ingestionVersion));
}
export async function getProfile(id: string): Promise<ProfileResponse> {
  await readyIngestion();
  const db = getAtlasDb();
  const [row] = await db.select({ payload: t.atlasProfiles.payload }).from(t.atlasProfiles).where(eq(t.atlasProfiles.companyId, id)).limit(1);
  if (!row) throw new AtlasError(404, "PROFILE_NOT_FOUND", "Company profile not found.");
  const [modelRow] = await db.select({ modelOverlay: modelOverlaySelection() }).from(t.atlasCompanies).where(eq(t.atlasCompanies.id, id)).limit(1);
  const p = applyModelOverlay(row.payload, modelRow?.modelOverlay ?? null);
  const [ownSites, storedFacts, storedEvents, storedSources, factObservations] = await Promise.all([
    db.select({ payload: t.atlasSites.payload }).from(t.atlasSites).where(eq(t.atlasSites.companyId, id)),
    db.select({ payload: t.atlasObservations.payload }).from(t.atlasObservations).where(and(eq(t.atlasObservations.companyId, id), sql`${t.atlasObservations.observationId} is null`, sql`${t.atlasObservations.siteId} is null`)),
    db.select({ payload: t.atlasEvents.payload }).from(t.atlasEvents).where(eq(t.atlasEvents.companyId, id)),
    db.select({ key: t.atlasSources.key, sourceId: t.atlasSources.sourceId, payload: t.atlasSources.payload }).from(t.atlasSources).where(eq(t.atlasSources.companyId, id)),
    completedFactObservations([id]),
  ]);
  // Later versions may add assumption-labeled observations and sources while the
  // original profile snapshot remains immutable. Existing keys/IDs in the profile
  // are authoritative, including any subsequent client edits.
  const facts = projectFactObservations(retainedFacts(p.facts, storedFacts.map(f => f.payload)), factObservations.map(f => f.payload));
  const eventIds = new Set(p.events.map(e => e.id));
  const events = [...p.events, ...storedEvents.filter(e => !eventIds.has(e.payload.id)).map(e => e.payload)];
  const sourceIds = new Set(p.sources.map(s => s.id));
  const sources = [...p.sources, ...storedSources.filter(s => s.key === keyHash(id, s.sourceId) && !sourceIds.has(s.sourceId)).map(s => s.payload)];
  const sites = ownSites.map(s => s.payload);
  const matches = sites.map(s => and(eq(t.atlasSites.regionId, s.regionId), or(s.zone ? eq(t.atlasSites.zone, s.zone) : undefined, s.city ? eq(t.atlasSites.city, s.city) : undefined))).filter((x): x is SQL => !!x);
  let peers: CompanySummary[] = [];
  if (matches.length) {
    const rows = await db.select({ summary: t.atlasCompanies.summary, modelOverlay: modelOverlaySelection(), zone: t.atlasSites.zone, city: t.atlasSites.city, regionId: t.atlasSites.regionId }).from(t.atlasSites).innerJoin(t.atlasCompanies, eq(t.atlasCompanies.id, t.atlasSites.companyId)).where(and(ne(t.atlasCompanies.id, id), or(...matches))).orderBy(asc(t.atlasCompanies.name)).limit(200);
    rows.sort((a, b) => Number(sites.some(s => s.zone && s.zone === b.zone && s.regionId === b.regionId)) - Number(sites.some(s => s.zone && s.zone === a.zone && s.regionId === a.regionId)));
    const seen = new Set<string>();
    peers = rows.filter(r => { if (seen.has(r.summary.id)) return false; seen.add(r.summary.id); return true; }).slice(0, 8).map(r => applyModelOverlay(r.summary, r.modelOverlay));
  }
  return { ...p, facts, events, sources, sites, peers, peerContext: { label: "Nearby / city context — not formal peers", basis: "Shared supported zone membership where available; otherwise shared city within the same region. No formal peer relationship is asserted.", formalPeers: false } };
}
export async function getCoverage() {
  const ingestion = await readyIngestion();
  const db = getAtlasDb();
  const metricRecords = sql`(select company_id, metric, section, evidence, missing from ${t.atlasObservations}
    union all select ${t.atlasFactObservations.companyId}, ${t.atlasFactObservations.metric}, ${t.atlasFactObservations.section}, ${t.atlasFactObservations.evidence}, ${t.atlasFactObservations.missing}
    from ${t.atlasFactObservations} inner join ${t.atlasIngestions} on ${t.atlasIngestions.version} = ${t.atlasFactObservations.ingestionVersion} where ${t.atlasIngestions.status} = 'complete') as metric_records`;
  const [overview, metrics, sources, sourceCount, observations, events, noSources, noFacts] = await Promise.all([
    getOverview(),
    db.select({ metric: sql<string>`metric`, section: sql<string>`section`, evidence: sql<"baseline" | "research">`evidence`, observations: sql<number>`count(*)`, missing: sql<number>`sum(missing)`, companies: sql<number>`count(distinct company_id)` }).from(metricRecords).groupBy(sql`metric`, sql`section`, sql`evidence`),
    db.select({ evidence: t.atlasSources.evidence, visibility: sql<string>`json_unquote(json_extract(${t.atlasSources.payload}, '$.visibility'))`.as("source_visibility"), total: count(), withPublicUrl: sql<number>`sum(case when json_extract(${t.atlasSources.payload}, '$.url') is not null and json_unquote(json_extract(${t.atlasSources.payload}, '$.url')) != 'null' then 1 else 0 end)` }).from(t.atlasSources).groupBy(t.atlasSources.evidence, sql`source_visibility`),
    db.select({ total: count() }).from(t.atlasSources), db.select({ total: sql<number>`count(*)` }).from(metricRecords), db.select({ total: count() }).from(t.atlasEvents),
    db.select({ total: count() }).from(t.atlasCompanies).where(sql`not exists (select 1 from ${t.atlasSources} where ${t.atlasSources.companyId} = ${t.atlasCompanies.id})`),
    db.select({ total: count() }).from(t.atlasCompanies).where(sql`not exists (select 1 from ${t.atlasObservations} where ${t.atlasObservations.companyId} = ${t.atlasCompanies.id} and ${t.atlasObservations.missing} = 0)`),
  ]);
  return { asOf: ingestion.asOf, ingestionVersion: ingestion.version, status: "ready", totals: { ...overview.totals, sourceRecords: Number(sourceCount[0].total), metricObservations: Number(observations[0].total), footprintEvents: Number(events[0].total), companiesWithoutSources: Number(noSources[0].total), companiesWithoutPopulatedFacts: Number(noFacts[0].total) }, metrics: metrics.map(m => ({ ...m, observations: Number(m.observations), missing: Number(m.missing), present: Number(m.observations) - Number(m.missing), companies: Number(m.companies) })), sources: sources.map(s => ({ ...s, total: Number(s.total), withPublicUrl: Number(s.withPublicUrl) })), regions: overview.regions, notes: ["Metric counts are observation counts; repeated dates and imported observations are retained, not deduplicated into asserted facts.", "Null-valued metrics are missing, not zero. Absence of a metric record is not equivalent to an explicit null.", "Source counts count company/observation/source associations, not unique websites."] };
}
// Export intentionally includes all filtered rows, ignoring UI page/limit. Read
// bounded batches and finish generation before sending headers so DB errors never
// masquerade as an empty successful CSV.
export async function getExportRows(f: CompanyFilters) {
  await readyIngestion(); if (f.region) await requireRegion(f.region);
  await requireFrame(f);
  const db = getAtlasDb();
  const rows: { summary: CompanySummary; profile: CompanyProfile }[] = [];
  let offset = 0;
  while (true) {
    const batch = await db.select({ summary: t.atlasCompanies.summary, sortScore: effectiveScore().as("effective_score"), modelOverlay: modelOverlaySelection(), profile: t.atlasProfiles.payload, evidence: projectedEvidence(f) }).from(t.atlasCompanies).innerJoin(t.atlasProfiles, eq(t.atlasProfiles.companyId, t.atlasCompanies.id)).where(companyWhere(f)).orderBy(...ordering(f)).limit(200).offset(offset);
    if (batch.length) {
      const ids = batch.map(r => r.summary.id);
      const [extraSources, storedFacts, factObservations] = await Promise.all([
        db.select({ companyId: t.atlasSources.companyId, key: t.atlasSources.key, sourceId: t.atlasSources.sourceId, payload: t.atlasSources.payload }).from(t.atlasSources).where(inArray(t.atlasSources.companyId, ids)),
        db.select({ companyId: t.atlasObservations.companyId, payload: t.atlasObservations.payload }).from(t.atlasObservations).where(and(inArray(t.atlasObservations.companyId, ids), sql`${t.atlasObservations.observationId} is null`, sql`${t.atlasObservations.siteId} is null`)),
        completedFactObservations(ids),
      ]);
      rows.push(...batch.map(r => {
        const knownSources = new Set(r.profile.sources.map(source => source.id));
        const sources = [...r.profile.sources, ...extraSources.filter(source => source.companyId === r.summary.id && source.key === keyHash(r.summary.id, source.sourceId) && !knownSources.has(source.sourceId)).map(source => source.payload)];
        const facts = projectFactObservations(retainedFacts(r.profile.facts, storedFacts.filter(fact => fact.companyId === r.summary.id).map(fact => fact.payload)), factObservations.filter(fact => fact.companyId === r.summary.id).map(fact => fact.payload));
        return { summary: { ...applyModelOverlay(r.summary, r.modelOverlay), evidence: r.evidence }, profile: { ...r.profile, facts, sources } };
      }));
    }
    if (batch.length < 200) break; offset += batch.length;
  }
  return rows;
}

import { z } from "zod";
import type { AtlasSeed, CompanyProfile, CompanySummary } from "../../shared/atlas";

export class AtlasError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

// Never pass arbitrary seed properties, local paths, credentials, or private source
// contents through to the browser. Zod objects intentionally strip unknown keys.
export function safeText(value: string): string {
  return value
    .replace(/(?:mysql|postgres(?:ql)?):\/\/[^\s"'<>]+/gi, "[redacted database connection]")
    .replace(/(?:file:\/\/)?\/(?:home|tmp|mnt|var|Users|root|workspace)\/[^\s"'<>),;]+/g, "[private file]")
    .replace(/[A-Za-z]:\\(?:Users|Windows|Temp)\\[^\r\n"'<>]+/g, "[private file]")
    .replace(/\b(?:DATABASE_URL|MANUS_API_KEY|api[_-]?key|access[_-]?token|password)\s*[:=]\s*[^\s,;]+/gi, "[redacted credential]");
}
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\/(?:assets|atlas-assets|atlas|manus-storage)\//.test(value) && !value.includes("..") && !/[\\\x00-\x1f]/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    if (url.hostname === "localhost" || /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.includes(":")) return null;
    for (const key of [...url.searchParams.keys()]) if (/token|secret|credential|password|api.?key|signature/i.test(key)) return null;
    return url.toString();
  } catch { return null; }
}
const text = z.string().max(200_000).transform(safeText);
const short = z.string().max(191).transform(safeText);
const id = z.string().min(1).max(191).regex(/^[^\s/\\?#\x00-\x1f]+$/);
const url = z.string().nullable().transform(safeUrl);
const finite = z.number().finite();
const strings = z.array(text);
const ids = z.array(id);
const evidence = z.enum(["baseline", "research"]);
const date = z.string().max(64).nullable();
const factSchema = z.object({ key: short, label: text, value: z.union([text, finite, z.null()]), unit: text.nullable().optional(), scope: text.nullable().optional(), asOf: date.optional(), periodStart: date.optional(), status: short, sourceIds: ids, notes: text.nullable().optional(), section: short });
const sourceSchema = z.object({ id, title: text, url, publishedDate: date.optional(), retrievedDate: date.optional(), visibility: short }).transform(s => {
  if (/private|internal|restricted|confidential/i.test(s.visibility) || /private.*brochure|JLL.*brochure/i.test(s.title)) return { ...s, title: "Restricted source — metadata only", url: null };
  return s;
});
const summarySchema = z.object({ id, name: z.string().min(1).max(512).transform(safeText), kind: short, evidence, category: short, ticker: text.nullable(), listing: text.nullable(), parent: z.string().max(512).nullable().transform(v => v === null ? null : safeText(v)), website: url, logoUrl: url, regionIds: ids, cities: strings, stage: text.nullable(), priority: short.nullable(), score: finite.nullable(), coverage: finite.nullable(), occupancyRead: text, occupancyReason: text, cash: factSchema.nullable(), runway: factSchema.nullable(), employees: factSchema.nullable() });
const siteSchema = z.object({ id, profileId: id, regionId: id, company: text, city: z.string().max(320).transform(safeText), zone: z.string().max(320).nullable().transform(v => v === null ? null : safeText(v)), address: text, country: text, latitude: finite.min(-90).max(90).nullable(), longitude: finite.min(-180).max(180).nullable(), precision: short, evidence, physicalStatus: text, functions: strings, sourceIds: ids, referenceType: text.nullable().optional(), isAnchor: z.boolean().optional(), facts: z.array(factSchema).optional() });
const eventSchema = z.object({ id, title: text, type: short, date, status: text, direction: text.nullable(), siteIds: ids, sourceIds: ids, notes: text.nullable() });
const profileSchema = summarySchema.extend({ facts: z.array(factSchema), sites: z.array(siteSchema), events: z.array(eventSchema), sources: z.array(sourceSchema), gaps: strings, imported: z.array(z.object({ id, note: text, facts: z.array(factSchema), sources: z.array(sourceSchema) })) });
const bounds = z.tuple([finite, finite, finite, finite]);
const regionSchema = z.object({ id, name: z.string().max(320).transform(safeText), geography: text, country: text, center: z.tuple([finite.min(-90).max(90), finite.min(-180).max(180)]), zoom: finite.min(0).max(22), macroUrl: url, pdfUrl: url, baselineCompanies: z.number().int().nonnegative(), researchCompanies: z.number().int().nonnegative(), sites: z.number().int().nonnegative(), preciseSites: z.number().int().nonnegative(), aerialCount: z.number().int().nonnegative(), description: text });
const aerialSchema = z.object({ id, regionId: id, title: text, bounds, imageBounds: bounds.optional(), imageUrl: z.string().transform(safeUrl).refine(v => v !== null, "Aerial image must have a safe public URL"), exhibitUrl: url, captureYears: z.array(z.number().int()), attribution: text, captureNote: text, siteIds: ids, sources: z.array(sourceSchema) });
const zoneSchema = z.object({ id, name: text, regionId: id, bounds, analytical: z.literal(true), siteIds: ids });
const seedSchema = z.object({ version: id, asOf: z.string().min(1).max(64), regions: z.array(regionSchema).min(1), companies: z.array(profileSchema).min(1), sites: z.array(siteSchema), aerials: z.array(aerialSchema), zones: z.array(zoneSchema), sourceHashes: z.record(z.string(), z.string()) });

export function parseSeed(input: unknown): AtlasSeed {
  const parsed = seedSchema.parse(input) as AtlasSeed;
  function unique(rows: { id: string }[], label: string) {
    const set = new Set<string>();
    for (const row of rows) { if (set.has(row.id)) throw new Error(`Duplicate ${label} ID: ${row.id}`); set.add(row.id); }
    return set;
  }
  const regions = unique(parsed.regions, "region");
  const companies = unique(parsed.companies, "company");
  const sites = unique(parsed.sites, "site");
  unique(parsed.aerials, "aerial"); unique(parsed.zones, "zone");
  const requireRegion = (regionId: string) => { if (!regions.has(regionId)) throw new Error(`Unknown seed region: ${regionId}`); };
  const requireSites = (siteIds: string[]) => { for (const siteId of siteIds) if (!sites.has(siteId)) throw new Error(`Unknown seed site: ${siteId}`); };
  for (const c of parsed.companies) {
    c.regionIds.forEach(requireRegion);
    unique(c.imported, `imported observation for ${c.id}`);
    unique(c.events, `event for ${c.id}`);
    for (const s of c.sites) { if (s.profileId !== c.id || !sites.has(s.id)) throw new Error(`Invalid profile/site link: ${s.id}`); }
    for (const e of c.events) requireSites(e.siteIds);
  }
  for (const site of parsed.sites) {
    requireRegion(site.regionId);
    if (!companies.has(site.profileId)) throw new Error(`Unknown seed company for site: ${site.id}`);
    const company = parsed.companies.find(c => c.id === site.profileId)!;
    if (!company.regionIds.includes(site.regionId)) throw new Error(`Site region missing from company: ${site.id}`);
  }
  for (const view of [...parsed.aerials, ...parsed.zones]) { requireRegion(view.regionId); requireSites(view.siteIds); }
  return parsed;
}
export function toSummary(p: CompanyProfile): CompanySummary {
  const { facts: _facts, sites: _sites, events: _events, sources: _sources, gaps: _gaps, imported: _imported, peers: _peers, ...summary } = p;
  return summary;
}
export function parseId(value: unknown): string {
  const parsed = id.safeParse(value);
  if (!parsed.success) throw new AtlasError(400, "INVALID_ID", "Invalid record ID.");
  return parsed.data;
}
const querySchema = z.object({
  region: id.optional(), frame: id.optional(), q: z.string().trim().max(200).optional(),
  evidence: z.enum(["baseline", "research", "all"]).default("all"),
  category: z.string().trim().min(1).max(191).optional(), priority: z.string().trim().min(1).max(191).optional(),
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(100_000)).default(1),
  limit: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(250)).default(50),
  sort: z.enum(["name", "cash", "employees", "score"]).default("name"),
}).strict();
export type CompanyFilters = z.infer<typeof querySchema>;
export function parseFilters(query: unknown): CompanyFilters {
  const result = querySchema.safeParse(query);
  if (!result.success) throw new AtlasError(400, "INVALID_QUERY", "Invalid filters. Use evidence=baseline|research|all, sort=name|cash|employees|score, page>=1, and limit=1..250.");
  if (result.data.frame && !result.data.region) throw new AtlasError(400, "FRAME_REQUIRES_REGION", "A frame filter requires its selected region.");
  return result.data;
}

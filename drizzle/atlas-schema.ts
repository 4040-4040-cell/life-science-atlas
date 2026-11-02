import { index, int, json, mysqlEnum, mysqlTable, primaryKey, double, timestamp, varchar } from "drizzle-orm/mysql-core";
import type { AerialView, AtlasRegion, CompanyProfile, CompanySummary, Fact, FootprintEvent, MapSite, Source, Zone } from "../shared/atlas";

// Public, explicitly projected payloads are stored separately from indexed summaries.
// IDs are the existing research IDs, never regenerated during an ingestion.
export const atlasIngestions = mysqlTable("atlas_ingestions", {
  version: varchar("version", { length: 191 }).primaryKey(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  asOf: varchar("as_of", { length: 64 }).notNull(),
  sourceHashes: json("source_hashes").$type<Record<string, string>>().notNull(),
  status: mysqlEnum("status", ["writing", "complete"]).notNull(),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const atlasRegions = mysqlTable("atlas_regions", {
  id: varchar("id", { length: 191 }).primaryKey(),
  name: varchar("name", { length: 320 }).notNull(),
  payload: json("payload").$type<AtlasRegion>().notNull(),
  ingestionVersion: varchar("ingestion_version", { length: 191 }).notNull(),
});
export const atlasParents = mysqlTable("atlas_parents", {
  id: varchar("id", { length: 191 }).primaryKey(),
  name: varchar("name", { length: 512 }).notNull(),
});
export const atlasCompanies = mysqlTable("atlas_companies", {
  id: varchar("id", { length: 191 }).primaryKey(),
  name: varchar("name", { length: 512 }).notNull(),
  evidence: mysqlEnum("evidence", ["baseline", "research"]).notNull(),
  category: varchar("category", { length: 191 }).notNull(),
  priority: varchar("priority", { length: 191 }),
  parentId: varchar("parent_id", { length: 191 }),
  score: double("score"),
  cashValue: double("cash_value"),
  employeeValue: double("employee_value"),
  summary: json("summary").$type<CompanySummary>().notNull(),
  ingestionVersion: varchar("ingestion_version", { length: 191 }).notNull(),
}, t => [index("atlas_company_name_idx").on(t.name), index("atlas_company_filter_idx").on(t.evidence, t.category, t.priority), index("atlas_company_score_idx").on(t.score), index("atlas_company_cash_idx").on(t.cashValue), index("atlas_company_employee_idx").on(t.employeeValue), index("atlas_company_parent_idx").on(t.parentId)]);
export const atlasProfiles = mysqlTable("atlas_profiles", {
  companyId: varchar("company_id", { length: 191 }).primaryKey(),
  payload: json("payload").$type<CompanyProfile>().notNull(),
});
export const atlasCompanyRegions = mysqlTable("atlas_company_regions", {
  companyId: varchar("company_id", { length: 191 }).notNull(),
  regionId: varchar("region_id", { length: 191 }).notNull(),
  evidence: mysqlEnum("evidence", ["baseline", "research"]).notNull(),
}, t => [primaryKey({ columns: [t.companyId, t.regionId] }), index("atlas_region_company_idx").on(t.regionId, t.companyId)]);
export const atlasSites = mysqlTable("atlas_sites", {
  id: varchar("id", { length: 191 }).primaryKey(),
  companyId: varchar("company_id", { length: 191 }).notNull(),
  regionId: varchar("region_id", { length: 191 }).notNull(),
  city: varchar("city", { length: 320 }).notNull(),
  zone: varchar("zone", { length: 320 }),
  precision: varchar("precision", { length: 191 }).notNull(),
  evidence: mysqlEnum("evidence", ["baseline", "research"]).notNull(),
  payload: json("payload").$type<MapSite>().notNull(),
}, t => [index("atlas_site_region_idx").on(t.regionId), index("atlas_site_company_idx").on(t.companyId), index("atlas_site_city_idx").on(t.city), index("atlas_site_zone_idx").on(t.zone)]);
export const atlasSources = mysqlTable("atlas_sources", {
  key: varchar("source_key", { length: 64 }).primaryKey(),
  sourceId: varchar("source_id", { length: 191 }).notNull(),
  companyId: varchar("company_id", { length: 191 }),
  evidence: mysqlEnum("evidence", ["baseline", "research"]).notNull(),
  payload: json("payload").$type<Source>().notNull(),
}, t => [index("atlas_source_company_idx").on(t.companyId), index("atlas_source_id_idx").on(t.sourceId)]);
export const atlasObservations = mysqlTable("atlas_observations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  companyId: varchar("company_id", { length: 191 }).notNull(),
  observationId: varchar("observation_id", { length: 191 }),
  siteId: varchar("site_id", { length: 191 }),
  metric: varchar("metric", { length: 191 }).notNull(),
  section: varchar("section", { length: 191 }).notNull(),
  evidence: mysqlEnum("evidence", ["baseline", "research"]).notNull(),
  missing: int("missing").notNull(),
  payload: json("payload").$type<Fact>().notNull(),
}, t => [index("atlas_observation_company_idx").on(t.companyId), index("atlas_observation_metric_idx").on(t.metric, t.missing), index("atlas_observation_site_idx").on(t.siteId)]);
export const atlasEvents = mysqlTable("atlas_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  eventId: varchar("event_id", { length: 191 }).notNull(),
  companyId: varchar("company_id", { length: 191 }).notNull(),
  date: varchar("date", { length: 64 }),
  type: varchar("type", { length: 191 }).notNull(),
  payload: json("payload").$type<FootprintEvent>().notNull(),
}, t => [index("atlas_event_company_idx").on(t.companyId), index("atlas_event_date_idx").on(t.date)]);
export const atlasAerials = mysqlTable("atlas_aerials", {
  id: varchar("id", { length: 191 }).primaryKey(),
  regionId: varchar("region_id", { length: 191 }).notNull(),
  payload: json("payload").$type<AerialView>().notNull(),
}, t => [index("atlas_aerial_region_idx").on(t.regionId)]);
export const atlasZones = mysqlTable("atlas_zones", {
  id: varchar("id", { length: 191 }).primaryKey(),
  regionId: varchar("region_id", { length: 191 }).notNull(),
  payload: json("payload").$type<Zone>().notNull(),
}, t => [index("atlas_zone_region_idx").on(t.regionId)]);

// Model overlays retain both the original and proposed values. They never rewrite
// company/profile rows, and reads apply them only while the original still matches.
export type AtlasModelValues = Pick<CompanySummary, "priority" | "score" | "coverage">;
export type AtlasModelOverlay = { version: string; before: AtlasModelValues; after: AtlasModelValues; assumption: true };
export const atlasCompanyOverlays = mysqlTable("atlas_company_overlays", {
  id: varchar("id", { length: 64 }).primaryKey(),
  companyId: varchar("company_id", { length: 191 }).notNull(),
  ingestionVersion: varchar("ingestion_version", { length: 191 }).notNull(),
  basePriority: varchar("base_priority", { length: 191 }),
  baseScore: double("base_score"),
  baseCoverage: double("base_coverage"),
  priority: varchar("priority", { length: 191 }),
  score: double("score"),
  coverage: double("coverage"),
  payload: json("payload").$type<AtlasModelOverlay>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("atlas_overlay_company_idx").on(t.companyId, t.createdAt)]);

// Append-only observations for reviewed seed corrections and missing facts. The
// original profile and original observations remain immutable. A projection is
// valid only while its retained base fact still matches, protecting human edits.
export type AtlasFactObservation = { version: string; before: Fact | null; after: Fact };
export const atlasFactObservations = mysqlTable("atlas_fact_observations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  companyId: varchar("company_id", { length: 191 }).notNull(),
  ingestionVersion: varchar("ingestion_version", { length: 191 }).notNull(),
  metric: varchar("metric", { length: 191 }).notNull(),
  section: varchar("section", { length: 191 }).notNull(),
  evidence: mysqlEnum("evidence", ["baseline", "research"]).notNull(),
  missing: int("missing").notNull(),
  payload: json("payload").$type<AtlasFactObservation>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, t => [index("atlas_fact_observation_company_idx").on(t.companyId, t.metric, t.createdAt), index("atlas_fact_observation_version_idx").on(t.ingestionVersion)]);

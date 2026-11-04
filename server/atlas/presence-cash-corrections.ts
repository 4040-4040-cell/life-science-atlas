import { sql } from "drizzle-orm";
import type { CompanySummary, Fact, Source } from "../../shared/atlas";
import * as t from "../../drizzle/atlas-schema";
import { sameFact } from "./facts";
import { sourceSignature } from "./financial-corrections";

export type CorrectiveValues = Partial<Pick<CompanySummary, "cash" | "cities" | "kind" | "evidence" | "occupancyReason">>;
export interface CorrectiveProjection { version: string; before: CorrectiveValues; after: CorrectiveValues }
export interface CashCorrection {
  companyId: string; name: string; before: Fact; after: Fact; sources: Source[];
  retainedIdentitySourceIds: string[];
  identity: { cik: number; reportingEntity: string; ticker: string; exchanges: string[] };
  nativeEvidence: { namespace: string; tag: string; unit: string; val: number; end: string; filed: string; form: string; accn: string; cik: number; reportingEntity: string; filingUrl: string; rowLabel?: string; sourceWitness: string };
}
// Complete value comparison, independent of MySQL JSON object-key order. Arrays
// remain ordered (unlike JSON_CONTAINS, which could falsely accept partial cities).
export function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
export const equalValues = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function applyCorrectiveProjection<T extends CompanySummary>(summary: T, projection: CorrectiveProjection | null): T {
  if (!projection || Object.entries(projection.before).some(([key, value]) => !equalValues(summary[key as keyof T], value))) return summary;
  return { ...summary, ...projection.after };
}
export function assertCashCorrection(c: CashCorrection, asOf: string) {
  const n = c.nativeEvidence;
  const standard = n.namespace === "us-gaap" && n.tag === "CashAndCashEquivalentsAtCarryingValue";
  const approvedAlternate = (n.namespace === "us-gaap" && ["Cash", "CashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations"].includes(n.tag)) || (n.namespace === "podd" && n.cik === 1145197 && n.tag === "CashCashEquivalentsAndRestrictedCashCurrent");
  const alternate = approvedAlternate && ["cash", "cash and cash equivalents", "cash and equivalents"].includes((n.rowLabel ?? "").trim().toLowerCase().replace(/:$/, ""));
  if (c.before.key !== "cash_and_cash_equivalents" || c.after.key !== c.before.key || c.before.unit !== "USD millions" || c.after.unit !== "USD millions" || typeof c.before.value !== "number" || typeof c.after.value !== "number" || c.after.value < 0 || n.val / 1e6 !== c.after.value || n.unit !== "USD" || (!standard && !alternate) || n.end !== c.after.asOf || n.end <= (c.before.asOf ?? "") || n.end > asOf || n.filed > asOf || !["10-K", "10-Q", "10-K/A", "10-Q/A"].includes(n.form) || c.after.periodStart != null || n.cik !== c.identity.cik || n.reportingEntity !== c.identity.reportingEntity || !c.identity.exchanges.length || !c.retainedIdentitySourceIds.length || !n.filingUrl.startsWith(`https://www.sec.gov/Archives/edgar/data/${n.cik}/${n.accn.replaceAll("-", "")}/`) || !c.sources.length || c.sources.some(s => !c.after.sourceIds.includes(s.id) || s.url !== n.filingUrl || s.publishedDate !== n.filed) || c.after.status !== "primary_filing_reported") throw new Error(`Invalid source-backed V6 cash correction ${c.companyId}`);
}
export function cashCorrectionDecision(c: CashCorrection, current: Fact | undefined, base: Fact | undefined, originals: Fact[], currentHeadline: Fact | null, oldSourceWitnesses: Source[], retainedSources: Source[]): "apply" | "already_correct" | "SKIP_CLIENT_EDITS" {
  if (sameFact(current, c.after) && sameFact(currentHeadline, c.after)) return "already_correct";
  if (!sameFact(current, c.before) || !sameFact(base, c.before) || !sameFact(currentHeadline, c.before) || !originals.some(f => sameFact(f, c.before))) return "SKIP_CLIENT_EDITS";
  if (!c.before.sourceIds.length || !c.retainedIdentitySourceIds.every(id => retainedSources.some(s => s.id === id))) return "SKIP_CLIENT_EDITS";
  for (const source of oldSourceWitnesses) {
    if (!retainedSources.some(s => sourceSignature(s) === sourceSignature(source)) || retainedSources.some(s => s.id === source.id && sourceSignature(s) !== sourceSignature(source))) return "SKIP_CLIENT_EDITS";
  }
  for (const source of c.sources) if (!retainedSources.some(s => sourceSignature(s) === sourceSignature(source)) || retainedSources.some(s => s.id === source.id && sourceSignature(s) !== sourceSignature(source))) return "SKIP_CLIENT_EDITS";
  return "apply";
}
const summaryFields = ["cash", "cities", "kind", "evidence", "occupancyReason"] as const;
const matchingProjection = () => sql`cp.target_id = ${t.atlasCompanies.id} and cp.target_type = 'company_summary' and ci.status = 'complete' and ${sql.join(summaryFields.map(key => sql`(json_contains_path(cp.payload, 'one', ${`$.before.${key}`}) = 0 or json_extract(cp.payload, ${`$.before.${key}`}) <=> json_extract(${t.atlasCompanies.summary}, ${`$.${key}`}))`), sql` and `)}`;
const projectionColumn = (path: string) => sql`(select json_extract(cp.payload, ${path}) from atlas_v6_corrective_projections cp inner join atlas_ingestions ci on ci.version = cp.ingestion_version where ${matchingProjection()} order by cp.created_at desc, cp.ingestion_version desc limit 1)`;
export const correctiveProjectionSelection = () => sql<CorrectiveProjection | null>`(select cp.payload from atlas_v6_corrective_projections cp inner join atlas_ingestions ci on ci.version = cp.ingestion_version where ${matchingProjection()} order by cp.created_at desc, cp.ingestion_version desc limit 1)`.mapWith(value => typeof value === "string" ? JSON.parse(value) as CorrectiveProjection : value as CorrectiveProjection | null);
export const effectiveCashValue = () => sql<number | null>`case when ${projectionColumn("$.after.cash.value")} is not null then cast(json_unquote(${projectionColumn("$.after.cash.value")}) as decimal(30,6)) * 1000000 else ${t.atlasCompanies.cashValue} end`;
export const effectiveGlobalEvidence = () => sql<"baseline" | "research">`coalesce(json_unquote(${projectionColumn("$.after.evidence")}), ${t.atlasCompanies.evidence})`;

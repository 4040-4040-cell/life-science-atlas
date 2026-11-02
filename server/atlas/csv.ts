import type { CompanyProfile, CompanySummary, Fact } from "../../shared/atlas";

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Quote escaping alone does not stop Excel/Sheets formula execution. Prefix
  // potentially executable strings, including whitespace-obscured formulas.
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const factColumns = (fact: Fact | null) => [fact?.value ?? null, fact?.unit ?? null, fact?.scope ?? null, fact?.asOf ?? null, fact?.periodStart ?? null, fact?.status ?? null, fact?.sourceIds.join(" | ") ?? null];
const metricHeaders = (name: string) => [name, `${name}_unit`, `${name}_scope`, `${name}_as_of`, `${name}_period_start`, `${name}_evidence_status`, `${name}_source_ids`];
export function companiesCsv(rows: { summary: CompanySummary; profile: CompanyProfile }[], datasetAsOf: string, selectedFrameId?: string): string {
  const headers = ["id", "company", "evidence", "category", "priority", "ticker", "listing", "parent", "regions", "cities", "stage", "score", "coverage", "occupancy_read", "occupancy_reason", ...metricHeaders("cash"), ...metricHeaders("runway"), ...metricHeaders("employees"), "source_ids", "source_titles", "source_urls", "source_published_dates", "source_retrieved_dates", "source_visibility", "dataset_as_of", "financial_scope_caveat", "imported_observation_ids", "gaps"];
  headers.push("selected_frame_id");
  const lines = [headers.map(csvCell).join(",")];
  for (const { summary: c, profile: p } of rows) {
    const sources = [...p.sources, ...p.imported.flatMap(i => i.sources)];
    const unique = [...new Map(sources.map(s => [s.id, s])).values()];
    const values = [c.id, c.name, c.evidence, c.category, c.priority, c.ticker, c.listing, c.parent, c.regionIds.join(" | "), c.cities.join(" | "), c.stage, c.score, c.coverage, c.occupancyRead, c.occupancyReason, ...factColumns(c.cash), ...factColumns(c.runway), ...factColumns(c.employees), unique.map(s => s.id).join(" | "), unique.map(s => s.title).join(" | "), unique.map(s => s.url ?? "").join(" | "), unique.map(s => `${s.id}: ${s.publishedDate ?? "unknown"}`).join(" | "), unique.map(s => `${s.id}: ${s.retrievedDate ?? "unknown"}`).join(" | "), unique.map(s => `${s.id}: ${s.visibility}`).join(" | "), datasetAsOf, "Companywide financial metrics are not local capital or guaranteed lease credit; currency conversion is not implied.", p.imported.map(i => i.id).join(" | "), p.gaps.join(" | ")];
    values.push(selectedFrameId ?? "");
    lines.push(values.map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

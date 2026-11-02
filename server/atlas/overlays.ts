import { sql } from "drizzle-orm";
import type { CompanySummary } from "../../shared/atlas";
import * as t from "../../drizzle/atlas-schema";
import type { AtlasModelOverlay } from "../../drizzle/atlas-schema";

const matching = () => sql`${t.atlasCompanyOverlays.companyId} = ${t.atlasCompanies.id}
  and ${t.atlasIngestions.status} = 'complete'
  and ${t.atlasCompanyOverlays.basePriority} <=> ${t.atlasCompanies.priority}
  and ${t.atlasCompanyOverlays.baseScore} <=> ${t.atlasCompanies.score}`;
function selectOverlay(column: typeof t.atlasCompanyOverlays.payload | typeof t.atlasCompanyOverlays.score | typeof t.atlasCompanyOverlays.priority | typeof t.atlasCompanyOverlays.id) {
  return sql`(select ${column} from ${t.atlasCompanyOverlays} inner join ${t.atlasIngestions} on ${t.atlasIngestions.version} = ${t.atlasCompanyOverlays.ingestionVersion} where ${matching()} order by ${t.atlasCompanyOverlays.createdAt} desc, ${t.atlasCompanyOverlays.ingestionVersion} desc limit 1)`;
}
export const modelOverlaySelection = () => sql<AtlasModelOverlay | null>`${selectOverlay(t.atlasCompanyOverlays.payload)}`.mapWith(value => typeof value === "string" ? JSON.parse(value) as AtlasModelOverlay : value as AtlasModelOverlay | null);
export const effectiveScore = () => sql<number | null>`case when ${selectOverlay(t.atlasCompanyOverlays.id)} is not null then ${selectOverlay(t.atlasCompanyOverlays.score)} else ${t.atlasCompanies.score} end`;
export const effectivePriority = () => sql<string | null>`case when ${selectOverlay(t.atlasCompanyOverlays.id)} is not null then ${selectOverlay(t.atlasCompanyOverlays.priority)} else ${t.atlasCompanies.priority} end`;
export function applyModelOverlay<T extends CompanySummary>(summary: T, overlay: AtlasModelOverlay | null): T {
  if (!overlay || ["score", "priority", "coverage"].some(key => summary[key as keyof CompanySummary] !== overlay.before[key as keyof typeof overlay.before])) return summary;
  return { ...summary, ...overlay.after };
}

import type { Fact, Source } from "../../shared/atlas";
import { sameFact } from "./facts";

export interface FinancialCorrection {
  companyId: string;
  name: string;
  before: Fact;
  after: Fact;
  sources: Source[];
  nativeEvidence: { namespace: string; tag: string; unit: string; value: number; periodStart: string; periodEnd: string; accession: string; filed: string; cacheFile: string; cacheSha256: string };
}
export interface FinancialCorrections {
  version: string;
  seedVersion: string;
  baseVersion: string;
  asOf: string;
  corrections: FinancialCorrection[];
}
// Source JSON key order may differ in MySQL. Compare the complete public contract.
export const sourceSignature = (s: Source) => JSON.stringify([s.id, s.title, s.url, s.publishedDate ?? null, s.retrievedDate ?? null, s.visibility]);

export function assertFinancialManifest(manifest: FinancialCorrections, seedVersion: string) {
  if (manifest.seedVersion !== seedVersion || !Array.isArray(manifest.corrections) || !manifest.corrections.length) throw new Error("Financial correction manifest does not match this seed version.");
  const keys = new Set<string>();
  for (const correction of manifest.corrections) {
    const { before, after, nativeEvidence: n } = correction;
    const key = `${correction.companyId}/${after.key}`;
    if (keys.has(key)) throw new Error("Duplicate financial correction.");
    keys.add(key);
    if (before.key !== "operating_cash_flow" || after.key !== before.key || before.unit !== "USD millions" || after.unit !== before.unit || typeof before.value !== "number" || typeof after.value !== "number" || after.value <= 0 || before.value !== -after.value || n.namespace !== "us-gaap" || n.tag !== "NetCashProvidedByUsedInOperatingActivities" || n.unit !== "USD" || n.value / 1e6 !== after.value || n.periodStart !== before.periodStart || n.periodEnd !== before.asOf || !sameFact({ ...before, value: after.value, notes: after.notes }, after)) throw new Error(`Invalid source-backed CFO correction ${key}.`);
    if (!before.sourceIds.length || correction.sources.length !== before.sourceIds.length || correction.sources.some(s => !before.sourceIds.includes(s.id) || !s.id.includes(n.accession.replaceAll("-", "")) || !s.url?.startsWith("https://www.sec.gov/Archives/edgar/data/"))) throw new Error(`Missing SEC source witness ${key}.`);
  }
}

export function financialCorrectionDecision(correction: FinancialCorrection, current: Fact | undefined, base: Fact | undefined, originals: Fact[], desired: Fact, profileSources: Source[], retainedSources: Source[]): "apply" | "already_correct" | "SKIP_CLIENT_EDITS" {
  if (!sameFact(desired, correction.after)) throw new Error("Seed CFO differs from the reviewed financial manifest.");
  if (sameFact(current, correction.after)) return "already_correct";
  // Guard both the projected value and immutable witness: new user edits never
  // become an implicit new baseline merely because another seed is imported.
  if (!sameFact(current, correction.before) || !sameFact(base, correction.before) || !originals.some(f => sameFact(f, correction.before))) return "SKIP_CLIENT_EDITS";
  for (const source of correction.sources) {
    const expected = sourceSignature(source);
    if (!profileSources.some(s => sourceSignature(s) === expected) || !retainedSources.some(s => sourceSignature(s) === expected) || retainedSources.some(s => s.id === source.id && sourceSignature(s) !== expected)) return "SKIP_CLIENT_EDITS";
  }
  return "apply";
}

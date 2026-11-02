import { createHash } from "node:crypto";
import type { Fact } from "../../shared/atlas";
import type { AtlasFactObservation } from "../../drizzle/atlas-schema";

// MySQL JSON can reorder object keys. Normalize the contract before comparing,
// treating omitted optional members like null and source association order as a set.
export function factHash(fact: Fact | null | undefined): string {
  const normalized = fact ? [fact.key, fact.label, fact.value, fact.unit ?? null, fact.scope ?? null, fact.asOf ?? null, fact.periodStart ?? null, fact.status, [...fact.sourceIds].sort(), fact.notes ?? null, fact.section] : null;
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
export const sameFact = (a: Fact | null | undefined, b: Fact | null | undefined) => factHash(a) === factHash(b);

export function retainedFacts(profileFacts: Fact[], storedFacts: Fact[]): Fact[] {
  const result = new Map(profileFacts.map(f => [f.key, f]));
  for (const fact of storedFacts) if (!result.has(fact.key)) result.set(fact.key, fact);
  return [...result.values()];
}
// Observations are ordered newest first. The most recent observation owns its
// key even if its guard fails: never fall through to an older stale override.
export function projectFactObservations(baseFacts: Fact[], observations: AtlasFactObservation[]): Fact[] {
  const base = new Map(baseFacts.map(f => [f.key, f]));
  const projected = new Map(base);
  const seen = new Set<string>();
  for (const observation of observations) {
    const key = observation.after.key;
    if (seen.has(key)) continue;
    seen.add(key);
    if (sameFact(base.get(key), observation.before)) projected.set(key, observation.after);
  }
  return [...projected.values()];
}
// Import-time guard: an edited original profile cannot become the trusted base
// of a new seed correction. Original retained observations are the witness.
export function assertRetainedFact(base: Fact | undefined, originalObservations: Fact[], companyId: string) {
  if (base && !originalObservations.some(f => f.key === base.key && sameFact(base, f))) {
    throw new Error(`Refusing fact revision for ${companyId}/${base.key}: the base fact differs from retained original evidence.`);
  }
}

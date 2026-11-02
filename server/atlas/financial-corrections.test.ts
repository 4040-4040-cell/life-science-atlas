import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AtlasSeed, Fact, Source } from "../../shared/atlas";
import { assertFinancialManifest, financialCorrectionDecision, type FinancialCorrections } from "./financial-corrections";
import { projectFactObservations } from "./facts";
import { parseSeed } from "./validation";

const manifest: FinancialCorrections = JSON.parse(readFileSync("data/financial-corrections_V5.json", "utf8"));
const v4: AtlasSeed = JSON.parse(readFileSync("data/atlas-seed_V4.json", "utf8"));
const v5 = parseSeed(JSON.parse(readFileSync("data/atlas-seed_V5.json", "utf8")));
const correction = manifest.corrections.find(c => c.companyId === "gco_83cf6169ad5cf8eb3372")!;
const decide = (changes: { 1?: Fact; 2?: Fact; 3?: Fact[]; 4?: Fact; 5?: Source[]; 6?: Source[] } = {}) => {
  const args: Parameters<typeof financialCorrectionDecision> = [correction, correction.before, correction.before, [correction.before], correction.after, correction.sources, correction.sources];
  Object.assign(args, changes);
  return financialCorrectionDecision(...args);
};

describe("V5 source-backed signed CFO correction", () => {
  it("validates all 91 correction witnesses and sanitized seed values", () => {
    expect(() => assertFinancialManifest(manifest, v5.version)).not.toThrow();
    expect(manifest.corrections).toHaveLength(91);
    for (const c of manifest.corrections) {
      const desired = v5.companies.find(p => p.id === c.companyId)!.facts.find(f => f.key === "operating_cash_flow")!;
      expect(financialCorrectionDecision(c, c.before, c.before, [c.before], desired, c.sources, c.sources)).toBe("apply");
    }
  });
  it("preserves all non-CFO profile content, cash, runway and every prior clinical correction", () => {
    const raw: AtlasSeed = JSON.parse(readFileSync("data/atlas-seed_V5.json", "utf8"));
    const restored = structuredClone(raw);
    for (const c of manifest.corrections) {
      const p = restored.companies.find(p => p.id === c.companyId)!;
      p.facts = p.facts.map(f => f.key === "operating_cash_flow" ? c.before : f);
    }
    restored.version = v4.version; restored.sourceHashes = v4.sourceHashes;
    expect(restored).toEqual(v4);
    expect(v5.companies).toHaveLength(1276); expect(v5.sites).toHaveLength(1648);
    expect(v5.companies.find(p => p.id === correction.companyId)?.cash?.value).toBe(332.4);
    expect(v5.companies.filter(c => c.evidence === "baseline" && c.runway?.value != null)).toHaveLength(0);
  });
  it("applies once and does not add another correction for already-correct values", () => {
    expect(decide()).toBe("apply");
    expect(decide({ 1: correction.after })).toBe("already_correct");
    const observation = { version: manifest.seedVersion, before: correction.before, after: correction.after };
    expect(projectFactObservations([correction.before], [observation])).toEqual([correction.after]);
    expect(projectFactObservations([{ ...correction.before, value: -999 }], [observation])[0].value).toBe(-999);
  });
  it.each([
    { value: -999 }, { unit: "USD" }, { periodStart: "2026-04-01" },
    { asOf: "2026-09-30" }, { sourceIds: ["human-source"] }, { notes: "Human reviewed" },
  ])("skips client changes to projected fact or retained original %j", edit => {
    expect(decide({ 1: { ...correction.before, ...edit } })).toBe("SKIP_CLIENT_EDITS");
    expect(decide({ 2: { ...correction.before, ...edit } })).toBe("SKIP_CLIENT_EDITS");
  });
  it("skips missing original evidence and changed source URLs in either source store", () => {
    expect(decide({ 3: [] })).toBe("SKIP_CLIENT_EDITS");
    const changed = correction.sources.map(s => ({ ...s, url: "https://www.sec.gov/changed" }));
    expect(decide({ 5: changed })).toBe("SKIP_CLIENT_EDITS");
    expect(decide({ 6: changed })).toBe("SKIP_CLIENT_EDITS");
  });
  it("rejects unreviewed desired values and altered manifest period/source/unit", () => {
    expect(() => decide({ 4: { ...correction.after, value: 1 } })).toThrow();
    for (const edit of [{ unit: "USD" }, { asOf: "2027-01-01" }, { sourceIds: ["changed"] }]) {
      const bad = structuredClone(manifest); bad.corrections[0].after = { ...bad.corrections[0].after, ...edit };
      expect(() => assertFinancialManifest(bad, v5.version)).toThrow();
    }
  });
});

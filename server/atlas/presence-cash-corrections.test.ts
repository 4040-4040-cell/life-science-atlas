import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { AtlasSeed, CompanySummary } from "../../shared/atlas";
import { applyCorrectiveProjection, assertCashCorrection, equalValues, type CashCorrection } from "./presence-cash-corrections";
const manifest = JSON.parse(readFileSync("data/presence-cash-corrections_V6.json", "utf8")) as { asOf: string; cash: CashCorrection[]; counts: Record<string, number> };
const seed = JSON.parse(gunzipSync(readFileSync("data/atlas-seed_V6.json.gz")).toString()) as AtlasSeed;
const old = JSON.parse(gunzipSync(readFileSync("data/atlas-seed_V5.json.gz")).toString()) as AtlasSeed;
describe("V6 preserved presence and source-backed cash", () => {
  it("accepts exactly source-backed native-unit, entity and filing witnesses", () => { expect(manifest.cash).toHaveLength(12); for (const correction of manifest.cash) expect(() => assertCashCorrection(correction, manifest.asOf)).not.toThrow(); });
  it("rejects a changed currency, issuer identity, date and combined cash label", () => {
    for (const transform of [(c: CashCorrection) => { c.nativeEvidence.unit = "CHF"; }, (c: CashCorrection) => { c.identity.cik = 1; }, (c: CashCorrection) => { c.nativeEvidence.end = "2027-01-01"; }, (c: CashCorrection) => { c.nativeEvidence.tag = "CashAndShortTermInvestments"; }]) {
      const bad = structuredClone(manifest.cash[0]); transform(bad); expect(() => assertCashCorrection(bad, manifest.asOf)).toThrow();
    }
  });
  it("preserves all profile IDs and every old site ID", () => { expect(seed.companies.map(c => c.id).sort()).toEqual(old.companies.map(c => c.id).sort()); expect(seed.companies).toHaveLength(1276); expect(seed.sites).toHaveLength(1652); for (const site of old.sites) expect(seed.sites.some(s => s.id === site.id)).toBe(true); });
  it("keeps three Fricktal plants and one unlocated planned project distinct", () => {
    const sites = seed.sites.filter(s => s.zone === "Fricktal / Rhine manufacturing corridor"); expect(sites).toHaveLength(4); expect(sites.filter(s => s.physicalStatus === "current")).toHaveLength(3); expect(sites.filter(s => s.physicalStatus === "planned_not_commissioned")).toHaveLength(1); for (const site of sites) { expect(site.latitude).toBeNull(); expect(site.longitude).toBeNull(); }
  });
  it("keeps the disputed Orbis observation as research, not closure or verified Basel occupancy", () => { const site = seed.sites.find(s => s.profileId === "gco_d96230457ee4d556f0ff" && s.regionId === "basel")!; expect(site.evidence).toBe("research"); expect(site.physicalStatus).toBe("operator_reported_current_unverified"); expect(site.latitude).toBeNull(); });
  it("refreshes the 10x cash-only line without changing positive CFO or issuer IDs", () => { const company = seed.companies.find(c => c.id === "gco_e2dfe3f6013a3ea81210")!; expect(company.cash?.value).toBe(502.512); expect(company.cash?.asOf).toBe("2026-06-30"); expect(company.facts.find(f => f.key === "operating_cash_flow")?.value).toBeGreaterThan(0); });
  it("does not accept partial or client-modified summary witnesses", () => {
    const company = old.companies.find(c => c.id === manifest.cash[0].companyId)! as CompanySummary;
    const projection = { version: "V6", before: { cash: manifest.cash[0].before }, after: { cash: manifest.cash[0].after } };
    expect(applyCorrectiveProjection(company, projection).cash).toEqual(manifest.cash[0].after);
    const edited = { ...company, cash: { ...company.cash!, notes: "Client edit" } };
    expect(applyCorrectiveProjection(edited, projection)).toBe(edited);
    expect(equalValues({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true); expect(equalValues([1, 2], [2, 1])).toBe(false);
  });
});

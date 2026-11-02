import { describe, expect, it } from "vitest";
import type { CompanyProfile, CompanySummary, Fact } from "../../shared/atlas";
import { csvCell, companiesCsv } from "./csv";
import { numericMetric } from "./ingest";
import { AtlasError, parseFilters, parseId, parseSeed, safeText, safeUrl, toSummary } from "./validation";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { companyWhere } from "./repository";
import { assertRetainedFact, factHash, projectFactObservations, retainedFacts } from "./facts";

describe("Atlas read contract and safety", () => {
  it("uses bounded explicit default pagination and all evidence", () => {
    expect(parseFilters({})).toEqual({ evidence: "all", page: 1, limit: 50, sort: "name" });
    expect(parseFilters({ region: "bay", evidence: "research", page: "2", limit: "100", sort: "cash", q: "  test  " })).toMatchObject({ region: "bay", evidence: "research", page: 2, limit: 100, sort: "cash", q: "test" });
  });
  it.each([{ evidence: "verified" }, { limit: "251" }, { page: "0" }, { page: "2.1" }, { sort: "arbitrary" }, { q: ["one", "two"] }, { unsupported: "yes" }, { region: "../private" }])("rejects unsupported filters %j", query => {
    expect(() => parseFilters(query)).toThrow(AtlasError);
  });
  it("rejects malformed IDs without interpolating them into SQL", () => {
    expect(parseId("company-123:a")).toBe("company-123:a");
    expect(() => parseId("/etc/passwd")).toThrow(AtlasError);
    expect(() => parseId(["one", "two"])).toThrow(AtlasError);
  });
  it("filters regional evidence using matching sites, not collapsed company-region evidence", () => {
    const filters = parseFilters({ region: "bay", evidence: "research", q: "50%_x' OR 1=1" });
    const compiled = new MySqlDialect().sqlToQuery(companyWhere(filters)!);
    expect(compiled.sql).toContain("atlas_company_regions");
    expect(compiled.sql).toContain("atlas_sites");
    expect(compiled.sql).not.toContain('`atlas_company_regions`.`evidence`');
    expect(compiled.sql).not.toContain("50%");
    expect(compiled.params).toContain("research");
    expect(compiled.params).toContain("%50\\%\\_x' OR 1=1%");
  });
  it("requires region context and accepted site IDs for canonical frame filters", () => {
    expect(() => parseFilters({ frame: "beach-carlsbad-core" })).toThrow(AtlasError);
    expect(() => parseFilters({ region: "biotech-beach", frame: "../invalid" })).toThrow(AtlasError);
    const filters = parseFilters({ region: "biotech-beach", frame: "beach-carlsbad-core", evidence: "research" });
    const compiled = new MySqlDialect().sqlToQuery(companyWhere(filters)!);
    expect(compiled.sql).toContain("atlas_zones");
    expect(compiled.sql).toContain("$.siteIds");
    expect(compiled.sql).not.toMatch(/latitude|longitude|bounds/);
    expect(compiled.params).toContain("beach-carlsbad-core");
  });
  it("hard-fails missing real seed content instead of fabricating defaults", () => {
    expect(() => parseSeed({})).toThrow();
  });
  it("rejects private, credential-bearing, local and executable URLs", () => {
    for (const url of ["file:///home/ubuntu/private.pdf", "/home/ubuntu/private.pdf", "javascript:alert(1)", "https://user:pass@example.com", "http://127.0.0.1/a", "https://example.com/a?api_key=private", "/assets/../private.pdf"]) expect(safeUrl(url)).toBeNull();
    expect(safeUrl("https://example.com/source")).toBe("https://example.com/source");
    expect(safeUrl("/manus-storage/atlas/approved.png")).toBe("/manus-storage/atlas/approved.png");
  });
  it("redacts local filesystem references and credential-like connection strings", () => {
    const result = safeText("Evidence /home/ubuntu/private/report.pdf DATABASE_URL=mysql://private:password@host/db and public notes");
    expect(result).not.toContain("/home/ubuntu");
    expect(result).not.toContain("password@host");
    expect(result).toContain("public notes");
  });
  it("does not send research payloads in summaries", () => {
    const profile = { id: "unit-test", name: "Unit test", facts: [{ key: "private" }], sites: [], sources: [], gaps: [], events: [], imported: [], peers: [] } as unknown as CompanyProfile;
    const summary = toSummary(profile);
    expect(summary).toEqual({ id: "unit-test", name: "Unit test" });
  });
  it("normalizes numeric units but never turns an unknown into zero", () => {
    const metric = { value: 1.5, unit: "USD million" } as Fact;
    expect(numericMetric(metric)).toBe(1_500_000);
    expect(numericMetric({ ...metric, unit: "USD billion" })).toBe(1_500_000_000);
    expect(numericMetric({ ...metric, value: null })).toBeNull();
    expect(numericMetric({ ...metric, value: "not disclosed" })).toBeNull();
  });
  it.each(["=SUM(A1:A2)", "+1+2", "-1+2", "@SUM(A1)", "  =formula", "\t=1", "\r=1"])("neutralizes spreadsheet formula %j", value => {
    expect(csvCell(value).startsWith('"\'')).toBe(true);
  });
  it("quotes delimiters and keeps metadata in even an empty export", () => {
    expect(csvCell('one,"two"')).toBe('"one,""two"""');
    const csv = companiesCsv([], "2026-11-02");
    expect(csv).toContain('"evidence"');
    expect(csv).toContain('"cash_as_of"');
    expect(csv).toContain('"source_urls"');
    expect(csv).toContain('"dataset_as_of"');
  });
});

describe("Append-only guarded fact observations", () => {
  const base: Fact = { key: "funding_0", label: "Disclosed financing", value: 193, unit: "USD millions", scope: "Generic companywide financing", status: "verified", sourceIds: ["source-1"], section: "Financing" };
  const corrected: Fact = { ...base, scope: "combined Series A and B financings", notes: "Financing type: equity_financing. Not a local space commitment." };
  it("normalizes MySQL object-key order and omitted optional nulls", () => {
    expect(factHash(base)).toBe(factHash({ ...Object.fromEntries(Object.entries(base).reverse()), notes: null, asOf: null } as Fact));
  });
  it("projects latest corrections and additions without mutating the original", () => {
    const clinical: Fact = { ...base, key: "trial_12", value: "NCT12345678", section: "Retained clinical programs", status: "registry_verified" };
    const projected = projectFactObservations([base], [{ version: "v4", before: base, after: corrected }, { version: "v4", before: null, after: clinical }]);
    expect(projected).toEqual([corrected, clinical]);
    expect(base.scope).toBe("Generic companywide financing");
    expect(base.notes).toBeUndefined();
  });
  it("refuses human-modified base facts at import and does not mask them on reads", () => {
    const edited = { ...base, notes: "Human-reviewed correction" };
    expect(() => assertRetainedFact(edited, [base], "company-1")).toThrow(/Refusing fact revision/);
    expect(projectFactObservations([edited], [{ version: "v4", before: base, after: corrected }])).toEqual([edited]);
    expect(() => assertRetainedFact(base, [base], "company-1")).not.toThrow();
  });
  it("retains human-added facts and never falls back to a stale version", () => {
    const edited = { ...base, notes: "Human-added fact" };
    expect(projectFactObservations([edited], [{ version: "v5", before: base, after: corrected }, { version: "v4", before: edited, after: corrected }])).toEqual([edited]);
    expect(projectFactObservations([edited], [{ version: "v4", before: null, after: corrected }])).toEqual([edited]);
    expect(retainedFacts([edited], [base])).toEqual([edited]);
  });
});

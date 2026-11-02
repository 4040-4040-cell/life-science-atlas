import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AtlasSeed } from "../../../shared/atlas";
import {
  emptyFilters,
  factValue,
  filterQuery,
  filterRegionalWorkspace,
  matchesFilters,
  precisionOf,
  safeUrl,
} from "./atlas";
import { isEligibleAerialSite, toLeafletBounds } from "./geography";

const seed = JSON.parse(
  readFileSync(
    new URL("../../../data/atlas-seed.json", import.meta.url),
    "utf8"
  )
) as AtlasSeed;

describe("retained atlas frontend geography", () => {
  it("converts every real aerial and analytical frame from W/S/E/N to Leaflet lat/lng", () => {
    for (const frame of [...seed.aerials, ...seed.zones]) {
      const [[south, west], [north, east]] = toLeafletBounds(frame.bounds);
      expect(south).toBeLessThan(north);
      expect(west).toBeLessThan(east);
      expect(Math.abs(south)).toBeLessThanOrEqual(90);
      expect(Math.abs(north)).toBeLessThanOrEqual(90);
      expect(Math.abs(west)).toBeLessThanOrEqual(180);
    }
  });
  it("never turns retained unchecked imports or campus orientation into address matches", () => {
    for (const site of seed.sites) {
      if (site.evidence === "research" || /unchecked/.test(site.precision))
        expect(precisionOf(site)).toBe("research");
      if (
        /campus_reference_address/.test(site.precision) &&
        site.evidence === "baseline"
      )
        expect(precisionOf(site)).toBe("city");
      if (
        /official_address_point|address_range_interpolation/.test(
          site.precision
        ) &&
        site.evidence === "baseline"
      )
        expect(precisionOf(site)).toBe("address");
    }
  });
  it("only allows baseline address-level sites explicitly linked to the real aerial", () => {
    for (const aerial of seed.aerials) {
      const eligible = seed.sites.filter(site =>
        isEligibleAerialSite(site, aerial)
      );
      for (const site of eligible) {
        expect(site.evidence).toBe("baseline");
        expect(precisionOf(site)).toBe("address");
        expect(aerial.siteIds).toContain(site.id);
      }
    }
  });
});

describe("retained atlas filters and evidence rendering", () => {
  it("preserves the actual selected evidence, category, priority and query in CSV parameters", () => {
    const company = seed.companies.find(company => company.priority)!;
    const filters = {
      q: company.name,
      evidence: company.evidence,
      category: company.category,
      priority: company.priority!,
    };
    const params = filterQuery(filters, company.regionIds[0]);
    expect(params.get("q")).toBe(company.name);
    expect(params.get("evidence")).toBe(company.evidence);
    expect(params.get("category")).toBe(company.category);
    expect(params.get("priority")).toBe(company.priority);
    expect(matchesFilters(company, filters)).toBe(true);
  });
  it("matches real names, tickers and cities without silently searching unrelated parent fields", () => {
    for (const company of seed.companies.slice(0, 80)) {
      expect(
        matchesFilters(company, { ...emptyFilters, q: company.name })
      ).toBe(true);
      expect(
        matchesFilters(company, {
          ...emptyFilters,
          evidence: company.evidence === "baseline" ? "research" : "baseline",
        })
      ).toBe(false);
      if (company.ticker)
        expect(
          matchesFilters(company, { ...emptyFilters, q: company.ticker })
        ).toBe(true);
    }
  });
  it("renders retained nulls as unknown while preserving disclosed units", () => {
    const missing = seed.companies
      .flatMap(c => c.facts)
      .find(f => f.value === null)!;
    const disclosed = seed.companies
      .flatMap(c => c.facts)
      .find(f => typeof f.value === "number" && f.unit)!;
    expect(factValue(missing)).toBe("Not disclosed");
    expect(factValue(disclosed)).toContain(disclosed.unit);
  });
  it("accepts supplied project assets and rejects browser links to local files or script schemes", () => {
    expect(safeUrl("/manus-storage/retained-exhibit.jpg")).toBe(
      "/manus-storage/retained-exhibit.jpg"
    );
    expect(safeUrl("/home/ubuntu/private.pdf")).toBeUndefined();
    expect(safeUrl("file:///home/ubuntu/private.pdf")).toBeUndefined();
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
  });
});

describe("canonical regional workspace membership", () => {
  it("includes research sites attached to globally baseline profiles without promoting or mutating records", () => {
    const company = seed.companies.find(
      company =>
        company.evidence === "baseline" &&
        seed.sites.some(
          site => site.profileId === company.id && site.evidence === "research"
        )
    )!;
    expect(company).toBeDefined();
    const localResearch = seed.sites.filter(
      site => site.profileId === company.id && site.evidence === "research"
    );
    const result = filterRegionalWorkspace([company], localResearch, {
      ...emptyFilters,
      evidence: "research",
    });
    expect(result.allowedCompanyIds.has(company.id)).toBe(true);
    expect(result.companies[0].evidence).toBe("research");
    expect(result.sites).toEqual(localResearch);
    expect(result.sites.every(site => precisionOf(site) === "research")).toBe(
      true
    );
    expect(company.evidence).toBe("baseline");
    expect(
      filterRegionalWorkspace([company], localResearch, {
        ...emptyFilters,
        evidence: "baseline",
      }).companies
    ).toEqual([]);
  });

  it("keeps both evidence memberships available on a mixed company while projecting the selected row evidence", () => {
    const company = seed.companies.find(company => {
      const sites = seed.sites.filter(site => site.profileId === company.id);
      return (
        sites.some(site => site.evidence === "baseline") &&
        sites.some(site => site.evidence === "research")
      );
    })!;
    expect(company).toBeDefined();
    const local = seed.sites.filter(site => site.profileId === company.id);
    for (const evidence of ["baseline", "research"] as const) {
      const result = filterRegionalWorkspace([company], local, {
        ...emptyFilters,
        evidence,
      });
      expect(result.companies[0].evidence).toBe(evidence);
      expect(result.sites.every(site => site.evidence === evidence)).toBe(true);
    }
  });

  it("uses only explicit frame site links, not nearby unchecked coordinates, and fails closed for missing frame membership", () => {
    const site = seed.sites[0];
    const company = seed.companies.find(
      company => company.id === site.profileId
    )!;
    const other = seed.companies.find(
      company => company.id !== site.profileId
    )!;
    const unlinked = {
      ...site,
      id: "test-unlinked-frame-site",
      profileId: other.id,
      evidence: "research" as const,
    };
    const filters = { ...emptyFilters, frame: "test-analytical-frame" };
    const result = filterRegionalWorkspace(
      [company, other],
      [site, unlinked],
      filters,
      [site.id]
    );
    expect([...result.allowedCompanyIds]).toEqual([company.id]);
    expect(result.sites).toEqual([site]);
    expect(
      filterRegionalWorkspace([company, other], [site, unlinked], filters)
        .companies
    ).toEqual([]);
    const restored = filterRegionalWorkspace(
      [company, other],
      [site, unlinked],
      emptyFilters
    );
    expect(restored.allowedCompanyIds.has(other.id)).toBe(true);
  });

  it("scopes every retained aerial's company/index records by its linked sites without weakening strict aerial pins", () => {
    for (const aerial of seed.aerials) {
      const local = seed.sites.filter(
        site => site.regionId === aerial.regionId
      );
      const filters = { ...emptyFilters, frame: aerial.id };
      const result = filterRegionalWorkspace(
        seed.companies,
        local,
        filters,
        aerial.siteIds
      );
      expect(result.sites.every(site => aerial.siteIds.includes(site.id))).toBe(
        true
      );
      expect(
        result.companies.every(company =>
          result.sites.some(site => site.profileId === company.id)
        )
      ).toBe(true);
      const pins = result.sites.filter(site =>
        isEligibleAerialSite(site, aerial)
      );
      expect(
        pins.every(
          site =>
            site.evidence === "baseline" && precisionOf(site) === "address"
        )
      ).toBe(true);
    }
  });

  it("serializes the selected frame identically for matrix and CSV and omits it after returning to the hub", () => {
    const aerial = seed.aerials[0];
    const selected = {
      ...emptyFilters,
      frame: aerial.id,
      evidence: "research",
    };
    const params = filterQuery(selected, aerial.regionId);
    expect(params.get("frame")).toBe(aerial.id);
    expect(params.get("region")).toBe(aerial.regionId);
    expect(params.get("evidence")).toBe("research");
    expect(
      filterQuery({ ...selected, frame: undefined }, aerial.regionId).has(
        "frame"
      )
    ).toBe(false);
  });
});

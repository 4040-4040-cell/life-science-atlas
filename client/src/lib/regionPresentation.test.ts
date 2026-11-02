import { describe, expect, it } from "vitest";
import { precisionOf } from "./atlas";
import {
  coverageText,
  defaultAerialId,
  groupDocumentedLocations,
  isCampusReference,
  regionPresentation,
} from "./regionPresentation";
import { atlasTestSeed as seed } from "./atlasTestFixture";

describe("concise retained research presentation", () => {
  it("opens the established core aerial instead of an alphabetical peripheral frame", () => {
    for (const [region, expected] of [
      ["basel", "basel-allschwil-bachgraben-main-campus"],
      ["biotech-beach", "beach-torrey-core"],
      ["genetown", "gene-cambridge-kendall-east"],
    ]) {
      expect(defaultAerialId(region, seed.aerials.filter(aerial => aerial.regionId === region))).toBe(expected);
    }
    expect(defaultAerialId("other", [{ id: "retained-first" }])).toBe("retained-first");
    expect(defaultAerialId("other", [])).toBe("");
  });

  it("gives every approved hub a readable label without using raw research geography", () => {
    for (const region of seed.regions) {
      const presentation = regionPresentation(region);
      expect(presentation.label.length).toBeLessThan(30);
      expect(presentation.subtitle.length).toBeLessThan(60);
      expect(
        (presentation.navSubtitle || presentation.subtitle).length
      ).toBeLessThan(33);
      expect(presentation.subtitle).not.toBe(region.geography);
    }
    expect(
      regionPresentation(seed.regions.find(region => region.id === "basel")!)
        .subtitle
    ).toContain("cross-border");
    expect(
      regionPresentation(seed.regions.find(region => region.id === "genetown")!)
        .subtitle
    ).toContain("Massachusetts");
  });
  it("removes only the editorial internal-link placeholder, retaining complete geography", () => {
    for (const region of seed.regions) {
      const text = coverageText(region.geography);
      expect(text).not.toContain("[internal reference]");
      const original = region.geography.split(": [internal reference]")[0];
      expect(text).toContain(original);
    }
  });
  it("keeps Basel and Beach site context separate on the same Neurocrine company identity", () => {
    const company = seed.companies.find(company => company.ticker === "NBIX")!;
    const before = JSON.stringify(company.sites);
    const basel = groupDocumentedLocations(company.sites, "basel");
    expect(basel.selected.length).toBeGreaterThan(0);
    expect(basel.selected.every(site => site.regionId === "basel")).toBe(true);
    expect(basel.other.some(site => site.city === "San Diego")).toBe(true);
    const beach = groupDocumentedLocations(company.sites, "biotech-beach");
    expect(
      beach.selected.every(site => site.regionId === "biotech-beach")
    ).toBe(true);
    expect(beach.other.some(site => site.city === "Allschwil")).toBe(true);
    expect(beach.selected).toHaveLength(1);
    expect(beach.other).toHaveLength(1);
    expect(beach.imported).toHaveLength(1);
    expect(beach.imported[0].precision).toBe("provider_unchecked_street");
    const all = groupDocumentedLocations(company.sites);
    expect(
      [...all.selected, ...all.other, ...all.imported]
        .map(site => site.id)
        .sort()
    ).toEqual(company.sites.map(site => site.id).sort());
    expect(JSON.stringify(company.sites)).toBe(before);
  });
  it("labels retained campus references without promoting them to address-matched company suites", () => {
    const campuses = seed.sites.filter(isCampusReference);
    expect(campuses.length).toBeGreaterThan(0);
    for (const campus of campuses)
      expect(precisionOf(campus)).not.toBe("address");
    expect(
      isCampusReference({
        precision: "provider_unchecked_street",
        referenceType: "unchecked_imported_presence",
      })
    ).toBe(false);
    const basel = seed.sites.filter(site => site.regionId === "basel");
    expect(
      basel
        .filter(site => precisionOf(site) === "address")
        .every(site => !isCampusReference(site))
    ).toBe(true);
  });
});

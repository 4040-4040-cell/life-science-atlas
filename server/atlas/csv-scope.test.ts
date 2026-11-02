import { describe, expect, it } from "vitest";
import type { CompanyProfile, CompanySummary } from "../../shared/atlas";
import { companiesCsv, csvCell } from "./csv";

const summary = {
  id: "scope-example", name: "Example Company", evidence: "baseline", category: "Therapeutics",
  priority: null, ticker: null, listing: null, parent: null, regionIds: ["basel", "biotech-beach"],
  cities: ["Allschwil", "San Diego"], stage: null, score: null, coverage: null,
  occupancyRead: "Not assessed", occupancyReason: null, cash: null, runway: null, employees: null,
} as unknown as CompanySummary;
const profile = { ...summary, sources: [], imported: [], gaps: [] } as unknown as CompanyProfile;

describe("regional CSV scope", () => {
  it("preserves global company locations while explicitly identifying the selected hub and frame", () => {
    const csv = companiesCsv([{ summary, profile }], "2026-11-02", "basel-example-frame", "basel");
    expect(csv).toContain('"selected_frame_id","selected_region_id","company_locations_scope"');
    expect(csv).toContain('"Allschwil | San Diego"');
    expect(csv).toContain('"basel-example-frame","basel","The regions and cities columns describe company locations across all covered regions, not only the selected hub or aerial frame."');
  });
  it("retains formula protection for source-controlled text", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe('"\'=HYPERLINK(1)"');
    expect(csvCell(null)).toBe('""');
  });
});

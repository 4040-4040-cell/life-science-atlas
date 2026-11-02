import { describe, expect, it } from "vitest";
import { atlasTestSeed } from "./atlasTestFixture";

describe("source-corrected financial release", () => {
  it("does not invert the retained positive SEC operating cash flows", () => {
    for (const ticker of ["NBIX", "GILD", "VRTX", "JANX"]) {
      const company = atlasTestSeed.companies.find(company => company.ticker === ticker);
      expect(company, ticker).toBeDefined();
      const cashFlow = company!.facts.find(fact => fact.key === "operating_cash_flow");
      expect(cashFlow, ticker).toBeDefined();
      expect(Number(cashFlow!.value), ticker).toBeGreaterThan(0);
      expect(cashFlow!.sourceIds.length, ticker).toBeGreaterThan(0);
      expect(cashFlow!.periodStart, ticker).toBeTruthy();
      expect(cashFlow!.asOf, ticker).toBeTruthy();
    }
  });
});

import { describe, expect, it } from "vitest";
import type { Fact } from "../../../shared/atlas";
import { cashObservationWarning } from "./factFreshness";
const fact = { label: "Cash and cash equivalents", value: 344.067, asOf: "2024-12-31", key: "cash_and_cash_equivalents", unit: "USD millions", sourceIds: [], section: "Financials", scope: "Companywide", status: "verified" } as Fact;
describe("Cash observation display warnings", () => {
  it("marks stale retained cash without changing it", () => { expect(cashObservationWarning(fact, "2026-11-04")).toContain("Historical balance"); expect(fact.value).toBe(344.067); });
  it("does not call an undated import a current balance", () => { expect(cashObservationWarning({ ...fact, asOf: null }, "2026-11-04")).toContain("unconfirmed"); });
  it("does not warn on a recent sourced balance", () => { expect(cashObservationWarning({ ...fact, asOf: "2026-06-30" }, "2026-11-04")).toBeNull(); });
  it("keeps cash-flow periods distinct from balance ages", () => { expect(cashObservationWarning({ ...fact, label: "Operating cash flow" }, "2026-11-04")).toBeNull(); });
  it("flags future-dated cash", () => { expect(cashObservationWarning({ ...fact, asOf: "2027-06-30" }, "2026-11-04")).toContain("Future-dated"); });
});

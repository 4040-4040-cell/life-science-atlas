import { describe, expect, it } from "vitest";
import { normalizeMarketBrief } from "./marketIntelligenceView";
describe("Source-preserving market intelligence view", () => {
  it("retains the actual producer dates, company, complete summary, status and public evidence", () => {
    const source = { printPdfUrl: "/manus-storage/a.pdf", sources: [{ id: "nbe", title: "Operator release", url: "https://nbe.example/release" }], signals: [{ company: "NBE", companyId: "nbe", date: "2025-04-03", status: "opened", summary: "Facility opened; reported campus area is not net absorption.", sourceIds: ["nbe"], quantities: [{ value: 1826, unit: "sqm" }] }] };
    const view = normalizeMarketBrief(source); expect(view.pdfUrl).toBe(source.printPdfUrl); expect(view.signals?.[0].eventDate).toBe("2025-04-03"); expect(view.signals?.[0].companyName).toBe("NBE"); expect(view.signals?.[0].text).toBe(source.signals[0].summary); expect(view.signals?.[0].sources).toEqual(source.sources); expect(view.signals?.[0].quantities).toEqual(source.signals[0].quantities);
  });
  it("does not invent an event date or replace missing cash with zero", () => {
    const view = normalizeMarketBrief({ metrics: [null, null, null, null, { value: null, label: "Cash" }].filter(Boolean), signals: [{ company: "Planned campus", status: "planned", summary: "Operator-stated target only." }] }); expect(view.signals?.[0].eventDate).toBeUndefined(); expect(view.signals?.[0].eventStatus).toBe("planned"); expect(view.metrics?.[0].value).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { safeUrl } from "./atlas";
import { offlineAssetUrl, isAtlasOffline } from "./offlineAtlas";
import printAssets from "./marketPrintAssets.json";
import { atlasTestSeed } from "./atlasTestFixture";

describe("market print and packaged media", () => {
  it("provides every retained region with a dated map image and single-market PDF", () => {
    expect(Object.keys(printAssets.markets).sort()).toEqual(atlasTestSeed.regions.map(region => region.id).sort());
    for (const market of Object.values(printAssets.markets)) {
      expect(market.asOf).toBe("2026-10-28");
      expect(market.imageUrl).toMatch(/^\/manus-storage\/.*\.png$/);
      expect(market.pdfUrl).toMatch(/^\/manus-storage\/.*\.pdf$/);
    }
    expect(printAssets.allMarketsPdfUrl).toMatch(/\.pdf$/);
    expect(printAssets.individualPdfZipUrl).toMatch(/\.zip$/);
  });
  it("permits local packaged images without broadening traversal or protocol acceptance", () => {
    expect(safeUrl("/offline-assets/logo.png")).toBe("/offline-assets/logo.png");
    for (const path of ["/offline-assets/../secret", "/offline-assets/%2e%2e/secret", "/offline-assets/%5csecret", "/offline-assets/%00secret", "javascript:alert(1)", "file:///etc/passwd"]) expect(safeUrl(path)).toBeUndefined();
    expect(offlineAssetUrl("https://example.com/logo.png")).toBeUndefined();
    expect(isAtlasOffline()).toBe(false);
  });
});

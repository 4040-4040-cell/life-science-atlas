import { describe, expect, it } from "vitest";
import type { CompanyListResponse, RegionResponse } from "../../shared/atlas";
import { emptyFilters, filterQuery, filterRegionalWorkspace } from "../../client/src/lib/atlas";

// These tests never bind a port or start/restart an application. They use the
// parent-owned existing server, and all requests are read-only GETs.
describe.runIf(process.env.ATLAS_LIVE_INTEGRATION === "1")("existing parent Atlas HTTP server (read-only)", () => {
  const base = process.env.ATLAS_LIVE_URL ?? "http://127.0.0.1:3000/api/atlas";
  it("matches client frame/evidence IDs, paginated API IDs, CSV IDs and frame metadata", async () => {
    for (const regionId of ["biotech-beach", "genetown", "basel"]) {
      const response = await fetch(`${base}/regions/${regionId}`);
      expect(response.status).toBe(200);
      const region: RegionResponse = await response.json();
      const frame = region.zones.find(z => z.siteIds.length > 3)!;
      expect(frame).toBeDefined();
      for (const evidence of ["all", "baseline", "research"]) {
        const filters = { ...emptyFilters, frame: frame.id, evidence };
        const expected = filterRegionalWorkspace(region.companies, region.sites, filters, frame.siteIds).companies.map(c => c.id).sort();
        const params = filterQuery(filters, regionId); params.set("limit", "250");
        const listResponse = await fetch(`${base}/companies?${params}`);
        expect(listResponse.status).toBe(200);
        const list: CompanyListResponse = await listResponse.json();
        expect(list.items.map(c => c.id).sort()).toEqual(expected);
        expect(list.total).toBe(expected.length);
        const csvResponse = await fetch(`${base}/export.csv?${params}`);
        expect(csvResponse.status).toBe(200);
        const csv = await csvResponse.text();
        expect(csv).toContain('"selected_frame_id"');
        const csvIds = [...csv.matchAll(/^"([^"]+)","/gm)].map(match => match[1]).filter(id => id !== "id").sort();
        expect(csvIds).toEqual(expected);
        if (expected.length) expect(csv).toContain(`"${frame.id}"`);
      }
    }
  }, 60_000);
  it("returns mixed Amgen research membership and fails closed on invalid frames", async () => {
    const response = await fetch(`${base}/companies?region=biotech-beach&q=Amgen&evidence=research`);
    const list: CompanyListResponse = await response.json();
    expect(response.status).toBe(200);
    expect(list.items.find(c => c.id === "gco_48272715346d6e3b4674")?.evidence).toBe("research");
    for (const endpoint of ["companies", "export.csv"]) {
      expect((await fetch(`${base}/${endpoint}?region=basel&frame=beach-carmel-core`)).status).toBe(400);
      expect((await fetch(`${base}/${endpoint}?region=basel&frame=not-a-real-frame`)).status).toBe(404);
      expect((await fetch(`${base}/${endpoint}?frame=beach-carmel-core`)).status).toBe(400);
    }
  }, 30_000);
});

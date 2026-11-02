import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AerialView } from "../../../shared/atlas";
import {
  aerialCampusReferences, clusterProjected, fitAerialMap, googleBounds,
  googleMapsScriptUrl, positionedSites,
} from "./googleMap";
import { precisionOf } from "./atlas";
import { atlasTestSeed as seed } from "./atlasTestFixture";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("managed native Google Maps", () => {
  it("builds the documented managed browser API route using only public runtime credentials", () => {
    const url = new URL(googleMapsScriptUrl({ apiUrl: "https://managed.example/api/", apiBrowserKey: "public browser/key+value" }, "__ready"));
    expect(url.origin).toBe("https://managed.example");
    expect(url.pathname).toBe("/api/v1/maps/proxy/maps/api/js");
    expect(url.searchParams.get("key")).toBe("public browser/key+value");
    expect(url.searchParams.get("callback")).toBe("__ready");
    expect(url.searchParams.get("loading")).toBe("async");
    expect(() => googleMapsScriptUrl(undefined, "ready")).toThrow("not configured");
    expect(() => googleMapsScriptUrl({ apiUrl: "https://managed.example" }, "ready")).toThrow("not configured");
  });
  it("retains W/S/E/N orientation for every one of the 57 aerials and all analytical frames", () => {
    expect(seed.aerials).toHaveLength(57);
    for (const frame of [...seed.aerials, ...seed.zones]) {
      const bounds = googleBounds(frame.bounds);
      expect(bounds.west).toBe(frame.bounds[0]);
      expect(bounds.south).toBe(frame.bounds[1]);
      expect(bounds.east).toBe(frame.bounds[2]);
      expect(bounds.north).toBe(frame.bounds[3]);
    }
    expect(googleBounds([7.52, 47.55, 7.58, 47.575])).not.toEqual(googleBounds([7.532, 47.55, 7.568, 47.575]));
    expect(() => googleBounds([NaN, 0, 1, 1])).toThrow("invalid");
    expect(() => googleBounds([10, 1, 5, 3])).toThrow("invalid");
    expect(() => googleBounds([0, -91, 1, 1])).toThrow("invalid");
  });
  it("fits the real raster to the final viewport instead of preserving the smaller initial integer zoom", () => {
    class LatLng {
      constructor(private latitude: number, private longitude: number) {}
      lat() { return this.latitude; } lng() { return this.longitude; }
    }
    class Point { constructor(public x: number, public y: number) {} }
    vi.stubGlobal("google", { maps: { LatLng, Point } });
    const projection = {
      fromLatLngToPoint: (position: LatLng) => {
        const sine = Math.sin(position.lat() * Math.PI / 180);
        return { x: (position.lng() + 180) / 360 * 256, y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * 256 };
      },
      fromPointToLatLng: (point: Point) => point,
    };
    const div = { clientWidth: 880, clientHeight: 510 };
    const setZoom = vi.fn(), setCenter = vi.fn();
    const map = { getDiv: () => div, getProjection: () => projection, setZoom, setCenter } as unknown as google.maps.Map;
    const aerial = { bounds: [7.532, 47.55, 7.568, 47.575], imageBounds: [7.522213394020482, 47.55, 7.577786605979515, 47.575] } as AerialView;
    fitAerialMap(map, aerial);
    const initial = setZoom.mock.lastCall![0];
    div.clientHeight = 680;
    fitAerialMap(map, aerial);
    const final = setZoom.mock.lastCall![0];
    expect(final).toBeGreaterThan(initial);
    expect(final).toBeGreaterThan(14);
    expect(final % 1).not.toBe(0);
    const width = projection.fromLatLngToPoint(new LatLng(47.55, aerial.imageBounds![2])).x - projection.fromLatLngToPoint(new LatLng(47.55, aerial.imageBounds![0])).x;
    expect(width * 2 ** final).toBeCloseTo(848, 3);
    expect(setCenter).toHaveBeenCalledTimes(2);
  });
  it("never promotes city, unchecked, invalid or unlinked sites into address-matched aerial pins", () => {
    for (const aerial of seed.aerials) {
      const pins = positionedSites(seed.sites, aerial);
      for (const site of pins) {
        expect(site.evidence).toBe("baseline");
        expect(precisionOf(site)).toBe("address");
        expect(aerial.siteIds).toContain(site.id);
      }
    }
    const sample = seed.sites.find(site => site.latitude != null)!;
    expect(positionedSites([{ ...sample, latitude: NaN }, { ...sample, longitude: 190 }, { ...sample, latitude: null }])).toEqual([]);
  });
  it("retains five Allschwil address matches plus the separate linked Neurocrine campus orientation", () => {
    const aerial = seed.aerials.find(aerial => aerial.id === "basel-allschwil-bachgraben-main-campus")!;
    const strict = positionedSites(seed.sites, aerial);
    expect(strict).toHaveLength(5);
    const references = aerialCampusReferences(seed.sites, aerial);
    const neurocrine = references.find(site => site.id === "basel:site:neurocrine-allschwil")!;
    expect(neurocrine).toBeDefined();
    expect(neurocrine.profileId).toBe("gco_83cf6169ad5cf8eb3372");
    expect(precisionOf(neurocrine)).toBe("city"); // No mutation or precision promotion.
    expect(strict.some(site => site.id === neurocrine.id)).toBe(false);
    for (const replacement of [
      { evidence: "research" as const }, { sourceIds: [] },
      { precision: "city_centroid" }, { referenceType: "city_centroid" },
      { latitude: NaN }, { longitude: null }, { id: "unlinked-site" },
    ]) expect(aerialCampusReferences([{ ...neurocrine, ...replacement }], aerial)).toEqual([]);
    expect(aerialCampusReferences([neurocrine], undefined)).toEqual([]);
  });
  it("keeps every regional and site record accessible in clusters, including adjacent-grid overlaps", () => {
    const records = [{ id: "one", x: 41, y: 30 }, { id: "two", x: 43, y: 30 }, { id: "three", x: 82, y: 30 }, { id: "far", x: 200, y: 30 }];
    const groups = clusterProjected(records, record => record, 42);
    expect(groups.map(group => group.map(record => record.id))).toEqual([["one", "two", "three"], ["far"]]);
    expect(groups.flat()).toHaveLength(records.length);
    const allSame = clusterProjected(seed.regions, () => ({ x: 20, y: 20 }), 100);
    expect(allSame).toHaveLength(1);
    expect(allSame[0].map(region => region.id).sort()).toEqual(seed.regions.map(region => region.id).sort());
    expect(clusterProjected([], () => ({ x: 0, y: 0 }), 42)).toEqual([]);
  });
  it("removes the rejected Leaflet/CARTO implementation and retains a genuine Google GroundOverlay", () => {
    const component = readFileSync(new URL("../components/atlas/AtlasMap.tsx", import.meta.url), "utf8");
    const helper = readFileSync(new URL("./googleMap.ts", import.meta.url), "utf8");
    expect(component).not.toMatch(/leaflet|cartocdn|openstreetmap/i);
    expect(component).toContain("new google.maps.GroundOverlay(aerial.imageUrl, googleBounds(aerial.imageBounds ?? aerial.bounds)");
    expect(component).toContain("onCompanyRef.current(record.profileId)");
    expect(component).not.toMatch(/innerHTML|dangerouslySetInnerHTML/);
    expect(helper).not.toContain("MANUS_API_KEY");
    expect(helper).toContain('script.crossOrigin = "anonymous"');
    expect(helper).toContain("script.onerror");
    expect(helper).toContain("25000");
    expect(component).toContain("tilesloaded");
    expect(component).toContain("Retry map");
  });
});

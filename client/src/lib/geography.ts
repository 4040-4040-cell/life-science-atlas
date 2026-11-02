import type { AerialView, MapSite } from "@shared/atlas";
import { precisionOf, validCoordinates } from "./atlas";

/** Retained aerial and analytical-zone bounds are [west, south, east, north]. */
export function toLeafletBounds(
  bounds: [number, number, number, number]
): [[number, number], [number, number]] {
  return [
    [bounds[1], bounds[0]],
    [bounds[3], bounds[2]],
  ];
}

/** An exhibit link alone does not verify an unchecked import or campus reference. */
export function isEligibleAerialSite(
  site: MapSite,
  aerial: AerialView
): boolean {
  return (
    site.evidence === "baseline" &&
    validCoordinates(site) &&
    precisionOf(site) === "address" &&
    aerial.siteIds.includes(site.id)
  );
}

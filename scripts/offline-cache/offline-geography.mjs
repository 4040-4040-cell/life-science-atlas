// client/src/lib/atlas.ts
function precisionOf(site) {
  const precision = `${site.precision} ${site.referenceType || ""}`.toLowerCase();
  if (site.evidence === "research" || /unchecked|unverified|import|approximate/.test(precision))
    return "research";
  if (/city|centroid|macro|reference/.test(precision)) return "city";
  if (/address|rooftop|exact|verified|precise/.test(precision))
    return "address";
  return "city";
}
var validCoordinates = (site) => site.latitude != null && site.longitude != null && Number.isFinite(site.latitude) && Number.isFinite(site.longitude) && Math.abs(site.latitude) <= 90 && Math.abs(site.longitude) <= 180;

// client/src/lib/geography.ts
function isEligibleAerialSite(site, aerial) {
  return site.evidence === "baseline" && validCoordinates(site) && precisionOf(site) === "address" && aerial.siteIds.includes(site.id);
}

// client/src/lib/offlineGeography.ts
function mercatorY(latitude) {
  const radians = latitude * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}
function rasterPosition(latitude, longitude, bounds) {
  const [west, south, east, north] = bounds;
  if (![latitude, longitude, west, south, east, north].every(Number.isFinite) || east <= west || north <= south) return void 0;
  return { x: 100 * (longitude - west) / (east - west), y: 100 * (mercatorY(north) - mercatorY(latitude)) / (mercatorY(north) - mercatorY(south)) };
}
function offlineAerialSites(sites, aerial) {
  return sites.filter(validCoordinates).filter((site) => isEligibleAerialSite(site, aerial) || site.evidence === "baseline" && site.precision === "campus_reference_address" && site.referenceType === "campus_reference_address" && site.sourceIds.length > 0 && aerial.siteIds.includes(site.id)).map((site) => ({ site, position: rasterPosition(site.latitude, site.longitude, aerial.imageBounds ?? aerial.bounds), campus: site.precision === "campus_reference_address" })).filter((record) => record.position && record.position.x >= 0 && record.position.x <= 100 && record.position.y >= 0 && record.position.y <= 100);
}
export {
  mercatorY,
  offlineAerialSites,
  rasterPosition
};

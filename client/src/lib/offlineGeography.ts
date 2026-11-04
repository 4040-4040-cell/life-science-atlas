import type { AerialView, MapSite } from '@shared/atlas';
import { isEligibleAerialSite } from './geography';
import { validCoordinates } from './atlas';

export function mercatorY(latitude: number): number {
  const radians = latitude * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}
/** Image percentages at the native geographic raster bounds; no exhibit padding. */
export function rasterPosition(latitude: number, longitude: number, bounds: readonly [number, number, number, number]) {
  const [west, south, east, north] = bounds;
  if (![latitude, longitude, west, south, east, north].every(Number.isFinite) || east <= west || north <= south) return undefined;
  return { x: 100 * (longitude - west) / (east - west), y: 100 * (mercatorY(north) - mercatorY(latitude)) / (mercatorY(north) - mercatorY(south)) };
}
export function offlineAerialSites(sites: MapSite[], aerial: AerialView) {
  return sites.filter(validCoordinates).filter(site => isEligibleAerialSite(site, aerial) || (
    site.evidence === 'baseline' && site.precision === 'campus_reference_address' &&
    site.referenceType === 'campus_reference_address' && site.sourceIds.length > 0 && aerial.siteIds.includes(site.id)
  )).map(site => ({ site, position: rasterPosition(site.latitude, site.longitude, aerial.imageBounds ?? aerial.bounds), campus: site.precision === 'campus_reference_address' }))
    .filter(record => record.position && record.position.x >= 0 && record.position.x <= 100 && record.position.y >= 0 && record.position.y <= 100);
}

/// <reference types="@types/google.maps" />
import type { AerialView, MapSite } from "@shared/atlas";
import { validCoordinates } from "./atlas";
import { isEligibleAerialSite } from "./geography";

export const MAP_AUTH_ERROR_EVENT = "bioatlas:maps-auth-error";
let sdkPromise: Promise<typeof google.maps> | undefined;
let sequence = 0;
let authHandlerInstalled = false;

/** Read only the two browser-safe public runtime values, never a server credential. */
export function googleMapsScriptUrl(
  config: { apiUrl?: string; apiBrowserKey?: string } | undefined,
  callback: string
): string {
  if (!config?.apiUrl || !config.apiBrowserKey)
    throw new Error("The managed map service is not configured.");
  const url = new URL(`${config.apiUrl.replace(/\/$/, "")}/v1/maps/proxy/maps/api/js`);
  url.search = new URLSearchParams({
    key: config.apiBrowserKey,
    v: "weekly",
    loading: "async",
    callback,
  }).toString();
  return url.href;
}

/** Deduplicated SDK loading; callback, network, timeout and authentication failures reject. */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (window.google?.maps?.Map && window.google.maps.OverlayView)
    return Promise.resolve(window.google.maps);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<typeof google.maps>((resolve, reject) => {
    const globals = window as unknown as Record<string, unknown>;
    const callback = `__bioatlasGoogleMapsReady${++sequence}`;
    const script = document.createElement("script");
    let finished = false;
    let timer: ReturnType<typeof setTimeout>;
    const clean = () => {
      clearTimeout(timer);
      window.removeEventListener(MAP_AUTH_ERROR_EVENT, authError);
      delete globals[callback];
      script.onerror = null;
    };
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      clean();
      script.remove();
      reject(new Error(message));
    };
    const authError = () => fail("The managed map service could not authorize this map.");
    if (!authHandlerInstalled) {
      const previous = globals.gm_authFailure;
      globals.gm_authFailure = () => {
        window.dispatchEvent(new Event(MAP_AUTH_ERROR_EVENT));
        if (typeof previous === "function") previous();
      };
      authHandlerInstalled = true;
    }
    globals[callback] = () => {
      if (!window.google?.maps?.Map || !window.google.maps.OverlayView) {
        fail("The map service returned an incomplete JavaScript SDK.");
        return;
      }
      if (finished) return;
      finished = true;
      clean();
      resolve(window.google.maps);
    };
    window.addEventListener(MAP_AUTH_ERROR_EVENT, authError);
    timer = setTimeout(() => fail("The map service took too long to respond."), 25000);
    script.async = true;
    // The managed browser proxy requires Origin; anonymous CORS supplies it.
    script.crossOrigin = "anonymous";
    script.onerror = () => fail("The map JavaScript service could not be loaded.");
    try {
      script.src = googleMapsScriptUrl(window.__MANUS_CONFIG__, callback);
      document.head.appendChild(script);
    } catch (error) {
      fail(error instanceof Error ? error.message : "The map service is unavailable.");
    }
  }).catch(error => {
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise;
}

/** Retained coordinates are [west, south, east, north], not lat/lng pairs. */
export function googleBounds(bounds: readonly [number, number, number, number]): google.maps.LatLngBoundsLiteral {
  const [west, south, east, north] = bounds;
  if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north ||
      Math.abs(west) > 180 || Math.abs(east) > 180 || Math.abs(south) > 90 || Math.abs(north) > 90)
    throw new Error("The retained map bounds are invalid.");
  return { west, south, east, north };
}

/** Fit the real raster after layout, not the earlier hub-sized viewport. */
export function fitAerialMap(map: google.maps.Map, aerial: AerialView) {
  const bounds = googleBounds(aerial.imageBounds ?? aerial.bounds);
  const element = map.getDiv();
  const projection = map.getProjection();
  if (!element.clientWidth || !element.clientHeight) return;
  if (!projection) { map.fitBounds(bounds, 16); return; }
  const southwest = projection.fromLatLngToPoint(new google.maps.LatLng(bounds.south, bounds.west));
  const northeast = projection.fromLatLngToPoint(new google.maps.LatLng(bounds.north, bounds.east));
  if (!southwest || !northeast) { map.fitBounds(bounds, 16); return; }
  const width = Math.max(1, element.clientWidth - 32);
  const height = Math.max(1, element.clientHeight - 48);
  const zoom = Math.min(18, Math.log2(Math.min(width / Math.abs(northeast.x - southwest.x), height / Math.abs(southwest.y - northeast.y))));
  const center = projection.fromPointToLatLng(new google.maps.Point((southwest.x + northeast.x) / 2, (southwest.y + northeast.y) / 2));
  if (center && Number.isFinite(zoom)) { map.setCenter(center); map.setZoom(zoom); }
}

export function positionedSites(sites: MapSite[], aerial?: AerialView) {
  return sites.filter(validCoordinates).filter(site => !aerial || isEligibleAerialSite(site, aerial));
}

/** Separate orientation layer, never an address-match or a city-centroid promotion. */
export function aerialCampusReferences(sites: MapSite[], aerial?: AerialView) {
  if (!aerial) return [];
  return sites.filter(validCoordinates).filter(site =>
    site.evidence === "baseline" &&
    site.precision === "campus_reference_address" &&
    site.referenceType === "campus_reference_address" &&
    site.sourceIds.length > 0 &&
    aerial.siteIds.includes(site.id)
  );
}

export interface ProjectedPoint { x: number; y: number }
/** Connected pixel-distance groups avoid overlapping markers even across grid boundaries. */
export function clusterProjected<T>(
  items: readonly T[],
  project: (item: T) => ProjectedPoint,
  distance: number
): T[][] {
  const points = items.map(project);
  const parents = items.map((_, i) => i);
  const root = (i: number): number => {
    while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
    return i;
  };
  const cells = new Map<string, number[]>();
  points.forEach((point, i) => {
    const x = Math.floor(point.x / distance), y = Math.floor(point.y / distance);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const j of cells.get(`${x + dx}:${y + dy}`) || []) {
        if (Math.hypot(point.x - points[j].x, point.y - points[j].y) < distance)
          parents[root(i)] = root(j);
      }
    }
    const key = `${x}:${y}`;
    cells.set(key, [...(cells.get(key) || []), i]);
  });
  const groups = new Map<number, T[]>();
  items.forEach((item, i) => {
    const key = root(i);
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return [...groups.values()];
}

/** Native Google overlay: DOM text, real map projection, keyboard-accessible buttons. */
export function domMapOverlay(
  map: google.maps.Map,
  position: google.maps.LatLngLiteral,
  element: HTMLElement
): google.maps.OverlayView {
  class Pin extends google.maps.OverlayView {
    onAdd() {
      element.classList.add("gmap-pin-root");
      this.getPanes()?.overlayMouseTarget.appendChild(element);
      google.maps.OverlayView.preventMapHitsAndGesturesFrom(element);
    }
    draw() {
      const point = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(position));
      if (point) { element.style.left = `${point.x}px`; element.style.top = `${point.y}px`; }
    }
    onRemove() { element.remove(); }
  }
  const overlay = new Pin();
  overlay.setMap(map);
  return overlay;
}

/** Restrained 2D geography; no map ID or vector/3D dependency is required. */
export const MUTED_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#eeeee9" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#65665f" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f7f7f3" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d8e1e3" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e9ece5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#d7d5ca" }] },
  { featureType: "road.highway", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#bbbfba" }] },
];

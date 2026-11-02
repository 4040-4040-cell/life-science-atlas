import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Crosshair, Image as ImageIcon, Layers, RotateCcw } from "lucide-react";
import type { AerialView, AtlasRegion, CompanySummary, MapSite, Zone } from "@shared/atlas";
import { count, precisionOf, safeUrl } from "@/lib/atlas";
import {
  aerialCampusReferences, clusterProjected, domMapOverlay, fitAerialMap, googleBounds, loadGoogleMaps,
  MAP_AUTH_ERROR_EVENT, MUTED_MAP_STYLES, positionedSites,
} from "@/lib/googleMap";
import "./GoogleAtlasMap.css";

function siteLabel(site: MapSite, company?: CompanySummary) {
  if (company?.kind === "institution_reference" || /campus|institution/i.test(`${site.referenceType || ""} ${site.precision}`))
    return precisionOf(site) === "research" ? "Unchecked campus reference" : "Campus reference · not a verified company suite";
  return precisionOf(site) === "address" ? "Address-matched" : precisionOf(site) === "research" ? "Unchecked research" : "City context · not an address";
}
function markerStyle(site: MapSite) {
  return precisionOf(site) !== "research" && site.precision === "campus_reference_address" ? "campus" : precisionOf(site);
}
function siteContext(site: MapSite) {
  return [site.address, site.city].filter(Boolean).join(" · ") || "Address not disclosed";
}
function companyLogo(company?: CompanySummary) {
  const src = safeUrl(company?.logoUrl);
  if (!src) return null;
  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  return image;
}

function useManagedMap(
  ref: RefObject<HTMLDivElement | null>, identity: string,
  latitude: number, longitude: number, zoom: number, minZoom = 2
) {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let instance: google.maps.Map | undefined;
    let resize: ResizeObserver | undefined;
    let tileTimer: ReturnType<typeof setTimeout> | undefined;
    let loaded: google.maps.MapsEventListener | undefined;
    setMap(null);
    setState("loading");
    setMessage("");
    const fail = (error: unknown) => {
      if (!active) return;
      clearTimeout(tileTimer);
      setMessage(error instanceof Error ? error.message : "The geographic map could not be loaded.");
      setState("error");
    };
    const authFailure = () => fail(new Error("The managed map service could not authorize this map."));
    window.addEventListener(MAP_AUTH_ERROR_EVENT, authFailure);
    loadGoogleMaps().then(maps => {
      if (!active || !ref.current) return;
      instance = new maps.Map(ref.current, {
        center: { lat: latitude, lng: longitude }, zoom, minZoom, maxZoom: 20,
        mapTypeId: maps.MapTypeId.ROADMAP,
        renderingType: maps.RenderingType.RASTER,
        isFractionalZoomEnabled: true,
        styles: MUTED_MAP_STYLES,
        tilt: 0, heading: 0, clickableIcons: false,
        mapTypeControl: false, streetViewControl: false,
        fullscreenControl: true,
        fullscreenControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
        zoomControl: true,
        zoomControlOptions: { position: maps.ControlPosition.RIGHT_CENTER },
        gestureHandling: "cooperative", keyboardShortcuts: true,
      });
      tileTimer = setTimeout(() => fail(new Error("The geographic map did not finish loading. Check your connection and retry.")), 25000);
      loaded = maps.event.addListenerOnce(instance, "tilesloaded", () => {
        if (!active) return;
        clearTimeout(tileTimer);
        setState("ready");
      });
      const current = instance;
      resize = new ResizeObserver(() => maps.event.trigger(current, "resize"));
      resize.observe(ref.current);
      setMap(instance);
    }).catch(fail);
    return () => {
      active = false;
      clearTimeout(tileTimer);
      loaded?.remove();
      resize?.disconnect();
      window.removeEventListener(MAP_AUTH_ERROR_EVENT, authFailure);
      if (instance) google.maps.event.clearInstanceListeners(instance);
    };
  }, [identity, latitude, longitude, zoom, minZoom, attempt, ref]);
  return { map, state, message, retry: () => setAttempt(value => value + 1) };
}

function MapServiceState({ state, message, retry }: {
  state: "loading" | "ready" | "error"; message: string; retry: () => void;
}) {
  if (state === "ready") return null;
  return <div className="gmap-service-state" role={state === "error" ? "alert" : "status"}>
    <strong>{state === "error" ? "Map unavailable" : "Loading geographic map"}</strong>
    <p>{state === "error" ? message : "Connecting to the managed Google Maps service…"}</p>
    {state === "error" && <button type="button" onClick={retry}><RotateCcw size={14} />Retry map</button>}
  </div>;
}

function projected(map: google.maps.Map, latitude: number, longitude: number) {
  const point = map.getProjection()?.fromLatLngToPoint(new google.maps.LatLng(latitude, longitude));
  const scale = 2 ** (map.getZoom() || 0);
  return { x: (point?.x || 0) * scale, y: (point?.y || 0) * scale };
}
function averagePosition<T>(items: T[], position: (item: T) => [number, number]) {
  const values = items.map(position);
  return { lat: values.reduce((sum, value) => sum + value[0], 0) / values.length,
    lng: values.reduce((sum, value) => sum + value[1], 0) / values.length };
}

export function OverviewMap({ regions, onRegion }: { regions: AtlasRegion[]; onRegion: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onRegionRef = useRef(onRegion);
  onRegionRef.current = onRegion;
  const service = useManagedMap(ref, "overview", 39, -48, 3, 1);
  const { map } = service;
  useEffect(() => {
    if (!map || !regions.length) return;
    const valid = regions.filter(region => region.center.every(Number.isFinite) && Math.abs(region.center[0]) <= 90 && Math.abs(region.center[1]) <= 180);
    if (!valid.length) return;
    const bounds = new google.maps.LatLngBounds();
    valid.forEach(region => bounds.extend({ lat: region.center[0], lng: region.center[1] }));
    map.fitBounds(bounds, { top: 56, left: 68, bottom: 72, right: 68 });
    const popup = new google.maps.InfoWindow({ maxWidth: 340 });
    let popupOpen = false;
    let overlays: google.maps.OverlayView[] = [];
    const draw = () => {
      if (!map.getProjection() || popupOpen) return;
      overlays.forEach(overlay => overlay.setMap(null));
      overlays = [];
      const groups = clusterProjected(valid, region => projected(map, ...region.center), 100);
      for (const group of groups) {
        const position = averagePosition(group, region => region.center);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gmap-overview-pin";
        const value = document.createElement("strong");
        value.textContent = count(group.reduce((total, region) => total + region.baselineCompanies, 0));
        const label = document.createElement("span");
        label.textContent = group.length === 1 ? group[0].name : `${group.length} regional hubs`;
        button.append(value, label);
        button.title = group.map(region => `${region.name}: ${count(region.baselineCompanies)} source-supported profiles`).join("; ");
        button.setAttribute("aria-label", `${button.title}. ${group.length > 1 ? "Open regional list" : "Open hub"}`);
        button.onclick = () => {
          if (group.length === 1) { onRegionRef.current(group[0].id); return; }
          const content = document.createElement("div");
          content.className = "gmap-region-popup";
          const title = document.createElement("h4");
          title.textContent = "Select a regional hub";
          content.append(title);
          group.forEach(region => {
            const row = document.createElement("button");
            row.type = "button";
            const name = document.createElement("strong"); name.textContent = region.name;
            const countLabel = document.createElement("span"); countLabel.textContent = `${count(region.baselineCompanies)} profiles`;
            row.append(name, countLabel);
            row.onclick = () => onRegionRef.current(region.id);
            content.append(row);
          });
          popup.setContent(content);
          popup.setPosition(position);
          popupOpen = true;
          popup.open({ map, shouldFocus: true });
        };
        overlays.push(domMapOverlay(map, position, button));
      }
    };
    const close = popup.addListener("closeclick", () => { popupOpen = false; draw(); });
    const idle = map.addListener("idle", draw);
    const zoom = map.addListener("zoom_changed", () => { popup.close(); popupOpen = false; });
    draw();
    return () => { idle.remove(); zoom.remove(); close.remove(); popup.close(); overlays.forEach(overlay => overlay.setMap(null)); };
  }, [map, regions]);
  return <div className="overview-map google-atlas-map">
    <div ref={ref} className="google-map-canvas" role="region" aria-label="Interactive regional index map. Numbered markers show profile totals; grouped hubs open a list of every region." />
    <div className="gmap-overview-note"><span className="eyebrow">RESEARCH GEOGRAPHIES</span><span>Select a hub · grouped markers open a regional list</span></div>
    <MapServiceState {...service} />
  </div>;
}

/** Dashed study frames use native geographic paths; they never determine raster placement. */
function studyFrame(map: google.maps.Map, bounds: [number, number, number, number], aerial: boolean, label: string) {
  const { west, south, east, north } = googleBounds(bounds);
  const rectangle = new google.maps.Rectangle({ map, bounds: { west, south, east, north }, strokeOpacity: 0,
    fillColor: aerial ? "#d1262b" : "#888b80", fillOpacity: aerial ? 0 : 0.035, clickable: !aerial });
  const line = new google.maps.Polyline({ map,
    path: [{ lat: south, lng: west }, { lat: north, lng: west }, { lat: north, lng: east }, { lat: south, lng: east }, { lat: south, lng: west }],
    strokeOpacity: 0, clickable: false,
    icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: aerial ? "#d1262b" : "#898c81", strokeWeight: 1, scale: 2 }, offset: "0", repeat: "10px" }],
  });
  const popup = new google.maps.InfoWindow();
  const click = rectangle.addListener("click", (event: google.maps.MapMouseEvent) => {
    const content = document.createElement("div"); content.textContent = label;
    popup.setContent(content); popup.setPosition(event.latLng); popup.open({ map });
  });
  return () => { click.remove(); popup.close(); rectangle.setMap(null); line.setMap(null); };
}

export function AtlasMap({ region, sites, companies, zones, aerial, onCompany }: {
  region: AtlasRegion; sites: MapSite[]; companies?: CompanySummary[]; zones: Zone[];
  aerial?: AerialView; onCompany: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCompanyRef = useRef(onCompany);
  onCompanyRef.current = onCompany;
  const [showZones, setShowZones] = useState(true);
  const [showLogos, setShowLogos] = useState(true);
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">("loading");
  const [imageRetry, setImageRetry] = useState(0);
  const service = useManagedMap(ref, region.id, ...region.center, region.zoom);
  const { map } = service;
  const eligible = useMemo(() => positionedSites(sites, aerial), [sites, aerial]);
  const campusReferences = useMemo(() => aerialCampusReferences(sites, aerial), [sites, aerial]);
  const markerSites = useMemo(() => [...eligible, ...campusReferences], [eligible, campusReferences]);

  useEffect(() => {
    if (!map) return;
    if (!aerial) { map.setCenter({ lat: region.center[0], lng: region.center[1] }); map.setZoom(region.zoom); return; }
    let firstFrame = 0, secondFrame = 0;
    const fitAfterLayout = () => {
      cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => fitAerialMap(map, aerial)); });
    };
    const fitResize = new ResizeObserver(fitAfterLayout);
    fitResize.observe(map.getDiv());
    const projectionReady = map.addListener("projection_changed", fitAfterLayout);
    fitAfterLayout();
    const clearFrame = studyFrame(map, aerial.bounds, true, "Analytical study frame, not an official boundary");
    let current = true;
    let overlay: google.maps.GroundOverlay | undefined;
    const image = new window.Image();
    const imageTimer = setTimeout(() => { if (current) setImageState("error"); }, 25000);
    setImageState("loading");
    image.onload = () => {
      if (!current) return;
      clearTimeout(imageTimer);
      // The raster's original georeferencing is independent of the analytical study frame.
      overlay = new google.maps.GroundOverlay(aerial.imageUrl, googleBounds(aerial.imageBounds ?? aerial.bounds), { opacity: 1, clickable: false });
      overlay.setMap(map);
      fitAfterLayout();
      setImageState("ready");
    };
    image.onerror = () => { clearTimeout(imageTimer); if (current) setImageState("error"); };
    const imageUrl = safeUrl(aerial.imageUrl);
    if (imageUrl) image.src = imageUrl;
    else setImageState("error");
    return () => { current = false; clearTimeout(imageTimer); cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); fitResize.disconnect(); projectionReady.remove(); image.onload = null; image.onerror = null; overlay?.setMap(null); clearFrame(); };
  }, [map, aerial, imageRetry, region.center[0], region.center[1], region.zoom]);

  useEffect(() => {
    if (!map || !showZones || aerial) return;
    const clear = zones.map(zone => studyFrame(map, zone.bounds, false, `${zone.name} · analytical frame, not an official boundary`));
    return () => clear.forEach(remove => remove());
  }, [map, zones, showZones, aerial]);

  useEffect(() => {
    if (!map) return;
    const companyById = new Map(companies?.map(company => [company.id, company]));
    const popup = new google.maps.InfoWindow({ maxWidth: 360 });
    let popupOpen = false;
    let overlays: google.maps.OverlayView[] = [];
    const draw = () => {
      if (!map.getProjection() || popupOpen) return;
      overlays.forEach(overlay => overlay.setMap(null));
      overlays = [];
      const groups = clusterProjected(markerSites, site => projected(map, site.latitude, site.longitude), 42);
      const center = map.getCenter();
      const centerPoint = center ? projected(map, center.lat(), center.lng()) : { x: 0, y: 0 };
      const size = { width: ref.current?.clientWidth || 0, height: ref.current?.clientHeight || 0 };
      const points = groups.map(group => {
        const point = projected(map, group[0].latitude, group[0].longitude);
        return { x: point.x - centerPoint.x + size.width / 2, y: point.y - centerPoint.y + size.height / 2 };
      });
      const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
      groups.forEach((group, index) => {
        const site = group[0], company = companyById.get(site.profileId);
        const ids = new Set(group.map(record => record.profileId));
        const precision = group.every(record => markerStyle(record) === "address") ? "address" : group.some(record => markerStyle(record) === "research") ? "research" : group.some(record => markerStyle(record) === "campus") ? "campus" : "city";
        const clustered = group.length > 1;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `gmap-site-pin ${precision}${clustered ? " is-cluster" : ""}`;
        const dot = document.createElement("span"); dot.className = "gmap-site-dot";
        dot.textContent = clustered ? String(ids.size) : "";
        button.append(dot);
        button.title = clustered ? `${ids.size} profiles / ${group.length} site records. Open every record.` : `${site.company} · ${siteLabel(site, company)} · ${siteContext(site)}. Logos identify companies, not verified occupancy.`;
        button.setAttribute("aria-label", button.title);
        button.onclick = () => {
          if (!clustered) { onCompanyRef.current(site.profileId); return; }
          const content = document.createElement("div"); content.className = "gmap-company-popup";
          const title = document.createElement("h4"); title.textContent = `${ids.size} profiles · ${group.length} site records`;
          const note = document.createElement("p"); note.textContent = "Overlapping records are listed individually. City/campus references and logos do not verify occupied premises or suites.";
          content.append(title, note);
          [...group].sort((a, b) => a.company.localeCompare(b.company) || a.id.localeCompare(b.id)).forEach(record => {
            const row = document.createElement("button"); row.type = "button";
            const recordCompany = companyById.get(record.profileId);
            const logo = companyLogo(recordCompany);
            if (logo) { logo.className = "gmap-popup-logo"; logo.onerror = () => logo.remove(); row.append(logo); }
            const details = document.createElement("span");
            const name = document.createElement("strong"); name.textContent = record.company;
            const badge = document.createElement("span"); badge.className = `gmap-site-badge ${markerStyle(record)}`; badge.textContent = siteLabel(record, recordCompany);
            const context = document.createElement("small"); context.textContent = siteContext(record);
            details.append(name, badge, context); row.append(details);
            row.onclick = () => onCompanyRef.current(record.profileId);
            content.append(row);
          });
          popup.setContent(content); popup.setPosition({ lat: site.latitude, lng: site.longitude });
          popupOpen = true; popup.open({ map, shouldFocus: true });
        };
        // Genuine supplied logos only, at the actual pin coordinate, with collision checks.
        const showCallout = !clustered && (showLogos || (map.getZoom() || 0) >= 14);
        if (showCallout) {
          const logo = companyLogo(company);
          const point = points[index];
          const box = { left: point.x + 14, right: point.x + 214, top: point.y - 33, bottom: point.y + 33 };
          const fits = box.left >= 8 && box.right <= size.width - 64 && box.top >= 70 && box.bottom <= size.height - 160;
          const collides = occupied.some(other => box.left < other.right + 10 && box.right > other.left - 10 && box.top < other.bottom + 10 && box.bottom > other.top - 10) || points.some((other, otherIndex) => otherIndex !== index && other.x >= box.left - 10 && other.x <= box.right + 10 && other.y >= box.top - 10 && other.y <= box.bottom + 10);
          if (fits && !collides) {
            const card = document.createElement("span"); card.className = "gmap-logo-callout"; card.setAttribute("aria-hidden", "true");
            if (logo) { logo.onerror = () => logo.remove(); card.append(logo); }
            const details = document.createElement("span");
            const name = document.createElement("strong"); name.textContent = company?.name || site.company;
            const badge = document.createElement("span"); badge.className = `gmap-site-badge ${precision}`; badge.textContent = siteLabel(site, company);
            const context = document.createElement("small"); context.textContent = siteContext(site);
            details.append(name, badge, context); card.append(details); button.append(card); occupied.push(box);
          }
        }
        overlays.push(domMapOverlay(map, { lat: site.latitude, lng: site.longitude }, button));
      });
    };
    const idle = map.addListener("idle", draw);
    const zoom = map.addListener("zoom_changed", () => { popup.close(); popupOpen = false; });
    const close = popup.addListener("closeclick", () => { popupOpen = false; draw(); });
    draw();
    return () => { idle.remove(); zoom.remove(); close.remove(); popup.close(); overlays.forEach(overlay => overlay.setMap(null)); };
  }, [map, markerSites, companies, showLogos]);

  function resetView() {
    if (!map) return;
    if (aerial) fitAerialMap(map, aerial);
    else { map.setCenter({ lat: region.center[0], lng: region.center[1] }); map.setZoom(region.zoom); }
  }
  return <div className={`atlas-map google-atlas-map ${aerial ? "is-aerial" : ""}`}>
    <div ref={ref} className="google-map-canvas" role="region" aria-label={`${region.name} ${aerial ? aerial.title + " aerial exhibit" : "company geography"}. The city list and company matrix are alternatives to map markers.`} />
    <div className="map-toolbar">
      <span className="map-mode-label"><span />{aerial ? "RETAINED AERIAL EXHIBIT" : "REGIONAL GEOGRAPHY"}</span>
      <div>
        <button type="button" className={`map-tool ${showLogos ? "selected" : ""}`} onClick={() => setShowLogos(value => !value)} title="Show available company logos at wider zooms; detail zoom shows isolated logos automatically" aria-label="Show company logos at wider zooms" aria-pressed={showLogos}><ImageIcon size={14} /><span>Show logos</span></button>
        {!aerial && zones.length > 0 && <button type="button" className={`map-tool ${showZones ? "selected" : ""}`} onClick={() => setShowZones(value => !value)} title="Toggle analytical frames" aria-pressed={showZones}><Layers size={14} /><span>Frames</span></button>}
        <button type="button" className="map-tool" onClick={resetView} title="Reset map view"><Crosshair size={15} /><span>Reset</span></button>
      </div>
    </div>
    <div className="map-bottom-label">
      <strong>{aerial ? `${count(eligible.length)} address-matched sites${campusReferences.length ? ` · ${count(campusReferences.length)} campus reference${campusReferences.length === 1 ? "" : "s"}` : ""}` : `${count(eligible.length)} positioned site records`}</strong>
      <span>{aerial ? campusReferences.length ? "Address dots: linked baseline sites · dashed squares: campus references" : "Only exhibit-linked, address-matched baseline sites" : "Zoom to separate points · select a numbered cluster for every record"}</span>
      <span>Logos identify companies, not verified building occupancy.</span>
    </div>
    {aerial && <div className="gmap-aerial-credit">{aerial.attribution}</div>}
    {!markerSites.length && service.state === "ready" && <div className="map-no-records">{sites.length ? "No eligible mapped sites for this view and these filters." : "No site records match the current filters."}</div>}
    {aerial && imageState !== "ready" && service.state === "ready" && <div className="gmap-image-state" role={imageState === "error" ? "alert" : "status"}>
      <strong>{imageState === "error" ? "Aerial image could not be loaded" : "Loading retained aerial image"}</strong>
      <p>{imageState === "error" ? "The geographic basemap is not the retained aerial exhibit." : "Loading the source raster at its original geographic bounds…"}</p>
      {imageState === "error" && <button type="button" onClick={() => setImageRetry(value => value + 1)}><RotateCcw size={13} />Retry imagery</button>}
    </div>}
    <MapServiceState {...service} />
  </div>;
}

export function MapLegend({ aerial = false }: { aerial?: boolean }) {
  return <div className="map-legend">
    <span><i className="legend-dot address" />Address-matched</span>
    <span><i className="gmap-legend-campus" />Campus reference · not a verified company suite</span>
    {!aerial && <><span><i className="legend-dot city" />City context</span><span><i className="legend-dot research" />Unchecked research</span><span className="legend-note">Dashed frames are analytical, not official boundaries.</span></>}
    {aerial && <><span><i className="legend-frame" />Analytical study frame, not an official boundary</span><span className="legend-note">No city-centroid or unchecked import pins are shown.</span></>}
  </div>;
}

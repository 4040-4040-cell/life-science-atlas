import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Image, Layers, RotateCcw } from "lucide-react";
import type {
  AerialView,
  AtlasRegion,
  CompanySummary,
  MapSite,
  Zone,
} from "@shared/atlas";
import { count, precisionOf, safeUrl, validCoordinates } from "@/lib/atlas";
import {
  toLeafletBounds as asBounds,
  isEligibleAerialSite,
} from "@/lib/geography";

const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_CREDIT =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

function siteLabel(site: MapSite, company?: CompanySummary) {
  if (
    company?.kind === "institution_reference" ||
    /campus|institution/i.test(`${site.referenceType || ""} ${site.precision}`)
  )
    return precisionOf(site) === "research"
      ? "Unchecked campus reference"
      : "Campus reference · not suite-verified";
  return precisionOf(site) === "address"
    ? "Address-matched"
    : precisionOf(site) === "research"
      ? "Unchecked research"
      : "City context · not an address";
}

function siteContext(site: MapSite) {
  return (
    [site.address, site.city].filter(Boolean).join(" · ") ||
    "Address not disclosed"
  );
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

function baseMap(
  element: HTMLDivElement,
  center: [number, number],
  zoom: number
) {
  const map = L.map(element, {
    center,
    zoom,
    zoomControl: false,
    scrollWheelZoom: false,
    maxZoom: 19,
    minZoom: 2,
  });
  L.tileLayer(TILE_URL, {
    attribution: TILE_CREDIT,
    maxZoom: 20,
    subdomains: "abcd",
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  return map;
}

export function OverviewMap({
  regions,
  onRegion,
}: {
  regions: AtlasRegion[];
  onRegion: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onRegionRef = useRef(onRegion);
  onRegionRef.current = onRegion;
  useEffect(() => {
    if (!ref.current || !regions.length) return;
    const map = baseMap(ref.current, [39, -48], 3);
    map.setMinZoom(1);
    map.fitBounds(L.latLngBounds(regions.map(region => region.center)), {
      padding: [38, 38],
      maxZoom: 4,
    });
    regions.forEach(region => {
      const marker = L.marker(region.center, {
        icon: L.divIcon({
          className: "overview-map-pin",
          html: `<span>${count(region.baselineCompanies)}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
        keyboard: true,
        title: `${region.name}: ${region.baselineCompanies} source-supported profiles`,
      }).addTo(map);
      const label = document.createElement("span");
      label.textContent = region.name;
      marker.bindTooltip(label, { direction: "top", offset: [0, -18] });
      marker.on("click", () => onRegionRef.current(region.id));
    });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      map.remove();
    };
  }, [regions]);
  return (
    <div className="overview-map">
      <div
        ref={ref}
        className="leaflet-canvas"
        role="region"
        aria-label="Interactive regional index map. Select a hub marker or use the regional index."
      />
      <div className="map-stamp">
        <span className="eyebrow">RESEARCH GEOGRAPHIES</span>
        <strong>
          One atlas.
          <br />
          Distinct local markets.
        </strong>
        <p>
          Marker values show source-supported profiles.
          <br />
          Select a hub to inspect the evidence.
        </p>
      </div>
    </div>
  );
}

export function AtlasMap({
  region,
  sites,
  companies,
  zones,
  aerial,
  onCompany,
}: {
  region: AtlasRegion;
  sites: MapSite[];
  companies?: CompanySummary[];
  zones: Zone[];
  aerial?: AerialView;
  onCompany: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [showLogos, setShowLogos] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const onCompanyRef = useRef(onCompany);
  onCompanyRef.current = onCompany;
  const eligible = sites
    .filter(validCoordinates)
    .filter(site => !aerial || isEligibleAerialSite(site, aerial));
  const markerSites = useRef(eligible);
  markerSites.current = eligible;

  useEffect(() => {
    if (!ref.current) return;
    const map = baseMap(ref.current, region.center, region.zoom);
    instance.current = map;
    layer.current = L.layerGroup().addTo(map);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      map.remove();
      instance.current = null;
      layer.current = null;
    };
  }, [region.id, region.center[0], region.center[1], region.zoom]);

  useEffect(() => {
    const map = instance.current;
    if (!map || !aerial) {
      setImageError(false);
      return;
    }
    setImageError(false);
    const image = L.imageOverlay(
      aerial.imageUrl,
      asBounds(aerial.imageBounds ?? aerial.bounds),
      {
        opacity: 1,
        interactive: false,
        zIndex: 250,
      }
    ).addTo(map);
    image.on("error", () => setImageError(true));
    const studyFrame = L.rectangle(asBounds(aerial.bounds), {
      color: "#d1262b",
      weight: 1,
      dashArray: "6 4",
      fillOpacity: 0,
      interactive: false,
    }).addTo(map);
    map.fitBounds(asBounds(aerial.bounds), { padding: [12, 12], maxZoom: 18 });
    return () => {
      map.removeLayer(image);
      map.removeLayer(studyFrame);
    };
  }, [aerial, imageRetry, region.id]);

  useEffect(() => {
    const map = instance.current;
    if (!map) return;
    const companyById = new Map(
      companies?.map(company => [company.id, company])
    );
    const draw = () => {
      layer.current?.clearLayers();
      const groups = new Map<string, typeof eligible>();
      for (const site of markerSites.current) {
        const point = map.project([site.latitude, site.longitude]);
        const key = `${Math.floor(point.x / 42)}:${Math.floor(point.y / 42)}`;
        groups.set(key, [...(groups.get(key) || []), site]);
      }
      const markerPoints = [...groups.values()].map(group =>
        map.latLngToContainerPoint([group[0].latitude, group[0].longitude])
      );
      const calloutBounds: L.Bounds[] = [];
      const size = map.getSize();
      for (const group of groups.values()) {
        const site = group[0];
        const company = companyById.get(site.profileId);
        const ids = new Set(group.map(s => s.profileId));
        const precision = group.every(s => precisionOf(s) === "address")
          ? "address"
          : group.some(s => precisionOf(s) === "research")
            ? "research"
            : "city";
        const clustered = group.length > 1;
        const dot = document.createElement("span");
        dot.textContent = clustered ? String(ids.size) : "";
        const marker = L.marker([site.latitude, site.longitude], {
          keyboard: true,
          riseOnHover: true,
          title: clustered
            ? `${ids.size} profiles / ${group.length} site records. Open list.`
            : `${site.company} · ${siteLabel(site, company)} · ${siteContext(site)}. Logo identifies the company, not verified occupancy.`,
          icon: L.divIcon({
            className: `atlas-marker ${precision} ${clustered ? "cluster" : ""}`,
            html: dot,
            iconSize: clustered ? [32, 32] : [18, 18],
            iconAnchor: clustered ? [16, 16] : [9, 9],
          }),
        });
        if (!clustered)
          marker.on("click", () => onCompanyRef.current(site.profileId));
        else {
          const popup = document.createElement("div");
          popup.className = "map-company-popup";
          const title = document.createElement("h4");
          title.textContent = `${site.city || "Shared location"} / ${ids.size} profiles`;
          popup.append(title);
          const note = document.createElement("p");
          note.textContent =
            "Overlapping records are listed individually. City/campus references do not verify occupied premises or suites. Logos identify companies, not occupancy.";
          popup.append(note);
          group
            .sort((a, b) => a.company.localeCompare(b.company))
            .forEach(record => {
              const button = document.createElement("button");
              button.type = "button";
              const recordCompany = companyById.get(record.profileId);
              const logo = companyLogo(recordCompany);
              if (logo) {
                logo.className = "map-popup-logo";
                logo.addEventListener("error", () => logo.remove(), {
                  once: true,
                });
                button.append(logo);
              }
              const details = document.createElement("span");
              const name = document.createElement("strong");
              name.textContent = record.company;
              const meta = document.createElement("small");
              const badge = document.createElement("span");
              badge.className = `map-site-badge ${precisionOf(record)}`;
              badge.textContent = siteLabel(record, recordCompany);
              meta.textContent = siteContext(record);
              details.append(name, badge, meta);
              button.append(details);
              button.addEventListener("click", () =>
                onCompanyRef.current(record.profileId)
              );
              popup.append(button);
            });
          marker.bindPopup(popup, {
            maxWidth: 340,
            minWidth: 260,
            maxHeight: 310,
          });
        }
        const tooltip = document.createElement("span");
        tooltip.textContent = clustered
          ? `${ids.size} profiles · open list`
          : `${site.company} · ${siteLabel(site, company)} · ${siteContext(site)}`;
        marker.bindTooltip(tooltip, { direction: "top" });
        marker.addTo(layer.current!);
        marker
          .getElement()
          ?.setAttribute("aria-label", marker.options.title || site.company);

        // Keep the precision dot at its actual coordinate. Add only genuine logos
        // to isolated singleton markers; do not obscure other dots or callouts.
        const logo =
          !clustered && (showLogos || map.getZoom() >= 14)
            ? companyLogo(company)
            : null;
        if (logo) {
          const point = map.latLngToContainerPoint([
            site.latitude,
            site.longitude,
          ]);
          const bounds = L.bounds(
            [point.x + 15, point.y - 32],
            [point.x + 195, point.y + 32]
          );
          const padded = L.bounds(
            [point.x + 5, point.y - 42],
            [point.x + 205, point.y + 42]
          );
          const fits =
            bounds.min!.x >= 8 &&
            bounds.max!.x <= size.x - 8 &&
            bounds.min!.y >= 60 &&
            bounds.max!.y <= size.y - 75;
          if (
            !fits ||
            calloutBounds.some(other => padded.intersects(other)) ||
            markerPoints.some(
              other => !other.equals(point) && padded.contains(other)
            )
          )
            continue;
          const card = document.createElement("div");
          card.className = "map-logo-callout";
          card.setAttribute("aria-hidden", "true");
          logo.addEventListener("error", () => card.remove(), { once: true });
          const details = document.createElement("div");
          const name = document.createElement("strong");
          name.textContent = company?.name || site.company;
          const badge = document.createElement("span");
          badge.className = `map-site-badge ${precision}`;
          badge.textContent = siteLabel(site, company);
          const context = document.createElement("small");
          context.textContent = siteContext(site);
          details.append(name, badge, context);
          card.append(logo, details);
          // Events bubble to the same keyboard-accessible Leaflet marker/profile ID.
          marker.getElement()?.append(card);
          calloutBounds.push(bounds);
        }
      }
    };
    draw();
    const redrawAfterMove = () => {
      // Opening an edge popup can auto-pan the map; do not destroy its rows.
      const popupOpen = layer.current
        ?.getLayers()
        .some(marker => marker instanceof L.Marker && marker.isPopupOpen());
      if (!popupOpen) draw();
    };
    map.on("zoomend resize", draw);
    map.on("moveend", redrawAfterMove);
    return () => {
      map.off("zoomend resize", draw);
      map.off("moveend", redrawAfterMove);
    };
  }, [sites, companies, showLogos, aerial, region.id]);

  useEffect(() => {
    const map = instance.current;
    if (!map || !showZones || aerial) return;
    const zoneLayer = L.layerGroup().addTo(map);
    zones.forEach(zone => {
      const label = document.createElement("span");
      label.textContent = `${zone.name} · analytical frame, not an official boundary`;
      L.rectangle(asBounds(zone.bounds), {
        color: "#b9b7b0",
        weight: 1,
        dashArray: "5 5",
        fillColor: "#a8a69e",
        fillOpacity: 0.035,
        interactive: true,
      })
        .bindTooltip(label, { sticky: true })
        .addTo(zoneLayer);
    });
    return () => {
      map.removeLayer(zoneLayer);
    };
  }, [zones, showZones, aerial, region.id]);

  function resetView() {
    if (aerial)
      instance.current?.fitBounds(asBounds(aerial.bounds), {
        padding: [12, 12],
        maxZoom: 18,
      });
    else instance.current?.setView(region.center, region.zoom);
  }
  return (
    <div className={`atlas-map ${aerial ? "is-aerial" : ""}`}>
      <div
        ref={ref}
        className="leaflet-canvas"
        role="region"
        aria-label={`${region.name} ${aerial ? aerial.title + " aerial exhibit" : "company geography"}. The adjacent city list and company matrix provide alternatives to map markers.`}
      />
      <div className="map-toolbar">
        <span className="map-mode-label">
          <span />
          {aerial ? "COMPLETED AERIAL EXHIBIT" : "REGIONAL GEOGRAPHY"}
        </span>
        <div>
          <button
            className={`map-tool ${showLogos ? "selected" : ""}`}
            onClick={() => setShowLogos(value => !value)}
            title="Show available company logos at wider zooms; detail zoom shows isolated logos automatically"
            aria-label="Show company logos at wider zooms"
            aria-pressed={showLogos}
          >
            <Image size={14} />
            <span>Show logos</span>
          </button>
          {!aerial && zones.length > 0 && (
            <button
              className={`map-tool ${showZones ? "selected" : ""}`}
              onClick={() => setShowZones(!showZones)}
              title="Toggle analytical frames"
              aria-pressed={showZones}
            >
              <Layers size={14} />
              <span>Frames</span>
            </button>
          )}
          <button
            className="map-tool"
            onClick={resetView}
            title="Reset map view"
          >
            <Crosshair size={15} />
            <span>Reset</span>
          </button>
        </div>
      </div>
      <div className="map-bottom-label">
        <strong>{count(eligible.length)} positioned site records</strong>
        <span>
          {aerial
            ? "Only exhibit-linked, address-matched baseline sites"
            : "Zoom to separate points · select a numbered cluster for all records"}
        </span>
        <span>Logos identify companies, not verified building occupancy.</span>
      </div>
      {!eligible.length && (
        <div className="map-no-records">
          {sites.length
            ? "No eligible mapped sites for this view and these filters."
            : "No site records match the current filters."}
        </div>
      )}
      {imageError && (
        <div className="map-image-error" role="alert">
          <strong>Aerial image could not be loaded</strong>
          <p>The basemap is not the completed aerial exhibit.</p>
          <button
            className="button button-small"
            onClick={() => setImageRetry(v => v + 1)}
          >
            <RotateCcw size={13} />
            Retry imagery
          </button>
        </div>
      )}
    </div>
  );
}
export function MapLegend({ aerial = false }: { aerial?: boolean }) {
  return (
    <div className="map-legend">
      <span>
        <i className="legend-dot address" />
        Address-matched
      </span>
      {!aerial && (
        <>
          <span>
            <i className="legend-dot city" />
            City context
          </span>
          <span>
            <i className="legend-dot research" />
            Unchecked research
          </span>
          <span className="legend-note">
            Dashed frames are analytical, not official boundaries.
          </span>
        </>
      )}
      {aerial && (
        <>
          <span>
            <i className="legend-frame" />
            Analytical study frame, not an official boundary
          </span>
          <span className="legend-note">
            No city-centroid or unchecked import pins are shown.
          </span>
        </>
      )}
    </div>
  );
}

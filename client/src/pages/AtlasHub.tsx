import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowUpRight, Image, Map, ShieldCheck } from "lucide-react";
import type { RegionResponse } from "@shared/atlas";
import {
  count,
  emptyFilters,
  filterRegionalWorkspace,
  safeUrl,
  useAtlas,
  type Filters,
} from "@/lib/atlas";
import {
  DownloadLink,
  Metric,
  PageHeader,
} from "@/components/atlas/AtlasShell";
import {
  EmptyState,
  ErrorState,
  External,
  Loading,
  SourceLinks,
} from "@/components/atlas/Primitives";
import { AtlasMap, MapLegend } from "@/components/atlas/AtlasMap";
import {
  CityCompanyIndex,
  CompanyFilters,
  CompanyMatrix,
} from "@/components/atlas/CompanyMatrix";

export default function AtlasHub({
  regionId,
  onCompany,
}: {
  regionId: string;
  onCompany: (id: string) => void;
}) {
  const query = useAtlas<RegionResponse>(
    `/regions/${encodeURIComponent(regionId)}`
  );
  const [filters, setFilters] = useState<Filters>({ ...emptyFilters });
  const [tab, setTab] = useState("map");
  const [aerialId, setAerialId] = useState("");
  useEffect(() => {
    setFilters({ ...emptyFilters });
    setTab("map");
    setAerialId("");
  }, [regionId]);
  useEffect(() => {
    if (
      query.data?.aerials.length &&
      !query.data.aerials.some(a => a.id === aerialId)
    )
      setAerialId(query.data.aerials[0].id);
  }, [query.data, aerialId]);
  const aerial = query.data?.aerials.find(view => view.id === aerialId);
  const workspaceFilters = useMemo(
    () => ({ ...filters, frame: tab === "aerial" ? aerialId : undefined }),
    [filters, tab, aerialId]
  );
  const workspace = useMemo(
    () =>
      filterRegionalWorkspace(
        query.data?.companies || [],
        query.data?.sites || [],
        workspaceFilters,
        tab === "aerial" ? aerial?.siteIds : undefined
      ),
    [query.data, workspaceFilters, tab, aerial]
  );
  const { companies, sites } = workspace;
  const region = query.data?.region;
  if (query.isLoading) return <Loading label="Opening regional evidence" />;
  if (query.isError)
    return (
      <>
        <PageHeader
          eyebrow="REGIONAL WORKSPACE"
          title="The evidence is not yet connected."
        />
        <ErrorState
          retry={() => query.refetch()}
          message={query.error.message}
        />
        <Link className="text-link return-link" href="/">
          <ArrowLeft size={14} />
          Back to all hubs
        </Link>
      </>
    );
  if (!query.data || !region) return null;
  return (
    <>
      <Link className="breadcrumb" href="/">
        <ArrowLeft size={12} />
        ALL HUBS<span>/</span>
        {region.country}
      </Link>
      <PageHeader
        eyebrow="REGIONAL OCCUPIER INTELLIGENCE"
        title={region.name}
        description={region.geography}
      >
        <DownloadLink url={safeUrl(region.pdfUrl)}>
          Regional exhibit PDF
        </DownloadLink>
      </PageHeader>
      <div className="metric-strip hub-metrics">
        <Metric
          label="SOURCE-SUPPORTED"
          value={region.baselineCompanies}
          note="Baseline company profiles"
        />
        <Metric
          label="RESEARCH IMPORTS"
          value={region.researchCompanies}
          note="Not independently verified"
        />
        <Metric
          label="ADDRESS-LEVEL RECORDS"
          value={region.preciseSites}
          note={`${count(region.sites)} total site records`}
        />
        <Metric
          label="AERIAL EXHIBITS"
          value={region.aerialCount}
          note={
            region.aerialCount
              ? "Completed attributed frames"
              : "Macro geography in this release"
          }
        />
      </div>
      <div className="workspace-heading">
        <div
          className="workspace-tabs"
          role="tablist"
          aria-label="Regional views"
        >
          <button
            role="tab"
            aria-selected={tab === "map"}
            className={tab === "map" ? "active" : ""}
            onClick={() => setTab("map")}
          >
            <Map size={15} />
            Hub map
          </button>
          {query.data.aerials.length > 0 && (
            <button
              role="tab"
              aria-selected={tab === "aerial"}
              className={tab === "aerial" ? "active" : ""}
              onClick={() => setTab("aerial")}
            >
              <Image size={15} />
              Aerial exhibits<span>{query.data.aerials.length}</span>
            </button>
          )}
        </div>
        <div className="workspace-live">
          <span />
          {count(companies.length)} MATCHING PROFILES
        </div>
      </div>
      <CompanyFilters
        filters={workspaceFilters}
        onChange={setFilters}
        companies={query.data.companies}
        regionId={regionId}
      />
      {tab === "aerial" && aerial && (
        <div className="aerial-selector">
          <div>
            <span className="eyebrow">COMPLETED REGIONAL EXHIBITS</span>
            <label htmlFor="aerial-view-select">
              Select an analytical frame
            </label>
          </div>
          <select
            id="aerial-view-select"
            value={aerialId}
            onChange={e => setAerialId(e.target.value)}
          >
            {query.data.aerials.map(view => (
              <option key={view.id} value={view.id}>
                {view.title}
              </option>
            ))}
          </select>
          <span>
            {query.data.aerials.findIndex(a => a.id === aerialId) + 1} /{" "}
            {query.data.aerials.length}
          </span>
        </div>
      )}
      <section
        className="map-workspace"
        aria-label={
          tab === "map"
            ? "Regional geography and company index"
            : "Aerial exhibit and company index"
        }
      >
        <div className="map-column">
          <AtlasMap
            key={`${regionId}-${tab}`}
            region={region}
            sites={sites}
            companies={companies}
            zones={query.data.zones}
            aerial={tab === "aerial" ? aerial : undefined}
            onCompany={onCompany}
          />
          <MapLegend aerial={tab === "aerial"} />
        </div>
        <CityCompanyIndex
          sites={sites}
          companies={companies}
          onCompany={onCompany}
        />
      </section>
      {tab === "aerial" && aerial ? (
        <section className="aerial-caption">
          <div className="aerial-caption-title">
            <span className="eyebrow">IMAGERY & PROVENANCE</span>
            <h3>{aerial.title}</h3>
            <p>{aerial.attribution}</p>
          </div>
          <div className="aerial-caption-meta">
            <div>
              <b>CAPTURE VINTAGE</b>
              <span>
                {aerial.captureYears.length
                  ? aerial.captureYears.join(" / ")
                  : "Acquisition date unconfirmed"}
              </span>
            </div>
            <p>
              {aerial.captureNote ||
                "Capture date has not been independently confirmed."}
            </p>
            <p>
              Analytical frame, not an official market boundary. Exhibit-linked,
              address-matched baseline sites only; imagery does not verify
              current occupancy.
            </p>
            <SourceLinks
              ids={aerial.sources.map(source => source.id)}
              sources={aerial.sources}
            />
          </div>
          <div className="aerial-links">
            <External url={aerial.exhibitUrl}>Open full exhibit</External>
            <DownloadLink url={safeUrl(region.pdfUrl)}>
              Regional PDF
            </DownloadLink>
          </div>
        </section>
      ) : (
        <div className="regional-context">
          <ShieldCheck size={17} />
          <p>
            {region.description}
            <span>
              City-reference coordinates do not locate occupied premises.
              Unchecked imports remain a separate research layer; analytical
              frames are not official JLL submarket boundaries.
            </span>
          </p>
          {safeUrl(region.macroUrl) && (
            <External url={region.macroUrl}>Source hub map</External>
          )}
        </div>
      )}
      <CompanyMatrix
        regionId={regionId}
        filters={workspaceFilters}
        companies={companies}
        onCompany={onCompany}
        onReset={() => setFilters({ ...emptyFilters })}
      />
    </>
  );
}

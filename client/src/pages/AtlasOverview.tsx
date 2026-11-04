import { Link, useLocation } from "wouter";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen } from "lucide-react";
import type { OverviewResponse } from "@shared/atlas";
import { count, dateLabel, useAtlas } from "@/lib/atlas";
import { regionPresentation } from "@/lib/regionPresentation";
import { DownloadLink, Metric, PageHeader } from "@/components/atlas/AtlasShell";
import { ErrorState, Loading } from "@/components/atlas/Primitives";
import { OverviewMap } from "@/components/atlas/AtlasMap";
import { OfflineOverviewMap } from "@/components/atlas/OfflineAtlasMap";
import { isAtlasOffline } from "@/lib/offlineAtlas";
import printAssets from "../lib/marketPrintAssetsV4.json";
import offlineDownload from "../lib/offlineDownload.json";

export default function AtlasOverview() {
  const query = useAtlas<OverviewResponse>("/overview");
  const [, navigate] = useLocation();
  const data = query.data;
  const RegionalIndex = isAtlasOffline() ? OfflineOverviewMap : OverviewMap;
  return (
    <>
      <PageHeader
        eyebrow="REGIONAL DIRECTORY"
        title="Life Science Atlas"
        description="Companies, sites, capital. Explore retained evidence across 11 life science hubs."
      >
        <a href="#regional-comparison" className="button">
          Compare hubs <ArrowDown size={15} />
        </a>
        <DownloadLink url={printAssets.allMarketsPdfUrl}>All markets · one page each</DownloadLink>
        {!isAtlasOffline() && <DownloadLink url={offlineDownload.url}>Offline atlas · desktop</DownloadLink>}
      </PageHeader>
      {query.isLoading ? (
        <Loading label="Opening the regional atlas" />
      ) : query.isError ? (
        <ErrorState
          retry={() => query.refetch()}
          message={query.error.message}
        />
      ) : (
        data && (
          <>
            <div className="metric-strip overview-metrics">
              <Metric
                label="REGIONAL HUBS"
                value={data.regions.length}
                note="Distinct research geographies"
              />
              <Metric
                label="SOURCE-SUPPORTED PROFILES"
                value={data.totals.baselineProfiles}
                note="Retained baseline evidence"
              />
              <Metric
                label="RESEARCH IMPORTS"
                value={data.totals.researchProfiles}
                note="Separately labeled observations"
              />
              <Metric
                label="COMPLETED AERIAL VIEWS"
                value={data.totals.aerialViews}
                note="Beach · Genetown · Basel"
              />
            </div>
            <section className="overview-map-section">
              <div className="section-heading compact-heading">
                <div>
                  <h2>Explore the hubs</h2>
                </div>
                <a href="#regional-comparison" className="text-link">
                  Compare hubs <ArrowDown size={13} />
                </a>
              </div>
              <RegionalIndex
                regions={data.regions}
                onRegion={id => navigate(`/hub/${id}`)}
              />
              <div className="overview-map-footer">
                <span>
                  <span className="legend-dot address" />
                  Source-supported profile count by hub
                </span>
                <span>
                  Coverage is retained research, not a complete company census.
                </span>
              </div>
            </section>
            <section className="regional-comparison" id="regional-comparison">
              <div className="section-heading">
                <div>
                  <h2>Regional coverage</h2>
                </div>
                <span className="release-label">
                  RELEASE / {dateLabel(data.asOf)}
                </span>
              </div>
              <div className="comparison-intro">
                <p>
                  Company counts describe evidence coverage, not market size.
                  Regional company memberships can overlap; cross-hub counts
                  should not be added to infer unique companies.
                </p>
                <Link href="/methodology">
                  Coverage notes <ArrowUpRight size={13} />
                </Link>
              </div>
              <div className="regional-table-scroll">
                <table className="regional-table">
                  <thead>
                    <tr>
                      <th>Research hub</th>
                      <th>Source-supported</th>
                      <th>Research imports</th>
                      <th>Site records</th>
                      <th>Address / campus</th>
                      <th>Aerial exhibits</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.regions.map((region, index) => (
                      <tr
                        key={region.id}
                        onClick={() => navigate(`/hub/${region.id}`)}
                      >
                        <td>
                          <Link href={`/hub/${region.id}`}>
                            <span className="region-row-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span>
                              <strong>
                                {regionPresentation(region).label}
                              </strong>
                              <small>
                                {regionPresentation(region).subtitle}
                              </small>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <span className="coverage-value">
                            {count(region.baselineCompanies)}
                          </span>
                          <span className="coverage-bar">
                            <i
                              style={{
                                width: `${Math.max(3, (region.baselineCompanies / Math.max(...data.regions.map(r => r.baselineCompanies), 1)) * 100)}%`,
                              }}
                            />
                          </span>
                        </td>
                        <td className="numeric-cell">
                          {count(region.researchCompanies)}
                        </td>
                        <td className="numeric-cell">{count(region.sites)}</td>
                        <td className="numeric-cell">
                          {count(region.preciseSites)}
                        </td>
                        <td>
                          {region.aerialCount ? (
                            <span className="aerial-available">
                              {count(region.aerialCount)} views
                            </span>
                          ) : (
                            <span className="muted-text">Macro view</span>
                          )}
                        </td>
                        <td>
                          <Link
                            href={`/hub/${region.id}`}
                            className="region-open"
                            aria-label={`Open ${region.name}`}
                          >
                            <ArrowUpRight size={18} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      )}
    </>
  );
}

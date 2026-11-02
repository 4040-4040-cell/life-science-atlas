import { Link } from "wouter";
import { ArrowUpRight, Check, CircleHelp } from "lucide-react";
import type { OverviewResponse } from "@shared/atlas";
import { count, dateLabel, useAtlas } from "@/lib/atlas";
import { Metric, PageHeader } from "@/components/atlas/AtlasShell";
import {
  ErrorState,
  EvidenceBadge,
  Loading,
} from "@/components/atlas/Primitives";

export default function AtlasMethodology() {
  const query = useAtlas<OverviewResponse>("/overview");
  return (
    <>
      <PageHeader
        eyebrow="METHODOLOGY / DATA COVERAGE"
        title="Evidence before inference."
        description="An atlas of retained research, not a complete census, a credit opinion or a forecast of space demand."
      />
      <div className="method-intro">
        <span className="method-intro-number">01 to 05</span>
        <p>
          Read the company. Locate the evidence.
          <br />
          <strong>Keep the unknowns visible.</strong>
        </p>
        <span className="method-intro-sub">THE ATLAS READING STANDARD</span>
      </div>
      <div className="method-content">
        <section className="method-section">
          <span className="method-number">01</span>
          <div>
            <span className="eyebrow">TWO EVIDENCE LAYERS</span>
            <h2>Retain the research. Preserve its status.</h2>
            <div className="method-evidence-grid">
              <article>
                <EvidenceBadge evidence="baseline" />
                <h3>Source-supported baseline</h3>
                <p>
                  Original company records and local site identities are
                  retained. “Source-supported” describes the baseline layer; it
                  does not mean every field is known, current or independently
                  verified. Read each fact’s date, scope, status and sources.
                </p>
              </article>
              <article>
                <EvidenceBadge evidence="research" />
                <h3>Reported research imports</h3>
                <p>
                  Imported observations remain separate and explicitly labeled.
                  Reported headcounts, property claims and A/B/C priorities are
                  not automatically verified local facts, occupied sites or
                  atlas scores. Unresolved identities are not silently merged.
                </p>
              </article>
            </div>
            <p>
              Evidence filters operate across the regional map, city index and
              matrix. Linked imported observations remain available in a
              distinct profile tab, rather than overwriting the original
              evidence.
            </p>
          </div>
        </section>
        <section className="method-section">
          <span className="method-number">02</span>
          <div>
            <span className="eyebrow">GEOGRAPHY & PRECISION</span>
            <h2>A point is not always a property.</h2>
            <div className="precision-explainer">
              <div>
                <i className="legend-dot address" />
                <h3>Address-matched</h3>
                <p>
                  The retained record supports an address-level location. This
                  is not, by itself, evidence of current tenure, occupied area
                  or lease terms.
                </p>
              </div>
              <div>
                <i className="legend-dot city" />
                <h3>City context</h3>
                <p>
                  A macro reference or city centroid locates a research
                  geography, not occupied premises. Overlapping companies are
                  accessible in marker lists.
                </p>
              </div>
              <div>
                <i className="legend-dot research" />
                <h3>Unchecked research</h3>
                <p>
                  Imported or unchecked locations are visibly separate and
                  excluded from verified aerial pins. Position does not
                  establish occupancy.
                </p>
              </div>
            </div>
            <p>
              Dashed analytical frames overlap and are not official JLL
              submarket boundaries. French and German extensions of Basel are
              identified by the retained regional geography, not presented as
              Switzerland. City-context peers are not confirmed submarket or
              tenancy peers.
            </p>
            <p>
              Macro city references use{" "}
              <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>.
              Basemap providers are credited on the map. Aerial source credits
              and capture-date notes appear with each selected view.
            </p>
          </div>
        </section>
        <section className="method-section">
          <span className="method-number">03</span>
          <div>
            <span className="eyebrow">FINANCIAL & SCIENCE DISCIPLINE</span>
            <h2>Scope matters as much as the number.</h2>
            <ul className="method-rule-list">
              <li>
                <Check size={15} />
                <span>
                  <strong>Companywide is not local.</strong> Cash, runway,
                  revenue and headcount are not allocated to a local site unless
                  a source explicitly supports that scope.
                </span>
              </li>
              <li>
                <Check size={15} />
                <span>
                  <strong>Liquidity is not guaranteed lease credit.</strong>{" "}
                  Reported cash and financings do not establish a local space
                  commitment or a parent guarantee.
                </span>
              </li>
              <li>
                <Check size={15} />
                <span>
                  <strong>Dates are part of the fact.</strong> Historical float
                  is not current market capitalization. A registry primary
                  completion date is not a guided clinical readout.
                </span>
              </li>
              <li>
                <Check size={15} />
                <span>
                  <strong>Missing is not zero.</strong> Unknown local tenure,
                  occupied area, jobs, landlord and lease expiry remain not
                  disclosed. Unsupported occupancy direction is “Insufficient
                  evidence,” not “Hold.”
                </span>
              </li>
              <li>
                <Check size={15} />
                <span>
                  <strong>No inferred scores.</strong> Source-reported scores or
                  priority labels retain their status. The atlas does not
                  manufacture company credit ratings or demand signals. Retained
                  model coverage, where present, is weighted criteria coverage
                  on a 0–1 scale, not profile completeness or credit quality.
                </span>
              </li>
            </ul>
            <p>
              Facts retain their value, unit, entity/geographic scope, as-of
              date, reporting period, evidence status, notes and source
              references where available. Source links are available at the
              field level; dates that are absent remain absent.
            </p>
          </div>
        </section>
        <section className="method-section">
          <span className="method-number">04</span>
          <div>
            <span className="eyebrow">COMPLETED AERIAL EXHIBITS</span>
            <h2>The original frame. The original caveats.</h2>
            <p>
              Completed exhibits are available for Biotech Beach, Genetown and
              Basel. Every aerial view uses the retained exhibit image and
              geographic bounds, with its attribution, capture years and notes.
              Swiss acquisition dates remain unconfirmed where the evidence does
              not establish them.
            </p>
            <p>
              Only address-matched baseline sites explicitly linked to the
              selected exhibit are eligible for aerial pins. Imagery does not
              verify current occupation. Regional PDFs and full exhibits are
              linked where supplied. Other hubs remain geographic macro views in
              this release.
            </p>
          </div>
        </section>
        <section className="method-section">
          <span className="method-number">05</span>
          <div>
            <span className="eyebrow">LIVE RELEASE COVERAGE</span>
            <h2>What this release contains.</h2>
            {query.isLoading ? (
              <Loading label="Loading release coverage" compact />
            ) : query.isError ? (
              <ErrorState
                message={query.error.message}
                retry={() => query.refetch()}
              />
            ) : (
              query.data && (
                <>
                  <div className="metric-strip method-metrics">
                    <Metric
                      label="BASELINE PROFILES"
                      value={query.data.totals.baselineProfiles}
                    />
                    <Metric
                      label="RESEARCH PROFILES"
                      value={query.data.totals.researchProfiles}
                    />
                    <Metric
                      label="SITE RECORDS"
                      value={query.data.totals.sites}
                    />
                    <Metric
                      label="AERIAL VIEWS"
                      value={query.data.totals.aerialViews}
                    />
                  </div>
                  <div className="coverage-release">
                    <b>RELEASE / {dateLabel(query.data.asOf)}</b>
                    <p>{query.data.methodology}</p>
                  </div>
                  <div className="coverage-list">
                    {query.data.regions.map(region => (
                      <Link href={`/hub/${region.id}`} key={region.id}>
                        <span>
                          <strong>{region.name}</strong>
                          <small>{region.geography}</small>
                        </span>
                        <span>
                          {count(region.baselineCompanies)} supported
                          <br />
                          <small>
                            {count(region.researchCompanies)} research
                          </small>
                        </span>
                        <ArrowUpRight size={16} />
                      </Link>
                    ))}
                  </div>
                </>
              )
            )}
            <div className="coverage-caveat">
              <CircleHelp size={18} />
              <p>
                Institution and campus references are context records and are
                excluded from company coverage counts. Address-level record
                counts may include campus reference addresses, which are not
                verified occupied premises. Regional memberships can overlap.
                Counts measure research coverage, not total market size, and should
                not be summed to infer unique companies. Data may be historical;
                consult the linked evidence before making decisions.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

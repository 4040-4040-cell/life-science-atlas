import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, MapPin, X } from "lucide-react";
import type { CompanyProfile, Fact, MapSite, Source } from "@shared/atlas";
import { operatingAffiliateLabel } from "@shared/operatingAffiliate";
import {
  dateLabel,
  humanize,
  precisionOf,
  safeUrl,
  useAtlas,
} from "@/lib/atlas";
import {
  groupDocumentedLocations,
  isCampusReference,
  regionPresentation,
} from "@/lib/regionPresentation";
import {
  CompanyLogo,
  EmptyState,
  ErrorState,
  EvidenceBadge,
  External,
  FactRow,
  Loading,
  SourceLinks,
} from "./Primitives";

const hasValue = (fact: Fact) => fact.value != null && fact.value !== "";

function FactSections({
  facts,
  sources,
}: {
  facts: Fact[];
  sources: Source[];
}) {
  const grouped = new Map<string, Fact[]>();
  facts.forEach(fact => {
    const section = fact.section || "Other retained facts";
    grouped.set(section, [...(grouped.get(section) || []), fact]);
  });
  return (
    <>
      {[...grouped].map(([section, items]) => {
        const available = items.filter(hasValue);
        const missing = items.filter(fact => !hasValue(fact));
        const longSection =
          /clinical|trial|science|evidence/i.test(section) ||
          available.length > 6;
        return (
          <details
            className="profile-fact-section"
            key={section}
            open={available.length > 0 && !longSection}
          >
            <summary>
              <h3>{humanize(section)}</h3>
              <span>
                {available.length} available · {missing.length} gaps
              </span>
            </summary>
            {available.map((fact, index) => (
              <FactRow
                key={`${fact.key}-${index}`}
                fact={fact}
                sources={sources}
              />
            ))}
            {missing.length > 0 && (
              <details className="missing-fields">
                <summary>{missing.length} fields not in release</summary>
                {missing.map((fact, index) => (
                  <FactRow
                    key={`${fact.key}-${index}`}
                    fact={fact}
                    sources={sources}
                  />
                ))}
              </details>
            )}
          </details>
        );
      })}
    </>
  );
}

function SiteCard({ site, sources }: { site: MapSite; sources: Source[] }) {
  const campus = isCampusReference(site);
  const precision = precisionOf(site);
  return (
    <article className="site-card">
      <div className="site-card-top">
        <MapPin size={17} />
        <strong>{site.address || "Street address not in release"}</strong>
        <span className={`precision-badge ${campus ? "campus" : precision}`}>
          {campus
            ? "Campus reference"
            : precision === "address"
              ? "Address-matched"
              : precision === "research"
                ? "Unchecked import"
                : "City reference"}
        </span>
      </div>
      <p>{[site.city, site.country].filter(Boolean).join(", ")}</p>
      {campus && (
        <p className="site-precision-caution">
          Campus reference, not a verified company suite. This address does not
          establish occupied premises or lease terms.
        </p>
      )}
      {!campus && precision !== "address" && (
        <p className="site-precision-caution">
          {precision === "research"
            ? "Unverified imported location; excluded from verified aerial pins."
            : "City-reference coordinates, not a verified occupied address."}
        </p>
      )}
      <div className="site-metadata">
        <span>
          <b>Function</b>
          {site.functions.length
            ? site.functions.join(" / ")
            : "Not in release"}
        </span>
        <span>
          <b>Recorded status</b>
          {humanize(site.physicalStatus || "Not in release")}
        </span>
      </div>
      {site.zone && (
        <div className="site-zone">
          Analytical context: {site.zone} · not an official boundary
        </div>
      )}
      {site.facts?.length ? (
        <FactSections facts={site.facts} sources={sources} />
      ) : (
        <p className="site-unknown-note">
          Tenure, area, landlord, expiry and local jobs are not established in
          this site's retained fields.
        </p>
      )}
      <details className="site-record-details">
        <summary>Location record & sources</summary>
        <p>
          Retained location precision:{" "}
          {humanize(site.precision || "Unspecified")}
        </p>
        <SourceLinks ids={site.sourceIds} sources={sources} />
      </details>
    </article>
  );
}

export default function CompanyProfileDrawer({
  id,
  onClose,
  onCompany,
}: {
  id: string | null;
  onClose: () => void;
  onCompany: (id: string) => void;
}) {
  const query = useAtlas<CompanyProfile>(
    id ? `/profile/${encodeURIComponent(id)}` : null
  );
  const [location] = useLocation();
  const cantonContext = /^\/canton\/basel-(?:stadt|landschaft)$/.test(location);
  const currentRegionId = location.match(/^\/(?:hub|intelligence)\/([^/?#]+)/)?.[1] || (cantonContext ? "basel" : undefined);
  const currentRegion = currentRegionId
    ? regionPresentation({ id: currentRegionId, name: currentRegionId }).label
    : null;
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [tab, setTab] = useState("evidence");
  useEffect(() => {
    if (!id) return;
    setTab("evidence");
    panel.current?.scrollTo(0, 0);
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => panel.current?.focus(), 0);
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    const oldOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab" && mobile && panel.current) {
        const elements = [
          ...panel.current.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),summary,input,select,[tabindex="0"]'
          ),
        ].filter(element => element.getClientRects().length > 0);
        const first = elements[0],
          last = elements[elements.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = oldOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [id, currentRegionId]);
  if (!id) return null;
  const company = query.data;
  const localFacts =
    company?.facts.filter(fact =>
      /local|occup|tenure|site|footprint|property|real.?estate|lease/i.test(
        fact.section
      )
    ) || [];
  const companyFacts =
    company?.facts.filter(fact => !localFacts.includes(fact)) || [];
  const {
    selected: selectedSites,
    other: otherSites,
    imported: importedSites,
  } = groupDocumentedLocations(company?.sites || [], currentRegionId);
  const unknownCompanyFacts =
    company?.facts.filter(fact => !hasValue(fact)) || [];
  const companyKnownCount = companyFacts.filter(hasValue).length;
  const gapCount =
    unknownCompanyFacts.length +
    (company?.sites.reduce(
      (total, site) =>
        total + (site.facts?.filter(fact => !hasValue(fact)).length || 0),
      0
    ) || 0);
  return (
    <>
      <button
        className="profile-scrim"
        aria-label="Close company profile"
        onClick={onClose}
      />
      <aside
        className="profile-drawer"
        role="dialog"
        aria-label={
          company ? `${company.name} company evidence` : "Company evidence"
        }
        aria-modal={
          window.matchMedia("(max-width: 900px)").matches ? true : undefined
        }
        tabIndex={-1}
        ref={panel}
      >
        <div className="profile-topline">
          <span>
            <span className="red-tick" /> COMPANY PROFILE
          </span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close company profile"
          >
            <X size={21} />
          </button>
        </div>
        {query.isLoading ? (
          <Loading label="Retrieving company evidence" />
        ) : query.isError ? (
          <ErrorState
            message={query.error.message}
            retry={() => query.refetch()}
          />
        ) : company ? (
          <>
            <header className="profile-header">
              <CompanyLogo company={company} large />
              <div>
                <EvidenceBadge evidence={company.evidence} />
                <h2>{company.name}</h2>
                <div className="profile-identifiers">
                  {[
                    company.ticker,
                    company.listing,
                    operatingAffiliateLabel(company) || (company.kind ? humanize(company.kind) : null),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="profile-record-link"><Link href={`/hub/${currentRegionId || company.regionIds[0]}/company/${encodeURIComponent(company.id)}`}>Open exact company record</Link><small>Record {company.id}</small></div>
              </div>
            </header>
            {cantonContext && <p className="section-caution">Company-wide and wider Basel-hub profile. The canton inventory carries the building-specific evidence.</p>}
            <details className="profile-overview-details">
              <summary>
                Identity & occupancy assessment{" "}
                <span>{company.occupancyRead || "Insufficient evidence"}</span>
              </summary>
              <div>
                <p className="assessment-reason">
                  {company.occupancyReason ||
                    "There is not enough supported local evidence to infer an occupancy direction."}
                </p>
                <div className="profile-entity">
                  <span>
                    <b>Parent</b>
                    {company.parent || "Not in release"}
                  </span>
                  <span>
                    <b>Category</b>
                    {humanize(company.category || "Not in release")}
                  </span>
                  <span>
                    <b>Stage</b>
                    {company.stage || "Not in release"}
                  </span>
                  <span>
                    <b>Website</b>
                    {safeUrl(company.website) ? (
                      <External url={company.website}>Company website</External>
                    ) : (
                      "Not in release"
                    )}
                  </span>
                  <span>
                    <b>Analyst priority</b>
                    {company.priority
                      ? humanize(company.priority)
                      : "Not assigned"}
                  </span>
                  <span>
                    <b>Source-reported score</b>
                    {company.score ?? "Not in release"}
                  </span>
                </div>
                {company.evidence === "research" && (
                  <p className="section-caution">
                    Reported import labels are not an atlas score or a verified
                    occupancy outlook.
                  </p>
                )}
              </div>
            </details>
            <nav className="profile-tabs" aria-label="Company profile sections">
              <button
                className={tab === "evidence" ? "active" : ""}
                onClick={() => setTab("evidence")}
              >
                Sites & events
              </button>
              <button
                className={tab === "company" ? "active" : ""}
                onClick={() => setTab("company")}
              >
                Company <span>{companyKnownCount}</span>
              </button>
              <button
                className={tab === "gaps" ? "active" : ""}
                onClick={() => setTab("gaps")}
              >
                Gaps <span>{gapCount}</span>
              </button>
              <button
                className={tab === "research" ? "active" : ""}
                onClick={() => setTab("research")}
              >
                Imports{" "}
                <span>{company.imported.length + importedSites.length}</span>
              </button>
              <button
                className={tab === "sources" ? "active" : ""}
                onClick={() => setTab("sources")}
              >
                Sources <span>{company.sources.length}</span>
              </button>
            </nav>
            {tab === "evidence" && (
              <div className="profile-body">
                <section className="profile-section">
                  <div className="profile-section-title">
                    <h3>
                      {currentRegion
                        ? `${currentRegion}: documented locations`
                        : "Documented locations"}
                    </h3>
                  </div>
                  {!selectedSites.length && (
                    <p className="profile-empty-note">
                      No physical site in {currentRegion || "this release"} is
                      established in the retained evidence.
                    </p>
                  )}
                  {selectedSites.map(site => (
                    <SiteCard
                      key={site.id}
                      site={site}
                      sources={company.sources}
                    />
                  ))}
                  {otherSites.length > 0 && (
                    <details className="other-locations">
                      <summary>
                        Other documented locations{" "}
                        <span>{otherSites.length}</span>
                      </summary>
                      <p className="section-caution">
                        These records are outside the selected hub. Company
                        identity is shared; local site evidence is not.
                      </p>
                      {otherSites.map(site => (
                        <div key={site.id}>
                          <h4 className="other-region-label">
                            {
                              regionPresentation({
                                id: site.regionId,
                                name: site.regionId,
                              }).label
                            }
                          </h4>
                          <SiteCard site={site} sources={company.sources} />
                        </div>
                      ))}
                    </details>
                  )}
                  {localFacts.length > 0 && (
                    <details className="retained-records">
                      <summary>
                        Additional site & lease evidence{" "}
                        <span>
                          {localFacts.filter(hasValue).length} available
                        </span>
                      </summary>
                      <p className="section-caution">
                        Read each field's geographic scope. These retained facts
                        are not automatically assigned to the selected hub.
                      </p>
                      <FactSections
                        facts={localFacts}
                        sources={company.sources}
                      />
                    </details>
                  )}
                </section>
                <section className="profile-section">
                  <div className="profile-section-title">
                    <h3>Dated footprint & company events</h3>
                  </div>
                  <p className="section-caution">
                    Historical events, not a forecast of local space demand.
                    Companywide events are not assigned to this hub.
                  </p>
                  {company.events.length ? (
                    <div className="event-timeline">
                      {company.events.map(event => (
                        <details key={event.id} className="event-record">
                          <summary>
                            <span className="event-date">
                              {event.date
                                ? dateLabel(event.date)
                                : "Date not in release"}
                            </span>
                            <strong>{event.title}</strong>
                          </summary>
                          <div className="event-status">
                            {humanize(event.type)} · {humanize(event.status)}
                            {event.direction
                              ? ` · ${humanize(event.direction)}`
                              : ""}
                          </div>
                          <p className="event-scope">
                            {event.siteIds.length
                              ? `Linked site records: ${event.siteIds
                                  .map(siteId => {
                                    const site = company.sites.find(
                                      site => site.id === siteId
                                    );
                                    return site
                                      ? [
                                          site.city,
                                          regionPresentation({
                                            id: site.regionId,
                                            name: site.regionId,
                                          }).label,
                                        ]
                                          .filter(Boolean)
                                          .join(", ")
                                      : "Site location not in release";
                                  })
                                  .join("; ")}`
                              : "Company event; local site consequence not established."}
                          </p>
                          {event.notes && (
                            <p className="fact-note">{event.notes}</p>
                          )}
                          <SourceLinks
                            ids={event.sourceIds}
                            sources={company.sources}
                          />
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="profile-empty-note">
                      No dated footprint events in this release.
                    </p>
                  )}
                </section>
                <details className="profile-section peer-disclosure">
                  <summary>
                    City-context peers <span>{company.peers?.length || 0}</span>
                  </summary>
                  <p className="section-caution">
                    Nearby or city-reference context only, unless zone
                    membership is explicitly supported. Not a credit comparison.
                  </p>
                  {company.peers?.length ? (
                    <div className="peer-list">
                      {company.peers.map(peer => (
                        <button
                          key={peer.id}
                          onClick={() => onCompany(peer.id)}
                        >
                          <CompanyLogo company={peer} />
                          <span>
                            <strong>{peer.name}</strong>
                            <small>
                              {peer.cities.join(" / ") || "City not in release"}
                            </small>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="profile-empty-note">
                      No supported peer context is available.
                    </p>
                  )}
                </details>
              </div>
            )}
            {tab === "company" && (
              <div className="profile-body">
                <section className="profile-section">
                  <div className="profile-section-title">
                    <h3>Company financials & science</h3>
                  </div>
                  <p className="scope-caution">
                    Companywide liquidity and dated financing are not local
                    capital, guaranteed lease credit or space commitments.
                    Historical float is not current market capitalization.
                    Registry primary completion is not a guided clinical
                    readout.
                  </p>
                  {companyFacts.length ? (
                    <FactSections
                      facts={companyFacts}
                      sources={company.sources}
                    />
                  ) : (
                    <p className="profile-empty-note">
                      No company financial or science facts in the retained
                      baseline release.
                    </p>
                  )}
                </section>
              </div>
            )}
            {tab === "gaps" && (
              <div className="profile-body">
                <section className="profile-section">
                  <div className="profile-section-title">
                    <h3>Fields not in this release</h3>
                  </div>
                  <p className="section-caution">
                    A research gap does not mean the company has never disclosed
                    the information. Missing is unknown, not zero. An
                    unsupported occupancy outlook is insufficient evidence, not
                    Hold.
                  </p>
                  {unknownCompanyFacts.length > 0 && (
                    <FactSections
                      facts={unknownCompanyFacts}
                      sources={company.sources}
                    />
                  )}
                  {company.sites
                    .filter(site => site.facts?.some(fact => !hasValue(fact)))
                    .map(site => (
                      <details className="missing-site" key={site.id}>
                        <summary>
                          {site.city || "Site"} ·{" "}
                          {
                            regionPresentation({
                              id: site.regionId,
                              name: site.regionId,
                            }).label
                          }
                        </summary>
                        <p className="section-caution">{site.address}</p>
                        <FactSections
                          facts={site.facts!.filter(fact => !hasValue(fact))}
                          sources={company.sources}
                        />
                      </details>
                    ))}
                </section>
                <section className="profile-section">
                  <div className="profile-section-title">
                    <h3>Research gap notes</h3>
                  </div>
                  {company.gaps.length ? (
                    <ul className="gap-list">
                      {company.gaps.map((gap, index) => (
                        <li key={index}>{gap}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="profile-empty-note">
                      No additional gap notes recorded. This does not establish
                      that all requested fields are known.
                    </p>
                  )}
                </section>
              </div>
            )}
            {tab === "research" && (
              <div className="profile-body">
                <div className="import-banner">
                  <span className="eyebrow">SEPARATE EVIDENCE LAYER</span>
                  <h3>Reported research imports</h3>
                  <p>
                    Retained observations are shown as imported. They do not
                    establish an occupied address, verified local headcount,
                    lease credit or an atlas priority score.
                  </p>
                </div>
                {importedSites.length > 0 && (
                  <section className="profile-section">
                    <div className="profile-section-title">
                      <h3>Imported location claims</h3>
                    </div>
                    <p className="section-caution">
                      Unchecked observations may repeat a documented address.
                      They are not additional distinct premises or verified
                      occupancy.
                    </p>
                    {importedSites.map(site => (
                      <div key={site.id}>
                        <h4 className="other-region-label">
                          {
                            regionPresentation({
                              id: site.regionId,
                              name: site.regionId,
                            }).label
                          }
                        </h4>
                        <SiteCard site={site} sources={company.sources} />
                      </div>
                    ))}
                  </section>
                )}
                {company.imported.length ? (
                  company.imported.map((observation, index) => (
                    <details
                      className="import-observation"
                      key={observation.id}
                    >
                      <summary>Imported observation {index + 1}</summary>
                      <p>{observation.note}</p>
                      <FactSections
                        facts={observation.facts}
                        sources={[...company.sources, ...observation.sources]}
                      />
                    </details>
                  ))
                ) : !importedSites.length ? (
                  <EmptyState
                    title="No linked research observations"
                    text="This profile has no additional imported observations in the current release."
                  />
                ) : null}
              </div>
            )}
            {tab === "sources" && (
              <div className="profile-body">
                <div className="source-intro">
                  <h3>Evidence register</h3>
                  <p>
                    Per-field references are attached to each fact. Public links
                    appear where available; retained private source content is
                    not exposed.
                  </p>
                </div>
                {company.sources.map((source, index) => (
                  <article className="source-register-item" key={source.id}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      {safeUrl(source.url) ? (
                        <External url={source.url}>{source.title}</External>
                      ) : (
                        <strong>{source.title}</strong>
                      )}
                      <p>
                        Published{" "}
                        {source.publishedDate
                          ? dateLabel(source.publishedDate)
                          : "date not in release"}
                        <br />
                        Retrieved{" "}
                        {source.retrievedDate
                          ? dateLabel(source.retrievedDate)
                          : "date not in release"}
                      </p>
                      {!safeUrl(source.url) && (
                        <small>Public source link not available.</small>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : null}
      </aside>
    </>
  );
}

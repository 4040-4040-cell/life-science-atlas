import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  MapPin,
  X,
} from "lucide-react";
import type { CompanyProfile, Fact, Source } from "@shared/atlas";
import {
  dateLabel,
  humanize,
  precisionOf,
  safeUrl,
  useAtlas,
} from "@/lib/atlas";
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

function FactSections({
  facts,
  sources,
}: {
  facts: Fact[];
  sources: Source[];
}) {
  const grouped = new Map<string, Fact[]>();
  facts.forEach(fact =>
    grouped.set(fact.section || "Other retained facts", [
      ...(grouped.get(fact.section || "Other retained facts") || []),
      fact,
    ])
  );
  return (
    <>
      {[...grouped].map(([section, items]) => (
        <details
          className="profile-fact-section"
          key={section}
          open={
            (!/clinical|trial/i.test(section) || items.length <= 24) &&
            items.some(fact => fact.value != null && fact.value !== "")
          }
        >
          <summary>
            <h3>{humanize(section)}</h3>
            <span>
              {
                items.filter(fact => fact.value != null && fact.value !== "")
                  .length
              }{" "}
              / {items.length} disclosed
            </span>
          </summary>
          {items.map((fact, index) => (
            <FactRow
              key={`${fact.key}-${index}`}
              fact={fact}
              sources={sources}
            />
          ))}
        </details>
      ))}
    </>
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
        ];
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
  }, [id]);
  if (!id) return null;
  const company = query.data;
  const localFacts =
    company?.facts.filter(f =>
      /local|occup|tenure|site|footprint|property|real.?estate|lease/i.test(
        f.section
      )
    ) || [];
  const companyFacts =
    company?.facts.filter(f => !localFacts.includes(f)) || [];
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
            <span className="red-tick" />
            COMPANY INTELLIGENCE
          </span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close company profile"
          >
            <X size={19} />
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
                    company.kind ? humanize(company.kind) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </header>
            <div className="occupancy-read">
              <div className="eyebrow">OCCUPANCY READ / LOCAL EVIDENCE</div>
              <h3>{company.occupancyRead || "Insufficient evidence"}</h3>
              <p>
                {company.occupancyReason ||
                  "There is not enough supported local evidence to infer an occupancy direction."}
              </p>
              <div className="occupancy-priority">
                <span>PRIORITY</span>
                <strong>
                  {company.priority
                    ? humanize(company.priority)
                    : "Not assigned"}
                </strong>
                {company.score != null && (
                  <small>Source score: {company.score}</small>
                )}
              </div>
              {company.evidence === "research" && (
                <small className="research-priority-note">
                  Reported import labels are not an atlas score or a verified
                  occupancy outlook.
                </small>
              )}
            </div>
            <div className="profile-entity">
              <span>
                <b>Parent</b>
                {company.parent || "Not disclosed"}
              </span>
              <span>
                <b>Category</b>
                {humanize(company.category || "Not disclosed")}
              </span>
              <span>
                <b>Stage</b>
                {company.stage || "Not disclosed"}
              </span>
              <span>
                <b>Website</b>
                {safeUrl(company.website) ? (
                  <External url={company.website}>Company website</External>
                ) : (
                  "Not disclosed"
                )}
              </span>
            </div>
            <nav className="profile-tabs" aria-label="Company profile sections">
              <button
                className={tab === "evidence" ? "active" : ""}
                onClick={() => setTab("evidence")}
              >
                Evidence
              </button>
              <button
                className={tab === "research" ? "active" : ""}
                onClick={() => setTab("research")}
              >
                Reported imports <span>{company.imported.length}</span>
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
                    <span>01</span>
                    <h3>Local presence & real estate</h3>
                  </div>
                  {!company.sites.length && (
                    <p className="profile-empty-note">
                      No local physical site is established in the retained
                      evidence.
                    </p>
                  )}
                  {company.sites.map(site => (
                    <article className="site-card" key={site.id}>
                      <div className="site-card-top">
                        <MapPin size={15} />
                        <strong>
                          {site.address || "Street address not disclosed"}
                        </strong>
                        <span
                          className={`precision-badge ${precisionOf(site)}`}
                        >
                          {precisionOf(site) === "address"
                            ? "Address-matched"
                            : precisionOf(site) === "research"
                              ? "Unchecked import"
                              : "City context"}
                        </span>
                      </div>
                      <p>
                        {[site.city, site.country].filter(Boolean).join(", ")}
                      </p>
                      {site.zone && (
                        <div className="site-zone">
                          Analytical context: {site.zone} · not an official
                          boundary
                        </div>
                      )}
                      <div className="site-metadata">
                        <span>
                          <b>Function</b>
                          {site.functions.length
                            ? site.functions.join(" / ")
                            : "Not disclosed"}
                        </span>
                        <span>
                          <b>Physical status</b>
                          {humanize(site.physicalStatus || "Not disclosed")}
                        </span>
                        <span>
                          <b>Location precision</b>
                          {humanize(site.precision || "Unspecified")}
                        </span>
                      </div>
                      {precisionOf(site) !== "address" && (
                        <p className="site-precision-caution">
                          {precisionOf(site) === "research"
                            ? "Imported location is unverified. It is excluded from verified aerial pins."
                            : "Coordinates provide city context only, not a verified occupied address."}
                        </p>
                      )}
                      {site.facts?.length ? (
                        <FactSections
                          facts={site.facts}
                          sources={company.sources}
                        />
                      ) : (
                        <p className="site-unknown-note">
                          Tenure, occupied area, landlord, lease expiry and
                          site-level jobs are not disclosed here unless
                          supported in the retained facts below.
                        </p>
                      )}
                      <SourceLinks
                        ids={site.sourceIds}
                        sources={company.sources}
                      />
                    </article>
                  ))}
                  <FactSections facts={localFacts} sources={company.sources} />
                </section>
                <section className="profile-section">
                  <div className="profile-section-title">
                    <span>02</span>
                    <h3>Dated footprint & company events</h3>
                  </div>
                  <p className="section-caution">
                    Reported events are historical evidence, not a forecast of
                    space demand.
                  </p>
                  {company.events.length ? (
                    <div className="event-timeline">
                      {company.events.map(event => (
                        <article key={event.id} className="event-item">
                          <div className="event-date">
                            {dateLabel(event.date)}
                            <span>{humanize(event.type)}</span>
                          </div>
                          <h4>{event.title}</h4>
                          <div className="event-status">
                            {humanize(event.status)}
                            {event.direction
                              ? ` · ${humanize(event.direction)}`
                              : ""}
                          </div>
                          {event.notes && <p>{event.notes}</p>}
                          <SourceLinks
                            ids={event.sourceIds}
                            sources={company.sources}
                          />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="profile-empty-note">
                      No dated footprint events in this release.
                    </p>
                  )}
                </section>
                <section className="profile-section">
                  <div className="profile-section-title">
                    <span>03</span>
                    <h3>Company context, financials & science</h3>
                  </div>
                  <div className="scope-caution">
                    Companywide liquidity is not local capital or guaranteed
                    lease credit. Historical float is not current market
                    capitalization. Trial primary completion is not a guided
                    readout; financing alone is not a space commitment.
                  </div>
                  {companyFacts.length ? (
                    <FactSections
                      facts={companyFacts}
                      sources={company.sources}
                    />
                  ) : (
                    <p className="profile-empty-note">
                      Companywide financial and science fields are not disclosed
                      in the retained baseline evidence.
                    </p>
                  )}
                </section>
                <section className="profile-section">
                  <div className="profile-section-title">
                    <span>04</span>
                    <h3>Gaps & next evidence</h3>
                  </div>
                  {company.gaps.length ? (
                    <ul className="gap-list">
                      {company.gaps.map((gap, i) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="profile-empty-note">
                      No additional gap notes were recorded. This does not
                      establish that all requested fields are known.
                    </p>
                  )}
                  <p className="unknown-note">
                    A missing fact is unknown, not zero. An unsupported
                    occupancy outlook is insufficient evidence, not Hold.
                  </p>
                </section>
                <section className="profile-section">
                  <div className="profile-section-title">
                    <span>05</span>
                    <h3>City-context peers</h3>
                  </div>
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
                              {peer.cities.join(" / ") || "City not disclosed"}
                            </small>
                          </span>
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="profile-empty-note">
                      No supported peer context is available.
                    </p>
                  )}
                </section>
              </div>
            )}
            {tab === "research" && (
              <div className="profile-body">
                <div className="import-banner">
                  <span className="eyebrow">SEPARATE EVIDENCE LAYER</span>
                  <h3>Reported, not independently verified</h3>
                  <p>
                    Retained research observations are shown as imported. They
                    do not establish an occupied address, verified local
                    headcount, lease credit or an atlas priority score.
                  </p>
                </div>
                {company.imported.length ? (
                  company.imported.map((observation, index) => (
                    <article
                      className="import-observation"
                      key={observation.id}
                    >
                      <span className="eyebrow">
                        OBSERVATION {String(index + 1).padStart(2, "0")}
                      </span>
                      <p>{observation.note}</p>
                      <FactSections
                        facts={observation.facts}
                        sources={[...company.sources, ...observation.sources]}
                      />
                    </article>
                  ))
                ) : (
                  <EmptyState
                    title="No linked research observations"
                    text="This profile has no additional imported observations in the current release."
                  />
                )}
              </div>
            )}
            {tab === "sources" && (
              <div className="profile-body">
                <div className="source-intro">
                  <h3>Evidence register</h3>
                  <p>
                    Per-field references are attached to each fact. Public links
                    are provided where available; retained private source
                    content is not exposed.
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
                          : "date not disclosed"}
                        <br />
                        Retrieved{" "}
                        {source.retrievedDate
                          ? dateLabel(source.retrievedDate)
                          : "date not disclosed"}
                      </p>
                      {!safeUrl(source.url) && (
                        <small>Public source link not available.</small>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="profile-footer">
              <Check size={12} /> Original record identity retained ·
              source-linked evidence
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}

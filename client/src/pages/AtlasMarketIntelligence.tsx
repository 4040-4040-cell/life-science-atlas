import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowUpRight, ChevronDown, Map, Printer, X } from "lucide-react";
import intelligenceData from "@/lib/marketIntelligence.json";
import { DownloadLink, PageHeader } from "@/components/atlas/AtlasShell";
import { safeUrl } from "@/lib/atlas";
import { normalizeMarketBrief } from "@/lib/marketIntelligenceView";
import { BaselAvailabilityRegister } from "@/components/atlas/BaselAvailabilityRegister";
import "./AtlasMarketIntelligence.css";

type Source = { id?: string; title?: string; url?: string };
type Area = {
  id?: string; name: string; baselineCompanies?: number; researchCandidates?: number;
  addressSites?: number; operatingSites?: number; sourceSupportedOperatingSites?: number; plannedSites?: number;
  tierA?: number; tierB?: number; tierC?: number; unscored?: number;
  cashMillionUsd?: number | null; cashReportingEntities?: number; cashPeriodRange?: string | string[];
  companyIds?: string[]; siteCompanyIds?: string[];
};
type Callout = { id?: string; companyId?: string; name: string; logoUrl?: string | null; area?: string; class?: string };
type Signal = { companyId?: string; companyName?: string; title?: string; text?: string; eventDate?: string; eventStatus?: string; direction?: string; areaName?: string; sources?: Source[]; sourceIds?: string[] };
type Brief = {
  id: string; title: string; subtitle?: string; headline?: string; decisionRead?: string;
  metrics?: { label: string; value: string | number | null; note?: string }[];
  areas?: Area[]; assignments?: Callout[]; signals?: Signal[]; capitalNote?: string;
  mapImageUrl?: string; coreAerialImageUrl?: string; coreAerialTitle?: string;
  coreAerialAttribution?: string; coreAerialCaptureYears?: (string | number)[];
  companyCallouts?: Callout[]; sources?: Source[]; notes?: string[]; pdfUrl?: string;
};
const edition = intelligenceData as unknown as { edition?: string; asOf?: string; markets: Record<string, Brief> };
const integer = (value?: number) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US") : "Not disclosed";
const money = (value?: number | null) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "n/a";

export default function AtlasMarketIntelligence({ regionId, onCompany }: { regionId: string; onCompany: (id: string) => void }) {
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const sourceMarket = edition.markets[regionId];
  const market = sourceMarket ? normalizeMarketBrief(sourceMarket) as Brief : undefined;
  if (!market) return <section className="market-brief"><h1>This market brief is not available.</h1><Link href="/">Back to all hubs</Link></section>;
  const sourceLookup = new globalThis.Map((market.sources || []).map(source => [source.id, source]));
  const selectedArea = market.areas?.find(area => area.id === selectedAreaId);
  const selectedIds = new Set([...(selectedArea?.companyIds || []), ...(selectedArea?.siteCompanyIds || [])]);
  const areaCompanies = (market.assignments || []).filter(company => selectedIds.has(company.id || company.companyId || ""));
  const metrics = <div className="brief-metrics">{market.metrics?.map(metric => <div className="metric" key={metric.label}><span className="metric-label">{metric.label}</span><strong>{metric.value == null ? "n/a" : typeof metric.value === "number" ? metric.value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : metric.value}</strong>{metric.note && <small>{metric.note}</small>}</div>)}</div>;
  return <div className="market-brief" data-register-region={regionId === "basel" ? "basel" : undefined}>
    <Link className="breadcrumb" href={`/hub/${regionId}`}><ArrowLeft size={12} />Back to map and companies</Link>
    <PageHeader eyebrow="MARKET INTELLIGENCE" title={market.title} description={market.subtitle}>
      <Link className="button button-small" href={`/hub/${regionId}`}><Map size={14} />Interactive map</Link>
      {regionId === "basel" && <><Link className="button button-small" href="/canton/basel-stadt">Basel-Stadt buildings</Link><Link className="button button-small" href="/canton/basel-landschaft">Basel-Landschaft buildings</Link></>}
      <Link className="button button-small" href={`/print/${regionId}`}><Printer size={14} />Print this market</Link>
      {market.pdfUrl && <DownloadLink url={safeUrl(market.pdfUrl)}>One-page PDF</DownloadLink>}
    </PageHeader>
    {(market.decisionRead || market.headline) && <p className="brief-takeaway">{market.decisionRead || market.headline}</p>}
    {regionId !== "basel" && metrics}
    <div className="brief-body">
      <section className="brief-geography" aria-label="Geographic context and selected companies">
        <h2>Geographic context</h2>
        {safeUrl(market.mapImageUrl) && <img className="brief-map" src={safeUrl(market.mapImageUrl)!} alt={`${market.title}: retained geographic hub context`} />}
        {safeUrl(market.coreAerialImageUrl) && <figure className="brief-aerial"><img src={safeUrl(market.coreAerialImageUrl)!} alt={market.coreAerialTitle || "Retained core aerial context"} /><figcaption>{market.coreAerialTitle || "Core aerial context"}. Analytical frame, not a formal submarket boundary. {market.coreAerialAttribution} {market.coreAerialCaptureYears?.length ? `Imagery capture: ${market.coreAerialCaptureYears.join(", ")}.` : "Imagery acquisition vintage not retained."}</figcaption></figure>}
        {!!market.companyCallouts?.length && <section className="brief-callouts"><h3>Selected companies</h3><p>Click a company for its locations, financial scope and sources. Selection is not endorsement or a tenant census.</p><div>{market.companyCallouts.map((company, index) => <button key={company.id || company.companyId || index} onClick={() => (company.id || company.companyId) && onCompany((company.id || company.companyId)!)}>
          {safeUrl(company.logoUrl) && <img src={safeUrl(company.logoUrl)!} alt="" onError={event => { event.currentTarget.style.display = "none"; }} />}
          <span><strong>{company.name}</strong>{company.area && <small>{company.area}</small>}</span><ArrowUpRight size={13} />
        </button>)}</div></section>}
      </section>
      <section className="brief-comparison">
        {regionId === "basel" && metrics}
        <h2>Primary research-area comparison</h2>
        <p className="brief-scope">Companies are assigned once within this hub from retained location evidence. These are not verified headquarters counts. Click an area to inspect its assigned profiles and other physical-site operators.</p>
        {market.capitalNote && <p className="brief-capital">{market.capitalNote}</p>}
        <div className="brief-table-scroll"><table><thead><tr><th>Research area</th><th>Baseline /<br />candidates</th><th>Operating /<br />address sites</th><th>Model<br />A / B / C / U</th><th>Company cash<br />USD millions</th></tr></thead><tbody>{market.areas?.map((area, index) => <tr key={area.id || area.name || index}>
          <th scope="row"><button className="brief-area-button" onClick={() => setSelectedAreaId(area.id === selectedAreaId ? null : area.id || null)} aria-expanded={area.id === selectedAreaId}>{area.name}<ChevronDown size={12} /></button></th>
          <td>{integer(area.baselineCompanies)} / {integer(area.researchCandidates)}</td>
          <td>{integer(area.sourceSupportedOperatingSites ?? area.operatingSites)} / {integer(area.addressSites)}{!!area.plannedSites && <small>{integer(area.plannedSites)} planned, excluded</small>}</td>
          <td>{integer(area.tierA)} / {integer(area.tierB)} / {integer(area.tierC)} / {integer(area.unscored)}</td>
          <td title={area.cashPeriodRange ? `Reporting period ends: ${Array.isArray(area.cashPeriodRange) ? area.cashPeriodRange.join(" to ") : area.cashPeriodRange}` : "No qualifying current exact cash disclosure"}>{money(area.cashMillionUsd)}<small>{integer(area.cashReportingEntities)} disclosed entities</small>{area.cashPeriodRange && <small>{Array.isArray(area.cashPeriodRange) ? [...new Set(area.cashPeriodRange)].join(" to ") : area.cashPeriodRange}</small>}</td>
        </tr>)}</tbody></table></div>
        <p className="brief-table-note">Operating sites require retained current physical-site support; address sites additionally require an accepted coordinate match. Planned projects are separate. Neither count verifies suites, occupancy area or lease obligations. U means unscored. Tiers are analyst-priority assumptions, not lease credit. Cash is companywide and is not local payroll, committed capital or forecast space demand.</p>
        {selectedArea && <section className="brief-area-roster" aria-label="Selected area company roster"><header><h3>{selectedArea.name}</h3><button className="icon-button" onClick={() => setSelectedAreaId(null)} aria-label="Close area company roster"><X size={15} /></button></header><p>Primary assignments plus other retained physical-site operators. Parent cash does not move to an outside plant.</p><div>{areaCompanies.map(company => <button key={company.id || company.companyId} onClick={() => onCompany((company.id || company.companyId)!)}><strong>{company.name}</strong><small>{selectedArea.companyIds?.includes(company.id || company.companyId || "") ? company.class === "research" ? "Research candidate, primary assignment" : "Source-supported primary assignment" : "Other physical-site operator"}</small><ArrowUpRight size={12} /></button>)}</div>{!areaCompanies.length && <p>No assigned company profiles are retained. Site or project evidence is separate from a company-count claim.</p>}</section>}
        <h2 className="brief-signals-heading">Selected physical-space actions</h2>
        <p className="brief-scope">2025–2026 disclosures where dates are established. Plans, openings, moves, subleases and ownership changes are not interchangeable.</p>
        <div className="brief-signals">{market.signals?.map((signal, index) => {
          const sources = signal.sources?.length ? signal.sources : (signal.sourceIds || []).map(id => sourceLookup.get(id)).filter((source): source is Source => !!source);
          return <article key={`${signal.companyId || "signal"}-${index}`}>
            <div className="brief-signal-meta"><span>{signal.eventDate || "Event date not disclosed"}</span><span>{(signal.eventStatus || "Retained disclosure").replaceAll("_", " ")}</span>{signal.areaName && <span>{signal.areaName}</span>}</div>
            {signal.companyId ? <button className="brief-company-link" onClick={() => onCompany(signal.companyId!)}>{signal.companyName || signal.title}<ArrowUpRight size={13} /></button> : <h3>{signal.companyName || signal.title}</h3>}
            <p>{signal.text || signal.title}</p>
            <div className="brief-sources">{sources.slice(0, 2).map((source, sourceIndex) => safeUrl(source.url) && <a key={source.id || sourceIndex} href={safeUrl(source.url)!} target="_blank" rel="noopener noreferrer">{source.title || "Primary source"}<ArrowUpRight size={11} /></a>)}</div>
          </article>;
        })}</div>
        {!market.signals?.length && <p className="brief-scope">No qualifying physical-space action is retained for this market. Missing evidence is not evidence of flat demand.</p>}
      </section>
    </div>
    {regionId === "basel" && <BaselAvailabilityRegister compact onCompany={onCompany} />}
    <footer className="brief-notes"><h2>Sources and reading the figures</h2>{market.notes?.map((note, index) => <p key={index}>{note}</p>)}<p>Research snapshot as of {edition.asOf || "the dated source records"}. Original reporting periods remain with each company profile. Geographic coverage is a selected baseline, not every life-science entity.</p><Link href="/methodology">Full methodology and evidence policy<ArrowUpRight size={12} /></Link><details><summary>Retained source index</summary>{market.sources?.map((source, index) => safeUrl(source.url) && <a key={source.id || index} href={safeUrl(source.url)!} target="_blank" rel="noopener noreferrer">{source.title || source.id || "Source"}<ArrowUpRight size={11} /></a>)}</details></footer>
  </div>;
}

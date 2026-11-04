import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight, Download, Search, X } from 'lucide-react';
import type { BaselCantonId } from '@shared/baselCantonDetail';
import type { BaselAvailabilityRecord, BaselAvailabilityRegister as Register, BaselCompanyRecord, BaselRegisterCanton, BaselRegisterSource } from '@shared/baselAvailability';
import registerData from '@/lib/baselAvailabilityRegisterV1.json';
import releaseData from '@/lib/baselRegisterDownloadV1.json';
import { safeUrl } from '@/lib/atlas';
import { AVAILABILITY_LABELS, COMPANY_EVIDENCE_LABELS, areaText, cleanRegisterText as text, downloadRegisterCsv, filterRegisterRecords } from '@/lib/baselRegisterView';
import { cantonRegisterRoute, scrollToCantonRegister } from '@/lib/cantonRegisterNavigation';
import './BaselAvailabilityRegister.css';

const register = registerData as unknown as Register;
const CANTONS = { BS: { name: 'Basel-Stadt', id: 'basel-stadt' }, BL: { name: 'Basel-Landschaft', id: 'basel-landschaft' } } as const;
// Static import works in both Vite and the no-network IIFE edition.
const release = releaseData;

function RegisterSources({ ids, urls = [], sources }: { ids: string[]; urls?: string[]; sources: BaselRegisterSource[] }) {
  const selected = ids.map(id => sources.find(source => source.id === id)).filter((source): source is BaselRegisterSource => !!source);
  const extraUrls = [...new Set(urls)].filter(url => !selected.some(source => source.url === url));
  return <details className="basel-register-sources"><summary>Source URLs and dates ({selected.length + extraUrls.length})</summary>
    {selected.map(source => <div key={source.id}>{safeUrl(source.url) ? <a href={safeUrl(source.url)!} target="_blank" rel="noopener noreferrer">{text(source.title)}<ArrowUpRight size={12} /></a> : <strong>{text(source.title)} · No public URL retained</strong>}<small>Published {source.publishedDate || 'date not disclosed'} · Observed {source.observedAsOf || 'date not disclosed'}</small>{source.url && <small className="basel-source-url">{source.url}</small>}<small>{text(source.notes)}</small></div>)}
    {extraUrls.map(url => <div key={url}>{safeUrl(url) && <a href={safeUrl(url)!} target="_blank" rel="noopener noreferrer">{url}<ArrowUpRight size={12} /></a>}<small>Publication date not separately disclosed in this URL reference. See record observation date.</small></div>)}
    {!selected.length && !extraUrls.length && <p>No public supporting source supplied. This is an evidence gap, not confirmation.</p>}
  </details>;
}
function RawFields({ value }: { value: Record<string, unknown> }) {
  return <dl className="basel-register-fields">{Object.entries(value).map(([key, field]) => <div key={key}><dt>{key}</dt><dd>{text(field)}</dd></div>)}</dl>;
}
function EvidenceDialog({ record, close, onCompany }: { record: BaselCompanyRecord | BaselAvailabilityRecord; close: () => void; onCompany: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const company = 'evidenceState' in record;
  return <dialog ref={dialog} className="basel-register-dialog" aria-label="Basel register source evidence" onCancel={close}>
    <header><div><span className="eyebrow">DATED REGISTER EVIDENCE</span><h2>{company ? record.name : record.building}</h2></div><button onClick={close} aria-label="Close register evidence"><X size={20} /></button></header>
    <div className="basel-register-dialog-body"><p>{record.address}</p><span className="basel-register-state">{company ? COMPANY_EVIDENCE_LABELS[record.evidenceState] : AVAILABILITY_LABELS[record.availabilityState]}</span>
      {company ? <><p>{text(record.evidenceExplanation)}</p><p className="basel-register-caveat">Official contact and registry evidence do not establish laboratory use, staffed tenancy, occupied area or lease commitments. Campus residency does not prove a specific suite.</p>{record.companyId && <button className="basel-register-action" onClick={() => { close(); onCompany(record.companyId!); }}>Open exact existing company profile<ArrowUpRight size={14} /></button>}<RegisterSources ids={record.supportSourceIds} urls={record.supportUrls} sources={register.sources} /></> : <><p>{text(record.notes)}</p><p className="basel-register-caveat">Marketing is not owner-confirmed vacancy. Source-listed floor plates, whole-building sizes, campus aggregates, future releases and refurbishment are not ready-to-lease laboratory supply.</p><RegisterSources ids={record.sourceIds} urls={record.sourceUrls} sources={register.sources} /></>}
      <h3>Full retained record and original source row</h3><RawFields value={record as unknown as Record<string, unknown>} />
    </div>
  </dialog>;
}
function CantonSummary({ canton }: { canton: BaselRegisterCanton }) {
  const totals = register.totals[canton];
  const counts = totals.evidenceCounts;
  return <article className="basel-register-canton-card"><header><h3>{CANTONS[canton].name}</h3><Link href={cantonRegisterRoute(CANTONS[canton].id)} onClick={() => scrollToCantonRegister(CANTONS[canton].id)}>Full register<ArrowUpRight size={12} /></Link></header>
    <div className="basel-register-supply"><div><span>Current marketed</span><strong>{areaText(totals.currentMarketedM2)}</strong><small>Measured, selected non-overlapping offers</small></div><div><span>Future marketed</span><strong>{areaText(totals.futureMarketedM2)}</strong><small>Not current ready supply</small></div><div><span>Refurbishment / planned</span><strong>{areaText(totals.underRefurbishmentM2)}</strong><small>Separate from current offers</small></div></div>
    {!!Object.keys(totals.measuredCurrentMarketedOfferByUseTypeM2).length && <p className="basel-register-use-breakdown">Current offer use: {Object.entries(totals.measuredCurrentMarketedOfferByUseTypeM2).map(([use, area]) => `${text(use)}: ${areaText(area)}`).join(' · ')}</p>}
    <dl className="basel-register-evidence-counts">{Object.entries(COMPANY_EVIDENCE_LABELS).map(([state, label]) => <div key={state}><dt>{label}</dt><dd>{counts[state as keyof typeof counts]}</dd></div>)}</dl>
    <p className="basel-register-small">{totals.companyRecords} source company records, not unique firms or confirmed tenancies. Registry and contact rows are not added to operating counts.</p>
  </article>;
}
function RegionalForecast() {
  const forecast = register.forecast;
  return <aside className="basel-register-forecast"><div><span className="eyebrow">REGIONAL FORECAST ONLY</span><h3>{areaText(forecast.annualLowerM2)} to {areaText(forecast.annualUpperM2)} per year</h3><p>{text(forecast.metric)} · {text(forecast.geography)} · {text(forecast.horizon)}</p></div><p>{text(forecast.notes)}</p><RegisterSources ids={forecast.sourceIds} sources={register.sources} /></aside>;
}
export function BaselAvailabilityRegister({ cantonId, compact = false, onCompany }: { cantonId?: BaselCantonId; compact?: boolean; onCompany: (id: string) => void }) {
  const scopedCanton = cantonId === 'basel-stadt' ? 'BS' : cantonId === 'basel-landschaft' ? 'BL' : '';
  const [view, setView] = useState<'availability' | 'company'>('availability');
  const [canton, setCanton] = useState<BaselRegisterCanton | ''>(scopedCanton);
  const [q, setQ] = useState('');
  const [availabilityState, setAvailabilityState] = useState('current_marketed');
  const [companyState, setCompanyState] = useState('all');
  const [selected, setSelected] = useState<BaselCompanyRecord | BaselAvailabilityRecord | null>(null);
  useEffect(() => { setCanton(scopedCanton); setQ(''); setSelected(null); }, [scopedCanton]);
  const availability = useMemo(() => register.availabilityRecords.filter(record => !canton || record.canton === canton), [canton]);
  const companies = useMemo(() => register.companyRecords.filter(record => !canton || record.canton === canton), [canton]);
  const displayedAvailability = useMemo(() => filterRegisterRecords(availability, q, availabilityState), [availability, q, availabilityState]);
  const displayedCompanies = useMemo(() => filterRegisterRecords(companies, q, companyState), [companies, q, companyState]);
  const displayed = view === 'availability' ? displayedAvailability : displayedCompanies;
  const scope = canton ? CANTONS[canton].name : 'Both Basel cantons';
  const isComplete = register.status === 'complete';
  return <section className={`basel-register ${compact ? 'compact' : ''}`} id="basel-corrected-register" data-register-canton={cantonId || 'both'} aria-label="Corrected Basel availability and company crosswalk">
    <header className="basel-register-heading"><div><span className="eyebrow">BASEL EVIDENCE REGISTER · {register.version}</span><h2>{compact ? 'Basel availability and company evidence' : `${scope}: availability and company crosswalk`}</h2><p>Observed as of {register.asOf}. Current marketed offers are not confirmed vacancy. Unmeasured availability remains unknown, never zero.</p></div>{safeUrl(release?.url) && <a className="basel-register-action" href={safeUrl(release?.url)!} target="_blank" rel="noopener noreferrer"><Download size={14} />Complete register download</a>}</header>
    {!isComplete && <p role="status" className="basel-register-caveat">Availability reconciliation is still pending. Property source history is retained separately and is not advertised as a corrected current offer register.</p>}
    <div className="basel-register-summaries">{(canton ? [canton] : ['BS', 'BL'] as BaselRegisterCanton[]).map(code => <CantonSummary key={code} canton={code} />)}</div>
    {compact ? <><p className="basel-register-caveat">Source-supported operating is separate from official contact, campus residency and registry-only evidence. Neither an official contact page nor a company registration proves a laboratory or staffed tenancy.</p><div className="basel-register-compact-links"><Link href={cantonRegisterRoute('basel-stadt')} onClick={() => scrollToCantonRegister('basel-stadt')}>Search Basel-Stadt availability and company crosswalk<ArrowUpRight size={14} /></Link><Link href={cantonRegisterRoute('basel-landschaft')} onClick={() => scrollToCantonRegister('basel-landschaft')}>Search Basel-Landschaft availability and company crosswalk<ArrowUpRight size={14} /></Link></div></> : <>
      <div className="basel-register-views" aria-label="Register view"><button aria-pressed={view === 'availability'} onClick={() => { setView('availability'); setQ(''); }}>Building / floor availability</button><button aria-pressed={view === 'company'} onClick={() => { setView('company'); setQ(''); }}>Company crosswalk</button></div>
      <div className="basel-register-filters"><label className="basel-register-search"><span>Search {view === 'availability' ? 'building, floor, campus, address or use' : 'company, address or source row'}</span><div><Search size={16} /><input type="search" value={q} onChange={event => setQ(event.target.value)} placeholder={view === 'availability' ? 'Building, campus or street' : 'Company name or address'} /></div></label>
        {!scopedCanton && <label><span>Canton</span><select value={canton} onChange={event => setCanton(event.target.value as BaselRegisterCanton | '')}><option value="">Both Basel cantons</option><option value="BS">Basel-Stadt</option><option value="BL">Basel-Landschaft</option></select></label>}
        <label><span>{view === 'availability' ? 'Offer state' : 'Company evidence'}</span>{view === 'availability' ? <select value={availabilityState} onChange={event => setAvailabilityState(event.target.value)}>{Object.entries(AVAILABILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="all">All states including source history</option></select> : <select value={companyState} onChange={event => setCompanyState(event.target.value)}><option value="all">All evidence states</option>{Object.entries(COMPANY_EVIDENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}</label>
      </div>
      <div className="basel-register-results"><p role="status">{displayed.length} of {view === 'availability' ? availability.length : companies.length} {scope} records shown. No row cap.</p><button className="basel-register-action" onClick={() => downloadRegisterCsv(displayed, `Basel_${canton || 'BS_BL'}_${view}_filtered_${register.version}.csv`)}><Download size={14} />Download filtered CSV</button><button className="basel-register-action" onClick={() => downloadRegisterCsv(view === 'availability' ? availability : companies, `Basel_${canton || 'BS_BL'}_${view}_complete_${register.version}.csv`)}>Download all {scope} rows</button></div>
      <div className="basel-register-table" tabIndex={0} aria-label="Scrollable complete register table">
        {view === 'availability' ? <table><caption>Source-published building and floor evidence. Current marketing is not owner-confirmed vacancy.</caption><thead><tr><th>Building / floor</th><th>Use / source-listed area</th><th>Offer state / dates</th><th>Totals treatment / evidence</th></tr></thead><tbody>{displayedAvailability.map(record => <tr key={record.id} data-availability-record={record.id}><th scope="row"><button className="basel-register-record-link" onClick={() => setSelected(record)}>{record.building}<ArrowUpRight size={12} /></button><small>{record.campus}</small><small>Floor: {record.floor || 'Not separately disclosed'}</small><small>{record.address} · {record.canton}</small></th><td>{text(record.useType)}<strong className="basel-register-area">{areaText(record.areaM2)}</strong><small>{text(record.areaBasis)}</small></td><td><span className={`basel-register-state ${record.availabilityState === 'current_marketed' ? 'current' : ''}`}>{AVAILABILITY_LABELS[record.availabilityState]}</span><small>Available from: {record.availableFrom || 'Not confirmed'}</small><small>Observed: {record.observedAsOf || 'Not disclosed'}</small><small>Published: {record.publishedDate || 'Not disclosed'}</small></td><td><small>{record.includeInTotal ? 'Included in its measured, non-overlapping state subtotal' : `Excluded from measured total: ${text(record.exclusionReason)}`}</small>{record.overlapGroup && <small>Overlap group: {record.overlapGroup}</small>}<RegisterSources ids={record.sourceIds} urls={record.sourceUrls} sources={register.sources} /><button className="basel-register-record-link" onClick={() => setSelected(record)}>Full source detail and original row</button></td></tr>)}</tbody></table> : <table><caption>Supplied company rows with conservative evidence crosswalks. Contacts and registry rows are not verified operating tenancies.</caption><thead><tr><th>Company / exact profile</th><th>Source address</th><th>Evidence state</th><th>Evidence explanation / sources</th></tr></thead><tbody>{displayedCompanies.map(record => <tr key={record.id} data-company-crosswalk={record.id}><th scope="row"><button className="basel-register-record-link" data-shared-company-id={record.companyId || undefined} onClick={() => record.companyId ? onCompany(record.companyId) : setSelected(record)}>{record.name}<ArrowUpRight size={12} /></button><small>{record.companyId ? 'Exact existing shared profile' : 'Own evidence card, no shared profile match'}</small><small>Source row {record.sourceRowIndex} · {record.canton}</small></th><td>{record.address || 'Not disclosed'}<small>{record.sourceFile}</small></td><td><span className="basel-register-state">{COMPANY_EVIDENCE_LABELS[record.evidenceState]}</span></td><td><p>{text(record.evidenceExplanation)}</p><RegisterSources ids={record.supportSourceIds} urls={record.supportUrls} sources={register.sources} /><button className="basel-register-record-link" onClick={() => setSelected(record)}>Full evidence / original source row</button></td></tr>)}</tbody></table>}
      </div>
      {!displayed.length && <p className="basel-register-empty">No records match this view. Try another evidence state or clear the search. This is not proof of zero availability or no companies.</p>}
      <p className="basel-register-caveat">Current marketed, future marketed, refurbishment and property context are separate. Campus totals and their building / floor components are never added together. Official contacts and registry-only rows do not establish laboratory use or staffed premises. Historical unchecked availability remains source history, not the corrected current register.</p>
    </>}
    <RegionalForecast />
    {!compact && <details className="basel-register-preservation"><summary>Complete source index, source-row preservation and subtotal definitions</summary><RegisterSources ids={register.sources.map(source => source.id)} sources={register.sources} />{(canton ? [canton] : ['BS', 'BL'] as BaselRegisterCanton[]).map(code => <div key={code}><h3>{CANTONS[code].name}: subtotal definitions</h3><RawFields value={register.totals[code] as unknown as Record<string, unknown>} /></div>)}<h3>Preservation record</h3><RawFields value={register.preservation as unknown as Record<string, unknown>} /></details>}
    {selected && <EvidenceDialog key={selected.id} record={selected} close={() => setSelected(null)} onCompany={onCompany} />}
  </section>;
}

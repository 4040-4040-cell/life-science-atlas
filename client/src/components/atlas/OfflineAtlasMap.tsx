import { useEffect, useMemo, useRef, useState } from 'react';
import type { AerialView, AtlasRegion, CompanySummary, MapSite, Zone } from '@shared/atlas';
import { count, precisionOf } from '@/lib/atlas';
import { offlineAssetUrl } from '@/lib/offlineAtlas';
import { offlineAerialSites, rasterPosition } from '@/lib/offlineGeography';
import './OfflineAtlasMap.css';

interface Props {
  region: AtlasRegion; sites: MapSite[]; companies?: CompanySummary[]; zones: Zone[];
  aerial?: AerialView; onCompany: (id: string) => void;
}
/** Saved geographic figures are not georeferenced overlays; city buttons are separate. */
export function OfflineOverviewMap({ regions, onRegion }: { regions: AtlasRegion[]; onRegion: (id: string) => void }) {
  return <div className="offline-overview-map" role="region" aria-label="Offline regional hub index">
    <div className="offline-index-intro"><span className="eyebrow">OFFLINE REGIONAL INDEX</span><h2>Choose a research geography</h2><p>Retained source-supported baseline. No live map or automatic refresh.</p></div>
    <div className="offline-hub-index">{regions.map(region => <button key={region.id} type="button" onClick={() => onRegion(region.id)}><strong>{region.name}</strong><span>{count(region.baselineCompanies)} baseline profiles</span><small>{region.country}</small></button>)}</div>
  </div>;
}
function SiteName({ site, company }: { site: MapSite; company?: CompanySummary }) {
  const src = offlineAssetUrl(company?.logoUrl);
  return <>{src && <img src={src} alt="" className="offline-site-logo" onError={event => { event.currentTarget.hidden = true; }} />}<span>{company?.name || site.company}</span></>;
}
export function OfflineAtlasMap({ region, sites, companies = [], aerial, onCompany }: Props) {
  const [zoom, setZoom] = useState(1);
  const [labels, setLabels] = useState(true);
  const [city, setCity] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [imageWidth, setImageWidth] = useState(900);
  const [imageAspect, setImageAspect] = useState(.5);
  const canvasRef = useRef<HTMLDivElement>(null);
  const companyById = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);
  const plotted = useMemo(() => aerial ? offlineAerialSites(sites, aerial) : [], [sites, aerial]);
  const imageUrl = offlineAssetUrl(aerial?.imageUrl || region.macroUrl);
  useEffect(() => { setZoom(1); setCity(''); setSelected([]); setFailed(false); }, [region.id, aerial?.id]);
  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver(entries => setImageWidth(entries[0]?.contentRect.width || 900));
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [aerial?.id]);
  const cities = useMemo(() => [...new Set(sites.map(s => s.city || 'City not disclosed'))].sort(), [sites]);
  const macroSites = useMemo(() => sites.filter(s => !city || (s.city || 'City not disclosed') === city).sort((a, b) => a.company.localeCompare(b.company) || a.id.localeCompare(b.id)), [sites, city]);
  // Labels are collision-controlled; every exact coordinate dot and list row stays clickable.
  const callouts = useMemo(() => {
    const kept: { x: number; y: number }[] = [];
    const allowed = new Set<string>();
    for (const record of plotted) {
      if (!record.position) continue;
      const x = record.position.x / 100 * imageWidth;
      const y = record.position.y / 100 * imageWidth * imageAspect;
      if (record.position.x > 80 || record.position.y < 4 || record.position.y > 95 || kept.some(p => Math.abs(p.x - x) < 195 && Math.abs(p.y - y) < 48)) continue;
      kept.push({ x, y }); allowed.add(record.site.id);
    }
    return allowed;
  }, [plotted, imageWidth, imageAspect]);
  const bounds = aerial?.imageBounds ?? aerial?.bounds;
  const frameSW = aerial && bounds ? rasterPosition(aerial.bounds[1], aerial.bounds[0], bounds) : undefined;
  const frameNE = aerial && bounds ? rasterPosition(aerial.bounds[3], aerial.bounds[2], bounds) : undefined;
  const addresses = plotted.filter(p => !p.campus).length;
  const campuses = plotted.filter(p => p.campus).length;
  const selectPoint = (id: string) => {
    const record = plotted.find(p => p.site.id === id);
    if (!record?.position) return;
    const overlapping = plotted.filter(p => p.position && Math.abs(p.position.x - record.position!.x) * imageWidth / 100 < 22 && Math.abs(p.position.y - record.position!.y) * imageWidth * imageAspect / 100 < 22).map(p => p.site.id);
    if (overlapping.length === 1) onCompany(record.site.profileId);
    else setSelected(overlapping);
  };
  // A filter change may remove selected IDs before the next user action.
  // Render only still-present records; never dereference stale selections.
  const selectedRecords = plotted.filter(record => selected.includes(record.site.id));
  return <section className={`offline-atlas-map ${aerial ? 'offline-is-aerial' : 'offline-is-macro'}`} aria-label={`${region.name} retained offline map`}>
    <div className="offline-map-heading"><div><span className="eyebrow">{aerial ? 'RETAINED GEOREFERENCED AERIAL' : 'RETAINED REGIONAL FIGURE'}</span><strong>{aerial?.title || region.name}</strong></div><span className="offline-mode-tag">Offline snapshot</span></div>
    {aerial && <div className="offline-map-tools"><button type="button" onClick={() => setZoom(z => Math.max(1, z - .5))} disabled={zoom <= 1} aria-label="Zoom out">−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom(z => Math.min(4, z + .5))} disabled={zoom >= 4} aria-label="Zoom in">+</button><button type="button" onClick={() => setZoom(1)}>Reset</button><button type="button" onClick={() => setLabels(value => !value)} aria-pressed={labels}>Site names</button></div>}
    <div className="offline-map-scroll"><div ref={canvasRef} className="offline-map-raster" style={{ width: `${zoom * 100}%` }}>
      {imageUrl && !failed ? <img src={imageUrl} alt={aerial ? `${aerial.title}: retained attributed aerial image at original raster bounds` : `${region.name}: retained macro map with original numbered city-group index; no interactive site coordinates overlaid`} className="offline-raster-image" onLoad={event => setImageAspect(event.currentTarget.naturalHeight / event.currentTarget.naturalWidth)} onError={() => setFailed(true)} /> : <div className="offline-image-error" role="alert">The saved image is missing from this package. No online map is substituted.</div>}
      {aerial && !failed && imageUrl && <>
        {frameSW && frameNE && <div className="offline-study-frame" aria-hidden="true" style={{ left: `${frameSW.x}%`, top: `${frameNE.y}%`, width: `${frameNE.x - frameSW.x}%`, height: `${frameSW.y - frameNE.y}%` }} />}
        {plotted.map(({ site, position, campus }) => position && <button key={site.id} type="button" className={`offline-map-pin ${campus ? 'offline-campus-pin' : 'offline-address-pin'}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} title={`${site.company} · ${campus ? 'Campus reference, not a verified company suite' : 'Source-address matched baseline'} · ${site.address}`} aria-label={`Open ${site.company} profile. ${campus ? 'Campus reference, not a verified company suite.' : 'Source-address matched baseline.'}`} onClick={() => selectPoint(site.id)}><i />{labels && callouts.has(site.id) && <span className="offline-pin-callout"><SiteName site={site} company={companyById.get(site.profileId)} /><small>{campus ? 'Campus reference' : 'Address-matched'}</small></span>}</button>)}
      </>}
    </div></div>
    {selectedRecords.length > 0 && <div className="offline-overlap-list" role="region" aria-label="Overlapping site records"><button type="button" className="offline-close-list" onClick={() => setSelected([])}>Close overlapping records</button>{selectedRecords.map(record => <button key={record.site.id} type="button" onClick={() => onCompany(record.site.profileId)}><strong>{record.site.company}</strong><small>{record.campus ? 'Campus reference · not a verified company suite' : 'Address-matched'} · {record.site.address}</small></button>)}</div>}
    <div className="offline-map-evidence">{aerial ? <><strong>{count(addresses)} address-matched sites{campuses ? ` · ${count(campuses)} campus references` : ''}</strong><span>Dots use retained native raster bounds, not study-frame bounds or padded exhibits. Only explicit exhibit-linked baseline records are eligible. No city centroids or unchecked imports are pinned.</span><span>Dashed squares are campus references, not company suites. Logos identify companies, not verified occupied premises.</span></> : <><strong>Saved macro map · city-group orientation only</strong><span>The numbered city groups belong to the original baseline map. The clickable list below follows current filters and can include unchecked research. It is not georeferenced to the padded image, and no building pins are inferred.</span></>}</div>
    {aerial && <div className="offline-aerial-credit"><strong>{aerial.attribution}</strong><span>{aerial.captureYears.length ? `Catalog acquisition year${aerial.captureYears.length > 1 ? 's' : ''}: ${aerial.captureYears.join(', ')}. ` : 'Imagery acquisition date unconfirmed. '}{aerial.captureNote}</span></div>}
    <details className="offline-site-index" open={!aerial}><summary>{aerial ? 'Every eligible aerial site / profile' : 'Filtered city / profile index'} ({aerial ? plotted.length : macroSites.length} site records)</summary>
      {!aerial && <label>City context<select value={city} onChange={event => setCity(event.target.value)}><option value="">All cities</option>{cities.map(c => <option key={c} value={c}>{c}</option>)}</select></label>}
      <div className="offline-site-rows">{(aerial ? plotted.map(r => r.site) : macroSites).map(site => <button key={site.id} type="button" onClick={() => onCompany(site.profileId)}><strong><SiteName site={site} company={companyById.get(site.profileId)} /></strong><span>{site.precision === 'campus_reference_address' ? 'Campus reference · not a verified company suite' : precisionOf(site) === 'address' ? 'Address-matched baseline' : precisionOf(site) === 'research' ? 'Unchecked research' : 'City context · not an address'}</span><small>{[site.address, site.city].filter(Boolean).join(' · ') || 'Address not disclosed'}</small></button>)}</div>
      {!(aerial ? plotted.length : macroSites.length) && <p>No eligible site records match this view and its filters.</p>}
    </details>
  </section>;
}

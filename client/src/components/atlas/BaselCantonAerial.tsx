import { useEffect, useMemo, useRef, useState } from 'react';
import type { RegionResponse } from '@shared/atlas';
import type { CantonAerialAddressReference, CantonAerialFrame } from '@shared/baselCantonDetail';
import { safeUrl } from '@/lib/atlas';
import { isAtlasOffline, offlineAssetUrl } from '@/lib/offlineAtlas';
import { offlineAerialSites, rasterPosition } from '@/lib/offlineGeography';
import { cantonReferencePosition } from '@/lib/cantonAerialGeometry';
import { groupAddressMarkers } from '@/lib/cantonMarkerGroups';
import { SourceLinks } from './Primitives';
import './BaselCantonAerial.css';

type MapRecord = { id: string; name: string; address: string; basis: string; campus: boolean; reference?: CantonAerialAddressReference; companyId?: string };
function AddressFallbackDialog({ record, aerial, close }: { record: MapRecord; aerial: CantonAerialFrame; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="canton-record-dialog" aria-label="Local postal-address evidence" onCancel={close}><header><h2>{record.name}</h2><button onClick={close} aria-label="Close local postal evidence">×</button></header><div className="canton-record-body"><p>{record.address}</p><p>{record.basis}</p><p>Source-address evidence only. No occupied suite, laboratory, staffed tenancy or vacancy is established by this anchor.</p><SourceLinks ids={record.reference?.sourceIds ?? []} sources={aerial.sources} /><details><summary>Complete retained address evidence</summary><pre className="canton-postal-evidence">{JSON.stringify(record.reference ?? record, null, 2).replaceAll('\u2014', ' - ')}</pre></details></div></dialog>;
}
function AddressGroupDialog({ records, close, open }: { records: MapRecord[]; close: () => void; open: (record: MapRecord) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="canton-record-dialog canton-address-group-dialog" aria-label="Nearby source-address records" onCancel={close}>
    <header><div><span className="eyebrow">POSTAL-ANCHOR RECORDS</span><h2>{records.length} nearby address records</h2></div><button onClick={close} aria-label="Close address record list">×</button></header>
    <div className="canton-record-body"><p>These pointer targets share or are close to a source-published postal anchor at this zoom. Each record retains its original coordinates. This list does not identify rooftops, occupied suites or vacant space.</p>
      <div className="canton-address-group-list">{records.map(record => <button key={record.id} data-address-record={record.id} onClick={() => { close(); open(record); }}><strong>{record.name}</strong><span>{record.address}</span><small>{record.basis}</small></button>)}</div>
    </div>
  </dialog>;
}
export function BaselCantonAerial({ aerial, region, siteIds, onCompany, onRecord }: {
  aerial: CantonAerialFrame; region: RegionResponse; siteIds: string[];
  onCompany: (id: string) => void; onRecord?: (reference: CantonAerialAddressReference) => void;
}) {
  const [zoom, setZoom] = useState(1); const [failed, setFailed] = useState(false); const [labels, setLabels] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<MapRecord[] | null>(null);
  const [selectedFallback, setSelectedFallback] = useState<MapRecord | null>(null);
  const raster = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const imageUrl = isAtlasOffline() ? offlineAssetUrl(aerial.imageUrl) : safeUrl(aerial.imageUrl);
  const exhibitUrl = aerial.exhibitUrl && (isAtlasOffline() ? offlineAssetUrl(aerial.exhibitUrl) : safeUrl(aerial.exhibitUrl));
  const bounds = aerial.imageBounds ?? aerial.bounds;
  const references = aerial.addressReferences ?? [];
  // Explicit producer references supersede duplicate legacy site pins. Exact native raster bounds are used.
  const plotted = useMemo(() => aerial.cantonOnly ? [] : offlineAerialSites(region.sites.filter(s => siteIds.includes(s.id) && !references.some(r => r.siteId === s.id)), aerial), [region.sites, aerial, siteIds, references]);
  const sourcePoints = useMemo(() => references.map(reference => ({ reference, position: cantonReferencePosition(reference, aerial) })), [references, aerial]);
  useEffect(() => { setFailed(false); setZoom(1); setSelectedGroup(null); setSelectedFallback(null); }, [aerial.id]);
  useEffect(() => {
    if (!raster.current) return;
    const observer = new ResizeObserver(entries => { const box = entries[0]?.contentRect; if (box?.width && box.height) setSize({ width: box.width, height: box.height }); });
    observer.observe(raster.current); return () => observer.disconnect();
  }, [aerial.id]);
  const sw = rasterPosition(aerial.bounds[1], aerial.bounds[0], bounds); const ne = rasterPosition(aerial.bounds[3], aerial.bounds[2], bounds);
  const sourceRecord = (r: CantonAerialAddressReference): MapRecord => ({ id: r.id, name: r.name, address: r.address, campus: r.referenceKind === 'campus_reference', basis: `${r.referenceKind === 'campus_reference' ? 'Campus reference, not occupied-suite proof' : 'Source-published address match'} · ${r.coordinateStatus}`, reference: r, companyId: r.companyId ?? undefined });
  const groups = useMemo(() => groupAddressMarkers([
    ...sourcePoints.flatMap(({ reference, position }) => position ? [{ id: reference.id, position, record: sourceRecord(reference) }] : []),
    ...plotted.flatMap(({ site, position, campus }) => position ? [{ id: site.id, position, record: { id: site.id, name: site.company, address: site.address ?? 'Address not supplied', campus: !!campus, basis: campus ? 'Campus reference, not a verified suite' : 'Retained address match', companyId: site.profileId } }] : []),
  ], size.width, size.height), [sourcePoints, plotted, size]);
  const labelIds = useMemo(() => {
    const placed: { x: number; y: number }[] = []; const ids = new Set<string>();
    for (const { id, position } of groups) if (position.x < 75 && position.y > 8 && position.y < 90 && !placed.some(p => Math.abs(p.x - position.x) < 22 && Math.abs(p.y - position.y) < 10)) { placed.push(position); ids.add(id); }
    return ids;
  }, [groups]);
  const openRecord = (record: MapRecord) => { if (record.reference && onRecord) onRecord(record.reference); else if (record.companyId) onCompany(record.companyId); else setSelectedFallback(record); };
  const streetFrame = aerial.frameKind === 'street_address' || references.length > 0;
  return <figure className="canton-aerial">
    <header><div><span className="eyebrow">{streetFrame ? 'STREET-ADDRESS AERIAL' : 'RETAINED AERIAL'}</span><h3>{aerial.title}</h3></div><div className="canton-map-tools"><button onClick={() => setZoom(z => Math.max(1, z - .5))} disabled={zoom <= 1} aria-label="Zoom aerial out">−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(z => Math.min(4, z + .5))} disabled={zoom >= 4} aria-label="Zoom aerial in">+</button><button onClick={() => setZoom(1)}>Reset</button><button aria-pressed={labels} onClick={() => setLabels(v => !v)}>Address labels</button></div></header>
    <div className="canton-aerial-scroll"><div ref={raster} className="canton-aerial-raster" style={{ width: `${zoom * 100}%` }}>
      {imageUrl && !failed ? <img src={imageUrl} alt={`${aerial.title}. Source-address aerial context, original uncropped raster bounds.`} onError={() => setFailed(true)} /> : <p className="canton-empty" role="status">Retained imagery is unavailable here. No online map is substituted in offline mode.</p>}
      {imageUrl && !failed && <>
        {sw && ne && <div className="canton-study-frame" style={{ left: `${sw.x}%`, top: `${ne.y}%`, width: `${ne.x - sw.x}%`, height: `${sw.y - ne.y}%` }} aria-hidden="true" />}
        {groups.map(group => {
          const multiple = group.members.length > 1; const first = group.members[0].record;
          return <button key={group.id} data-address-group={group.id} data-record-count={group.members.length} className={`canton-map-pin ${multiple ? 'address-group' : first.campus ? 'campus' : ''}`} style={{ left: `${group.position.x}%`, top: `${group.position.y}%` }} onClick={() => multiple ? setSelectedGroup(group.members.map(member => member.record)) : openRecord(first)} aria-label={multiple ? `${group.members.length} nearby source-address records: ${group.members.map(member => member.record.name).join('; ')}` : `${first.name}: ${first.basis}, ${first.address}`} title={multiple ? `${group.members.length} source-address records. Choose a record from the list.` : `${first.name} · ${first.address}`}><i aria-hidden="true">{multiple ? group.members.length : null}</i>{labels && labelIds.has(group.id) && <span>{multiple ? `${group.members.length} address records` : first.name}<small>{multiple ? 'Postal anchors, select a record' : first.campus ? 'Campus reference' : 'Source-address match'}</small></span>}</button>;
        })}
      </>}
    </div></div>
    <figcaption><strong>{aerial.attribution}</strong><p>{aerial.captureYears.length ? `Retained acquisition years: ${aerial.captureYears.join(', ')}.` : 'Acquisition date unconfirmed.'} {aerial.captureNote}</p><p>Native raster bounds are retained. The dashed frame is analytical, not an official boundary. Circles are source-address matches; dashed squares are campus references, not suite proof. Numbered markers group nearby pointer targets and open every member record. Group anchors use an original postal point, never an inferred rooftop. A geocoder point is an address anchor, not a surveyed building footprint. Imagery does not establish tenancy or availability.</p><SourceLinks ids={aerial.sources.map(s => s.id)} sources={aerial.sources} /></figcaption>
    {exhibitUrl && <p><a className="text-link" href={exhibitUrl} target="_blank" rel="noreferrer">Open individual public aerial exhibit PDF</a></p>}
    <details className="canton-aerial-index" open><summary>All linked address records ({plotted.length + sourcePoints.length}; {sourcePoints.filter(p => p.position).length} producer points plotted)</summary><div>{sourcePoints.map(({ reference: r, position }) => <button key={`index-${r.id}`} data-address-index={r.id} onClick={() => openRecord(sourceRecord(r))}><strong>{r.name}</strong><span>{r.address}</span><small>{r.referenceKind === 'campus_reference' ? 'Campus reference, not occupied-suite proof' : 'Accepted source-address match'} · {r.coordinateStatus}{!position ? ' · Outside this native frame / unplotted' : ''}</small></button>)}{plotted.map(({ site, campus }) => <button key={site.id} onClick={() => onCompany(site.profileId)}><strong>{site.company}</strong><span>{site.address}</span><small>{campus ? 'Campus reference, not occupied-suite proof' : 'Retained source-address match'}</small></button>)}</div>{!plotted.length && !sourcePoints.length && <p>No cluster-linked accepted coordinates are supplied. The full sourced address inventory above remains separate from mapped pins.</p>}</details>
    {selectedGroup && <AddressGroupDialog records={selectedGroup} close={() => setSelectedGroup(null)} open={openRecord} />}
    {selectedFallback && <AddressFallbackDialog record={selectedFallback} aerial={aerial} close={() => setSelectedFallback(null)} />}
  </figure>;
}

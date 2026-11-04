import { useEffect, useRef } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import type { BaselCantonDocument, CantonAerialAddressReference } from '@shared/baselCantonDetail';
import { CantonEvidenceMetadata } from './CantonEvidenceMetadata';
import { SourceLinks } from './Primitives';

/** Every producer record has its own dialog, even without a shared company or canonical crosswalk. */
export function CantonSourceCardDialog({ reference: r, document, close, onCompany, onCanonical }: {
  reference: CantonAerialAddressReference; document: BaselCantonDocument; close: () => void;
  onCompany: (id: string) => void; onCanonical?: (reference: CantonAerialAddressReference) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const sourceIds = [...new Set(r.sourceIds)];
  return <dialog ref={dialog} className="canton-record-dialog" onCancel={close} aria-labelledby="canton-source-card-title">
    <header><div><span className="eyebrow">LOCAL SOURCE-RECORD DETAIL</span><h2 id="canton-source-card-title">{r.name}</h2></div><button onClick={close} aria-label="Close local source record"><X size={20} /></button></header>
    <div className="canton-record-body">
      <h3>{r.address || 'Street address unresolved / not supplied'}</h3>
      <p>{r.referenceKind === 'campus_reference' ? 'Campus / residency reference, not company-suite proof' : r.referenceKind === 'verified_address' ? 'Source-published postal-address anchor, not a surveyed rooftop or suite' : 'Unresolved address evidence; no map geometry invented'}.</p>
      <p>Coordinate status: {r.coordinateStatus}. {r.latitude == null || r.longitude == null ? 'No accepted coordinates.' : `Accepted latitude ${r.latitude}; longitude ${r.longitude}.`}</p>
      {r.companyId ? <><button className="button" onClick={() => { close(); onCompany(r.companyId!); }}>Open exact shared company profile<ArrowUpRight size={14} /></button><p className="canton-caveat">The shared profile is distinct from this local source card. Parent ownership or an acquisition is not site-closure proof.</p></> : <p className="canton-caveat">Source-scoped record only. No phantom company profile, active-company admission or new company/site master is created.</p>}
      {r.canonicalRecordId && onCanonical && <button className="canton-detail-link" onClick={() => onCanonical(r)}>View exactly matched canton evidence record</button>}
      <SourceLinks ids={sourceIds} sources={document.sources} />
      <p>Exact source IDs: {sourceIds.length ? sourceIds.join(' · ') : 'None supplied'}</p>
      <h3>Complete retained public source card</h3>
      <CantonEvidenceMetadata metadata={r.sourceCard ?? {}} sources={document.sources} />
      <h3>Geometry and conservative record binding</h3>
      <CantonEvidenceMetadata metadata={{ producerRecordId: r.producerRecordId ?? r.id, canonicalRecordId: r.canonicalRecordId ?? null, clusterId: r.clusterId, companyId: r.companyId, siteId: r.siteId, postalPointNativePixel: r.postalPointNativePixel ?? null, pixelDimensions: r.pixelDimensions ?? null, ...r.metadata }} sources={document.sources} />
      <p className="canton-caveat">Native postal points and campus anchors do not establish occupied premises, a full building, a floor, lease terms, availability or suite tenancy. Explicit unknowns remain unknown; area measures retain their original basis and are not added together.</p>
    </div>
  </dialog>;
}

import type { BaselCantonCompanion, BaselCantonDocument, CantonAerialAddressReference, CantonAerialFrame, CantonMetadata, CantonProducerAddressReference, CantonProducerPin, CantonPublicValue, CantonSource } from '../../../shared/baselCantonDetail';
import { canonicalJson, cleanText, publicSourceUrl, sha256, validateDocumentHash, validateSourceRefs } from './contract';

type ObjectValue = Record<string, unknown>;
export interface ProducerFrame extends ObjectValue {
  id: string; title: string; canton: 'BS' | 'BL'; clusterIds: string[];
  pins: CantonProducerPin[]; pixelDimensions: [number, number]; nativeExtent3857: [number, number, number, number];
  imageBounds: [[number, number], [number, number]]; imageSha256: string;
  acquisitionYears: number[]; attribution: string; dateNote: string; imageryVintageCaveat: string;
}
export interface ProducerEnvelope { addressReferences: CantonProducerAddressReference[]; sourceDirectory: ObjectValue[]; aerials: ProducerFrame[]; }
export interface PublicAsset { id: string; sha256: string; pixelDimensions: [number, number]; nativeExtent: [number, number, number, number]; studyBoundsWGS84: [number, number, number, number]; imageBounds: [[number, number], [number, number]]; [key: string]: unknown; }
export interface UploadedAsset { frameId: string; kind: 'image' | 'exhibit'; url: string; sha256: string; bytes: number; }
const object = (v: unknown): ObjectValue => v && typeof v === 'object' && !Array.isArray(v) ? v as ObjectValue : {};
const signature = (s: string | null | undefined) => cleanText(s || '').replace(/[\u2010-\u2015-]/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
const sourceSet = (ids: string[]) => [...new Set(ids)].sort().join('|');

/** Public facts survive recursively; original/private links and local files never do. */
export function producerSanitizer(envelope: ProducerEnvelope) {
  const withheld = new Set<string>();
  const gather = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(gather);
    else if (v && typeof v === 'object') {
      const r = object(v);
      if (/private|internal|restricted|confidential/i.test(String(r.visibility)) && typeof r.url === 'string') withheld.add(r.url);
      Object.values(r).forEach(gather);
    }
  };
  gather(envelope);
  const safe = (v: unknown): CantonPublicValue => {
    if (v == null) return null;
    if (typeof v === 'string') {
      let result = cleanText(v);
      for (const url of withheld) result = result.split(url).join('[retained source; original link withheld]');
      return result;
    }
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('Non-finite producer value'); return v; }
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.map(safe);
    const r = object(v); const out: CantonMetadata = {};
    for (const [key, value] of Object.entries(r)) {
      if (/^(?:path|.*Path|.*Paths|originalBrochureUrl|privateDownloadUrl)$/i.test(key)) continue;
      if (/url$/i.test(key) && typeof value === 'string') out[key] = withheld.has(value) ? null : publicSourceUrl(value, r.visibility) ?? (/^\/manus-storage\/[A-Za-z0-9._/-]+$/.test(value) ? value : null);
      else out[key] = safe(value);
    }
    return out;
  };
  return safe;
}
function canonicalBinding(ref: CantonProducerAddressReference, document: BaselCantonDocument): { id: string; type: 'occupier' | 'property' } | null {
  const cluster = document.clusters.find(c => c.id === ref.clusterId);
  if (!cluster) throw new Error('Unknown producer cluster: '+ref.clusterId);
  const occupiers = [...cluster.companySites, ...cluster.residentReferences, ...cluster.excludedOrUnresolvedLeads].map(row => ({ row, type: 'occupier' as const }));
  const properties = [...cluster.propertyEvidence, ...cluster.buildingSchedule, ...cluster.developmentPipeline, ...cluster.availabilityEvidence].map(row => ({ row, type: 'property' as const }));
  const candidates = ref.recordType === 'building' ? properties : /^(occupier|lead|reference)$/.test(ref.recordType) ? occupiers : [];
  const matches = candidates.filter(({row}) => signature(row.name) === signature(ref.name) && signature(row.address) === signature(ref.address) && sourceSet(row.sourceIds) === sourceSet(ref.sourceIds));
  // A source key alone, campus/company ID alone, or fuzzy business name is never sufficient.
  return matches.length === 1 ? { id: matches[0].row.id, type: matches[0].type } : null;
}
export function adaptProducerReference(ref: CantonProducerAddressReference, document: BaselCantonDocument, safe: ReturnType<typeof producerSanitizer>, pin?: CantonProducerPin, dimensions?: [number, number]): CantonAerialAddressReference {
  const binding = canonicalBinding(ref, document);
  const matched = ref.geocodeStatus === 'matched' && typeof ref.latitude === 'number' && typeof ref.longitude === 'number' && Number.isFinite(ref.latitude) && Number.isFinite(ref.longitude);
  if (pin && (!matched || pin.recordId !== ref.recordId || pin.companyId !== ref.companyId || pin.siteId !== ref.siteId || sourceSet(pin.sourceIds) !== sourceSet(ref.sourceIds))) throw new Error('Pin / exact top-level source record mismatch: '+ref.recordId);
  const campus = /campus|residen|reference_address/i.test(ref.referenceType) || /campus_reference/i.test(ref.coordinatePrecision || '');
  const value: CantonAerialAddressReference = {
    id: ref.recordId, recordId: binding?.id ?? ref.recordId, producerRecordId: ref.recordId,
    canonicalRecordId: binding?.id ?? null, clusterId: ref.clusterId, recordType: binding?.type ?? 'source_record',
    name: cleanText(ref.name), address: cleanText(ref.address || ''), companyId: ref.companyId, siteId: ref.siteId,
    latitude: matched ? ref.latitude : null, longitude: matched ? ref.longitude : null,
    referenceKind: campus ? 'campus_reference' : matched ? 'verified_address' : 'unresolved_lead',
    coordinateStatus: ref.geocodeStatus || 'unresolved', sourceIds: [...ref.sourceIds],
    sourceCard: safe(ref.sourceCard) as CantonMetadata,
    metadata: { producerRecordType: ref.recordType, referenceType: ref.referenceType, inventoryGroup: ref.inventoryGroup ?? null,
      evidenceStatus: ref.evidenceStatus, coordinatePrecision: ref.coordinatePrecision ?? null, unresolvedCause: ref.unresolvedCause ?? null,
      bindingPolicy: 'Unique exact normalized name + address + complete source-ID set; otherwise own source-card record',
      canonicalBindingStatus: binding ? 'exact_unambiguous' : 'source_card_fallback', suiteVerified: false, isRooftop: false },
  };
  if (pin?.postalPointNativePixel && dimensions) {
    if (pin.postalPointNativePixel.some(n => !Number.isFinite(n)) || dimensions.some(n => !Number.isFinite(n) || n <= 0)) throw new Error('Invalid native postal pixels');
    value.postalPointNativePixel = [...pin.postalPointNativePixel]; value.pixelDimensions = [...dimensions];
    value.metadata.pin = safe(pin); // Label displacement is retained as evidence, never used for postal point placement.
  }
  return value;
}
export function prepareProducerV3(base: BaselCantonCompanion, producer: ProducerEnvelope, manifest: { assets: PublicAsset[] }, uploaded: UploadedAsset[], producerHash: string, manifestHash: string) {
  if (base.version !== 'V2' || producer.aerials.length !== 24) throw new Error('Expected immutable V2 companion and actual 24-frame envelope');
  for (const d of Object.values(base.documents)) if (!validateDocumentHash(d)) throw new Error('Invalid V2 document hash');
  if (new Set(producer.addressReferences.map(r => r.recordId)).size !== producer.addressReferences.length || new Set(producer.aerials.map(a => a.id)).size !== producer.aerials.length) throw new Error('Duplicate producer record/frame ID');
  const safe = producerSanitizer(producer);
  const sourceDirectory = producer.sourceDirectory.map(raw => {
    const s = safe(raw) as CantonMetadata;
    if (typeof s.id !== 'string' || typeof s.title !== 'string') throw new Error('Invalid source directory entry');
    return { ...s, documentPage: s.documentPage ?? null } as unknown as CantonSource;
  });
  if (new Set(sourceDirectory.map(s => s.id)).size !== sourceDirectory.length) throw new Error('Duplicate exact producer source ID');
  const companion = structuredClone(base); companion.version = 'V3';
  const documents = Object.values(companion.documents);
  for (const d of documents) {
    d.id = `basel-canton:${d.cantonId}:V3`; d.version = 'V3';
    const refs = producer.addressReferences.filter(r => d.clusters.some(c => c.id === r.clusterId));
    d.addressReferences = safe(refs) as unknown as CantonProducerAddressReference[];
    d.canonicalAddressReferences = refs.map(r => adaptProducerReference(r, d, safe));
    const sources = new Map(d.sources.map(s => [s.id, s]));
    for (const s of sourceDirectory) if (!sources.has(s.id)) sources.set(s.id,s);
    d.sources = [...sources.values()];
    d.metadata = { ...d.metadata, aerialSourceBinding: { version: 'V3', rawProducerHash: producerHash, rawManifestHash: manifestHash,
      sourceResearchVersion: 'V2', sourceResearchHash: base.sourceHash, noMasterWrites: true,
      sourceDirectory: safe(sourceDirectory), pointPolicy: 'Native postalPointNativePixel / pixelDimensions; displaced labels are not geometry; unresolved references remain null',
      originalClusterAerialIds: Object.fromEntries(d.clusters.map(c => [c.id,c.aerialIds])) } };
  }
  const rawRefs = new Map(producer.addressReferences.map(r => [r.recordId,r]));
  const assets = new Map(manifest.assets.map(a => [a.id,a]));
  const frames: CantonAerialFrame[] = producer.aerials.map(raw => {
    const asset = assets.get(raw.id); if (!asset || asset.sha256 !== raw.imageSha256 || canonicalJson(asset.pixelDimensions) !== canonicalJson(raw.pixelDimensions) || canonicalJson(asset.nativeExtent) !== canonicalJson(raw.nativeExtent3857)) throw new Error('Producer/native asset contract mismatch: '+raw.id);
    const image = uploaded.find(a => a.frameId === raw.id && a.kind === 'image'); const exhibit = uploaded.find(a => a.frameId === raw.id && a.kind === 'exhibit');
    if (!image || !exhibit || image.sha256 !== asset.sha256 || ![image.url,exhibit.url].every(u => /^\/manus-storage\/[A-Za-z0-9._/-]+$/.test(u))) throw new Error('Missing verified durable public asset: '+raw.id);
    const d = documents.find(d => d.canton === raw.canton)!;
    if (!d || raw.clusterIds.some(id => !d.clusters.some(c => c.id === id))) throw new Error('Frame canton / cluster mismatch');
    // Native frames genuinely overlap neighboring source clusters; the top-level record keeps its own cluster.
    const references = raw.pins.map(pin => { const ref = rawRefs.get(pin.recordId); if (!ref || !d.clusters.some(c => c.id === ref.clusterId)) throw new Error('Pin lacks exact top-level source-card join within its canton'); return adaptProducerReference(ref,d,safe,pin,raw.pixelDimensions); });
    const [[south,west],[north,east]] = raw.imageBounds;
    const ids = new Set(references.flatMap(r => r.sourceIds));
    const frame: CantonAerialFrame = {
      id: `basel-canton-v3:${raw.id}`, producerFrameId: raw.id, regionId: 'basel', cantonId: d.cantonId, cantonOnly: true,
      title: cleanText(raw.title), frameKind: 'street_address', bounds: [...asset.studyBoundsWGS84], imageBounds: [west,south,east,north],
      imageUrl: image.url, exhibitUrl: exhibit.url, captureYears: [...raw.acquisitionYears], attribution: cleanText(raw.attribution),
      captureNote: cleanText(`${raw.dateNote} ${raw.imageryVintageCaveat}`), siteIds: [],
      clusterIds: [...new Set([...raw.clusterIds,...references.map(r => r.clusterId)])], pixelDimensions: [...raw.pixelDimensions], nativeExtent3857: [...raw.nativeExtent3857],
      addressReferences: references, pins: safe(raw.pins) as unknown as CantonProducerPin[],
      sources: d.sources.filter(s => ids.has(s.id)), producerMetadata: { ...(safe(raw) as CantonMetadata), nativeAsset: safe(asset), imageSha256: image.sha256, exhibitSha256: exhibit.sha256, producerHash, manifestHash },
    };
    // No master site points are substituted; all new marker memberships come from exact producer references.
    return frame;
  });
  // Supplied material is authorized for this client work (4 Nov 2026); original visibility remains provenance.
  // No private original files/paths are delivered, and no broad publication is performed.
  for (const d of documents) {
    for (const c of d.clusters) c.aerialIds = frames.filter(a => a.clusterIds?.includes(c.id)).map(a => a.id);
    const { contentHash: _, ...payload } = d;
    d.contentHash = sha256(canonicalJson(payload));
    validateSourceRefs(d, new Set(d.sources.map(s => s.id)));
  }
  return { companion, frames, restrictedRedactions: [] as string[] };
}

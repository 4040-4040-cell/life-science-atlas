import type { AerialView, Source } from './atlas';

export type BaselCantonId = 'basel-stadt' | 'basel-landschaft';
export type AddressEvidenceKind = 'verified_address' | 'campus_reference' | 'unresolved_lead';
export type FacilityState = 'current_evidence' | 'planned' | 'historical' | 'unresolved';
/** Sanitized JSON preserves factual fields not covered by a canonical display column. */
export type CantonPublicValue = string | number | boolean | null | CantonPublicValue[] | { [key: string]: CantonPublicValue };
export type CantonMetadata = { [key: string]: CantonPublicValue };
export interface CantonSource extends Source { documentPage: string | number | null; metadata?: CantonMetadata; }
/** Accepted geocoder results only; never fabricated company/site master rows. */
export interface CantonAerialAddressReference {
  id: string; recordId: string; clusterId: string; recordType: 'occupier' | 'property' | 'source_record';
  name: string; address: string; companyId: string | null; siteId: string | null;
  latitude: number | null; longitude: number | null; referenceKind: AddressEvidenceKind;
  coordinateStatus: string; sourceIds: string[]; metadata: CantonMetadata;
  sourceCard?: CantonMetadata;
  producerRecordId?: string; canonicalRecordId?: string | null;
  postalPointNativePixel?: [number, number]; pixelDimensions?: [number, number];
}
/** Actual building producer envelope; stable IDs are independent of canton-normalizer IDs. */
export interface CantonProducerAddressReference {
  recordId: string; companyId: string | null; siteId: string | null; clusterId: string;
  name: string; address: string | null; recordType: string; referenceType: string;
  evidenceStatus: string; geocodeStatus: string | null; longitude: number | null; latitude: number | null;
  sourceIds: string[]; sourceCard: CantonMetadata;
  inventoryGroup?: string; coordinatePrecision?: string | null; unresolvedCause?: string | null;
}
export interface CantonProducerPin {
  recordId: string; name: string; address: string; companyId: string | null; siteId: string | null;
  latitude: number; longitude: number; recordType: string; referenceType: string;
  evidenceStatus: string; sourceIds: string[]; postalPointNativePixel?: [number, number];
  labelNativePixel?: [number, number]; geocodePrecision?: string; inventoryGroup?: string;
}
export interface CantonAerialReferenceManifest {
  addressReferences: CantonProducerAddressReference[];
  aerials: { id: string; clusterIds?: string[]; pins: CantonProducerPin[]; pixelDimensions?: [number, number]; nativeExtent3857?: [number, number, number, number] }[];
  sourceDirectory?: CantonSource[];
}
/** Optional enrichment on a retained AerialView; existing regional DTOs remain compatible. */
export interface CantonAerialFrame extends AerialView {
  frameKind?: 'street_address' | 'legacy'; addressReferences?: CantonAerialAddressReference[];
  pins?: CantonProducerPin[]; clusterIds?: string[]; pixelDimensions?: [number, number];
  nativeExtent3857?: [number, number, number, number];
  cantonId?: BaselCantonId; cantonOnly?: boolean; producerFrameId?: string;
  producerMetadata?: CantonMetadata;
}
/** Values stay local and source-scoped. No currency or area-basis conversion. */
export interface CantonFact {
  label: string; value: CantonPublicValue; unit: string | null; scope: string | null;
  sourceAsOf: string | null; observedAsOf: string | null; evidenceStatus: string; sourceIds: string[];
  notes: string | null; id?: string | null; sourceKey?: string; basis?: string | null;
  qualifier?: string | null; comparator?: string | null; metadata?: CantonMetadata;
}
export interface CantonOccupier {
  id: string; name: string; companyId: string | null; siteId: string | null;
  location: string; address: string | null; municipality: string | null; role: string;
  parent: string | null; addressKind: AddressEvidenceKind; evidenceStatus: string;
  facilityState: FacilityState; sourceIds: string[]; gaps: string[]; facts: CantonFact[];
  recordClass: 'company_site' | 'resident_reference' | 'excluded_or_unresolved_lead';
  sourceKey: string; observedAsOf: string | null; buildingReferences: string[];
  areaBasis: string | null; metadata: CantonMetadata;
}
export interface CantonProperty {
  id: string; name: string; kind: string; operator: string | null; address: string | null;
  status: string; facilityState: FacilityState; areaValue: string | number | null;
  areaUnit: string | null; areaBasis: string; sourceAsOf: string | null;
  sourceIds: string[]; caveat: string; facts: CantonFact[];
  sourceKey: string; observedAsOf: string | null; scope: string | null;
  areaQualifier: string | null; buildingReferences: string[]; metadata: CantonMetadata;
}
export interface CantonNamedEvidence {
  id: string; name: string; text: string; date: string | null; status: string; sourceIds: string[];
  metadata: CantonMetadata;
}
export interface BaselCantonCluster {
  id: string; canton: 'BS' | 'BL'; name: string; municipalities: string[];
  occupancyRead: string; functions: string[]; aerialIds: string[]; companySites: CantonOccupier[];
  institutions: CantonNamedEvidence[]; propertyEvidence: CantonProperty[];
  buildingSchedule: CantonProperty[]; developmentPipeline: CantonProperty[]; availabilityEvidence: CantonProperty[];
  residentReferences: CantonOccupier[]; excludedOrUnresolvedLeads: CantonOccupier[];
  datedActions: CantonNamedEvidence[]; nextChecks: string[]; sources: CantonSource[];
  metrics: CantonFact[]; gaps: string[]; detailedNarrative: string;
  narrativeCitationIndex: Record<string, string>; assemblyProvenance: CantonMetadata; metadata: CantonMetadata;
}
export interface BaselCantonDocument {
  format: 1; id: string; cantonId: BaselCantonId; canton: 'BS' | 'BL'; title: string;
  version: string; asOf: string; sourceHash: string; contentHash: string;
  coverage: string; clusters: BaselCantonCluster[]; sources: CantonSource[];
  supportedCompanyIds: string[]; metrics: CantonFact[]; metadata: CantonMetadata;
  addressReferences?: CantonProducerAddressReference[];
  canonicalAddressReferences?: CantonAerialAddressReference[];
}
/** Client-safe companion only, never private raw research or a second company master. */
export interface BaselCantonCompanion { format: 1; version: string; asOf: string; sourceHash: string; documents: Record<BaselCantonId, BaselCantonDocument>; }
export const BASEL_CANTONS: Record<BaselCantonId, { code: 'BS' | 'BL'; title: string }> = {
  'basel-stadt': { code: 'BS', title: 'Basel-Stadt' },
  'basel-landschaft': { code: 'BL', title: 'Basel-Landschaft' },
};

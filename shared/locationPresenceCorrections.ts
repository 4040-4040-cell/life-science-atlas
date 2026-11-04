import type { Fact, MapSite, Source } from './atlas';

export interface RetainedPresenceObservation {
  version: string;
  site: MapSite;
}
export interface LocationPresenceCorrection {
  siteId: string;
  companyId: string;
  before: MapSite;
  after: MapSite;
  sources: Source[];
  decision: string;
  witness: Record<string, unknown>;
  newFacts: Fact[];
}
export interface LocationPresenceManifest {
  seedVersion: string;
  baseVersion: string;
  asOf: string;
  baseSeedSha256: string;
  baseSnapshotSha256: string;
  counts: Record<string, number>;
  reviewFiles: Array<{ file: string; sha256: string }>;
  policy: string;
  presence: LocationPresenceCorrection[];
  producerCorrections: Record<string, unknown>;
}

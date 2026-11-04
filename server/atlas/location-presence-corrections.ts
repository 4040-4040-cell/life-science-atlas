import type { MapSite, Source } from '../../shared/atlas';
import type { LocationPresenceCorrection } from '../../shared/locationPresenceCorrections';
import { equalValues } from './presence-cash-corrections';
import { sourceSignature } from './financial-corrections';

const approvedIds = new Set(['boulder:site:corden-colorado', 'uk:site:randox-laboratories-uk-hq']);
export function assertLocationCorrection(c: LocationPresenceCorrection) {
  const a = c.after, b = c.before;
  if (!approvedIds.has(c.siteId) || c.siteId !== a.id || a.id !== b.id || c.companyId !== a.profileId || a.profileId !== b.profileId || a.regionId !== b.regionId || a.evidence !== b.evidence || a.precision !== b.precision || !equalValues(a.retainedPresenceObservations?.[0]?.site, b) || !b.sourceIds.every(id => a.sourceIds.includes(id)) || !c.newFacts.every(f => a.facts?.some(x => equalValues(f, x))) || !equalValues(a.facts?.slice(0, b.facts?.length ?? 0), b.facts ?? [])) throw new Error(`V7 identity/raw-field preservation failure ${c.siteId}`);
  const allowed = new Set(['physicalStatus', 'latitude', 'longitude', 'sourceIds', 'facts', 'retainedPresenceObservations']);
  for (const key of Object.keys(b) as (keyof MapSite)[]) if (!allowed.has(key) && !equalValues(a[key], b[key])) throw new Error(`Unapproved V7 field change ${c.siteId}/${key}`);
  if (c.siteId.startsWith('boulder:')) {
    if (b.physicalStatus !== 'current' || a.physicalStatus !== 'lease_signed_opening_not_confirmed' || a.address !== '5505 Central, Boulder, Colorado' || !equalValues([a.latitude, a.longitude], [b.latitude, b.longitude]) || !equalValues(a.sourceIds, b.sourceIds)) throw new Error('Corden lab must remain an unconfirmed signed lease, not operations');
  } else {
    if (b.country !== 'GB' || !b.address.includes('BT29') || a.precision !== 'city_centroid' || a.physicalStatus !== b.physicalStatus || !equalValues([b.latitude,b.longitude], [51.67778,-3.13528]) || !equalValues([a.latitude,a.longitude], [54.62054,-6.21414]) || c.witness.geonameId !== '2651804' || c.witness.country !== 'GB' || c.witness.admin1 !== 'NIR') throw new Error('Randox requires the retained GB/NIR Crumlin city reference');
  }
}
export function locationCorrectionDecision(c: LocationPresenceCorrection, current: MapSite | undefined, indexed: { evidence: string; precision: string; city: string; zone: string | null }, retainedSources: Source[]): 'apply' | 'already_correct' | 'SKIP_CLIENT_EDITS' {
  if (equalValues(current, c.after)) return 'already_correct';
  if (!equalValues(current, c.before) || !equalValues(indexed, { evidence: c.before.evidence, precision: c.before.precision, city: c.before.city, zone: c.before.zone })) return 'SKIP_CLIENT_EDITS';
  for (const witness of c.sources.filter(s => c.before.sourceIds.includes(s.id))) {
    if (!retainedSources.some(s => sourceSignature(s) === sourceSignature(witness)) || retainedSources.some(s => s.id === witness.id && sourceSignature(s) !== sourceSignature(witness))) return 'SKIP_CLIENT_EDITS';
  }
  for (const witness of c.sources.filter(s => !c.before.sourceIds.includes(s.id))) if (retainedSources.some(s => s.id === witness.id && sourceSignature(s) !== sourceSignature(witness))) return 'SKIP_CLIENT_EDITS';
  return 'apply';
}

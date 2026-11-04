import { createHash } from 'node:crypto';
import type { AddressEvidenceKind, BaselCantonCluster, BaselCantonCompanion, BaselCantonDocument, BaselCantonId, CantonFact, CantonMetadata, CantonNamedEvidence, CantonOccupier, CantonProperty, CantonPublicValue, CantonSource, FacilityState } from '../../../shared/baselCantonDetail';
import { BASEL_CANTONS } from '../../../shared/baselCantonDetail';

type RecordValue = Record<string, unknown>;
const obj = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const nullable = (value: unknown): string | null => typeof value === 'string' && value.trim() ? cleanText(value) : null;
const text = (value: unknown, fallback = '') => nullable(value) ?? fallback;
const strings = (value: unknown): string[] => list(value).filter((v): v is string => typeof v === 'string').map(cleanText);
const scalar = (value: unknown): string | number | null => typeof value === 'number' && Number.isFinite(value) ? value : nullable(value);
const refs = (r: RecordValue): string[] => [...new Set([...strings(r.sourceIds), ...strings(r.assemblySourceIds), ...(nullable(r.sourceId) ? [String(r.sourceId)] : [])])];
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => JSON.stringify(key) + ':' + canonicalJson(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
/** Redact private paths even when accidentally included in source labels or notes. */
export function cleanText(value: string): string {
  return value.replace(/\u2014/g, ' - ').replace(/(?:file:\/{0,3}|(?<![A-Za-z0-9:/])\/)(?:home|mnt|tmp|Users|private)\/[^\s<>"']+/gi, '[retained internal document]').trim();
}
export function publicSourceUrl(value: unknown, visibility: unknown): string | null {
  if (typeof value !== 'string' || /private|internal|restricted|confidential/i.test(String(visibility))) return null;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,191}$/.test(value)) throw new Error(`Invalid ${label} ID`);
  return value;
}
const municipalityKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const BS = new Set(['basel', 'riehen', 'bettingen']);
// Geographic guard, not a coverage denominator. Municipality names are canton boundaries.
const BL = new Set(('Aesch Allschwil Anwil Arboldswil Arlesheim Augst Bennwil Biel-Benken Binningen Birsfelden Blauen Böckten Bottmingen Bretzwil Brislach Bubendorf Buckten Burg-im-Leimental Buus Diegten Diepflingen Dittingen Duggingen Eptingen Ettingen Frenkendorf Füllinsdorf Gelterkinden Giebenach Grellingen Häfelfingen Hemmiken Hersberg Hölstein Itingen Känerkinden Kilchberg Lausen Laufen Läufelfingen Lauwil Lampenberg Langenbruck Läufelfingen Liedertswil Liestal Liesberg Maisprach Münchenstein Muttenz Nenzlingen Niederdorf Nusshof Oberdorf Oberwil Oltingen Ormalingen Pfeffingen Pratteln Ramlinsburg Reigoldswil Reinach Rickenbach Roggenburg Röschenz Rothenfluh Rümlingen Rünenberg Schönenbuch Seltisberg Sissach Tecknau Tenniken Therwil Thürnen Titterten Wahlen Waldenburg Wenslingen Wintersingen Wittinsburg Zeglingen Ziefen Zunzgen Zwingen').split(' ').map(municipalityKey));
export function assertMunicipalities(canton: 'BS' | 'BL', names: string[]): void {
  if (!names.length || names.some(name => !(canton === 'BS' ? BS : BL).has(municipalityKey(name)))) throw new Error(`Canton municipality mismatch: ${canton}`);
}
export function facilityState(status: string): FacilityState {
  if (/historical|brochure|former|superseded/i.test(status)) return 'historical';
  if (/planned|proposed|construction|pipeline|future|development|under.?way/i.test(status)) return 'planned';
  if (/unresolved|unverified|unconfirmed|unknown|not_active|not_current|conflict|evidence_gap|no_current|no_verified/i.test(status)) return 'unresolved';
  if (/current|operating|open|completed|active|verified|primary|source.supported/i.test(status)) return 'current_evidence';
  return 'unresolved';
}
export function addressKind(r: RecordValue): AddressEvidenceKind {
  const basis = [r.addressKind, r.addressType, r.addressRole, r.addressBasis, r.addressEvidence, r.recordType, r.precision, r.role, r.evidenceStatus].join(' ');
  const category = text(obj(r.counting).category);
  if (/campus.reference|operator.residen|residen.*list|tenant.list|campus.postal|reference.only|operator_reported_municipality_reference|current_property_operator/i.test(basis + ' ' + category)) return 'campus_reference';
  const status = text(r.evidenceStatus);
  if (nullable(r.address) && refs(r).length && /verified.address|company.address|official.address|primary|verified|source.supported|address.confirmed|current_supported_company_site|current_null_id_company_address_lead|current_null_id_scientific_operator/i.test(basis + ' ' + category) && !/^(?:not.?verified|unverified)|conflicting_current_location|district_lead_only|historical_primary_property|historical_property_current|unchecked_district|unresolved_lead/i.test(status + ' ' + category)) return 'verified_address';
  return 'unresolved_lead';
}
export function validateSourceRefs(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) { value.forEach(v => validateSourceRefs(v, ids)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (['sourceIds', 'ownerSourceIds', 'assemblySourceIds'].includes(key)) {
      if (!Array.isArray(item) || item.some(id => typeof id !== 'string' || !ids.has(id))) throw new Error(`Missing or invalid exact source ID reference: ${key}`);
    } else if (['sourceId', 'operatorResidencySourceId', 'companySourceId'].includes(key)) {
      if (item != null && (typeof item !== 'string' || !ids.has(item))) throw new Error(`Missing or invalid exact source ID reference: ${String(item)}`);
    } else if (key !== 'sources') validateSourceRefs(item, ids);
  }
}
/** Expand actual container shapes. Preserve the wrapper separately as metadata. */
function records(value: unknown): { row: unknown; suffix: string }[] {
  if (Array.isArray(value)) return value.flatMap((row, i) => {
    const r = obj(row);
    if (!nullable(r.name) && Array.isArray(r.names)) return strings(r.names).map((name, n) => ({ row: { ...r, name }, suffix: `${i + 1}:${n + 1}` }));
    return [{ row, suffix: String(i + 1) }];
  });
  const r = obj(value); if (!Object.keys(r).length) return [];
  const nested = Object.entries(r).filter(([key, v]) => Array.isArray(v) && ['rows', 'entries', 'records', 'rhystadtUnits', 'stueckiUnits'].includes(key));
  if (!nested.length) return [{ row: r, suffix: '1' }];
  const inherited = Object.fromEntries(Object.entries(r).filter(([, v]) => !Array.isArray(v)));
  return nested.flatMap(([key, v]) => records(v).map(({ row, suffix }) => ({ row: { ...inherited, ...obj(row), sourceIds: refs(obj(row)).length ? refs(obj(row)) : refs(r) }, suffix: `${key}:${suffix}` })));
}
/** Normalize supported display fields and retain every other useful field, with recursive privacy redaction. */
export function prepareCantonCompanion(raw: unknown, version: string, asOf: string, sourceHash: string): BaselCantonCompanion {
  requireId(version, 'version');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !/^[a-f0-9]{64}$/.test(sourceHash)) throw new Error('Invalid source hash or observation date');
  const root = obj(raw); const cantonRows = Object.values(obj(root.cantons)).map(obj);
  let rows: unknown[] = Array.isArray(raw) ? raw : list(root.clusters);
  if (!rows.length) rows = list(root.records);
  if (!rows.length && root.cantons) rows = Object.values(obj(root.cantons)).flatMap(value => Array.isArray(value) ? value : list(obj(value).clusters));
  if (!rows.length) throw new Error('No canton clusters in factual contract');
  const allSources: unknown[] = [];
  const gather = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(gather);
    else if (v && typeof v === 'object') for (const [key, item] of Object.entries(v)) {
      if (key === 'sources') allSources.push(...list(item)); else gather(item);
    }
  };
  gather(raw);
  const withheldUrls = new Set(allSources.map(obj).filter(r => /private|internal|restricted|confidential/i.test(String(r.visibility))).map(r => typeof r.url === 'string' ? r.url : '').filter(Boolean));
  const safeText = (s: string): string => { let result = cleanText(s); for (const url of withheldUrls) result = result.split(url).join('[retained source; original link withheld]'); return result; };
  const safe = (v: unknown): CantonPublicValue => {
    if (v == null) return null;
    if (typeof v === 'string') return safeText(v);
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('Non-finite factual value'); return v; }
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.map(safe);
    const r = obj(v); const out: CantonMetadata = {};
    for (const [key, item] of Object.entries(r)) {
      if (/^(?:path|.*Path|.*Paths|originalBrochureUrl|privateDownloadUrl)$/i.test(key)) continue;
      if (/url$/i.test(key) && typeof item === 'string') {
        if (withheldUrls.has(item) || /private|internal|restricted|confidential/i.test(String(r.visibility)) || /^(?:file:|javascript:|data:)/i.test(item)) out[key] = null;
        else out[key] = publicSourceUrl(item, 'public') ?? (/^\/manus-storage\//.test(item) ? safeText(item) : null);
      } else out[key] = safe(item);
    }
    return out;
  };
  const metadata = (r: RecordValue, consumed: string[] = []): CantonMetadata => safe(Object.fromEntries(Object.entries(r).filter(([key]) => !consumed.includes(key) || /^(?:asOf|sourceDate|publishedDate|sourceAsOf|observedAsOf)$/.test(key)))) as CantonMetadata;
  const source = (rawSource: unknown): CantonSource => {
    const r = obj(rawSource); const id = requireId(r.id, 'source');
    if (/cbre/i.test(canonicalJson(r))) throw new Error('Prohibited source');
    if (!nullable(r.title)) throw new Error(`Missing source title: ${id}`);
    return { id, title: safeText(text(r.title)), url: publicSourceUrl(r.url, r.visibility), publishedDate: nullable(r.publishedDate), retrievedDate: nullable(r.retrievedDate), visibility: text(r.visibility, 'not_disclosed'), documentPage: typeof r.documentPage === 'number' ? r.documentPage : nullable(r.documentPage ?? r.page), metadata: metadata(r, ['id', 'title', 'url', 'publishedDate', 'retrievedDate', 'visibility', 'documentPage']) };
  };
  const rawSources = new Map<string, string>(); const sourceIndex = new Map<string, CantonSource>();
  for (const item of allSources) {
    const r = obj(item); const s = source(r); const signature = canonicalJson(r);
    if (rawSources.has(s.id) && rawSources.get(s.id) !== signature) throw new Error(`Exact source ID collision: ${s.id}`);
    rawSources.set(s.id, signature); sourceIndex.set(s.id, s);
  }
  const ids = new Set(sourceIndex.keys()); validateSourceRefs(raw, ids);
  const metricIndex = new Map<string, RecordValue>();
  for (const r of [...cantonRows, ...rows.map(obj)]) {
    const metrics = Array.isArray(r.metrics) ? list(r.metrics) : Object.values(obj(r.metrics));
    for (const m of metrics.map(obj)) if (nullable(m.id)) metricIndex.set(String(m.id), m);
  }
  const fact = (v: unknown, fallback = '', sourceKey = ''): CantonFact => {
    const r = obj(v); const value = safe(r.value); const sourceIds = refs(r);
    const numeric = (x: CantonPublicValue): boolean => typeof x === 'number' || (Array.isArray(x) ? x.some(numeric) : x && typeof x === 'object' ? Object.values(x).some(numeric) : false);
    if (numeric(value) && !sourceIds.length) throw new Error(`Numeric fact lacks an exact source ID: ${text(r.id, fallback)}`);
    return { label: text(r.label ?? r.name ?? r.metric ?? r.key ?? r.id, fallback || 'Retained fact'), value: typeof value === 'string' ? safeText(value) : value, unit: nullable(r.unit), scope: nullable(r.scope), sourceAsOf: nullable(r.sourceAsOf ?? r.sourceDate ?? r.publishedDate ?? r.asOf), observedAsOf: nullable(r.observedAsOf ?? r.observationAsOf ?? r.observationDate ?? r.observedDate ?? r.observedAt ?? r.retrievedDate), evidenceStatus: text(r.evidenceStatus ?? r.status, 'not_disclosed'), sourceIds, notes: nullable(r.notes ?? r.caveat), id: nullable(r.id), sourceKey, basis: nullable(r.basis ?? r.areaBasis), qualifier: nullable(r.qualifier), comparator: nullable(r.comparator), metadata: metadata(r, ['label', 'name', 'metric', 'key', 'value', 'unit', 'scope', 'sourceAsOf', 'sourceDate', 'publishedDate', 'asOf', 'observedAsOf', 'evidenceStatus', 'status', 'sourceIds', 'notes', 'caveat', 'id', 'basis', 'qualifier', 'comparator']) };
  };
  const localFacts = (r: RecordValue): CantonFact[] => {
    const result = [...list(r.facts), ...list(r.metrics)].map(v => fact(v));
    const keys: [string, string][] = [['tenure', 'Leased / owned'], ['ownedLeased', 'Leased / owned'], ['leasedOrOwned', 'Leased / owned'], ['ownershipInterest', 'Ownership interest'], ['occupancyInterest', 'Occupancy interest'], ['owner', 'Owner'], ['ownerRead', 'Owner'], ['ownerLandlord', 'Owner / landlord'], ['propertyOwner', 'Property owner'], ['landlord', 'Landlord'], ['currentLeaseCounterparty', 'Current lease counterparty'], ['leaseExpiry', 'Lease expiry'], ['renewalOptions', 'Renewal options'], ['rent', 'Rent'], ['executedRent', 'Executed rent'], ['askingRent', 'Asking rent'], ['sourceRentText', 'Source rent text'], ['normalizedRent', 'Normalized rent'], ['localEmployees', 'Local employees'], ['localWorkforce', 'Local workforce'], ['localFTE', 'Local FTE'], ['occupiedArea', 'Occupied area'], ['companyOccupiedArea', 'Company occupied area'], ['leaseArea', 'Lease area'], ['availability', 'Availability'], ['externalAvailability', 'External availability'], ['availableArea', 'Available area'], ['availableFrom', 'Available from'], ['availableSuite', 'Available suite'], ['fitOut', 'Fit-out specification'], ['capacity', 'Capacity'], ['suite', 'Suite'], ['floor', 'Floor']];
    for (const [key, label] of keys) if (r[key] !== undefined) {
      const nested = obj(r[key]);
      const value = Object.keys(nested).length ? fact({ ...nested, sourceIds: refs(nested).length ? refs(nested) : refs(r) }, label, key) : fact({ value: r[key], unit: /area/i.test(key) ? r.areaUnit : null, sourceIds: refs(r), sourceAsOf: r.sourceAsOf ?? r.publishedDate, observedAsOf: r.observedAsOf ?? r.asOf, evidenceStatus: r.evidenceStatus ?? r.status, scope: r.scope, basis: /area/i.test(key) ? r.areaBasis : null, notes: 'Record-level citation; field-specific date/scope may not be separately disclosed.' }, label, key);
      result.push(value);
    }
    if (r.askingRentValue !== undefined) result.push(fact({ value: r.askingRentValue, unit: r.askingRentUnit, basis: r.askingRentBasis, scope: r.scope, sourceIds: refs(r), publishedDate: r.publishedDate, observedAsOf: r.observedAsOf, evidenceStatus: r.evidenceStatus }, 'Advertised asking rent', 'askingRentValue'));
    for (const [key, v] of Object.entries(r)) if (/MetricIds?$/i.test(key)) {
      for (const id of typeof v === 'string' ? [v] : strings(v)) {
        const m = metricIndex.get(id);
        if (!m) throw new Error(`Missing exact metric reference: ${id} (${key})`);
        result.push(fact(m, key.replace(/MetricIds?$/i, ''), key));
      }
    }
    return result;
  };
  const buildingRefs = (r: RecordValue): string[] => [...new Set([...strings(r.buildingReferences), ...strings(r.buildingIds), ...[r.buildingReference, r.buildingReferenceStatus, r.buildingRef, r.buildingId, r.buildingLabel, r.building].flatMap(v => nullable(v) ? [text(v)] : [])])];
  const occupier = (v: unknown, id: string, sourceKey: string, recordClass: CantonOccupier['recordClass'] = 'company_site'): CantonOccupier => {
    const r = obj(v); const name = text(r.name, typeof v === 'string' ? String(v) : text(r.currentCompanyAddress ?? r.decision, 'Retained address lead'));
    if (recordClass === 'company_site' && !nullable(r.name)) throw new Error(`Missing occupier name: ${id}`);
    const state = recordClass === 'company_site' && /^current_(?:supported_company_site|null_id_company_address_lead|null_id_scientific_operator)$/.test(text(obj(r.counting).category)) ? 'current_evidence' : facilityState(text(r.physicalStatus ?? r.facilityStatus ?? r.status ?? r.evidenceStatus));
    return { id: requireId(r.id ?? r.recordId ?? r.localRecordId ?? r.addressInventoryId ?? id, 'record'), name, companyId: r.companyId == null ? null : requireId(r.companyId, 'company'), siteId: r.siteId == null ? null : requireId(r.siteId, 'site'), location: text(r.location), address: nullable(r.address ?? r.companyStreetAddress), municipality: nullable(r.municipality ?? r.city), role: text(r.role, recordClass === 'resident_reference' ? 'Operator-listed residency reference; company-specific function not independently verified' : 'Role not disclosed'), parent: nullable(r.parent), addressKind: recordClass === 'resident_reference' ? 'campus_reference' : recordClass === 'excluded_or_unresolved_lead' ? 'unresolved_lead' : addressKind(r), evidenceStatus: text(r.evidenceStatus ?? r.status, 'not_disclosed'), facilityState: state, sourceIds: refs(r), gaps: [...strings(r.gaps), ...[r.gap, r.reason, r.reasonNotCurrentOccupierRow, r.note, r.caveat, r.decision].flatMap(v => nullable(v) ? [safeText(text(v))] : [])], facts: localFacts(r), recordClass, sourceKey, observedAsOf: nullable(r.observedAsOf ?? r.asOf), buildingReferences: buildingRefs(r), areaBasis: nullable(r.areaBasis), metadata: metadata(r, ['id', 'name', 'companyId', 'siteId', 'location', 'address', 'municipality', 'role', 'parent', 'evidenceStatus', 'sourceIds', 'gaps', 'facts', 'metrics']) };
  };
  const property = (v: unknown, id: string, sourceKey: string): CantonProperty => {
    const r = obj(v); const linked = Object.entries(r).filter(([k, x]) => /^(?:areaMetricId|metricId)$/.test(k) && typeof x === 'string').map(([, x]) => metricIndex.get(String(x))).find(m => m && /m[²2]|sq|area/i.test(text(m.unit) + ' ' + text(m.scope)));
    const areaValue = scalar(r.areaValue ?? r.availableArea ?? linked?.value); const status = text(r.status ?? r.evidenceStatus ?? r.classification, 'Status not disclosed');
    if (areaValue != null && !refs(r).length) throw new Error(`Property area lacks an exact source ID: ${id}`);
    return { id: requireId(r.id ?? r.recordId ?? id, 'property'), name: text(r.name ?? r.property ?? r.unitCode ?? r.buildingReference ?? r.buildingId ?? r.building, sourceKey + ' evidence'), kind: text(r.kind ?? r.recordType, sourceKey), operator: nullable(r.operator), address: nullable(r.address ?? r.verifiedStreetAddress), status, facilityState: facilityState(status), areaValue, areaUnit: nullable(r.areaUnit ?? linked?.unit), areaBasis: text(r.areaBasis ?? linked?.basis, 'Area basis not disclosed'), sourceAsOf: nullable(r.sourceAsOf ?? r.sourceDate ?? r.publishedDate ?? linked?.sourceDate), sourceIds: refs(r), caveat: safeText(text(r.caveat ?? r.read ?? r.note ?? r.nextVerification)), facts: localFacts(r), sourceKey, observedAsOf: nullable(r.observedAsOf ?? r.asOf), scope: nullable(r.scope ?? r.areaScope ?? linked?.scope), areaQualifier: nullable(r.areaQualifier ?? linked?.qualifier), buildingReferences: buildingRefs(r), metadata: metadata(r, ['id', 'name', 'operator', 'address', 'status', 'areaValue', 'areaUnit', 'areaBasis', 'sourceAsOf', 'sourceIds', 'caveat', 'facts', 'metrics']) };
  };
  const named = (v: unknown, id: string): CantonNamedEvidence => {
    const r = obj(v);
    return { id: text(r.id, id), name: text(r.name ?? r.title ?? r.action, typeof v === 'string' ? safeText(v) : 'Retained evidence'), text: safeText(text(r.text ?? r.description ?? r.notes ?? r.action ?? r.role ?? r.occupancyConsequence ?? r.occupancyImplication ?? r.caveat)), date: nullable(r.date ?? r.eventDate), status: text(r.status ?? r.evidenceStatus, 'not_disclosed'), sourceIds: refs(r), metadata: metadata(r, ['id', 'name', 'title', 'text', 'description', 'notes', 'action', 'date', 'status', 'evidenceStatus', 'sourceIds']) };
  };
  const clusterIds = new Set<string>();
  const clusters: BaselCantonCluster[] = rows.map(row => {
    const r = obj(row); const id = requireId(r.id, 'cluster');
    if (clusterIds.has(id)) throw new Error('Duplicate cluster ID'); clusterIds.add(id);
    if (r.canton !== 'BS' && r.canton !== 'BL') throw new Error('Only BS and BL clusters are admitted');
    const canton = r.canton; const municipalities = strings(r.municipalities); assertMunicipalities(canton, municipalities);
    const companySites = list(r.companySites).map((v, i) => occupier(v, `${id}:occupier:${i + 1}`, 'companySites'));
    for (const o of companySites) if (o.municipality) assertMunicipalities(canton, [o.municipality]);
    const properties = (key: string) => records(r[key]).map(({ row, suffix }) => property(row, `${id}:${key}:${suffix}`, key));
    const residents = ['residentReferences', 'directoryResidencyReferences', 'operatorResidencyReferences', 'residentRoster'].flatMap(key => records(r[key]).map(({ row, suffix }) => occupier(row, `${id}:${key}:${suffix}`, key, 'resident_reference')));
    const exclusions = ['excludedOrUnresolvedLeads', 'excludedOrConflictingLeads', 'unresolvedLeads', 'excludedOrBoundaryLeads', 'outsideClusterCorrections', 'encounteredOutOfScopeAddresses'].flatMap(key => records(r[key]).map(({ row, suffix }) => occupier(row, `${id}:${key}:${suffix}`, key, 'excluded_or_unresolved_lead')));
    const consumed = ['id', 'canton', 'name', 'municipalities', 'occupancyRead', 'functions', 'aerialIds', 'companySites', 'institutions', 'propertyEvidence', 'buildingSchedule', 'developmentPipeline', 'availabilityEvidence', 'datedActions', 'nextChecks', 'sources', 'metrics', 'gaps', 'detailedNarrative', 'narrativeCitationIndex', 'assemblyProvenance'];
    // Object-valued containers carry shared context and nulls as well as child records.
    const containerContext = Object.fromEntries(['buildingSchedule', 'developmentPipeline', 'availabilityEvidence', 'nextChecks'].filter(key => r[key] !== undefined).map(key => [key, safe(r[key])]));
    const c: BaselCantonCluster = { id, canton, name: text(r.name, id), municipalities, occupancyRead: safeText(text(r.occupancyRead)), functions: strings(r.functions), aerialIds: strings(r.aerialIds), companySites, institutions: list(r.institutions).map((v, i) => named(v, `${id}:institution:${i + 1}`)), propertyEvidence: properties('propertyEvidence'), buildingSchedule: [...properties('buildingSchedule'), ...properties('unresolvedBuildingSchedule'), ...properties('contextualBuildingReferences')], developmentPipeline: properties('developmentPipeline'), availabilityEvidence: properties('availabilityEvidence'), residentReferences: residents, excludedOrUnresolvedLeads: exclusions, datedActions: list(r.datedActions).map((v, i) => named(v, `${id}:action:${i + 1}`)), nextChecks: list(r.nextChecks).map(v => typeof v === 'string' ? safeText(v) : Object.entries(obj(v)).map(([key, x]) => `${key}: ${safeText(text(x))}`).join(' · ')), sources: list(r.sources).map(source), metrics: list(r.metrics).map(v => fact(v)), gaps: strings(r.gaps), detailedNarrative: safeText(text(r.detailedNarrative)), narrativeCitationIndex: Object.fromEntries(Object.entries(obj(r.narrativeCitationIndex)).map(([key, value]) => [key, requireId(value, 'narrative source')])), assemblyProvenance: metadata(obj(r.assemblyProvenance)), metadata: metadata(r, consumed) };
    c.metadata.evidenceContainers = containerContext;
    for (const sourceId of Object.values(c.narrativeCitationIndex)) if (!ids.has(sourceId)) throw new Error(`Missing narrative source: ${sourceId}`);
    const rowIds = [...c.companySites, ...c.residentReferences, ...c.excludedOrUnresolvedLeads].map(v => v.id);
    if (new Set(rowIds).size !== rowIds.length) throw new Error('Duplicate occupier record ID');
    return c;
  });
  const documents = {} as Record<BaselCantonId, BaselCantonDocument>;
  for (const cantonId of Object.keys(BASEL_CANTONS) as BaselCantonId[]) {
    const config = BASEL_CANTONS[cantonId]; const selected = clusters.filter(c => c.canton === config.code);
    if (!selected.length) throw new Error(`Missing canton document: ${cantonId}`);
    const cr = cantonRows.find(r => r.canton === config.code || r.id === cantonId) ?? {};
    const supportedCompanyIds = strings(cr.companyIds).map(id => requireId(id, 'company'));
    if (new Set(supportedCompanyIds).size !== supportedCompanyIds.length) throw new Error('Duplicate conservative company ID');
    const metrics = (Array.isArray(cr.metrics) ? list(cr.metrics) : Object.entries(obj(cr.metrics)).map(([key, v]) => ({ ...obj(v), label: obj(v).label ?? key }))).map(v => fact(v));
    const scope = obj(cr.scope); const coverage = text(root.coverage ?? root.coverageStatement ?? scope.countingPolicy, 'Every sourced address encountered in the retained cluster research is included. This is not an exhaustive canton census; no coverage denominator is established.');
    const documentMetadata = { ...metadata(cr, ['id', 'title', 'canton', 'clusters', 'sources', 'metrics', 'companyIds']), edition: safe(root.edition), externalExtensions: safe(root.externalExtensions ?? []) };
    const used = new Set([...selected.flatMap(c => c.sources.map(s => s.id)), ...list(cr.sources).map(v => requireId(obj(v).id, 'source'))]);
    const collect = (v: unknown): void => { if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') for (const [key, item] of Object.entries(v)) { if (['sourceIds', 'ownerSourceIds', 'assemblySourceIds'].includes(key)) strings(item).forEach(id => used.add(id)); else if (['sourceId', 'operatorResidencySourceId', 'companySourceId'].includes(key) && typeof item === 'string') used.add(item); else if (key === 'sources') list(item).forEach(s => used.add(requireId(obj(s).id, 'source'))); else collect(item); } };
    collect([selected, metrics, documentMetadata]);
    const document = { format: 1 as const, id: `basel-canton:${cantonId}:${version}`, cantonId, canton: config.code, title: config.title, version, asOf, sourceHash, coverage: safeText(coverage), clusters: selected, sources: [...used].map(id => sourceIndex.get(id)!), supportedCompanyIds, metrics, metadata: documentMetadata };
    documents[cantonId] = { ...document, contentHash: sha256(canonicalJson(document)) };
    validateSourceRefs(documents[cantonId], new Set(documents[cantonId].sources.map(s => s.id)));
  }
  return { format: 1, version, asOf, sourceHash, documents };
}
export function validateDocumentHash(document: BaselCantonDocument): boolean {
  const { contentHash, ...payload } = document;
  return contentHash === sha256(canonicalJson(payload));
}

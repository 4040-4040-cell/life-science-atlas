import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareCantonCompanion, sha256, validateDocumentHash, validateSourceRefs, cleanText } from './contract';
import { cantonInventory } from '../../../client/src/lib/baselCantonDetail';

const fixtureBytes = readFileSync(new URL('./fixtures/final-source-shapes_V1.json', import.meta.url));
const fixture = JSON.parse(fixtureBytes.toString('utf8'));
const prepare = () => prepareCantonCompanion(fixture, 'V1', '2026-11-04', sha256(fixtureBytes));
const cluster = (id: string) => Object.values(prepare().documents).flatMap(d => d.clusters).find(c => c.id === id)!;

describe('final source shapes from c8f633df V1 input', () => {
  it('retains conservative 19 BS / 13 BL existing IDs with one overlap, not directory or null-ID admissions', () => {
    const d = prepare().documents; const bs = d['basel-stadt'].supportedCompanyIds; const bl = d['basel-landschaft'].supportedCompanyIds;
    expect(bs).toHaveLength(19); expect(bl).toHaveLength(13); expect(bs.filter(id => bl.includes(id))).toHaveLength(1);
    expect(fixture.fixtureSourceSha256).toBe('c8f633df4ea8e6528da22dd3dddea8c28c0a0cb8511dabcb9424b7fa612e2554');
  });
  it('expands all 21 Novartis building rows and all 49 separately labeled resident links', () => {
    const c = cluster('st-johann'); expect(c.companySites).toHaveLength(11); expect(c.buildingSchedule).toHaveLength(21); expect(c.residentReferences).toHaveLength(49);
    expect(c.residentReferences.every(r => r.addressKind === 'campus_reference' && r.address === null)).toBe(true);
    expect(c.residentReferences.every(r => r.sourceIds.includes('bs:st-johann:S06'))).toBe(true);
    expect(c.metadata.evidenceContainers).toHaveProperty('buildingSchedule.commonUnknowns');
  });
  it('retains all 54 Allschwil roster entries without fabricated company-address allocations', () => {
    const c = cluster('allschwil'); expect(c.residentReferences).toHaveLength(54);
    expect(c.residentReferences[0].name).toBe('abc biopply AG'); expect(c.residentReferences[0].metadata.buildingAllocation).toBeNull();
    const rows = cantonInventory([c], { q: '', clusterId: '', addressKind: 'all' }); expect(rows).toHaveLength(67);
  });
  it('keeps every Klybeck unit, asking-rent denominator, fit-out and unnormalized Stücki rent text', () => {
    const c = cluster('klybeck-stucki'); expect(c.availabilityEvidence).toHaveLength(32); expect(c.residentReferences).toHaveLength(29);
    const first = c.availabilityEvidence[0]; expect(first.areaValue).toBe(1590); expect(first.areaBasis).toContain('gross/net not defined');
    expect(first.facts.find(f => f.sourceKey === 'askingRentValue')).toMatchObject({ value: 220, unit: 'CHF/m2/year', sourceIds: ['bs:klybeck-stucki:s27'] });
    const lab = c.availabilityEvidence.find(p => p.metadata.building === 'HO60A')!;
    expect(lab.metadata.fitOut).toContain('BSL2'); expect(lab.metadata.sourceRentText).toContain('no visible denominator'); expect(lab.metadata.normalizedRent).toBeNull();
  });
  it('resolves exact metric-ID references without losing source keys, marketed unit area basis or asking rents', () => {
    const c = cluster('reinach-aesch-therwil'); expect(c.buildingSchedule).toHaveLength(8); expect(c.availabilityEvidence).toHaveLength(7);
    const first = c.availabilityEvidence[0]; expect(first.metadata.unitCode).toBe('F.SG.01');
    expect(first.facts.some(f => f.sourceKey === 'areaMetricId' && typeof f.value === 'number' && f.sourceIds.length)).toBe(true);
    expect(first.facts.some(f => f.sourceKey === 'askingRentMetricId' && typeof f.value === 'number' && f.unit?.includes('CHF'))).toBe(true);
    expect(c.developmentPipeline[0].status).toBe('evidence_gap_not_zero_pipeline');
    expect(c.developmentPipeline[0].metadata.verifiedLocal2025Or2026ProjectArea).toBeNull();
  });
  it('retains nested tenure, conflicting company addresses, capability certificates and exact null-ID operators', () => {
    const c = cluster('reinach-aesch-therwil'); const intertek = c.companySites.find(o => o.name === 'Intertek (Schweiz) AG')!;
    expect(intertek.companyId).toBeNull(); expect(intertek.siteId).toBeNull(); expect(intertek.addressKind).toBe('verified_address');
    expect(intertek.metadata.tenure).toMatchObject({ interest: null, owner: null, landlord: null, leaseExpiry: null, rent: null });
    expect(intertek.metadata.addressObservations).toHaveLength(2); expect(intertek.metadata.capabilityEvidence).toHaveProperty('statement');
    expect(cluster('liestal-sissach').companySites.find(o => o.name.includes('Corden'))?.metadata.capabilities).toHaveLength(6);
  });
  it('keeps Ironwood current physical operations unknown rather than using merger as closure', () => {
    const c = cluster('sbb-downtown'); const ironwood = c.excludedOrUnresolvedLeads.find(o => o.name.includes('Ironwood'))!;
    expect(ironwood).toBeTruthy(); expect(ironwood.addressKind).toBe('unresolved_lead'); expect(ironwood.facilityState).toBe('unresolved');
    expect(ironwood.gaps.join(' ')).toMatch(/merger|closure|operating/i);
  });
  it('does not redact valid public /home/ URL paths and preserves source page/date labels', () => {
    expect(cleanText('https://www.straumann.com/group/en/home/about/contact-us.html')).toBe('https://www.straumann.com/group/en/home/about/contact-us.html');
    const c = cluster('klybeck-stucki'); const source = c.sources.find(s => s.documentPage != null)!;
    expect(source.documentPage).not.toBeNull(); expect(source.metadata).toHaveProperty('publicationDateStatus');
  });
  it('keeps full narratives/citation indexes and hashes all rich public data', () => {
    const c = cluster('st-johann'); expect(c.detailedNarrative.length).toBeGreaterThan(1000); expect(Object.keys(c.narrativeCitationIndex).length).toBeGreaterThan(0);
    for (const d of Object.values(prepare().documents)) { expect(validateDocumentHash(d)).toBe(true); expect(() => validateSourceRefs(d, new Set(d.sources.map(s => s.id)))).not.toThrow(); }
    expect(JSON.stringify(prepare())).not.toMatch(/file:|(?:^|[\s"'(])\/(?:home|mnt|tmp|Users|private)\/|\u2014|cbre/i);
  });
  it('preserves source-reported array ranges and minimum/maximum objects instead of turning them into null', () => {
    const f = fixture.cantons['basel-stadt'].clusters.find((c: { id: string }) => c.id === 'st-johann');
    const metric = f.metrics.find((m: { value: unknown }) => Array.isArray(m.value));
    expect(cluster('st-johann').metrics.find(m => m.id === metric.id)?.value).toEqual(metric.value);
    const l = fixture.cantons['basel-landschaft'].clusters.find((c: { id: string }) => c.id === 'liestal-sissach');
    const range = l.metrics.find((m: { value: unknown }) => m.value && !Array.isArray(m.value) && typeof m.value === 'object');
    expect(cluster('liestal-sissach').metrics.find(m => m.id === range.id)?.value).toEqual(range.value);
  });
  it('prepares V2 Schönenbuch as a new cluster with a verified existing-ID BÜHLMANN record, without replacing V1', () => {
    const v2 = JSON.parse(readFileSync(new URL('./fixtures/schonenbuch-final_V2.json', import.meta.url), 'utf8'));
    const f = structuredClone(fixture); const canton = f.cantons['basel-landschaft'];
    canton.clusters.push(v2.newCluster); canton.companyIds = v2.companyIds; canton.metrics = v2.metrics;
    const d = prepareCantonCompanion(f, 'V2', '2026-11-04', v2.inputSha256).documents['basel-landschaft'];
    const row = d.clusters.find(c => c.id === 'schonenbuch')!.companySites[0];
    expect(d.version).toBe('V2'); expect(d.supportedCompanyIds).toHaveLength(14);
    expect(row).toMatchObject({ companyId: 'gco_a188e36055bd76686fb9', siteId: null, municipality: 'Schönenbuch', addressKind: 'verified_address' });
    expect(row.address).toContain('Baselstrasse 55'); expect(prepare().documents['basel-landschaft'].supportedCompanyIds).toHaveLength(13);
  });
});

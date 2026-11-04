import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { AtlasSeed, MapSite } from '../../shared/atlas';
import type { LocationPresenceManifest } from '../../shared/locationPresenceCorrections';
import { assertLocationCorrection, locationCorrectionDecision } from './location-presence-corrections';
import { equalValues } from './presence-cash-corrections';
const manifest=JSON.parse(readFileSync('data/location-presence-corrections_V7.json','utf8')) as LocationPresenceManifest;
const old=JSON.parse(gunzipSync(readFileSync('data/atlas-seed_V6.json.gz')).toString()) as AtlasSeed;
const seed=JSON.parse(gunzipSync(readFileSync('data/atlas-seed_V7.json.gz')).toString()) as AtlasSeed;
describe('V7 bounded location/presence corrections',()=>{
  it('changes only the two reviewed sites and retains exact 1276 company and 1652 site IDs',()=>{
    expect(seed.companies.map(p=>p.id)).toEqual(old.companies.map(p=>p.id));expect(seed.companies).toHaveLength(1276);expect(seed.sites.map(s=>s.id)).toEqual(old.sites.map(s=>s.id));expect(seed.sites).toHaveLength(1652);
    const targets=new Set(manifest.presence.map(c=>c.siteId));
    for(const s of old.sites) if(!targets.has(s.id))expect(seed.sites.find(x=>x.id===s.id)).toEqual(s);
    expect(seed.regions).toEqual(old.regions);expect(seed.zones).toEqual(old.zones);expect(seed.aerials).toEqual(old.aerials);
    for(const p of old.companies){const after=seed.companies.find(x=>x.id===p.id)!;const expected=structuredClone(p);expected.sites=expected.sites.map(s=>manifest.presence.find(c=>c.siteId===s.id)?.after??s);for(const c of manifest.presence.filter(c=>c.companyId===p.id))for(const s of c.sources)if(!expected.sources.some(x=>x.id===s.id))expected.sources.push(s);expect(after).toEqual(expected);}
  });
  it('uses BT29 + GB/NIR Crumlin, never the South Wales homonym or a fake building pin',()=>{
    const c=manifest.presence.find(c=>c.siteId.startsWith('uk:'))!;expect(c.before.address).toContain('BT29');expect([c.after.latitude,c.after.longitude]).toEqual([54.62054,-6.21414]);expect(c.after.precision).toBe('city_centroid');expect(c.witness.country).toBe('GB');expect(c.witness.admin1).toBe('NIR');expect(c.after.retainedPresenceObservations?.[0].site).toEqual(c.before);
    const bad=structuredClone(c);bad.after.latitude=51.67778;expect(()=>assertLocationCorrection(bad)).toThrow();
  });
  it('keeps the signed 5505 Central lab out of current operations without revoking company admission',()=>{
    const c=manifest.presence.find(c=>c.siteId.startsWith('boulder:'))!;expect(c.after.physicalStatus).toBe('lease_signed_opening_not_confirmed');expect(c.after.evidence).toBe('baseline');expect(c.after.address).toBe(c.before.address);expect(seed.companies.find(p=>p.id===c.companyId)?.evidence).toBe('baseline');expect(c.after.retainedPresenceObservations?.[0].site.physicalStatus).toBe('current');
    const bad=structuredClone(c);bad.after.physicalStatus='current';expect(()=>assertLocationCorrection(bad)).toThrow();
  });
  it('accepts exact before fields/sources, but rejects client edits, reordered arrays and source collisions',()=>{
    for(const c of manifest.presence){const indexed={evidence:c.before.evidence,precision:c.before.precision,city:c.before.city,zone:c.before.zone};expect(()=>assertLocationCorrection(c)).not.toThrow();expect(locationCorrectionDecision(c,c.before,indexed,c.sources)).toBe('apply');expect(locationCorrectionDecision(c,c.after,indexed,c.sources)).toBe('already_correct');expect(locationCorrectionDecision(c,{...c.before,address:'Client edited address'},indexed,c.sources)).toBe('SKIP_CLIENT_EDITS');expect(locationCorrectionDecision(c,c.before,{...indexed,city:'Client edit'},c.sources)).toBe('SKIP_CLIENT_EDITS');expect(locationCorrectionDecision(c,c.before,indexed,c.sources.map(s=>({...s,title:'Client edited source'})))).toBe('SKIP_CLIENT_EDITS');}
    const c=manifest.presence.find(c=>c.before.sourceIds.length>1)!;expect(locationCorrectionDecision(c,{...c.before,sourceIds:[...c.before.sourceIds].reverse()}, {evidence:c.before.evidence,precision:c.before.precision,city:c.before.city,zone:c.before.zone},c.sources)).toBe('SKIP_CLIENT_EDITS');
  });
  it('preserves every raw prior site field and every original fact/source association',()=>{
    for(const c of manifest.presence){expect(equalValues(c.after.retainedPresenceObservations?.[0].site,c.before)).toBe(true);expect(c.after.facts?.slice(0,c.before.facts?.length??0)).toEqual(c.before.facts??[]);for(const id of c.before.sourceIds)expect(c.after.sourceIds).toContain(id);}
    expect(manifest.counts.baselineUniqueCompaniesAfter).toBe(479);expect(manifest.counts.baselineCompanyRegionMembershipsAfter).toBe(502);
  });
});

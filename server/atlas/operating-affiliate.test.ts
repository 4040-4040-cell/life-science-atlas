import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { CompanyProfile } from '../../shared/atlas';
import { operatingAffiliateLabel, retainedAffiliateWitnesses } from '../../shared/operatingAffiliate';
const snapshot=JSON.parse(gunzipSync(readFileSync('scripts/offline-cache/snapshot_V7.json.gz')).toString()) as {profiles:CompanyProfile[]};
describe('Retained T3/NBE operating affiliate labels',()=>{
  it('preserves BI ownership, baseline admissions/current sites and missing own-company cash',()=>{
    for(const cid of Object.keys(retainedAffiliateWitnesses)){
      const p=snapshot.profiles.find(p=>p.id===cid)!;expect(p.parent).toBe('Boehringer Ingelheim');expect(p.listing).toBe('subsidiary');expect(p.kind).toBe('baseline_company');expect(operatingAffiliateLabel(p)).toBe('Operating affiliate of Boehringer Ingelheim');expect(p.sites.some(s=>s.physicalStatus==='current'&&s.evidence==='baseline')).toBe(true);expect(p.cash?.value).toBeNull();
    }
  });
  it('does not force a display projection after parent/kind/source edits or onto ambiguous affiliates',()=>{
    const p=snapshot.profiles.find(p=>p.id==='gco_4770f3a112b9769fac17')!;expect(operatingAffiliateLabel({...p,parent:'Client edited parent'})).toBeNull();expect(operatingAffiliateLabel({...p,kind:'Client edited kind'})).toBeNull();expect(operatingAffiliateLabel({...p,sources:p.sources.map(s=>({...s,url:'https://example.com/edited'}))})).toBeNull();expect(operatingAffiliateLabel({...p,id:'unresolved-alias'})).toBeNull();
  });
  it('keeps operator-reported Orbis association unresolved, not a closure or proven nonpresence',()=>{
    const p=snapshot.profiles.find(p=>p.id==='gco_d96230457ee4d556f0ff')!;expect(p.evidence).toBe('research');expect(p.sites[0].physicalStatus).toBe('operator_reported_current_unverified');expect(p.sites[0].address).toBe('');expect(operatingAffiliateLabel(p)).toBeNull();
  });
});

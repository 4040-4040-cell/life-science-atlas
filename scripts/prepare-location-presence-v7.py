#!/usr/bin/env python3
"""Bounded retained-evidence corrections. Never research, merge IDs, or overwrite V6."""
import copy, gzip, hashlib, json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
RESEARCH = Path('/home/ubuntu/life-science-atlas/market_intelligence_V2/research')
VERSION = 'atlas-web-v7-20261104'
ASOF = '2026-11-04'
sha = lambda b: hashlib.sha256(b).hexdigest()
def immutable(path, data):
    with path.open('xb') as f: f.write(data)
def encoded(obj): return (json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False)+'\n').encode()
def main():
    base_bytes = (ROOT/'data/atlas-seed_V6.json.gz').read_bytes()
    seed = json.loads(gzip.decompress(base_bytes))
    snap_bytes = (ROOT/'scripts/offline-cache/snapshot_V6.json.gz').read_bytes()
    snap = json.loads(gzip.decompress(snap_bytes))
    check = json.loads((ROOT/'data/snapshot-verification_V6.json').read_text())
    assert sha(snap_bytes) == check['sha256'] and sha(base_bytes) == check['correctedSeedSha256']
    assert len(seed['companies']) == len(snap['profiles']) == 1276
    old = copy.deepcopy(seed)
    live_sites = {s['id']: s for r in snap['regions'] for s in r['sites']}
    profiles = {p['id']: p for p in snap['profiles']}
    review_files = []
    for rid in ['biocapital','boulder','uk','seattle','bio-nc','biomidwest']:
        path = RESEARCH/'final_applied_reviews'/f'{rid}_review_V1.json'
        review_files.append({'file':str(path),'sha256':sha(path.read_bytes())})
    gaz_path = Path('/home/ubuntu/life-science-atlas/assets/geonames/cities1000.txt')
    gaz_bytes = gaz_path.read_bytes()
    matches = [line for line in gaz_bytes.decode().splitlines() if (lambda f: f[1]=='Crumlin' and f[8]=='GB' and f[10]=='NIR')(line.split('\t'))]
    assert len(matches)==1, 'No unambiguous retained GB/NIR Crumlin city reference'
    gaz_line = matches[0]; fields = gaz_line.split('\t')
    source = {'id':'v7:geonames:2651804:crumlin-gb-nir','title':'Retained GeoNames Crumlin city reference, ID 2651804, GB / NIR; not a building point','url':'https://download.geonames.org/export/dump/cities1000.zip','publishedDate':None,'retrievedDate':ASOF,'visibility':'public'}
    corrections=[]
    for sid in ['boulder:site:corden-colorado','uk:site:randox-laboratories-uk-hq']:
        before=copy.deepcopy(live_sites[sid]); after=copy.deepcopy(before)
        sources=[copy.deepcopy(s) for s in profiles[before['profileId']]['sources'] if s['id'] in before['sourceIds']]
        if sid.startswith('boulder:'):
            assert before['physicalStatus']=='current' and before['address']=='5505 Central, Boulder, Colorado' and before['sourceIds']==['boulder:s15']
            after['physicalStatus']='lease_signed_opening_not_confirmed'
            decision='Signed lease / lab opening unconfirmed; non-operating typed plan record. Baseline admission retained; eligibility not re-reviewed.'
            witness={'file':str(RESEARCH/'boulder_review.json'),'sha256':sha((RESEARCH/'boulder_review.json').read_bytes()),'sourceId':'boulder:s15','status':'lease_signed_opening_not_confirmed'}
            fact={'key':'site_presence_status_v7','label':'5505 Central lab status','value':'Signed lease; lab opening and occupancy commencement unconfirmed','unit':None,'scope':'This specific 5505 Central lab only; not a company eligibility or closure decision','asOf':'2026-03-04','periodStart':None,'status':'reported_signed_opening_unconfirmed','sourceIds':['boulder:s15'],'notes':'Completed building and lease announcement do not establish lab operations. No older operating site invented.','section':'Sites and leases'}
        else:
            assert before['country']=='GB' and 'BT29' in before['address'] and before['precision']=='city_centroid' and (before['latitude'],before['longitude'])==(51.67778,-3.13528)
            after['latitude'],after['longitude']=float(fields[4]),float(fields[5])
            after['sourceIds'].append(source['id']); sources.append(source)
            decision='Country GB / admin1 NIR and retained BT29 source address select Northern Ireland Crumlin city reference; no building/tenancy precision upgrade.'
            witness={'file':str(gaz_path),'sha256':sha(gaz_bytes),'record':gaz_line,'geonameId':fields[0],'country':fields[8],'admin1':fields[10],'addressSourceIds':['uk:s125','uk:s126'],'addressPostcode':'BT29 4QY'}
            fact={'key':'city_reference_resolution_v7','label':'City reference disambiguation','value':'Crumlin, Northern Ireland (GB / NIR), GeoNames 2651804','unit':None,'scope':'City reference only; not the Randox building','asOf':ASOF,'periodStart':None,'status':'retained_gazetteer_city_reference','sourceIds':before['sourceIds']+[source['id']],'notes':'BT29 source address resolves the homonym; original South Wales coordinates retained in the prior presence observation.','section':'Sites and leases'}
        after.setdefault('facts',[]).append(fact)
        after['retainedPresenceObservations']=[{'version':snap['correctedSeed']['version'],'site':copy.deepcopy(before)}]
        corrections.append({'siteId':sid,'companyId':before['profileId'],'before':before,'after':after,'sources':sources,'decision':decision,'witness':witness,'newFacts':[fact]})
        for collection in [seed['sites']]+[p['sites'] for p in seed['companies'] if p['id']==before['profileId']]:
            index=next(i for i,s in enumerate(collection) if s['id']==sid)
            assert collection[index]==before, 'Seed vs live before site drift'
            collection[index]=copy.deepcopy(after)
        p=next(p for p in seed['companies'] if p['id']==before['profileId'])
        for s in sources:
            if not any(o['id']==s['id'] for o in p['sources']):p['sources'].append(copy.deepcopy(s))
    manifest={'seedVersion':VERSION,'baseVersion':seed['version'],'asOf':ASOF,'baseSeedSha256':sha(base_bytes),'baseSnapshotSha256':sha(snap_bytes),'counts':{'companyIds':1276,'siteIds':1652,'newCompanyIds':0,'newSiteIds':0,'baselineUniqueCompaniesBefore':snap['overview']['totals']['baselineProfiles'],'baselineUniqueCompaniesAfter':snap['overview']['totals']['baselineProfiles'],'baselineCompanyRegionMembershipsBefore':sum(r['region']['baselineCompanies'] for r in snap['regions']),'baselineCompanyRegionMembershipsAfter':sum(r['region']['baselineCompanies'] for r in snap['regions'])},'reviewFiles':review_files,'policy':'Only exact expected-before site corrections and additive source/fact/audit records. Preserve all company IDs, imported observations, raw fields, prior baseline admissions, cash and region/frame memberships. No eligibility census review, new master, alias-parent merge, opening inference, FTE or lease-area invention.','presence':corrections,'producerCorrections':{'adial':{'companyId':'gco_859f011c4ffa88b7a469','priorUncheckedSiteId':'claude_csv:5c6eedfb4fa8:site:111','currentSiteId':'biocapital:site:adial-pharmaceuticals-hq','sourceIds':['biocapital:S38'],'change':'Primary selector: current baseline source-supported site before unchecked HQ import; raw import preserved; cash allocated once.'},'researchCounts':'Selected baseline company assigned once per hub; research assignment records are company/site observations, may overlap entities across layers/locations; U counts assignment records. No deduplicated research company assertion.','plans':'Typed planned site-record universe only, not a tally of all planned/construction actions; zero does not mean no planning activity.','seattleOutsideCoreIds':['claude_csv:5c6eedfb4fa8:966','claude_csv:5c6eedfb4fa8:987']}}
    assert manifest['counts']['baselineUniqueCompaniesAfter']==479 and manifest['counts']['baselineCompanyRegionMembershipsAfter']==502
    mb=encoded(manifest); seed['version']=VERSION;seed['asOf']=ASOF;seed['sourceHashes']['location_presence_corrections_V7']=sha(mb)
    assert [p['id'] for p in seed['companies']]==[p['id'] for p in old['companies']]
    assert [s['id'] for s in seed['sites']]==[s['id'] for s in old['sites']]
    immutable(ROOT/'data/location-presence-corrections_V7.json',mb)
    sb=encoded(seed); immutable(ROOT/'data/atlas-seed_V7.json',sb); immutable(ROOT/'data/atlas-seed_V7.json.gz',gzip.compress(sb,compresslevel=9,mtime=0))
    print(json.dumps({'version':VERSION,'manifestSha256':sha(mb),'seedSha256':sha(sb),'counts':manifest['counts'],'changedSiteIds':[c['siteId'] for c in corrections]}))
if __name__=='__main__':main()

#!/usr/bin/env python3
"""Read-only live/source checks; writes a new V7 audit, never modifies data."""
import gzip, hashlib, json, urllib.request
from pathlib import Path
APP=Path(__file__).resolve().parents[1]
INT=Path('/home/ubuntu/life-science-atlas/market_intelligence_V2')
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p):return json.loads(p.read_text())
def get(endpoint):
 with urllib.request.urlopen('http://127.0.0.1:3000/api/atlas'+endpoint,timeout=90) as r:return json.load(r)
def save(path,j):
 data=(json.dumps(j,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode()
 if path.exists():
  assert path.read_bytes()==data, 'Immutable audit already exists with different contents'
 else:
  with path.open('xb') as f:f.write(data)
def main():
 mb=(APP/'data/location-presence-corrections_V7.json').read_bytes();manifest=json.loads(mb)
 snapshot_bytes=(APP/'scripts/offline-cache/snapshot_V7.json.gz').read_bytes();snapshot=json.loads(gzip.decompress(snapshot_bytes));verification=read(APP/'data/snapshot-verification_V7.json')
 prior=json.load(gzip.open(APP/'scripts/offline-cache/snapshot_V6.json.gz'))
 assert sha(snapshot_bytes)==verification['sha256'] and sha(mb)==verification['manifestSha256']
 coverage=get('/coverage');overview=get('/overview')
 def coverage_groups(c):
  # SQL GROUP BY rows have no order contract; values/counts must still agree exactly.
  return {**c,**{key:sorted(c[key],key=lambda x:json.dumps(x,sort_keys=True)) for key in ['metrics','sources']}}
 assert coverage_groups(coverage)==coverage_groups(snapshot['coverage']) and overview==snapshot['overview'], 'Current API and corrected offline source disagree'
 live_regions={rid:get('/regions/'+rid) for rid in ['boulder','uk','biocapital']}
 for rid,r in live_regions.items():assert r==next(x for x in snapshot['regions'] if x['region']['id']==rid)
 for cid in ['gco_70cd08d154f30063bd4f','gco_9e75314396ae9567e3cb','gco_859f011c4ffa88b7a469','gco_4770f3a112b9769fac17','gco_7a1b3460a09f20347048']:
  assert get('/profile/'+cid)==next(p for p in snapshot['profiles'] if p['id']==cid)
 data=read(INT/'data/marketIntelligence_V2.json');old=read(INT/'data/marketIntelligence_before_V7.json')
 assert data['baselineDelta']==old['baselineDelta'] and data['snapshotVerification']['sha256']==verification['sha256']
 assert data['baselineDelta']['currentV6UniqueBaselineCompanies']==479 and data['baselineDelta']['currentV6CompanyRegionProfiles']==502
 site_changes=[]
 for c in manifest['presence']:
  fields={k:{'before':c['before'].get(k),'after':c['after'].get(k)} for k in sorted(set(c['before'])|set(c['after'])) if c['before'].get(k)!=c['after'].get(k)}
  site_changes.append({'siteId':c['siteId'],'companyId':c['companyId'],'canonicalFieldChanges':fields,'decision':c['decision'],'witness':c['witness']})
 assignment_changes=[];aggregate_changes=[]
 for rid,m in data['markets'].items():
  oldm=old['markets'][rid];om={a['companyId']:a for a in oldm['assignments']}
  assert {a['companyId'] for a in m['assignments']}==set(om)
  assert m['baselineCompanies']==oldm['baselineCompanies'] and m['researchCompanyCandidates']==oldm['researchCompanyCandidates'] and m['cashMillionUsd']==oldm['cashMillionUsd']
  for a in m['assignments']:
   o=om[a['companyId']];fields={k:{'before':o.get(k),'after':a.get(k)} for k in ['primarySiteId','areaId','area','address','sourceIds'] if a.get(k)!=o.get(k)}
   if fields:assignment_changes.append({'regionId':rid,'companyId':a['companyId'],'name':a['name'],'fields':fields})
  fields={k:{'before':oldm.get(k),'after':m.get(k)} for k in ['baselineCompanies','researchCompanyCandidates','operatingSites','plannedProjectLeads','cashMillionUsd'] if oldm.get(k)!=m.get(k)}
  if fields:aggregate_changes.append({'regionId':rid,'fields':fields})
 assert [c['companyId'] for c in assignment_changes if 'primarySiteId' in c['fields']]==['gco_859f011c4ffa88b7a469']
 report={'version':manifest['seedVersion'],'asOf':manifest['asOf'],'snapshotVerification':verification,'siteChanges':site_changes,'producerAssignmentChanges':assignment_changes,'aggregateChanges':aggregate_changes,'preservation':{'companyIds':1276,'siteIds':1652,'baselineUniqueCompanies':479,'baselineCompanyRegionMemberships':502,'unrelatedPrimarySiteAssignmentsUnchanged':True,'parentBaselineDeltaUnchanged':True,'sourceRecordsDelta':coverage['totals']['sourceRecords']-prior['coverage']['totals']['sourceRecords'],'metricObservationsDelta':coverage['totals']['metricObservations']-prior['coverage']['totals']['metricObservations'],'allCashHubTotalsUnchanged':True,'currentApiEqualsV7OfflineSource':True},'labelsAndRules':data['methodology'],'areaAliases':read(INT/'source/area_aliases_V2.json')['markets']['biocapital'],'outsideCoreResearchRecords':data['markets']['seattle']['outsideCoreResearchRecords'],'limitations':'Bounded API verification of all headers/summaries at capture plus three full profiles. Other 1273 full profiles retained unchanged from V6; no new current-company eligibility census. Print maps/layout and packaging are delegated, not certified by this data audit.'}
 audit_path=APP/('data/location-presence-ownership-verification_V7.json' if 'entityScope' in data['methodology'] else 'data/location-presence-verification_V7.json')
 if 'entityScope' in data['methodology']:report['ownershipRecords']=data['markets']['basel']['ownershipRecords']
 save(audit_path,report)
 figures=[]
 for metric,value,scope in [('baseline-unique-companies',479,'Current retained baseline company admissions across atlas; not current-company/occupancy census'),('baseline-company-region-memberships',502,'One baseline company assignment per hub; companies repeat across hubs, not additive unique companies'),('retained-profile-ids',1276,'All retained profile IDs, including imported research observations and institutional references'),('boulder-operating-site-records',13,'Current source-supported Boulder site records; 5505 Central signed/opening-unconfirmed excluded'),('boulder-typed-plan-records',1,'Only explicitly typed site plan/signed-unconfirmed records; not all planning actions')]:
  figures.append({'id':'bioatlas-'+metric+'-v7','metric':metric,'value':str(value),'scope':scope,'period':'Retained corrected release V7','source':'Source-linked current API / immutable snapshot_V7; specific retained final applied reviews','source_ids':['snapshot_V7',verification['sha256']],'as_of_date':manifest['asOf'],'verified':False,'locked':metric.startswith('baseline-'),'notes':'Baseline figures confirmed by parent/user; no eligibility recensus. Versioned additive ledger fragment for parent merge; historical seed figures remain historical.'})
 save(APP/'data/figures-ledger-fragment_V7.json',{'project':'BioAtlas corrected V7 release','last_updated':manifest['asOf'],'figures':figures})
 print(json.dumps({'auditPath':str(audit_path),'siteCorrections':len(site_changes),'primarySiteCorrections':1,'assignmentAreaOrFieldCorrections':len(assignment_changes),'aggregateChanges':aggregate_changes,'sourceRecordsDelta':report['preservation']['sourceRecordsDelta'],'snapshotSha256':verification['sha256']}))
if __name__=='__main__':main()

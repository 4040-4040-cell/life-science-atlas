#!/usr/bin/env python3
"""Immutable bounded corrective handoff. Exact reviewed IDs only; no new company IDs."""
import copy, gzip, hashlib, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
RESEARCH=pathlib.Path('/home/ubuntu/life-science-atlas/market_intelligence_V2/research')
VERSION='atlas-web-v6-20261104'
IDS={'roche-kaiseraugst':'gco_452de3e48d5e8b37d3d5','novartis-stein':'gco_9328b082a7756ed365fb','lonza-stein':'gco_59823ff9aac271b5cc32','bachem-sisslerfeld':'gco_1dc783a1c4c6e9b7b31b','t3-basel':'gco_4770f3a112b9769fac17','nbe-allschwil':'gco_7a1b3460a09f20347048','orbis-basel':'gco_d96230457ee4d556f0ff','accuray-santa-clara':'gco_52071cd164fdc6c1a826','omnicell-bay':'gco_74c8ccb8a7caefcb6052'}
NAMES={'roche-kaiseraugst':'Roche Holding AG','novartis-stein':'Novartis AG','lonza-stein':'Lonza Group AG','bachem-sisslerfeld':'Bachem Holding AG','t3-basel':'T3 Pharmaceuticals AG','nbe-allschwil':'NBE Therapeutics AG','orbis-basel':'Orbis Medicines','accuray-santa-clara':'Accuray Incorporated','omnicell-bay':'Omnicell, Inc.'}
NEW={'roche-kaiseraugst':'Kaiseraugst','novartis-stein':'Stein','lonza-stein':'Stein','bachem-sisslerfeld':'Eiken'}
SUMMARY_KEYS=['id','name','kind','evidence','category','ticker','listing','parent','website','logoUrl','regionIds','cities','stage','priority','score','coverage','occupancyRead','occupancyReason','cash','runway','employees']
def sha(b):return hashlib.sha256(b).hexdigest()
def new(path,data):
 if path.exists() and path.read_bytes()!=data:raise ValueError('Refusing to overwrite immutable V6 artifact '+str(path))
 if not path.exists():path.write_bytes(data)
def source_map(slug,sources):
 result=[];mapping={}
 for source in sources:
  sid='v6:presence:'+slug+':'+source['id'];mapping[source['id']]=sid;result.append({**source,'id':sid})
 return result,mapping
def fact(key,label,value,scope,sourceids,notes,status='primary_source_reported',unit=None,asof='2026-11-04',section='Sites and leases'):
 return {'key':key,'label':label,'value':value,'unit':unit,'scope':scope,'asOf':asof,'periodStart':None,'status':status,'sourceIds':sourceids,'notes':notes,'section':section}
def summary(c):return {k:c[k] for k in SUMMARY_KEYS}
def main():
 basebytes=(ROOT/'data/atlas-seed_V5.json').read_bytes();base=json.loads(basebytes);seed=copy.deepcopy(base)
 if len(seed['companies'])!=1276:raise ValueError('Identity fixture changed; parent approval required')
 byid={c['id']:c for c in seed['companies']};oldbyid={c['id']:c for c in base['companies']};sites={s['id']:s for s in seed['sites']}
 manifest={'version':'presence-cash-corrections-V6','seedVersion':VERSION,'baseVersion':base['version'],'asOf':'2026-11-04','baseSeedSha256':sha(basebytes),'policy':{'noNewCompanyIds':True,'nonDestructive':True,'exactExpectedOldGuards':True,'preserveHistoricalObservations':True,'plannedSitesAreNotCurrentPins':True,'Orbis':'Retain master and operator-reported Basel lead; no verified company address/pin/current-occupancy baseline. No closure inference. Copenhagen and Lausanne/Epalinges not Basel HQ.','cash':'Cash and cash equivalents only; entity-wide USD, latest eligible calendar instant <=2026-11-04 and filed<=cutoff; no investments, no local allocation, no remembered facts.'},'researchFiles':[],'presence':[],'cash':[],'profileChanges':[],'regionChanges':[],'zoneAdditions':[],'quarantined':[]}
 for slug,cid in IDS.items():
  c=byid[cid]
  if c['name']!=NAMES[slug]:raise ValueError('Exact global company identity differs '+slug)
  path=RESEARCH/(slug+'_correction.json');raw=path.read_bytes();r=json.loads(raw);manifest['researchFiles'].append({'file':path.name,'sha256':sha(raw),'decision':r['decision'],'companyId':cid,'globalCompanyId':cid,'reportingOrOperatingEntity':r['currentOperator'],'groupParent':r['parent']})
  sources,smap=source_map(slug,r['sources']);c['sources'].extend(sources);sids=[s['id'] for s in sources]
  records=[r]+r.get('relatedSiteCorrections',[])
  for i,record in enumerate(records):
   sid=record['id'];before=copy.deepcopy(sites.get(sid));after=copy.deepcopy(before) if before else {'id':sid,'profileId':cid,'regionId':'basel','company':c['name'],'city':NEW[slug],'zone':'Fricktal / Rhine manufacturing corridor','address':'','country':'Switzerland','latitude':None,'longitude':None,'precision':'unknown','evidence':'baseline','physicalStatus':'current','functions':[],'sourceIds':[],'referenceType':None,'isAnchor':False,'facts':[]}
   if before and before['profileId']!=cid:raise ValueError('Site points to a different exact global identity '+sid)
   if slug in NEW:after['city']=NEW[slug];after['zone']='Fricktal / Rhine manufacturing corridor'
   after['address']=record.get('address') or '';after['latitude']=record.get('lat');after['longitude']=record.get('lon')
   # No street-address metadata, workplace/contact blocks, or ambiguous address
   # matches can promote an address pin. Exact official workflow matches only.
   if record.get('lat') is not None and record.get('lon') is not None and (record.get('coordinatePrecision') or '').startswith('official_address_point'):
    after['precision']='official_address_point'
   else:after['precision']='unlocated_planned_project' if slug=='bachem-sisslerfeld' else 'unknown_no_verified_address_point'
   after['physicalStatus']=record['physicalStatus'];after['evidence']='research' if slug in {'bachem-sisslerfeld','orbis-basel'} else 'baseline'
   functions=record['siteFunction'];after['functions']=functions if isinstance(functions,list) else [functions]
   after['sourceIds']=list(dict.fromkeys(after['sourceIds']+sids));after['facts']=after.get('facts',[])+[
    fact('v6_site_operator','Current operating entity / project developer',record['currentOperator'],'This physical site only; not the property owner or listed reporting entity',sids,record['statusExplanation']),
    fact('v6_physical_presence','Physical-site evidence',record['physicalStatus'],'This site only',sids,record['statusExplanation'],status='operator_reported_unverified' if slug=='orbis-basel' else 'primary_source_reported'),
    fact('v6_coordinate_evidence','Coordinate evidence',record.get('coordinatePrecision') or 'No address point verified','This site only; not an occupied suite/area boundary',sids,'Only independently matched official workflow coordinates qualify; unresolved or ambiguous geocoding remains null.')]
   if before:sites[sid].clear();sites[sid].update(after)
   else:seed['sites'].append(after);sites[sid]=after
   manifest['presence'].append({'companyId':cid,'globalCompanyId':cid,'siteId':sid,'decision':record['decision'],'before':before,'after':after,'sources':sources,'gaps':record.get('gaps',r['gaps']),'researchFile':path.name})
  if slug in NEW and NEW[slug] not in c['cities']:c['cities'].append(NEW[slug])
  if slug=='orbis-basel':
   c['evidence']='research';c['kind']='retained_presence_research_lead';c['occupancyReason']='Operator-reported Allschwil residency conflicts with company-stated Copenhagen and Lausanne locations; Basel occupancy unresolved. Not a closure or verified current site.'
   c['gaps']=[g for g in c['gaps'] if 'corroborates residency' not in g]+r['gaps']
  else:c['gaps']=list(dict.fromkeys(c['gaps']+r['gaps']))
  c['facts'].append(fact('v6_presence_review','Bounded physical-presence review',r['statusExplanation'],'Named site only; not a census, available area or demand inference',sids,'Original observations and parent identities retained.',status='operator_reported_unverified' if slug=='orbis-basel' else 'primary_source_reported',section='Evidence and priority'))
  if slug in {'t3-basel','nbe-allschwil'}:c['facts'].append(fact('v6_parent_presence','Acquisition versus continuing operations','Acquired subsidiary; continuing physical operations','Named operating subsidiary and source-backed local site; acquisition is not physical closure',sids,r['statusExplanation'],section='Evidence and priority'))
  if r.get('event'):
   e=r['event'];es=[smap[x] for x in (e.get('sourceIds') or [e.get('sourceId')]) if x in smap];c['events'].append({'id':'v6:'+slug+':event','title':e.get('title') or e.get('description') or e.get('type'),'type':e['type'],'date':e.get('date'),'status':e.get('status') or ('completed' if slug=='accuray-santa-clara' else 'reported'),'direction':'contraction' if slug=='accuray-santa-clara' else None,'siteIds':[r['id']],'sourceIds':es,'notes':e.get('notes') or e.get('description') or r['statusExplanation']})
  # Keep narrowly described historic facility figures; never overwrite current
  # suite-area/headcount fields or duplicate combined premises across sites.
  for i,q in enumerate(r.get('quantities',[])):
   c['facts'].append(fact('v6_historical_premises_'+str(i),'Historical premises disclosure / source scope',q['value'],q['scope'],[smap[q['sourceId']]],'Not current measured occupancy, available space, or market demand.',unit=q['unit'],asof=next((s['publishedDate'] for s in sources if s['id']==smap[q['sourceId']]),None)))
 cash=json.loads((ROOT/'data/cash-extraction_V6.json').read_text());manifest['cashExtractionSha256']=sha((ROOT/'data/cash-extraction_V6.json').read_bytes())
 for r in cash['results']:
  if r['decision']!='correct_verified_current_cash':manifest['quarantined'].append(r);continue
  c=byid[r['companyId']];old=next((f for f in c['facts'] if f['key']==r['before']['key']),None)
  if old!=r['before']:raise ValueError('Cash field differs from retained detailed fact '+c['id'])
  c['cash']=r['after'];c['facts']=[r['after'] if f['key']==r['before']['key'] else f for f in c['facts']];c['sources'].extend(r['sources']);manifest['cash'].append(r)
  # Historical mechanical runway is not recomputed using mismatched current cash.
  for f in c['facts']:
   if f['key']=='cash_runway_months' and f.get('value') is not None:
    manifest['quarantined'].append({'companyId':c['id'],'reason':'Historical runway preserved, not recomputed from newly corrected cash without a matching flow period.'})
 basel=next(r for r in seed['regions'] if r['id']=='basel');oldbasel=next(r for r in base['regions'] if r['id']=='basel')
 basel['geography']=oldbasel['geography']+' Fricktal / Rhine manufacturing corridor includes the individually sourced Roche Kaiseraugst and Novartis/Lonza Stein operating sites and the separately labeled planned Bachem Sisslerfeld project in Eiken. This is analytical coverage, not an official JLL boundary or exhaustive Fricktal census.'
 basel['description']='Selected source-supported baseline, unresolved research leads and named planned projects kept distinct. Fricktal coverage added; not a complete census.'
 manifest['regionChanges'].append({'regionId':'basel','before':oldbasel,'after':copy.deepcopy(basel)})
 zone={'id':'basel-fricktal-manufacturing','name':'Fricktal / Rhine manufacturing corridor (analytical, not official JLL)','regionId':'basel','bounds':[7.68,47.50,8.05,47.61],'analytical':True,'siteIds':[sites[json.loads((RESEARCH/(slug+'_correction.json')).read_text())['id']]['id'] for slug in NEW]}
 # Broad analytical study extent only; no site coordinates are derived from it.
 seed['zones'].append(zone);manifest['zoneAdditions'].append(zone)
 for c in seed['companies']:
  if c!=oldbyid[c['id']]:manifest['profileChanges'].append({'companyId':c['id'],'beforeSummary':summary(oldbyid[c['id']]),'afterSummary':summary(c),'beforeProfile':oldbyid[c['id']],'afterProfile':c})
 seed['version']=VERSION;seed['asOf']='2026-11-04';seed['sourceHashes']['presence_cash_base_V5']=sha(basebytes)
 # The old V5 financial manifest is retained provenance, not rerun against V6.
 seed['sourceHashes']['retained_financial_corrections_V5']=seed['sourceHashes'].pop('financial_corrections_V5')
 for f in manifest['researchFiles']:seed['sourceHashes']['presence:'+f['file']]=f['sha256']
 seed['sourceHashes']['cash_extraction_V6']=manifest['cashExtractionSha256']
 manifest['counts']={'profileCountBefore':len(base['companies']),'profileCountAfter':len(seed['companies']),'siteCountBefore':len(base['sites']),'siteCountAfter':len(seed['sites']),'newSites':len(seed['sites'])-len(base['sites']),'cashCorrections':len(manifest['cash']),'newCompanyIds':0}
 # Store preservation witnesses in the machine diff, not sensitive local paths.
 manifestbytes=(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n').encode();seed['sourceHashes']['presence_cash_corrections_V6']=sha(manifestbytes)
 new(ROOT/'data/presence-cash-corrections_V6.json',manifestbytes)
 seedbytes=(json.dumps(seed,ensure_ascii=False,separators=(',',':'))+'\n').encode();new(ROOT/'data/atlas-seed_V6.json',seedbytes);new(ROOT/'data/atlas-seed_V6.json.gz',gzip.compress(seedbytes,compresslevel=9,mtime=0))
 fragment={'project':'BioAtlas','last_updated':'2026-11-04','mergePolicy':'Parent merges by metric/scope, respecting existing locks. This bounded fragment does not replace the root canonical ledger.','figures':[]}
 for r in manifest['cash']:
  a=r['after'];fragment['figures'].append({'id':r['companyId']+'-cash-'+a['asOf'],'metric':r['name']+' companywide cash and cash equivalents','value':str(a['value']),'unit':a['unit'],'scope':a['scope'],'period':a['asOf'],'source':r['sources'][0]['title'],'source_url':r['sources'][0]['url'],'as_of_date':r['sources'][0]['publishedDate'],'verified':True,'locked':False,'notes':'V6 guarded replacement of stale display; original observation preserved. Investments excluded.'})
 fragment['figures'].extend([{'id':'bioatlas-profile-count-v6','metric':'Retained atlas profiles, including reference and research records','value':str(len(seed['companies'])),'scope':'All atlas profile IDs, not complete market census','period':'V6','source':'Immutable V6 seed','as_of_date':'2026-11-04','verified':True,'locked':False,'notes':'Exact identity set unchanged from V5; no new company IDs.'},{'id':'bioatlas-site-count-v6','metric':'Retained atlas physical/reference site records','value':str(len(seed['sites'])),'scope':'All regions; includes research, reference and planned records, not current occupied properties','period':'V6','source':'Immutable V6 seed and nine primary-source correction decisions','as_of_date':'2026-11-04','verified':True,'locked':False,'notes':'Three new current Fricktal sites and one unlocated planned project; no prior record removed.'}])
 new(ROOT/'data/figures-ledger-fragment_V6.json',(json.dumps(fragment,indent=2)+'\n').encode());print(json.dumps(manifest['counts']));print('immutable V6 seed and machine diff ready')
if __name__=='__main__':main()

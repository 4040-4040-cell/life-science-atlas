#!/usr/bin/env python3
import csv,hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1];SOURCE=pathlib.Path('/home/ubuntu/life-science-atlas/output');j=json.load(open(ROOT/'data/atlas-seed.json'));profiles={x['id']:x for x in j['companies']}
with (SOURCE/'improved_V6/company-id-crosswalk_V6.csv').open(encoding='utf-8-sig') as f:cross={(r['region_id'],r['regional_company_id']):r['global_company_id'] for r in csv.DictReader(f)}
path=SOURCE/'final_V5/life-science-atlas_company-matrix_V5.csv';added=0;ranked=0
with path.open(encoding='utf-8-sig') as f:
 for row in csv.DictReader(f):
  cid=cross.get((row['region_id'],row['company_id']))
  if cid not in profiles:continue
  p=profiles[cid];sid='analyst_model_v5:'+row['region_id']+':'+row['company_id'];note='Existing V5 regional analyst model, not credit or a space-demand forecast. '+row['rank_note']+' The score is conditional on coverage; outside-company sites do not inherit parent lease credit.'
  p['sources'].append({'id':sid,'title':'V5 company matrix / regional analyst assumptions','url':None,'publishedDate':'2026-10-28','retrievedDate':'2026-11-02','visibility':'analyst_model'})
  def metric(key,label,value,unit=None):return {'key':key+'_'+row['region_id'],'label':label,'value':value,'unit':unit,'scope':'Regional analyst model: '+row['region'],'asOf':'2026-10-28','periodStart':None,'status':'analyst_assumption','sourceIds':[sid],'notes':note,'section':'Evidence and priority'}
  p['facts'].append(metric('original_priority','V5 analyst-priority outcome',row['tier']));p['facts'].append(metric('original_coverage','V5 weighted evidence coverage',float(row['weighted_coverage']) if row['weighted_coverage'] else None,'share of applicable weighted criteria'));added+=1
  if row['local_hq']=='Yes' and row['tier'] in ['Tier A','Tier B','Tier C'] and row['total_conditional_score'] and float(row['weighted_coverage'])>=.8:
   p['priority']=row['tier'];p['score']=float(row['total_conditional_score']);p['coverage']=float(row['weighted_coverage']);ranked+=1
j['version']='atlas-web-v2-20261102';j['sourceHashes'][path.name]=hashlib.sha256(path.read_bytes()).hexdigest();target=ROOT/'data/atlas-seed_V2.json';assert not target.exists();target.write_text(json.dumps(j,indent=2,ensure_ascii=False)+'\n');print('Added regional model observation sets',added,'with qualifying HQ priority outputs',ranked);print('Final seed',target)

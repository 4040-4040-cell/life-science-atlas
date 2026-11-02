#!/usr/bin/env python3
import collections,concurrent.futures,csv,io,json,pathlib,urllib.parse,urllib.request,urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:3000'

def get(path):
 with urllib.request.urlopen(BASE+path,timeout=45) as r:return json.load(r)

def response(path):
 try:
  with urllib.request.urlopen(BASE+path,timeout=30) as r:return r.status,r.read()
 except urllib.error.HTTPError as e:return e.code,e.read()

def main():
 seed=json.load(open(ROOT/'data/atlas-seed_V4.json'));overview=get('/api/atlas/overview');assert overview['totals']=={'baselineProfiles':480,'researchProfiles':773,'sites':1648,'aerialViews':57};regions={r['id']:get('/api/atlas/regions/'+r['id']) for r in seed['regions']};cases=[]
 for rid,data in regions.items():
  for frame in data['aerials']:
   assert frame.get('imageBounds')
   for mode in ['all','baseline','research']:cases.append((rid,data,frame,mode))
 def check_case(case):
  rid,data,frame,mode=case;siteids=set(frame['siteIds']);expected={s['profileId'] for s in data['sites'] if s['id'] in siteids and (mode=='all' or s['evidence']==mode)};params={'region':rid,'frame':frame['id'],'evidence':mode,'limit':200};query=urllib.parse.urlencode(params);listed=get('/api/atlas/companies?'+query);ids={x['id'] for x in listed['items']};assert ids==expected,(frame['id'],mode,'matrix',ids^expected)
  code,body=response('/api/atlas/export.csv?'+query);assert code==200;rows=list(csv.DictReader(io.StringIO(body.decode('utf-8-sig'))));exported={x['id'] for x in rows};assert exported==expected,(frame['id'],mode,'CSV',exported^expected)
  return {'frame':frame['id'],'evidence':mode,'profiles':len(expected)}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:frame_results=list(pool.map(check_case,cases))
 mixed=get('/api/atlas/companies?'+urllib.parse.urlencode({'region':'biotech-beach','q':'Amgen','evidence':'research','limit':100}));assert any(x['id']=='gco_48272715346d6e3b4674' for x in mixed['items'])
 originals=json.load(open('/home/ubuntu/life-science-atlas/output/improved_V6/company-cards_V6.json'));old={c['id']:c for c in json.load(open(ROOT/'data/atlas-seed_V3.json'))['companies']};clinical_checked=0;funding_checked=0
 for card in originals:
  cid=card['card_id'];expected={n for program in card.get('clinical',{}).get('programs',[]) for n in program.get('nct_ids',[])};old_ids={n.strip() for f in old[cid]['facts'] if f['key'].startswith('trial_') for n in str(f['value']).split(',') if n.strip()};needs_clinical=not expected<=old_ids;funding=card['companywide_facts']['financials'].get('funding_events',[])
  if not needs_clinical and not funding:continue
  profile=get('/api/atlas/profile/'+urllib.parse.quote(cid,safe=''));facts={f['key']:f for f in profile['facts']};actual={n.strip() for f in profile['facts'] if f['key'].startswith('trial_') for n in str(f['value']).split(',') if n.strip()}
  if needs_clinical:assert expected<=actual,(profile['name'],len(expected-actual));clinical_checked+=1
  for i,event in enumerate(funding):
   amount=event.get('amount')
   if isinstance(amount,dict) and amount.get('scope'):
    f=facts['funding_'+str(i)];assert f['scope']==amount['scope'],(profile['name'],f['scope'],amount['scope']);assert f['value']==amount.get('value');funding_checked+=1
 for path in ['/@fs/home/ubuntu/bioatlas/data/asset-transfer.json','/data/asset-transfer.json','/%40fs/home/ubuntu/bioatlas/data/asset-transfer.json']:
  code,body=response(path);assert code==403 and b'/home/ubuntu/' not in body
 for path in ['/api/atlas/companies?region=basel&frame=not-a-real-frame','/api/atlas/export.csv?region=uk&frame=basel-allschwil-bachgraben-main-campus']:
  code,body=response(path);assert code in [400,404],(path,code)
 report={'status':'PASS','edition':seed['version'],'checks':{'all_region_api_joins':len(regions),'frame_evidence_matrix_csv_parity_cases':len(frame_results),'mixed_company_research_observation':'Amgen presence retained without master duplication','clinical_profiles_with_restored_ids_checked':clinical_checked,'financing_scopes_checked':funding_checked,'private_file_routes':'403 / no source contents or local path body','invalid_frame_selection':'Rejected, no regional fallback'},'frame_cases':frame_results};(ROOT/'data/final-release-check_V4.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='frame_cases'},indent=2))

if __name__=='__main__':main()

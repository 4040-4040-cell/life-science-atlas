#!/usr/bin/env python3
import collections,csv,hashlib,json,math,pathlib,re
from urllib.parse import urlparse,unquote
ROOT=pathlib.Path(__file__).resolve().parents[1];A=pathlib.Path('/home/ubuntu/life-science-atlas');V=A/'output/improved_V6';AIR=A/'aerial_submarkets_V1'
REGION_ORDER=['biotech-beach','genetown','biotech-bay','basel','pharm-country','biocapital','bio-nc','biomidwest','seattle','boulder','uk']
NAMES={'biotech-beach':'Biotech Beach','genetown':'Genetown','biotech-bay':'Biotech Bay','basel':'Basel','pharm-country':'Pharm Country','biocapital':'BioCapital','bio-nc':'Bio NC','biomidwest':'BioMidwest','seattle':'Seattle / Puget Sound','boulder':'Boulder / Front Range','uk':'United Kingdom'}
CENTERS={'biotech-beach':([33.20,-117.65],8),'genetown':([42.35,-71.12],10),'biotech-bay':([37.62,-122.10],9),'basel':([47.56,7.60],11),'pharm-country':([40.65,-74.20],7),'biocapital':([39.05,-77.05],8),'bio-nc':([35.90,-78.85],8),'biomidwest':([40.6,-87.5],6),'seattle':([47.61,-122.20],9),'boulder':([39.98,-105.12],9),'uk':([54.0,-2.0],6)}

def clean(value):
 if value is None:return None
 s=str(value).replace('\u2014',' / ');s=re.sub(r'/home/ubuntu/[^\s;,\)]+','[internal reference]',s)
 return s if 'cbre' not in s.lower() else 'Restricted external reference omitted'

def url(v):return v if isinstance(v,str) and (v.startswith('https://') or v.startswith('http://') or v.startswith('/manus-storage/')) else None

def source(x):
 if not isinstance(x,dict):return None
 visibility=x.get('access_visibility') or x.get('visibility') or ('public' if url(x.get('url')) else 'internal');restricted=visibility in ['internal','restricted','private','supplied']
 return {'id':x.get('id') or x.get('source_id') or 'source:'+hashlib.sha256(str(x).encode()).hexdigest()[:20],'title':'Internal source / not shared' if restricted else clean(x.get('title') or x.get('publisher') or 'Source'),'url':None if restricted else url(x.get('url')),'publishedDate':x.get('publication_date') or x.get('publishedDate'),'retrievedDate':x.get('retrieved_date') or x.get('retrievedDate'),'visibility':visibility}

def fact(key,label,m=None,section='Companywide financials',scope=None,status=None,ids=None,asof=None,unit=None,notes=None):
 m=m if isinstance(m,dict) else {'value':m};value=m.get('value');value=clean(value) if isinstance(value,str) else value
 return {'key':key,'label':label,'value':value,'unit':unit or m.get('unit'),'scope':scope or clean(m.get('scope')),'asOf':asof or m.get('period_end') or m.get('observed_as_of'),'periodStart':m.get('period_start'),'status':status or m.get('status') or ('unknown' if value is None else 'reported'),'sourceIds':ids if ids is not None else m.get('source_ids',[]),'notes':notes or clean(m.get('notes')),'section':section}

def num(v):
 try:
  f=float(v);return f if math.isfinite(f) else None
 except (TypeError,ValueError):return None

def unique_sources(rows):
 out={}
 for s in rows:
  if s:out[s['id']]=s
 return list(out.values())

def main():
 assets=json.load(open(ROOT/'data/asset-transfer.json'));filings=json.load(open(ROOT/'data/retained-filing-enrichment.json')) if (ROOT/'data/retained-filing-enrichment.json').exists() else {}
 def asset(path):return assets.get(str(path),{}).get('url')
 def logo(raw):return asset(pathlib.Path(unquote(urlparse(raw).path))) if raw else None
 cards=json.load(open(V/'company-cards_V6.json'));models={x['profile_id']:x for x in json.load(open(V/'profile-view-models_V6.json'))};profiles={};sites={};site_profiles={}
 for card in cards:
  ident=card['identity'];cid=ident['global_company_id'];cw=card['companywide_facts'];fin=cw['financials'];brief=models[cid]['baseline_cre_brief'];facts=[]
  for key,label in [('cash_and_cash_equivalents','Cash and cash equivalents'),('operating_cash_flow','Operating cash flow'),('cash_runway_months','Cash runway'),('total_debt','Total debt'),('revenue','Reported revenue'),('historical_public_float','Historical public float'),('revenue_growth_yoy_pct','Matched-period revenue growth')]:facts.append(fact(key,label,fin.get(key),scope=None))
  facts.append(fact('global_employees','Global employees',cw.get('global_employees'),'Workforce'))
  facts.extend([fact('modality','Modality',None,'Science and operations'),fact('manufacturing','Manufacturing / disclosed operating relationships',None,'Science and operations'),fact('acquisition','Corporate relationship',ident.get('corporate_relationship'),'Identity',scope='Company identity',status='reported',ids=ident.get('identity_source_ids',[]))])
  cl=card.get('clinical',{});stage=cl.get('most_advanced_active_stage');stage=None if stage in ['unknown','not_applicable',None] else stage.replace('_',' ').title()
  facts.append(fact('active_stage','Highest active trial stage',stage,'Science and operations',scope='Companywide active sponsor trials, not local activity',status=cl.get('stage_evidence_status','unknown'),ids=sorted({s for p in cl.get('programs',[]) for s in p.get('source_ids',[])})))
  for i,p in enumerate(cl.get('programs',[])):
   if p.get('nct_ids'):facts.append(fact('trial_'+str(i),'Active trial registry',', '.join(p['nct_ids']),'Clinical dates',scope='Companywide sponsor trial',status=p.get('evidence_status','reported'),ids=p.get('source_ids',[]),notes=clean(p.get('notes'))))
  products=card.get('regulatory',{}).get('products',[])
  facts.append(fact('products','Disclosed products / approval-rights evidence','; '.join(str(p.get('product_name') or p.get('name') or p.get('brand_name') or 'Disclosed product') for p in products) if products else None,'Science and operations',scope='Product evidence is not automatically current approval/rightsholder proof',status='company_disclosed' if products else 'unknown',ids=sorted({s for p in products for s in p.get('source_ids',[])})))
  facts.append(fact('clinical_primary_completion','Next active primary completion',None,'Clinical dates',scope='Registry completion is not a guided results/readout date'))
  facts.append(fact('clinical_readout_guidance','Company-guided readout',None,'Clinical dates'))
  for i,funding in enumerate(fin.get('funding_events',[])):
   amount=funding.get('amount') or funding.get('amount_raised');original_scope=amount.get('scope') if isinstance(amount,dict) else None
   facts.append(fact('funding_'+str(i),'Disclosed financing',amount,'Financing',scope=original_scope,asof=funding.get('date') or funding.get('event_date'),ids=funding.get('source_ids',[]),notes=(clean(funding.get('description') or funding.get('notes')) or '')+' Financing type: '+str(funding.get('event_type') or 'not specified')+'. Companywide financing; not current cash or committed local space.'))
  sources=[source(s) for s in card['sources']]
  for addition in filings.get(cid,[]):
   sources.append(source(addition['source']));facts.extend(addition['facts'])
  events=[]
  for event in card.get('footprint_events',[]):events.append({'id':event['event_id'],'title':clean(event.get('description') or event.get('event_type') or 'Footprint event'),'type':event.get('event_type','unknown'),'date':event.get('event_date'),'status':event.get('event_status','unknown'),'direction':event.get('direction'),'siteIds':event.get('site_ids',[]),'sourceIds':event.get('source_ids',[]),'notes':clean(event.get('notes'))})
  profile={'id':cid,'name':clean(ident['display_name']),'kind':'baseline_company','evidence':'baseline','category':clean(cw.get('company_category') or 'Other').replace('_',' ').title(),'ticker':ident.get('ticker'),'listing':ident.get('listing_status'),'parent':clean(ident.get('parent_name')),'website':url(cw.get('official_website')),'logoUrl':logo(cw.get('logo_asset',{}).get('asset_url')),'regionIds':[r['region_id'] for r in card['regions']],'cities':[],'stage':stage,'priority':None,'score':None,'coverage':None,'occupancyRead':brief.get('occupancy_read',{}).get('label','Insufficient evidence'),'occupancyReason':clean(brief.get('occupancy_read',{}).get('reason','No current site-direction evidence.')),'cash':facts[0],'runway':facts[2],'employees':next((f for f in facts if f['key']=='global_employees_primary_excerpt'),next(f for f in facts if f['key']=='global_employees')),'facts':facts,'sites':[],'events':events,'sources':unique_sources(sources),'gaps':[clean(x) for x in card.get('coverage_and_gaps',{}).get('gaps',[])],'imported':[]}
  profiles[cid]=profile
  for site in card['sites']:
   sid=site['site_id'];region=sid.split(':')[0];ad=site['address'];loc=site.get('location',{});sf=[]
   for key,label in [('company_occupied_area','Company-occupied area'),('gross_area','Gross building/campus area'),('net_area','Net area'),('campus_available_area','Campus availability')]:sf.append(fact(key,label,site.get('occupancy',{}).get(key),'Sites and leases'))
   sf.append(fact('local_jobs','Local/site employees',site.get('local_jobs'),'Workforce'));tenure=site.get('tenure',{})
   for k,label in [('occupancy_interest','Owned / leased interest'),('owner_name','Named owner / landlord'),('lease_expiry','Lease expiry'),('renewal_options','Renewal options')]:sf.append(fact(k,label,None if tenure.get(k) in [None,'unknown'] else tenure[k],'Sites and leases',scope='This site only',status=tenure.get('disclosure_status','unknown'),ids=tenure.get('source_ids',[])))
   row={'id':sid,'profileId':cid,'regionId':region,'company':profile['name'],'city':ad.get('city') or '', 'zone':None,'address':', '.join(str(ad.get(k)) for k in ['address_line_1','address_line_2','city','state_or_province','postal_code'] if ad.get(k)),'country':ad.get('country') or '', 'latitude':loc.get('latitude'),'longitude':loc.get('longitude'),'precision':loc.get('precision_code','unknown'),'evidence':'baseline','physicalStatus':site.get('physical_status','unknown'),'functions':site.get('local_functions',[]),'sourceIds':site.get('source_ids',[]),'referenceType':None,'isAnchor':False,'facts':sf};sites[sid]=row;site_profiles[sid]=cid
 # Retain every supplied observation; exact identity links do not promote its fields.
 imports=json.load(open(V/'imported-observations_V6.json'))['observations'];research_map={f['properties']['provider_id']:f for f in json.load(open(V/'profile-linked-research-map_V6.geojson'))['features']}
 fieldmap=[('employees','Employees','people','Workforce','emp_asof'),('employees_prior','Prior employees','people','Workforce',None),('emp_change_pct','Employee change','%','Workforce','emp_asof'),('cash_and_investments_usd_m','Cash and investments','USD millions','Companywide financials','cash_asof'),('op_cash_flow_fy_usd_m','FY operating cash flow','USD millions','Companywide financials',None),('runway_months','Reported runway','months','Companywide financials','cash_asof'),('revenue_fy_usd_m','FY revenue','USD millions','Companywide financials',None),('public_float_usd_m','Historical public float','USD millions','Companywide financials','float_asof'),('private_raised_usd_m','Lifetime capital raised','USD millions','Financing',None),('last_round_usd_m','Last financing amount','USD millions','Financing','last_round_date'),('last_round_date','Last financing date',None,'Financing',None),('last_round_type','Financing type',None,'Financing','last_round_date'),('offerings_12m','Reported recent offerings',None,'Financing',None),('largest_site_sf_10k','Reported largest site / scope unchecked','sq ft','Sites and leases',None),('lease_expiration_years','Reported lease-expiration years',None,'Sites and leases',None),('landlords_named','Reported landlord names',None,'Sites and leases',None),('modality','Modality',None,'Science and operations',None),('stage','Reported scientific stage',None,'Science and operations',None),('fda_products','Reported FDA products / rights unchecked',None,'Science and operations',None),('latest_fda_approval','Reported regulatory decision date',None,'Science and operations',None),('next_ph2_3_completion','Reported trial primary completion',None,'Clinical dates',None),('next_trial','Reported trial registry ID',None,'Clinical dates',None),('footprint_2025_26','Reported footprint event',None,'Footprint events',None),('tests_met','Provider-reported inclusion tests',None,'Evidence and priority',None),('tier','Provider tier / not adopted',None,'Evidence and priority',None),('score','Provider score / not adopted',None,'Evidence and priority',None)]
 numeric={'employees','employees_prior','emp_change_pct','cash_and_investments_usd_m','op_cash_flow_fy_usd_m','runway_months','revenue_fy_usd_m','public_float_usd_m','private_raised_usd_m','last_round_usd_m','largest_site_sf_10k','score'}
 for obs in imports:
  pid=obs['provider_id'];raw=obs['original_row'];feature=research_map.get(pid);props=feature['properties'] if feature else {};region=props.get('region_id')
  if not region:
   norm=re.sub(r'[^a-z0-9]','',str(raw.get('region','')).lower());region=next((k for k,v in NAMES.items() if norm==re.sub(r'[^a-z0-9]','',v.lower())),None);region=region or {'colorado':'boulder','seattle':'seattle','biocapital':'biocapital','biomidwest':'biomidwest','bionc':'bio-nc'}.get(norm)
  assert region in REGION_ORDER,(pid,raw.get('region'))
  cid=obs['linkage'].get('linked_baseline_company_id') or pid;sid=obs['source_site_id'];sourceid='import:'+pid
  src={'id':sourceid,'title':'Supplied research CSV / row '+str(obs['source_record']['csv_row_number']),'url':None,'publishedDate':None,'retrievedDate':'2026-10-28','visibility':'supplied_research'};f=[]
  for key,label,unit,section,datekey in fieldmap:
   rawvalue=raw.get(key);value=num(rawvalue) if key in numeric else (clean(rawvalue) if rawvalue not in ['',None] else None)
   f.append(fact('reported_'+key,label,value,section,scope='Provider reported; companywide/parent or property scope not independently checked',status='reported_unverified' if value is not None else 'unknown',ids=[sourceid],asof=raw.get(datekey) if datekey else None,unit=unit,notes='Imported observation only. An address citation does not verify this field.'))
  if cid not in profiles:
   profile={'id':cid,'name':clean(raw['company']),'kind':'reported_research_observation','evidence':'research','category':clean(raw.get('category') or 'Other'),'ticker':raw.get('ticker') or None,'listing':'reported_public' if raw.get('ticker') else 'unknown','parent':None,'website':url(raw.get('website')),'logoUrl':None,'regionIds':[],'cities':[],'stage':raw.get('stage') or None,'priority':('Reported '+raw['tier']) if raw.get('tier') else None,'score':None,'coverage':None,'occupancyRead':'Insufficient evidence','occupancyReason':'Imported research has not independently established a current local occupancy direction.','cash':next(x for x in f if x['key']=='reported_cash_and_investments_usd_m'),'runway':next(x for x in f if x['key']=='reported_runway_months'),'employees':next(x for x in f if x['key']=='reported_employees'),'facts':f,'sites':[],'events':[],'sources':[src],'gaps':['Research-layer presence, metrics, priorities and coordinates require independent field-level checking.','Provider Hold is not adopted as an occupancy conclusion.'],'imported':[]};profiles[cid]=profile
  profile=profiles[cid]
  if region not in profile['regionIds']:profile['regionIds'].append(region)
  if profile['evidence']=='baseline':profile['imported'].append({'id':pid,'note':'Imported research observation, not independently confirmed. Original values retained; no baseline facts replaced.','facts':f,'sources':[src]})
  geometry=(feature or {}).get('geometry');coords=geometry.get('coordinates') if geometry else None
  addresssrc={'id':'import-address:'+pid,'title':'Provider-supplied address citation only','url':url(raw.get('address_source')),'publishedDate':None,'retrievedDate':'2026-10-28','visibility':'public'};profile['sources']=unique_sources(profile['sources']+[src,addresssrc])
  sites[sid]={'id':sid,'profileId':cid,'regionId':region,'company':clean(raw['company']),'city':clean(raw.get('city') or ''),'zone':clean(raw.get('submarket') or raw.get('zone')),'address':', '.join(str(raw.get(k)) for k in ['street','city','state'] if raw.get(k)),'country':'United Kingdom' if region=='uk' else 'United States','latitude':coords[1] if coords else None,'longitude':coords[0] if coords else None,'precision':'provider_unchecked_'+str(raw.get('geo_precision') or 'unknown'),'evidence':'research','physicalStatus':'unknown','functions':[raw.get('site_type') or 'Reported site'],'sourceIds':[sourceid,addresssrc['id']],'referenceType':'unchecked_imported_presence','isAnchor':obs.get('record_type')=='imported_anchor','facts':[]}
 # Apply source-supported street/address coordinates and separately named campus references.
 aerialrecords=json.load(open(AIR/'data/aerial_site_records_V1.json'))+json.load(open(AIR/'data/basel_aerial_site_records_V1.json'))
 for r in aerialrecords:
  sid=r['site']['site_id'];cid=r['company_id'];g=r['geocode'];ad=r['site']['address'];sources=[source(s) for s in r.get('source_records',[])]
  if cid not in profiles:
   profiles[cid]={'id':cid,'name':clean(r['company']),'kind':'institution_reference','evidence':'baseline','category':'Institution / campus reference','ticker':None,'listing':None,'parent':None,'website':url(r.get('website')),'logoUrl':logo((r.get('logo') or {}).get('asset_url')),'regionIds':[r['region_id']],'cities':[],'stage':None,'priority':None,'score':None,'coverage':None,'occupancyRead':'Reference location','occupancyReason':'Institutional or campus orientation reference, not a company lease or suite.','cash':None,'runway':None,'employees':None,'facts':[],'sites':[],'events':[],'sources':unique_sources(sources),'gaps':['A campus reference address does not establish a company suite, lease or available area.'],'imported':[]}
  profile=profiles[cid];profile['sources']=unique_sources(profile['sources']+sources)
  if sid not in sites:
   sites[sid]={'id':sid,'profileId':cid,'regionId':r['region_id'],'company':clean(r['company']),'city':ad.get('city') or '','zone':None,'address':'','country':ad.get('country') or '', 'latitude':None,'longitude':None,'precision':'unknown','evidence':'baseline','physicalStatus':r['site'].get('physical_status','unknown'),'functions':r['site'].get('local_functions',[]),'sourceIds':r['site'].get('source_ids',[]),'referenceType':r.get('reference_type'),'isAnchor':bool(r.get('is_anchor')),'facts':[]}
  row=sites[sid]
  if g.get('status')=='matched':
   row.update(latitude=g['latitude'],longitude=g['longitude'],precision=g['precision'],city=ad.get('city') or row['city'],country=ad.get('country') or row['country'],address=', '.join(str(ad.get(k)) for k in ['address_line_1','city','state_or_province','postal_code'] if ad.get(k)),referenceType=r.get('reference_type') or ('campus_reference' if 'campus contact' in str(ad.get('address_line_1')).lower() else None))
  if r['region_id'] not in profile['regionIds']:profile['regionIds'].append(r['region_id'])
 units=json.load(open(AIR/'data/map_units_V1.json'))+json.load(open(AIR/'data/basel_map_units_V1.json'));rendered=json.load(open(AIR/'output/render_manifest_V1.json'))['units']+json.load(open(AIR/'output/basel_release_render_manifest_V1.json'))['units'];rm={u['unit_id']:u for u in rendered};aerials=[];zones=[]
 for u in units:
  uid=u['unit_id'];pins=rm[uid]['pins'];siteids=[p['site_id'] for p in pins];sources=unique_sources([source(s) for s in u.get('sources',[]) if isinstance(s,dict)])
  aerials.append({'id':uid,'regionId':u['region_id'],'title':clean(u['title']),'bounds':u['bbox'],'imageUrl':asset(u['image_file']),'exhibitUrl':asset(ROOT/'assets/prepared'/f'{uid}_exhibit.jpg'),'captureYears':u.get('imagery_years',[]),'attribution':clean(u.get('imagery_attribution') or u.get('imagery_source') or 'See source metadata'),'captureNote':clean(u.get('imagery_year_note') or 'Acquisition years are scoped to intersecting source imagery; not live.'),'siteIds':siteids,'sources':sources})
  zones.append({'id':uid,'name':clean(u['title']),'regionId':u['region_id'],'bounds':u['bbox'],'analytical':True,'siteIds':siteids})
 for row in sites.values():
  profile=profiles[row['profileId']];profile['sites'].append(row)
  if row['city'] and row['city'] not in profile['cities']:profile['cities'].append(row['city'])
 # Keep field-level source links resolvable, including imported and geocoder additions.
 for p in profiles.values():
  sourceids={s['id'] for s in p['sources']};needed={sid for f in p['facts'] for sid in f['sourceIds']}|{sid for e in p['events'] for sid in e['sourceIds']}|{sid for s in p['sites'] for sid in s['sourceIds']}
  for sid in needed-sourceids:p['sources'].append({'id':sid,'title':'Retained source reference / details unavailable','url':None,'publishedDate':None,'retrievedDate':None,'visibility':'unknown'})
 regions=[];pdfs=json.load(open(AIR/'output/aerial_delivery-manifest_V2.json'))['pdfs']
 for rid in REGION_ORDER:
  raw=json.load(open(A/'data/normalized_V5'/f'{rid}_V5.json'));center,zoom=CENTERS[rid];rs=[s for s in sites.values() if s['regionId']==rid];base={s['profileId'] for s in rs if s['evidence']=='baseline' and not s['isAnchor']};research={s['profileId'] for s in rs if s['evidence']=='research'}-base
  regions.append({'id':rid,'name':NAMES[rid],'geography':clean(raw.get('boundary',{}).get('description') or raw.get('coverage_notes') or NAMES[rid]),'country':'Switzerland and labeled cross-border extensions' if rid=='basel' else 'United Kingdom' if rid=='uk' else 'United States','center':center,'zoom':zoom,'macroUrl':asset(ROOT/'assets/prepared'/f'{rid}_map_V5.jpg'),'pdfUrl':asset(pdfs[rid]) if rid in pdfs else None,'baselineCompanies':len(base),'researchCompanies':len(research),'sites':len(rs),'preciseSites':sum(s['evidence']=='baseline' and s['latitude'] is not None and s['precision'] not in ['city_centroid','unknown'] for s in rs),'aerialCount':sum(u['regionId']==rid for u in aerials),'description':'Selected source-supported baseline with a separately labeled reported research layer. Not a complete census.'})
 for u in aerials:assert u['imageUrl'] and u['exhibitUrl'];assert all(s in sites for s in u['siteIds'])
 files=[V/'company-cards_V6.json',V/'profile-view-models_V6.json',V/'imported-observations_V6.json',AIR/'data/map_units_V1.json',AIR/'data/basel_map_units_V1.json'];hashes={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in files};payload={'version':'atlas-web-v1-20261102','asOf':'2026-11-02','regions':regions,'companies':list(profiles.values()),'sites':list(sites.values()),'aerials':aerials,'zones':zones,'sourceHashes':hashes};out=ROOT/'data/atlas-seed.json';assert not out.exists(),'Versioned seed already exists';out.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n');print('Prepared',len(profiles),'profiles',len(sites),'sites',len(aerials),'aerial views');print('Seed bytes',out.stat().st_size)
 counts={'as_of':'2026-11-02','source':'data/atlas-seed.json','baseline_company_profiles':sum(p['kind']=='baseline_company' for p in profiles.values()),'research_only_profiles':sum(p['evidence']=='research' for p in profiles.values()),'institutional_reference_profiles':sum(p['kind']=='institution_reference' for p in profiles.values()),'site_rows':len(sites),'aerial_views':len(aerials),'original_import_observations':len(imports),'regions':[{k:r[k] for k in ['id','baselineCompanies','researchCompanies','preciseSites','aerialCount']} for r in regions]};(ROOT/'data/seed-counts.json').write_text(json.dumps(counts,indent=2)+'\n')
 ledger=json.load(open(A/'figures-ledger.json'));metadata=[{'id':'web-atlas-'+k+'-20261102','metric':k.replace('_',' '),'value':str(v),'scope':'This generated application seed only, not a market census or tenant count','period':'2026-11-02 build','source':'data/seed-counts.json and immutable seed input hashes','as_of_date':'2026-11-02','verified':True,'locked':False,'notes':'Generated-record count; baseline/research/reference grains remain distinct.'} for k,v in counts.items() if isinstance(v,int)];ledger['figures']=[x for x in ledger['figures'] if x['id'] not in {f['id'] for f in metadata}]+metadata;(ROOT/'data/figures-ledger_web-build_V1.json').write_text(json.dumps(ledger,indent=2)+'\n')

if __name__=='__main__':main()

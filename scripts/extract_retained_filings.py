#!/usr/bin/env python3
import gzip,html,json,pathlib,re,collections
ROOT=pathlib.Path(__file__).resolve().parents[1];ATLAS=pathlib.Path('/home/ubuntu/life-science-atlas')

def main():
 cards=json.load(open(ATLAS/'output/improved_V6/company-cards_V6.json'));byurl=collections.defaultdict(list)
 for card in cards:
  for src in card['sources']:
   u=src.get('url') or ''
   if 'sec.gov/Archives/edgar/data/' in u and u.endswith(('.htm','.html')) and not u.endswith('-index.html'):byurl[u].append((card['card_id'],src))
 results=collections.defaultdict(list)
 for meta in (ATLAS/'assets/primary_logo_cache').glob('*.json'):
  info=json.load(open(meta));url=info.get('url','')
  if url not in byurl:continue
  body=meta.with_suffix('.gz')
  if not body.exists():continue
  raw=gzip.open(body,'rt',errors='replace').read();text=re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',raw)))
  props=[]
  for m in re.finditer(r'\bITEM\s*2[.\s:\-]+PROPERTIES\b',text,re.I):
   end=re.search(r'\bITEM\s*3[.\s:\-]+LEGAL',text[m.end():],re.I)
   if end:
    excerpt=text[m.end():m.end()+end.start()].strip()
    if 150<len(excerpt)<18000:props.append(excerpt[:2600])
  employee_matches=[]
  pattern=r'\b(?:we\s+(?:had|have|employed|employ)|our\s+workforce\s+consisted\s+of)\s+(?:(?:approximately|about|a\s+total\s+of)\s+)?([\d,]{2,10})\s+(?:full[ -]time\s+)?employees\b'
  for m in re.finditer(pattern,text,re.I):
   number=int(m.group(1).replace(',',''))
   if 1<=number<=2000000:employee_matches.append((number,text[max(0,m.start()-180):m.end()+160]))
  unique={x[0] for x in employee_matches}
  for cid,src in byurl[url]:
   source={'id':'retained_filing:'+src['id'],'title':src.get('title','Primary annual filing')+' / retained source text','url':url,'publishedDate':src.get('publication_date'),'retrievedDate':src.get('retrieved_date'),'visibility':'public'};facts=[]
   if props:facts.append({'key':'filing_properties_excerpt','label':'Property disclosures / primary filing excerpt','value':props[-1],'unit':None,'scope':'Companywide filing excerpt; locations and area scopes must be read in context','asOf':src.get('publication_date'),'periodStart':None,'status':'primary_filing_excerpt','sourceIds':[source['id']],'notes':'Direct text from Item 2. Not a parser-assigned landlord, lease expiry or site-occupied area. Filing date shown.','section':'Sites and leases'})
   if len(unique)==1:
    value,excerpt=employee_matches[-1];date=re.search(r'As of\s+([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})',excerpt,re.I)
    facts.append({'key':'global_employees_primary_excerpt','label':'Employees / annual filing disclosure','value':value,'unit':'people','scope':'Companywide; not local or site employment','asOf':None,'periodStart':None,'status':'primary_filing_reported','sourceIds':[source['id']],'notes':excerpt+' Reporting date: '+(date.group(1) if date else 'See source sentence and filing')+'. Source-stated approximate counts remain approximate.','section':'Workforce'})
   if facts:results[cid].append({'source':source,'facts':facts})
 normalized={}
 for cid,rows in results.items():
  selected={}
  for row in rows:
   for f in row['facts']:
    if f['key']=='global_employees_primary_excerpt':
     match=re.search(r'Reporting date: ([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})',f['notes'])
     if match:
      import datetime
      try:f['asOf']=datetime.datetime.strptime(match.group(1).replace(',',''),'%B %d %Y').date().isoformat()
      except ValueError:pass
    prior=selected.get(f['key'])
    if not prior or (row['source'].get('publishedDate') or '')>(prior['source'].get('publishedDate') or ''):selected[f['key']]={'source':row['source'],'facts':[f]}
  normalized[cid]=list(selected.values())
 results=normalized
 target=ROOT/'data/retained-filing-enrichment.json';target.write_text(json.dumps(results,indent=2)+'\n');print('Profiles with retained primary-filing additions',len(results));print('Property excerpts',sum(any(f['key']=='filing_properties_excerpt' for f in r['facts']) for rows in results.values() for r in rows));print('Employee disclosures',sum(any(f['key']=='global_employees_primary_excerpt' for f in r['facts']) for rows in results.values() for r in rows))

if __name__=='__main__':main()

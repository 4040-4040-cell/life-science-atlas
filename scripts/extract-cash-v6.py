#!/usr/bin/env python3
"""Bounded V6 stale-cash repair. No census, fuzzy matching, or remembered figures.
Only retained SEC reporting CIKs with a matching current listed ticker qualify.
Cash-only alternate concepts require the actual filing balance-sheet line witness.
"""
import argparse, datetime as dt, decimal, gzip, hashlib, json, pathlib, re, time
import requests
from bs4 import BeautifulSoup
ROOT = pathlib.Path(__file__).resolve().parents[1]
ATLAS = pathlib.Path('/home/ubuntu/life-science-atlas')
TODAY = '2026-11-04'
CACHE = ROOT/'scripts/v6-sec-cache'
FORMS = {'10-Q', '10-K', '10-Q/A', '10-K/A'}
STANDARD = 'CashAndCashEquivalentsAtCarryingValue'
# Never automatically accept combined/restricted concepts. These require an
# exact cash-only line in the entity-wide balance sheet of the actual filing.
ALTERNATES = {'Cash', 'CashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations'}
REVIEWED_ENTITY_ALTERNATES = {1145197: {'podd:CashCashEquivalentsAndRestrictedCashCurrent'}}
CACHE_ONLY = False
HEADERS = {'User-Agent':'LifeScienceAtlasResearch/1.0 (institutional financial research)', 'Accept-Encoding':'gzip, deflate'}
last_request = 0.0

def sha(b): return hashlib.sha256(b).hexdigest()
def save_new(path, data):
    if path.exists():
        if path.read_bytes()!=data: raise ValueError('Immutable V6 file already differs: '+str(path))
    else: path.write_bytes(data)
def fetch(url, name):
    global last_request
    path=CACHE/name
    if path.exists(): return path.read_bytes(), {'path':str(path.relative_to(ROOT)), 'sha256':sha(path.read_bytes()), 'retrievedDate':TODAY, 'reused':True}
    if CACHE_ONLY: raise ValueError('Cache-only mode cannot issue any network request: '+name)
    # Sequential start intervals at least 0.3 sec: strictly below four requests/sec.
    time.sleep(max(0, .30-(time.monotonic()-last_request)))
    last_request=time.monotonic()
    response=requests.get(url, headers=HEADERS, timeout=35)
    response.raise_for_status()
    body=response.content
    save_new(path,body)
    return body, {'path':str(path.relative_to(ROOT)), 'sha256':sha(body), 'retrievedDate':TODAY, 'url':url}

def eligible(f):
    return f.get('form') in FORMS and f.get('end') and f.get('filed') and f['end']<=TODAY and f['filed']<=TODAY and not f.get('start') and isinstance(f.get('val'),(int,float)) and f['val']>=0

def latest_fact(cf, tags):
    choices=[]
    for priority,tag in enumerate(tags):
        for f in cf.get('facts',{}).get('us-gaap',{}).get(tag,{}).get('units',{}).get('USD',[]):
            if eligible(f): choices.append((f['end'], f['filed'], -priority, tag, f))
    if not choices: return None
    choice=max(choices,key=lambda x:x[:3])
    return {'tag':choice[3], **choice[4]}

def filing_rows(raw, cik, reporting_date):
    """Exact entity-wide instant, USD, cash-only balance-sheet labels, no segments."""
    soup=BeautifulSoup(raw,'html.parser'); contexts={}; units={}
    for c in soup.find_all(lambda x:x.name and x.name.lower()=='xbrli:context'):
        ident=c.find(lambda x:x.name and x.name.lower()=='xbrli:identifier')
        instant=c.find(lambda x:x.name and x.name.lower()=='xbrli:instant')
        dim=c.find(lambda x:x.name and ('member' in x.name.lower() or x.name.lower()=='xbrli:segment'))
        if ident and instant and not dim and int(ident.get_text())==int(cik): contexts[c.get('id')]=instant.get_text().strip()
    for u in soup.find_all(lambda x:x.name and x.name.lower()=='xbrli:unit'):
        units[u.get('id')]=' '.join(u.stripped_strings)
    results=[]
    for f in soup.find_all(lambda x:x.name and x.name.lower()=='ix:nonfraction'):
        tag=f.get('name','').split(':')[-1]
        qualified=f.get('name','')
        if not (qualified.startswith('us-gaap:') and tag in {STANDARD,*ALTERNATES}) and qualified not in REVIEWED_ENTITY_ALTERNATES.get(int(cik),set()): continue
        if contexts.get(f.get('contextref'))!=reporting_date or units.get(f.get('unitref'))!='iso4217:USD': continue
        row=f.find_parent('tr')
        table=f.find_parent('table')
        if not row or not table: continue
        rowtext=' '.join(row.stripped_strings)
        # The complete first textual label must say cash-only, not restricted or
        # investments. Combined taxonomy alone is NEVER sufficient evidence.
        cells=row.find_all(['td','th'],recursive=False)
        label=next((' '.join(x.stripped_strings) for x in cells if re.search(r'[A-Za-z]',x.get_text())), '')
        normalized=re.sub(r'\s+',' ',label).strip().lower().rstrip(':')
        if normalized not in {'cash and cash equivalents','cash','cash and equivalents'}: continue
        tabletext=' '.join(table.stripped_strings).lower()
        if not ('total assets' in tabletext and ('total liabilities' in tabletext or 'stockholders' in tabletext or 'shareholders' in tabletext)): continue
        val=decimal.Decimal(re.sub(r'[^\d.\-]','',f.get_text()))*(decimal.Decimal(10)**int(f.get('scale','0')))
        if f.get('sign')=='-':val=-val
        if val<0: continue
        results.append({'namespace':qualified.split(':')[0],'tag':tag,'val':int(val) if val==int(val) else float(val),'end':reporting_date,'unit':'USD','rowLabel':label,'rowText':rowtext,'contextId':f.get('contextref'),'unitId':f.get('unitref'),'sourceWitness':'Entity-wide consolidated balance-sheet cash-only label in actual inline XBRL filing; investments/restricted cash are not admitted by tag fallback.'})
    # One value only; ambiguous same-period conflicting labels fail closed.
    if len({(r['tag'],r['val']) for r in results})>1: return None
    return results[0] if results else None

def main():
    global CACHE_ONLY
    CACHE_ONLY = '--cache-only' in __import__('sys').argv
    CACHE.mkdir(exist_ok=True)
    seed=json.loads((ROOT/'data/atlas-seed_V5.json').read_text()); cutoff=(dt.date.fromisoformat(TODAY)-dt.timedelta(days=365)).isoformat()
    selected=[c for c in seed['companies'] if c['id'].startswith('gco_') and c.get('cash') and c['cash']['key']=='cash_and_cash_equivalents' and c['cash'].get('asOf') and c['cash']['asOf']<cutoff]
    if len(selected)>20: raise ValueError('V6 bound exceeded; no total-census refresh permitted')
    retained={}
    for p in (ATLAS/'assets/primary_logo_cache').glob('*.json'):
        try:meta=json.loads(p.read_text())
        except Exception:continue
        if p.with_suffix('.gz').exists():retained[meta.get('url')]=(p.with_suffix('.gz'),meta)
    results=[]
    for index,c in enumerate(selected):
        item={'companyId':c['id'],'name':c['name'],'before':c['cash'],'decision':'unresolved_no_current_verified_cash','errors':[]}
        ciks=set(re.findall(r'/edgar/data/(\d+)/',' '.join(s['url'] or '' for s in c['sources'])))
        if len(ciks)!=1:
            item['decision']='quarantine_ambiguous_reporting_cik';results.append(item);continue
        cik=int(next(iter(ciks)));basename=f'CIK{cik:010d}.json';item['cik']=cik
        source_witness=[s for s in c['sources'] if re.search(r'SEC_FACT_'+str(cik)+r'_',s['id'])]
        if not source_witness:
            item['decision']='quarantine_no_retained_fact_source_identity';results.append(item);continue
        item['retainedIdentitySourceIds']=[s['id'] for s in source_witness]
        def read_sec(kind):
            url=f'https://data.sec.gov/'+('submissions/' if kind=='submissions' else 'api/xbrl/companyfacts/')+basename
            try:b,meta=fetch(url,kind+'-'+basename);return json.loads(b),meta
            except Exception as e:
                item['errors'].append({'stage':kind,'message':type(e).__name__+': '+str(e)[:180]})
                p=ATLAS/'assets'/('sec_submissions' if kind=='submissions' else 'sec')/basename
                b=p.read_bytes();return json.loads(b),{'path':str(p),'sha256':sha(b),'retrievedDate':dt.datetime.fromtimestamp(p.stat().st_mtime,dt.timezone.utc).date().isoformat(),'liveRefreshFailed':True}
        sub,submeta=read_sec('submissions');cf,cfmeta=read_sec('companyfacts')
        ticker=(c.get('ticker') or '').split(':')[-1].strip()
        if int(sub.get('cik',0))!=cik or int(cf.get('cik',0))!=cik or ticker not in sub.get('tickers',[]) or not sub.get('exchanges') or c.get('listing')!='public':
            item['decision']='quarantine_not_exact_current_listed_identity';results.append(item);continue
        item['identity']={'cik':cik,'reportingEntity':sub['name'],'companyfactsEntity':cf.get('entityName'),'ticker':ticker,'exchanges':sub['exchanges'],'matchBasis':'Retained exact SEC_FACT CIK/source mapping plus same CIK in submissions and companyfacts and exact current listed ticker. No partial-name matching.','submissionsEvidence':submeta};item['companyfactsEvidence']=cfmeta
        r=sub['filings']['recent'];filings=[{k:r[k][i] for k in ['accessionNumber','filingDate','reportDate','form','primaryDocument']} for i in range(len(r['form'])) if r['form'][i] in FORMS and r['filingDate'][i]<=TODAY and r['reportDate'][i]<=TODAY and r['reportDate'][i]]
        latest=max(filings,key=lambda f:(f['reportDate'],f['filingDate'])) if filings else None
        standard=latest_fact(cf,[STANDARD]);item['standardTagLatest']=standard
        best=None; filing=None; htmlmeta=None
        if latest:
            filing=latest;url=f'https://www.sec.gov/Archives/edgar/data/{cik}/{filing["accessionNumber"].replace("-","")}/{filing["primaryDocument"]}'
            try:
                if url in retained:
                    p,meta=retained[url];raw=gzip.decompress(p.read_bytes());htmlmeta={'path':str(p),'sha256':sha(raw),'retrievedDate':meta.get('retrieved_date') or meta.get('retrievedDate'),'retained':True};save_new(CACHE/(str(cik)+'-'+filing['accessionNumber']+'.html'),raw)
                else:raw,htmlmeta=fetch(url,str(cik)+'-'+filing['accessionNumber']+'.html')
                best=filing_rows(raw,cik,filing['reportDate'])
                if best:best.update({'accn':filing['accessionNumber'],'filed':filing['filingDate'],'form':filing['form']})
            except Exception as e:item['errors'].append({'stage':'actual_latest_filing','message':type(e).__name__+': '+str(e)[:180]})
        # Standard tag may be newer than cached submissions, but must identify its
        # actual filing. Alternate cash-only rows never promote by absent evidence.
        if standard and (not best or (standard['end'],standard['filed'])>(best['end'],best['filed'])):
            match=next((f for f in filings if f['accessionNumber']==standard['accn']),None)
            if match:best={**standard,'unit':'USD','sourceWitness':'Standard us-gaap cash and cash equivalents USD instant from SEC companyfacts.'};filing=match
        if best and best['end']>c['cash']['asOf'] and best['end']>=cutoff:
            url=f'https://www.sec.gov/Archives/edgar/data/{cik}/{best["accn"].replace("-","")}/{filing["primaryDocument"]}'
            sid=f'v6:SEC_CASH_{cik}_{best["accn"].replace("-","")}'
            item.update({'decision':'correct_verified_current_cash','after':{**c['cash'],'value':float(decimal.Decimal(str(best['val']))/decimal.Decimal(1000000)),'unit':'USD millions','scope':f'Companywide consolidated SEC reporting entity: {sub["name"]} (CIK {cik}); not local capital or lease credit','asOf':best['end'],'periodStart':None,'status':'primary_filing_reported','sourceIds':[sid],'notes':f'Cash and cash equivalents only; investments excluded. Native {best["tag"]}, USD instant, {best["form"]} filed {best["filed"]}. Selected by latest calendar instant, filing date, then approved concept; retained original observations are preserved.'},'sources':[{'id':sid,'title':f'{sub["name"]} {best["form"]} — consolidated cash and cash equivalents at {best["end"]}','url':url,'publishedDate':best['filed'],'retrievedDate':TODAY,'visibility':'public'}],'nativeEvidence':{**best,'namespace':best.get('namespace','us-gaap'),'reportingEntity':sub['name'],'cik':cik,'filingUrl':url,'filingEvidence':htmlmeta,'companyfactsEvidence':cfmeta}})
        else:item['gap']='No source-backed current cash-only USD instant. Retain historical observation; no zero or remembered-value promotion.'
        results.append(item);print(f'Cash V6 {index+1}/{len(selected)}: {c["name"]}: {item["decision"]}',flush=True)
    output={'version':'cash-extraction-V6','asOf':TODAY,'bound':{'staleDays':365,'selected':len(selected),'maximum':20,'requestRatePerSecond':3.333,'noBulkLLM':True},'policy':'Cash and cash equivalents only. USD only, exact retained listed reporting CIK, instant/form/filed cutoff. Combined restricted-cash taxonomy requires an actual consolidated balance-sheet cash-only line witness; no blanket alternate-tag fallback. Never investments or currency conversion.','results':results}
    save_new(ROOT/'data/cash-extraction_V6.json',(json.dumps(output,indent=2)+'\n').encode());print('Verified corrections:',sum(r['decision']=='correct_verified_current_cash' for r in results),flush=True)
if __name__=='__main__':main()

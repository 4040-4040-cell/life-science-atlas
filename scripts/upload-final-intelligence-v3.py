#!/usr/bin/env python3
import concurrent.futures,hashlib,json,re,subprocess,sys,threading
from pathlib import Path
APP=Path('/home/ubuntu/bioatlas');ROOT=Path('/home/ubuntu/life-science-atlas/market_intelligence_V2');FINAL=ROOT/'render_V3'
sys.path.insert(0,str(ROOT/'source'))
from public_data import public_intelligence
manifest=json.load(open(FINAL/'data/marketPrintAssetsV3_local.json'));maps=json.load(open(FINAL/'data/map_manifest_V3.json'));data=json.load(open(FINAL/'data/marketIntelligence_V3.json'))
cachefile=APP/'data/intelligence-final-transfer_V3.json';cache=json.load(open(cachefile)) if cachefile.exists() else {};lock=threading.Lock()
def dump(p,j):Path(p).write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
def upload(p):
 p=Path(p);sha=hashlib.sha256(p.read_bytes()).hexdigest()
 if str(p) in cache and cache[str(p)]['sha256']==sha:return cache[str(p)]['url']
 response=subprocess.run(['manus-upload-file','--webdev',str(p)],cwd=APP,capture_output=True,text=True,timeout=240)
 match=re.search(r'Storage Path:\s*(/manus-storage/\S+)',response.stdout)
 if response.returncode or not match:raise RuntimeError(p.name+': '+(response.stdout+response.stderr)[-600:])
 with lock:
  cache[str(p)]={'url':match.group(1),'sha256':sha};dump(cachefile,cache);print('Stored',p.name,flush=True)
 return match.group(1)
files=[Path(r[k]) for r in manifest['markets'].values() for k in ('pngPath','pdfPath')]+[Path(manifest['combinedPdfPath'])]+list((FINAL/'assets/maps').glob('*.png'))+list((FINAL/'assets/maps').glob('*.svg'))+list((FINAL/'output').glob('*.zip'))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(upload,dict.fromkeys(files)))
public={'edition':'V3','asOf':data['asOf'],'paper':{'widthInches':17,'heightInches':11,'name':'Tabloid'},'allMarketsPdfUrl':cache[manifest['combinedPdfPath']]['url'],'individualPdfZipUrl':cache[str(FINAL/'output/life-science-atlas_individual-intelligence_V3.zip')]['url'],'markets':{}}
for slug,record in manifest['markets'].items():
 m=data['markets'][slug];mp=maps[slug]
 public['markets'][slug]={'title':m['title'],'imageUrl':cache[record['pngPath']]['url'],'pdfUrl':cache[record['pdfPath']]['url'],'asOf':data['asOf'],'pages':1,'widthPoints':1224,'heightPoints':792,'paper':public['paper'],'companyRecordIds':record['companyRecordIds']}
 m.update({'printImageUrl':public['markets'][slug]['imageUrl'],'printPdfUrl':public['markets'][slug]['pdfUrl'],'mapImageUrl':cache[mp['png']]['url'],'mapSvgUrl':cache[mp['svg']]['url'],'mapAttribution':mp['attribution'],'mapBounds':mp['bbox'],'mapMetadata':{k:v for k,v in mp.items() if k not in ('png','svg')}})
registryfile=APP/'data/asset-transfer.json';registry=json.load(open(registryfile));registry.update(cache);dump(registryfile,registry)
dump(APP/'client/src/lib/marketPrintAssetsV3.json',public);dump(APP/'client/src/lib/marketIntelligence.json',public_intelligence(data));dump(FINAL/'data/durable_manifest_V3.json',public)
print('Final V3 market print/brief assets bound; 11 one-page markets.',flush=True)

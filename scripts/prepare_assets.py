#!/usr/bin/env python3
import concurrent.futures,hashlib,json,pathlib,re,subprocess,threading
from urllib.parse import urlparse,unquote
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parents[1];ATLAS=pathlib.Path('/home/ubuntu/life-science-atlas');AERIAL=ATLAS/'aerial_submarkets_V1';LOCK=threading.Lock()

def main():
 out=ROOT/'data/asset-transfer.json';existing=json.loads(out.read_text()) if out.exists() else {};paths=set();prepared=ROOT/'assets/prepared';prepared.mkdir(parents=True,exist_ok=True)
 cards=json.load(open(ATLAS/'output/improved_V6/company-cards_V6.json'))
 for c in cards:
  raw=c['companywide_facts']['logo_asset'].get('asset_url')
  if raw:
   p=pathlib.Path(unquote(urlparse(raw).path))
   if p.is_file():paths.add(p)
 units=json.load(open(AERIAL/'data/map_units_V1.json'))+json.load(open(AERIAL/'data/basel_map_units_V1.json'))
 manifest=json.load(open(AERIAL/'output/render_manifest_V1.json'))['units']+json.load(open(AERIAL/'output/basel_release_render_manifest_V1.json'))['units'];render={x['unit_id']:x for x in manifest}
 for u in units:
  paths.add(pathlib.Path(u['image_file']));target=prepared/(u['unit_id']+'_exhibit.jpg')
  if not target.exists():
   with Image.open(render[u['unit_id']]['png_path']) as im:im.thumbnail((1800,2400));im.convert('RGB').save(target,quality=91,subsampling=0,optimize=True)
  paths.add(target)
 for p in sorted((ATLAS/'maps/final_V5').glob('*_map_V5.png')):
  target=prepared/(p.stem+'.jpg')
  if not target.exists():
   with Image.open(p) as im:im.thumbnail((1800,1800));im.convert('RGB').save(target,quality=91,subsampling=0,optimize=True)
  paths.add(target)
 delivery=json.load(open(AERIAL/'output/aerial_delivery-manifest_V2.json'))
 for p in delivery['pdfs'].values():paths.add(pathlib.Path(p))
 pending=[p for p in sorted(paths) if str(p) not in existing]
 print('Durable assets',len(paths),'already transferred',len(paths)-len(pending),'pending',len(pending),flush=True)
 def upload(path):
  result=subprocess.run(['manus-upload-file','--webdev',str(path)],cwd=ROOT,capture_output=True,text=True,timeout=180)
  match=re.search(r'Storage Path:\s*(/manus-storage/\S+)',result.stdout)
  if result.returncode or not match:raise RuntimeError(str(path)+': '+(result.stdout+result.stderr)[-600:])
  with LOCK:
   existing[str(path)]={'url':match.group(1),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size};out.write_text(json.dumps(existing,indent=2)+'\n');print('Transferred',path.name,flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:list(pool.map(upload,pending))
 print('Asset transfer complete',len(existing),flush=True)

if __name__=='__main__':main()

#!/usr/bin/env python3
import csv,hashlib,json,re,subprocess,zipfile
from pathlib import Path
import pymupdf
APP=Path('/home/ubuntu/bioatlas');OUT=Path('/home/ubuntu/life-science-atlas/basel_building_detail_V1/output')
registry_path=APP/'data/asset-transfer.json';registry=json.load(open(registry_path))
def dump(p,j):Path(p).write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n')
def upload(p):
 sha=hashlib.sha256(p.read_bytes()).hexdigest();old=registry.get(str(p))
 if old and old['sha256']==sha:return old['url']
 result=subprocess.run(['manus-upload-file','--webdev',str(p)],cwd=APP,capture_output=True,text=True,timeout=240)
 match=re.search(r'Storage Path:\s*(/manus-storage/\S+)',result.stdout)
 if result.returncode or not match:raise RuntimeError(result.stdout+result.stderr)
 registry[str(p)]={'url':match.group(1),'sha256':sha};dump(registry_path,registry);print('Stored',p.name,flush=True);return match.group(1)
manifest={'edition':'V4','asOf':'2026-11-04','paper':'A3 landscape','cantons':{}}
for code,slug,title in [('BS','basel-stadt','Basel-Stadt'),('BL','basel-landschaft','Basel-Landschaft')]:
 pdf=OUT/f'basel_{code}_canton-overview_V4.pdf';png=pdf.with_suffix('.png')
 document=pymupdf.open(pdf);assert len(document)==1
 if not png.exists():document[0].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(png)
 book=OUT/f'basel_{code}_building-book_V4.pdf'
 manifest['cantons'][slug]={'title':title,'imageUrl':upload(png),'pdfUrl':upload(pdf),'bookPdfUrl':upload(book),'asOf':'2026-11-04','pages':1}
combined=OUT/'basel_BS_BL_building-book_V4.pdf';manifest['combinedBookPdfUrl']=upload(combined)
companion=APP/'data/baselCantonDetail_offline_V3.json';data=json.load(open(companion));assert not re.search(r'file://|/(?:home|mnt|Users)/', re.sub(r'https?://[^\s"<>]+', '', json.dumps(data)))
schedules=OUT/'source-schedules_V4';schedules.mkdir(exist_ok=True)
for slug,doc in data['documents'].items():
 for name,keys in [('occupiers',['companySites','residentReferences','excludedOrUnresolvedLeads']),('properties',['propertyEvidence','buildingSchedule','developmentPipeline','availabilityEvidence'])]:
  rows=[dict(canton=slug,clusterId=c['id'],**r) for c in doc['clusters'] for key in keys for r in c.get(key,[])];columns=list(dict.fromkeys(k for r in rows for k in r))
  with (schedules/f'{slug}_{name}_V4.csv').open('w',newline='',encoding='utf-8-sig') as f:
   writer=csv.DictWriter(f,fieldnames=columns);writer.writeheader();writer.writerows({k:json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v for k,v in r.items()} for r in rows)
archive=OUT/'Basel_Cantons_Print_and_Data_V4.zip'
if not archive.exists():
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
  for p in [combined,*[OUT/f'basel_{c}_{s}_V4.pdf' for c in ['BS','BL'] for s in ['canton-overview','building-book']],*schedules.glob('*.csv')]:z.write(p,p.name)
  z.write(companion,'Basel-canton-complete-evidence_V3.json')
manifest['sourceDataZipUrl']=upload(archive);dump(APP/'client/src/lib/baselCantonPrintAssetsV4.json',manifest);dump(OUT/'durable_canton_print_V4.json',manifest)

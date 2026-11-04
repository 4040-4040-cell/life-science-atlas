#!/usr/bin/env python3
"""Upload only public native aerial rasters and public individual exhibits; preserve registry."""
import concurrent.futures, hashlib, json, os, pathlib, re, shutil, subprocess, fcntl
ROOT = pathlib.Path('/home/ubuntu/bioatlas')
PRODUCER = pathlib.Path('/home/ubuntu/life-science-atlas/basel_building_detail_V1')
OUT = ROOT / 'assets/basel-canton-V3'
OUT.mkdir(parents=True, exist_ok=True)
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
dto = json.loads((PRODUCER/'data/basel_client_aerial_DTOs_V2.json').read_text())
manifest = json.loads((PRODUCER/'data/public_asset_manifest_V2.json').read_text())
index = {a['id']: a for a in manifest['assets']}
tasks = []
for frame in dto['aerials']:
    asset = index[frame['id']]
    image = PRODUCER / asset['path']
    if sha(image) != asset['sha256']: raise RuntimeError('Native raster source hash mismatch: '+frame['id'])
    pdf = PRODUCER / 'aerials' / (frame['id']+'_V2.pdf')
    if not pdf.is_file(): raise RuntimeError('Missing individual public exhibit: '+frame['id'])
    for kind,source in [('image',image),('exhibit',pdf)]:
        dest = OUT / source.name
        if dest.exists() and sha(dest) != sha(source): raise RuntimeError('Immutable copied asset differs: '+str(dest))
        if not dest.exists(): shutil.copyfile(source,dest)
        tasks.append((frame['id'],kind,dest,sha(dest)))
registry_path = ROOT/'data/asset-transfer.json'
old = json.loads(registry_path.read_text())
receipt_path = ROOT/'data/baselCantonAssets_upload_receipt_V3.json'
prior = json.loads(receipt_path.read_text()) if receipt_path.exists() else None
cache = {x['path']:x for x in prior['assets']} if prior else {}
def upload(task):
    frame_id,kind,path,digest = task
    previous = old.get(str(path)) or cache.get(str(path))
    if previous:
        if previous['sha256'] != digest or not previous['url'].startswith('/manus-storage/'): raise RuntimeError('Existing asset key differs')
        entry = dict(previous)
    else:
        result = subprocess.run(['manus-upload-file','--webdev',str(path)],cwd=ROOT,text=True,capture_output=True,timeout=180)
        if result.returncode: raise RuntimeError('Upload failed: '+path.name+' '+result.stderr[-1000:])
        match = re.search(r'/manus-storage/[^\s\"\'<>]+',result.stdout)
        if not match: raise RuntimeError('No durable path returned: '+result.stdout[:500])
        entry={'url':match.group(0).rstrip('.,)'), 'sha256':digest,'bytes':path.stat().st_size}
    print('uploaded',kind,frame_id,flush=True)
    return {**entry,'frameId':frame_id,'kind':kind,'path':str(path)}
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for result in pool.map(upload,tasks):
        results.append(result)
        partial={'version':'V3','assets':results,'complete':len(results)==len(tasks)}
        receipt_path.write_text(json.dumps(partial,indent=2)+'\n')
# Lock, reload and merge only our versioned entries. Never replace prior entries or digest aliases.
with open(ROOT/'data/.asset-transfer-merge.lock','a') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    latest=json.loads(registry_path.read_text())
    for key,value in old.items():
        if latest.get(key)!=value: raise RuntimeError('Previous registry entry changed during upload: '+key)
    for entry in results:
        key=entry['path']; value={k:entry[k] for k in ('url','sha256','bytes')}
        if key in latest and latest[key]!=value: raise RuntimeError('Conflicting immutable upload entry')
        latest[key]=value
    temp=registry_path.with_suffix('.basel-v3.tmp')
    temp.write_text(json.dumps(latest,indent=2)+'\n');os.replace(temp,registry_path)
receipt={'version':'V3','complete':True,'assets':results,'nativeFrames':len(dto['aerials']), 'individualExhibits':len(dto['aerials']), 'previousRegistryEntries':len(old),'previousRegistryHash':hashlib.sha256(json.dumps(old,sort_keys=True).encode()).hexdigest(),'registryEntriesAfterMerge':len(latest), 'registryByteHash':sha(registry_path),'producerHash':sha(PRODUCER/'data/basel_client_aerial_DTOs_V2.json'),'manifestHash':sha(PRODUCER/'data/public_asset_manifest_V2.json')}
receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
print('COMPLETE',len(results),'assets',len(latest),'registry entries',flush=True)

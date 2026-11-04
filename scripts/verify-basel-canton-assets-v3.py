#!/usr/bin/env python3
import concurrent.futures,datetime,hashlib,json,os,time,urllib.request
receipt=json.load(open('data/baselCantonAssets_upload_receipt_V3.json'))
origin=os.environ.get('MANUS_ADDON_PREVIEW_PUBLIC_ORIGIN') or 'http://127.0.0.1:3000'
def check(asset):
    error=None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(origin.rstrip('/')+asset['url'],timeout=60) as response:
                data=response.read();mime=response.headers.get('Content-Type');status=response.status
            digest=hashlib.sha256(data).hexdigest()
            if status!=200 or digest!=asset['sha256']:raise RuntimeError('Gateway content mismatch '+asset['frameId']+' '+str(mime))
            print('verified',asset['kind'],asset['frameId'],flush=True)
            return {'frameId':asset['frameId'],'kind':asset['kind'],'url':asset['url'],'status':status,'contentType':mime,'sha256':digest,'bytes':len(data)}
        except Exception as exc:
            error=exc
            if attempt<2:time.sleep(2)
    raise error
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(check,receipt['assets']))
output={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'gatewayType':'registered server storage gateway (direct development endpoint); stable project resolver takes priority where supplied','assetsVerified':len(results),'assets':results}
open('data/baselCanton_asset_gateway_verification_V3.json','w').write(json.dumps(output,indent=2)+'\n')
print('PASS',len(results),'new managed assets exact hashes',flush=True)

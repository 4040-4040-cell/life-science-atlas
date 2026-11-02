#!/usr/bin/env python3
"""Read-only checks against the actual development API and source seed."""
import csv,io,json,pathlib,urllib.error,urllib.parse,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1];BASE='http://127.0.0.1:3000'

def get(path):
 with urllib.request.urlopen(BASE+path,timeout=30) as response:return json.load(response)

def main():
 seed=json.load(open(ROOT/'data/atlas-seed_V2.json'));overview=get('/api/atlas/overview');assert len(overview['regions'])==len(seed['regions']);assert overview['totals']['aerialViews']==len(seed['aerials']);summary=[]
 for r in seed['regions']:
  data=get('/api/atlas/regions/'+r['id']);assert data['region']['id']==r['id'];assert len(data['aerials'])==r['aerialCount'];assert len(data['sites'])==r['sites'];ids={c['id'] for c in data['companies']}
  for s in data['sites']:assert s['profileId'] in ids
  sites={s['id']:s for s in data['sites']}
  for view in data['aerials']:
   assert view['imageUrl'].startswith('/manus-storage/')
   for sid in view['siteIds']:assert sites[sid]['evidence']=='baseline' and sites[sid]['precision']!='city_centroid' and 'unchecked' not in sites[sid]['precision']
  listing=get('/api/atlas/companies?'+urllib.parse.urlencode({'region':r['id'],'evidence':'baseline','limit':200,'page':1}));assert all(x['evidence']=='baseline' for x in listing['items']);summary.append({'region':r['id'],'sites':len(data['sites']),'aerials':len(data['aerials']),'companies':len(data['companies'])})
 query=get('/api/atlas/companies?'+urllib.parse.urlencode({'q':'Neurocrine','evidence':'all','limit':100}));assert query['items'];baseline=next(x for x in query['items'] if x['evidence']=='baseline');profile=get('/api/atlas/profile/'+urllib.parse.quote(baseline['id'],safe=''));assert profile['name']==baseline['name'];assert profile['sources'] and profile['sites'];assert profile['occupancyRead']!='Hold';assert 'file://' not in json.dumps(profile) and '/home/ubuntu/' not in json.dumps(profile)
 with urllib.request.urlopen(BASE+'/api/atlas/export.csv?'+urllib.parse.urlencode({'q':'Neurocrine','evidence':'all'}),timeout=30) as response:
  rows=list(csv.DictReader(io.StringIO(response.read().decode('utf-8-sig'))));assert rows
 for path in ['/api/atlas/profile/does-not-exist','/api/atlas/regions/does-not-exist']:
  try:urllib.request.urlopen(BASE+path);raise AssertionError('Unknown ID returned success')
  except urllib.error.HTTPError as error:assert error.code==404
 report={'status':'PASS','source_version':seed['version'],'scope':'Read-only actual database-backed API / all requested regions','regions':summary,'profile_join':'Neurocrine baseline/source/site join checked','filters_and_export':'Evidence filter and company search/export checked','unknown_ids':'404 verified','aerial_precision':'Every returned aerial site is baseline address-matched, not unchecked research or a city centroid'};(ROOT/'data/api-integration-check_V1.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))

if __name__=='__main__':main()

#!/usr/bin/env python3
"""Add final source-derived Basel register figures without altering unrelated locks."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REGISTER=ROOT/'client/src/lib/baselAvailabilityRegisterV1.json'
LEDGER=ROOT/'figures-ledger.json'
WORK=ROOT/'data/basel-availability_V1'

def main():
    raw=REGISTER.read_bytes();register=json.loads(raw)
    if register['status']!='complete':raise SystemExit('Final ledger update blocked: availability handoff is still pending.')
    before=LEDGER.read_bytes();ledger=json.loads(before)
    backup=WORK/'figures-ledger_before-register_V1.json'
    if not backup.exists():backup.write_bytes(before)
    figures=[]
    def add(canton,key,metric,value,scope,notes,unit='records',source_ids=None):
        if value is None:return
        figures.append(dict(id=f'basel-register-v1-{canton.lower()}-{key}-20261104',metric=metric,value=str(value),unit=unit,scope=scope,period='Observed/reconciled 2026-11-04; Basel register V1',source='Basel availability register V1; exact source CSV hashes and reviewed evidence in the integration manifest',source_file='client/src/lib/baselAvailabilityRegisterV1.json',source_sha256=hashlib.sha256(raw).hexdigest(),source_ids=source_ids or [],as_of_date=register['asOf'],verified=True,locked=False,notes=notes))
    for canton,t in register['totals'].items():
        name='Basel-Stadt' if canton=='BS' else 'Basel-Landschaft'
        scope=name+' incoming source observations retained in the companion register, not unique verified companies or an exhaustive census'
        add(canton,'company-source-rows','Retained incoming company source rows',t['sourceCompanyRows'],scope,'Exact CSV data-row coverage; provider Y/verified flags do not establish independent verification.')
        add(canton,'property-source-rows','Retained incoming property source rows',t['sourcePropertyRows'],name+' supplied campus/building observations; not vacant buildings','Every original property row preserved with source hash and 1-based data-row index; owner-occupied, planned and historical statuses stay separate.')
        for state,count in t['evidenceCounts'].items():
            add(canton,'company-evidence-'+state,'Incoming company observations classified '+state,count,scope,'Deterministic reviewed-first name/alias and street/city gates. Campus residency, registry-only and unresolved observations are not verified local operating tenants.')
        for key,ids,bucket,label in [('currentMarketedM2','currentMarketedRecordIds','measuredCurrentMarketedOfferByUseTypeM2','current'),('futureMarketedM2','futureMarketedRecordIds','futureMarketedOfferByUseTypeM2','future'),('underRefurbishmentM2','underRefurbishmentRecordIds','underRefurbishmentByUseTypeM2','refurbishment')]:
            records=[r for r in register['availabilityRecords'] if r['id'] in t[ids]]
            source_ids=list(dict.fromkeys(s for r in records for s in r['sourceIds']))
            notes=t['subtotalLabels'][label]+'. Use-type buckets: '+json.dumps(t[bucket],ensure_ascii=False)+'. Campus stock and overlapping aggregates excluded; not actual vacancy or laboratory-only supply. No absorption/years-supply ratio.'
            add(canton,'selected-'+label+'-marketed-m2','Selected measured '+label+' marketed premises',t[key],name+' selected reviewed marketed offers, mixed use with explicit type buckets; no exhaustive-market denominator',notes,'m²',source_ids)
            add(canton,'selected-'+label+'-records','Selected measured '+label+' offer records',len(t[ids]),name+' contributing reviewed unit records in '+label+' subtotal','Contributing IDs: '+', '.join(t[ids]))
    old={f['id']:f for f in ledger['figures']}
    for entry in figures:
        previous=old.get(entry['id'])
        if previous and previous.get('locked') and previous['value']!=entry['value']:
            raise SystemExit('Locked figure conflict: '+entry['id'])
    new_ids={f['id'] for f in figures}
    preserved=[f for f in ledger['figures'] if f['id'] not in new_ids]
    ledger['figures']=preserved+figures
    ledger['last_updated']=register['asOf']
    assert all(f in ledger['figures'] for f in json.loads(before)['figures'] if f['id'] not in new_ids)
    serialized=(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n').encode()
    LEDGER.write_bytes(serialized)
    receipt=dict(format=1,version='V1',beforeSha256=hashlib.sha256(before).hexdigest(),afterSha256=hashlib.sha256(serialized).hexdigest(),registerSha256=hashlib.sha256(raw).hexdigest(),preservedPriorFigures=len(preserved),addedOrRefreshedRegisterFigures=len(figures),unrelatedFigureChanges=0)
    (WORK/'ledger-update-receipt_V1.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))

if __name__=='__main__':main()

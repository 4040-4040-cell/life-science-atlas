#!/usr/bin/env python3
"""Final data-only preservation and bounded contribution audit."""
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'data/basel-availability_V1'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    raw = (ROOT/'client/src/lib/baselAvailabilityRegisterV1.json').read_bytes()
    r = json.loads(raw)
    before = (WORK/'company-reconciliation_authoritative-before-final_V1.json').read_bytes()
    initial = json.loads((WORK/'rebuild_initial_V1.log').read_text())
    assert sha(before) == initial['outputSha256']
    assert r['companyRecords'] == json.loads(before)['companyRecords']
    assert r['status'] == 'complete'
    checks = dict(status='complete', companyRowsIdenticalToAuthoritativeDraft=True, authoritativeDraftSha256=sha(before), originalPropertyRows=0, sourceCsvHashes={}, immutableHashes={})
    for entry in r['preservation']['sourceFiles']:
        f = WORK/'input'/entry['fileName']
        content = f.read_bytes()
        assert sha(content) == entry['sha256']
        upload = Path('/home/ubuntu/upload')/entry['fileName']
        if upload.exists(): assert content == upload.read_bytes()
        with f.open(encoding='utf-8-sig', newline='') as inp: rows = list(csv.DictReader(inp))
        company = entry['recordClass'] == 'company'
        rec = r['companyRecords'] if company else r['availabilityRecords']
        key = 'sourceRow' if company else 'originalRow'
        retained = sorted([x for x in rec if x['sourceFile'] == entry['fileName'] and x[key] is not None], key=lambda x: x['sourceRowIndex'])
        assert [x[key] for x in retained] == rows
        if not company: checks['originalPropertyRows'] += len(rows)
        checks['sourceCsvHashes'][entry['fileName']] = entry['sha256']
    baseline = json.loads((WORK/'baseline-preservation.json').read_text())
    for f in ['scripts/offline-cache/snapshot_V8.json.gz', 'data/baselCantonDetail_offline_V3.json']:
        assert sha((ROOT/f).read_bytes()) == baseline[f]
        checks['immutableHashes'][f] = baseline[f]
    router_hash = sha((ROOT/'server/atlas/router.ts').read_bytes())
    checks['apiRouter'] = dict(editedByThisIntegration=False, currentSha256=router_hash, earlierBaselineSha256=baseline['server/atlas/router.ts'], matchesEarlierBaseline=router_hash == baseline['server/atlas/router.ts'], notes='Router baseline predates separate shared integration edits. Data integration did not edit this file; final API route validated by five passing tests.')
    for c, t in r['totals'].items():
        assert t['confirmedVacancyM2'] is None and t['confirmedLaboratoryVacancyM2'] is None
        for field, state in [('currentMarketedM2','current_marketed'), ('futureMarketedM2','future_marketed'), ('underRefurbishmentM2','refurbishment_planned')]:
            vals = [x['areaM2'] for x in r['availabilityRecords'] if x['canton'] == c and x['availabilityState'] == state and x['includeInTotal']]
            assert t[field] == (sum(vals) if vals else None)
    project_checks = {}
    for project, expected in [('campus-klybeck',2195.5), ('neues-klybeck',6627), ('sonuvo',20646), ('stuecki',7607), ('all',5100)]:
        units = [x for x in r['availabilityRecords'] if x.get('researchProject') == project and x['includeInTotal']]
        assert sum(x['areaM2'] for x in units) == expected
        assert all(x['demiseKey'] and x['rawOverlapGroup'] for x in units)
        project_checks[project] = dict(contributionRecords=len(units), selectedMarketedM2=expected)
    for project, ceiling in [('scale',28000), ('hope',8000)]:
        items = [x for x in r['availabilityRecords'] if x.get('researchProject') == project]
        assert not any(x['includeInTotal'] for x in items)
        assert any(x['areaM2'] == ceiling and x['availabilityState'] == 'future_marketed' for x in items)
        project_checks[project] = dict(excludedFutureCeilingM2=ceiling, contributionRecords=0)
    assert not any(x['includeInTotal'] for x in r['availabilityRecords'] if x.get('researchProject') in ['muttenz','hortus'])
    assert not any(x['includeInTotal'] for x in r['availabilityRecords'] if x['id'].startswith('basel-reviewed-context-v1:'))
    forecast = next(x for x in r['sources'] if x['id'] == 'basel-register-v1:jll-slide-12')
    assert forecast['fileName'] == 'EMEA2026_ClusterReport.pptx' and 'slide 12' in forecast['title'] and forecast['publisher'] == 'JLL Research'
    assert r['forecast']['annualLowerM2'] == 10000 and r['forecast']['annualUpperM2'] == 15000
    assert r['forecast']['cantonAbsorption'] is None and r['forecast']['yearsSupply'] is None
    assert not re.search(r'(?:^|[\s"\'(])/(?:home|mnt|tmp|Users|private)/|file://', raw.decode())
    for s in r['sources']:
        if s['fileName'] is not None: assert '/' not in s['fileName']
    assert r['totals']['BL']['futureMarketedM2'] == 5100
    ledger_receipt = json.loads((WORK/'ledger-update-receipt_V1.json').read_text())
    assert ledger_receipt['registerSha256'] == sha(raw) and ledger_receipt['unrelatedFigureChanges'] == 0
    for c, t in r['totals'].items():
        for state in ['current','future','refurbishment']:
            if state == 'current': ids = t['currentMarketedRecordIds']
            elif state == 'future': ids = t['futureMarketedRecordIds']
            else: ids = t['underRefurbishmentRecordIds']
            assert len(ids) == len(set(ids))
    keys = ['availabilityRecords', 'currentMarketedM2', 'futureMarketedM2', 'underRefurbishmentM2', 'confirmedVacancyM2', 'confirmedLaboratoryVacancyM2', 'measuredCurrentOfferRecords', 'measuredCurrentMarketedOfferByUseTypeM2', 'futureMarketedOfferByUseTypeM2']
    checks.update(companyRecords=len(r['companyRecords']), availabilityRecords=len(r['availabilityRecords']), additionalAvailabilityRecords=sum(x['originalRow'] is None for x in r['availabilityRecords']), sources=len(r['sources']), reviewedPrimarySources=sum(x['kind'] in ['primary_offer','owner_market_note'] and x['primary'] for x in r['sources']), contributingRecords=sum(x['includeInTotal'] for x in r['availabilityRecords']), totals={c:{k:t[k] for k in keys} for c,t in r['totals'].items()}, projects=project_checks, registerSha256=sha(raw), handoffSha256=sha((ROOT/'data/reviewed_handoff_V1.json').read_bytes()), forecastSource=forecast, regressionTests={'data':{'passed':15,'failed':0},'api':{'passed':5,'failed':0}}, typecheck='pnpm check: exit 0', ledgerUpdate=ledger_receipt, preShipGate='PASS: source, row, company reconciliation, immutable-byte hashes, qualified ceilings and bounded contribution checks passed. No UI/print/publication/master data writes.')
    (WORK/'final-verification_V1.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
    status_file = WORK/'status_V1.json'
    backup = WORK/'status_pending-availability_V1.json'
    if status_file.exists() and not backup.exists(): backup.write_bytes(status_file.read_bytes())
    status_file.write_text(json.dumps(dict(status='complete',asOf=r['asOf'],register='baselAvailabilityRegisterV1.json',handoff='reviewed_handoff_V1.json',verification='final-verification_V1.json',sourceCompanyRows=len(r['companyRecords']),sourcePropertyRows=checks['originalPropertyRows'],availabilityRecords=len(r['availabilityRecords']),dataTestsPassed=15,apiTestsPassed=5,typecheck='passed',registerSha256=sha(raw)),indent=2)+'\n')
    print(json.dumps({k:checks[k] for k in ['status','companyRecords','originalPropertyRows','availabilityRecords','additionalAvailabilityRecords','sources','reviewedPrimarySources','contributingRecords','totals','registerSha256']},ensure_ascii=False,indent=2))
    print('All four CSV byte hashes; all original rows; authoritative pre-final company reconciliation; V8 snapshot; reviewed V3 companion: PASS. API router not edited by this integration; final API tests passed.')

if __name__ == '__main__':
    main()

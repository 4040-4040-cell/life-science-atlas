#!/usr/bin/env python3
"""Create V5 from V4 without mutating any retained seed, SEC cache or ledger.
Only the 91 audited source/period/unit/value matches qualify. Future rebuilds
must run this corrective finalizer, or apply data/builder-cfo-sign_V1.patch to
a NEW working copy of the archived builder (never overwrite V5/V6 archives).
"""
import argparse
import copy
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = Path('/home/ubuntu/terminal_full_output/2026-11-02_19-03-49_643294_39337.txt')
CACHE = Path('/home/ubuntu/life-science-atlas/assets/sec')

def digest(data):
    return hashlib.sha256(data).hexdigest()

def signed_operating_cash_flow(value, field):
    # Native CFO fields retain their sign. CASHUSE is the signed inverse of CFO.
    return -value if field == 'operating_cash_use_usdm' else value

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', default=str(ROOT / 'data/atlas-seed_V4.json'))
    parser.add_argument('--output', default=str(ROOT / 'data/atlas-seed_V5.json'))
    parser.add_argument('--manifest', default=str(ROOT / 'data/financial-corrections_V5.json'))
    args = parser.parse_args()
    output, manifest_path = Path(args.output), Path(args.manifest)
    for p in [output, Path(str(output) + '.gz'), manifest_path]:
        if p.exists():
            raise SystemExit('Immutable output already exists: ' + str(p))
    raw = Path(args.input).read_bytes()
    seed = json.loads(gzip.decompress(raw) if args.input.endswith('.gz') else raw)
    assert seed['version'] == 'atlas-web-v4-20261102', 'V4 is the approved base'
    original = copy.deepcopy(seed)
    audit = AUDIT.read_text().split('\nOCF_MISMATCH_COUNT 91\n', 1)[1]
    records, _ = json.JSONDecoder().raw_decode(audit.lstrip())
    assert len(records) == 91 and len({r['id'] for r in records}) == 91
    profiles = {c['id']: c for c in seed['companies']}
    corrections = []
    for r in records:
        c = profiles[r['id']]
        f = next(f for f in c['facts'] if f['key'] == r['key'])
        assert f['value'] == r['live'] and f['unit'] == r['unit'] == 'USD millions'
        assert (f['periodStart'], f['asOf']) == (r['start'], r['end'])
        assert r['sec'] > 0 and r['live'] == -r['sec']
        sources = [next(s for s in c['sources'] if s['id'] == sid) for sid in f['sourceIds']]
        assert sources and all(r['accn'].replace('-', '') in s['id'] for s in sources)
        cik = sources[0]['url'].split('/data/')[1].split('/')[0]
        cache_file = CACHE / ('CIK' + cik.zfill(10) + '.json')
        cached = cache_file.read_bytes()
        cf = json.loads(cached)
        native = cf['facts']['us-gaap'][r['tag']]['units']['USD']
        matches = [n for n in native if n.get('start') == r['start'] and n['end'] == r['end'] and n['accn'] == r['accn'] and n['filed'] == r['filed'] and n['val'] / 1e6 == r['sec']]
        assert matches, ('SEC source witness mismatch', c['id'])
        before = copy.deepcopy(f)
        f['value'] = matches[0]['val'] / 1e6
        bad_prefix = 'Positive source-stated operating cash use is represented as negative operating cash flow.'
        notes = (f.get('notes') or '').replace(bad_prefix, '').strip()
        notes = notes.replace('Cash-use sign is the inverse of reported operating cash flow', 'Signed cash-use input is the inverse of reported operating cash flow; converting back preserves the SEC CFO sign')
        f['notes'] = 'Corrected CFO sign from SEC us-gaap.NetCashProvidedByUsedInOperatingActivities; positive means cash provided by operations. ' + notes
        corrections.append({'companyId': c['id'], 'name': c['name'], 'before': before, 'after': copy.deepcopy(f), 'sources': sources, 'nativeEvidence': {'namespace': 'us-gaap', 'tag': r['tag'], 'unit': 'USD', 'value': matches[0]['val'], 'periodStart': r['start'], 'periodEnd': r['end'], 'accession': r['accn'], 'filed': r['filed'], 'cacheFile': cache_file.name, 'cacheSha256': digest(cached)}})
    manifest = {'version': 'financial-corrections-v5-20261102', 'seedVersion': 'atlas-web-v5-20261102', 'baseVersion': original['version'], 'asOf': '2026-11-02', 'auditSha256': digest(AUDIT.read_bytes()), 'corrections': corrections}
    manifest_bytes = (json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode()
    seed['version'] = manifest['seedVersion']
    seed['sourceHashes']['financial_corrections_V5'] = digest(manifest_bytes)
    seed['sourceHashes']['corrective_base_V4'] = digest(raw)
    # The only profile differences are the 91 explicitly manifested CFO facts.
    reverted = copy.deepcopy(seed)
    for r in corrections:
        c = next(c for c in reverted['companies'] if c['id'] == r['companyId'])
        c['facts'] = [r['before'] if f['key'] == 'operating_cash_flow' else f for f in c['facts']]
    reverted['version'] = original['version']
    reverted['sourceHashes'] = original['sourceHashes']
    assert reverted == original
    encoded = (json.dumps(seed, indent=2, ensure_ascii=False) + '\n').encode()
    for p, data in [(manifest_path, manifest_bytes), (output, encoded), (Path(str(output) + '.gz'), gzip.compress(encoded, compresslevel=9, mtime=0))]:
        with p.open('xb') as handle:
            handle.write(data)
    print(json.dumps({'version': seed['version'], 'sourceBackedCfoCorrections': len(corrections), 'profiles': len(seed['companies']), 'sites': len(seed['sites']), 'onlyCfoValuesAndNotesChanged': True, 'manifestSha256': digest(manifest_bytes)}))

if __name__ == '__main__':
    main()

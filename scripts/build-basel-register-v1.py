#!/usr/bin/env python3
"""Basel register V1: immutable master, reviewed-first company reconciliation.

Initial phase preserves all CSV rows but does not assemble current availability.
Final phase requires an explicit reviewed handoff JSON, never an automatic scrape.
"""
import argparse
import collections
import csv
import gzip
import hashlib
import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'data/basel-availability_V1'
INPUT = WORK / 'input'
OUTPUT = ROOT / 'client/src/lib/baselAvailabilityRegisterV1.json'
SNAPSHOT = ROOT / 'scripts/offline-cache/snapshot_V8.json.gz'
COMPANION = ROOT / 'data/baselCantonDetail_offline_V3.json'
AS_OF = '2026-11-04'
STATES = ['source_supported_operating', 'source_supported_contact', 'campus_resident', 'registry_only', 'unresolved', 'conflict']
FILES = [(c, k, f'Basel_Basel{n}_{suffix}_V1.csv') for c, n in [('BS', 'Stadt'), ('BL', 'Landschaft')] for k, suffix in [('company', 'Companies'), ('property', 'CampusesBuildings')]]
EXPECTED = {('BS', 'company'): 138, ('BL', 'company'): 107, ('BS', 'property'): 57, ('BL', 'property'): 38}

# Explicit, review-scoped display aliases; not a global legal-entity merger.
# These aliases never by themselves prove the incoming local address.
ALIASES = {
 'allschwil:occupier:2': ['Basilea Pharmaceutica'],
 'klybeck-stucki:occupier:2': ['Boehringer Ingelheim / NBE-Therapeutics AG'],
 'sbb:bayer-consumer': ['Bayer (Basel hub: Bayer Consumer Care AG)'],
 'st-johann:occupier:8': ['Ultragenyx Europe GmbH'],
 'sbb:regeneron-office': ['Regeneron Switzerland GmbH'],
 'sbb:acadia-office': ['Acadia Pharmaceuticals GmbH'],
 'klybeck-stucki:occupier:4': ['Medartis Holding AG'],
 'allschwil:occupier:5': ['SKAN Group AG'],
 'allschwil:occupier:9': ['Neurocrine Switzerland GmbH'],
 'allschwil:occupier:10': ['Viatris Innovation GmbH'],
 'allschwil:occupier:13': ['Abbott (Established Pharmaceuticals Division)'],
 'sbb:lonza-hq': ['Lonza Group AG'],
 'sbb:sandoz-hq': ['Sandoz Group AG'],
 'sbb:straumann-hq': ['Straumann Holding AG'],
 'roche-kleinbasel:occupier:1': ['Roche Holding AG'],
}
# Only reviewed local-function evidence, not incoming modality or site_type, sets this state.
OPERATING_RECORDS = {
 'rosental:occupier:2', 'rosental:occupier:3', 'rosental:occupier:4',
 'klybeck-stucki:occupier:1', 'klybeck-stucki:occupier:2', 'klybeck-stucki:occupier:4',
 'allschwil:occupier:1', 'allschwil:occupier:2', 'allschwil:occupier:3',
 'allschwil:occupier:4', 'allschwil:occupier:5', 'allschwil:occupier:6',
 'muttenz-pratteln:occupier:1', 'muttenz-pratteln:occupier:2', 'muttenz-pratteln:occupier:3', 'muttenz-pratteln:occupier:4',
 'bubendorf:occupier:2', 'bubendorf:occupier:3', 'reinach-intertek', 'reinach-swiss-bioquant',
 'aesch-acino', 'therwil-sentec', 'liestal-sissach:address:cordenpharma-liestal',
 'liestal-sissach:address:nanosurf-liestal', 'schonenbuch:occupier:1',
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def norm(value):
    value = unicodedata.normalize('NFKD', str(value or '').replace('ü', 'ue').replace('Ü', 'Ue').replace('ö', 'oe').replace('Ö', 'Oe').replace('ä', 'ae').replace('Ä', 'Ae'))
    value = ''.join(c for c in value if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z0-9]+', ' ', value).strip()

def name_key(value):
    value = norm(value)
    value = re.sub(r'\b(?:ag|gmbh|ltd|limited|inc|sa|s a|spa|llc)\b', '', value)
    return ' '.join(value.split())

def names(reviewed):
    # A reviewed '/' explicitly separates the named entities or functional labels.
    base = re.split(r'\s+-\s+', reviewed['name'])[0]
    variants = [base, *base.split(' / '), *ALIASES.get(reviewed['id'], [])]
    return {name_key(n) for n in variants if name_key(n)}

def valid_url(value):
    value = re.sub(r'\s+', '', str(value or ''))
    return value if re.match(r'^https?://', value) else None

def street_key(value):
    # Preserve number/letter suffix and do not equate different numbered buildings.
    value = norm(value)
    value = re.sub(r'([a-z])str\b', r'\1strasse', value)
    value = re.sub(r'\bstr\b', 'strasse', value)
    value = re.sub(r'\b(\d+)\s+([a-z])\b', r'\1\2', value)
    return value

def address_matches(incoming, reviewed, cluster):
    street = street_key(incoming.get('street'))
    city = norm(incoming.get('city'))
    address = street_key(reviewed.get('address'))
    if not street or not address or not city:
        return False
    # City must be stated in the reviewed address or reviewed municipality.
    # Cluster-only locality is insufficient for numbered street-site verification.
    if not (re.search(r'(?<![a-z0-9])' + re.escape(city) + r'(?![a-z0-9])', address) or city == norm(reviewed.get('municipality'))):
        return False
    # Exact contiguous street + building number match, preserving suffix.
    return bool(re.search(r'(?<![a-z0-9])' + re.escape(street) + r'(?![a-z0-9])', address))

def campus_matches(incoming, reviewed, cluster):
    # Campus association only: no exact-address or legal-entity claim.
    city = norm(incoming.get('city'))
    if city not in {norm(x) for x in cluster.get('municipalities', [])}:
        return False
    street = street_key(incoming.get('street'))
    if cluster['id'] == 'allschwil':
        return bool(re.fullmatch(r'hegenheimermattweg 167[a-d]?', street))
    if cluster['id'] == 'st-johann':
        return street.startswith('lichtstrasse 35')
    if cluster['id'] == 'klybeck-stucki':
        return street.startswith('hochbergerstrasse 60')
    return False

def registry_url(value):
    return bool(re.search(r'(?:chregister\.ch|zefix\.admin\.ch)', value or '', re.I))

def source_id_for_url(url):
    return 'basel-register-v1:incoming-url:' + sha(url.encode())[:18]

def reconcile(incoming, reviewed_index, source_lookup, file_name, file_hash, index, canton, master_ids):
    key = name_key(incoming['company'])
    candidates = [(doc, cluster, row, kind) for doc, cluster, row, kind in reviewed_index if doc['canton'] == canton and key in names(row)]
    exact = [(d, c, r, k) for d, c, r, k in candidates if address_matches(incoming, r, c)]
    current = [(d, c, r, k) for d, c, r, k in exact if k == 'companySites' and r['facilityState'] == 'current_evidence']
    picked = None
    state = 'registry_only' if registry_url(incoming.get('source_url')) else 'unresolved'
    explanation = 'Incoming source row retained as a lead. Its provider verification flag is not atlas verification. No reviewed matching current street/site evidence was established; no exhaustive verification claimed.'
    company_id = None
    if current:
        unique = {r['companyId'] for _, _, r, _ in current if r['companyId']}
        if len(unique) > 1:
            state = 'conflict'
            explanation = 'Matching reviewed address points to multiple retained master identities. No automatic master link made.'
        else:
            picked = current[0]
            r = picked[2]
            if 'conflict' in r['evidenceStatus'].lower():
                state = 'conflict'
                explanation = 'Reviewed record explicitly retains a source address conflict; not promoted as a verified current imported site.'
            elif r['addressKind'] == 'verified_address':
                state = 'source_supported_operating' if r['id'] in OPERATING_RECORDS else 'source_supported_contact'
                company_id = r['companyId'] if r['companyId'] in master_ids else None
                explanation = 'Incoming name/display alias and city/street match reviewed canton evidence. ' + ('Reviewed sources specifically support local operating/R&D/production function. ' if state == 'source_supported_operating' else 'Reviewed sources support a company contact/HQ/office address only; no laboratory or manufacturing inference. ') + r['role']
            else:
                state = 'campus_resident'
                explanation = 'Reviewed company/campus association matches this address, but campus/care-of reference does not establish a separately occupied demise or local laboratory. ' + r['role']
    if picked is None and state != 'conflict':
        # Source URL may establish the reviewed display-name alias for a resident only.
        resident_url = valid_url(incoming.get('source_url'))
        roster = [(d,c,r,k) for d,c,r,k in reviewed_index if d['canton'] == canton and k == 'residentReferences' and valid_url(r.get('metadata',{}).get('residentUrl')) == resident_url and resident_url]
        resident = [(d,c,r,k) for d,c,r,k in [*candidates, *roster] if k in ['residentReferences', 'companySites'] and r['facilityState'] != 'historical' and campus_matches(incoming,r,c)]
        if resident:
            picked = resident[0]
            state = 'campus_resident'
            explanation = 'Reviewed operator residency/campus reference reused. Matching campus locality is not proof of the incoming exact company street address, legal entity, suite or current laboratory function. No new master-company link.'
        elif candidates:
            picked = candidates[0]
            r = picked[2]
            if r.get('address') and r['facilityState'] == 'current_evidence' and norm(incoming.get('city')) in {norm(x) for x in picked[1].get('municipalities', [])}:
                state = 'conflict'
                explanation = 'Name candidate found, but incoming street address differs from the reviewed current address. Preserve both observations; exact name alone does not establish the same local site. Reviewed address: ' + str(r['address'])
            else:
                explanation += ' A reviewed same-name reference exists, but is historical, unresolved or a different locality; it does not verify this incoming address.'
    support = [source_id_for_url(u)] if (u := valid_url(incoming.get('source_url'))) else []
    urls = [u] if u else []
    if picked:
        support.extend(picked[2].get('sourceIds', []))
        for sid in picked[2].get('sourceIds', []):
            if (u := valid_url(source_lookup.get(sid, {}).get('url'))) and u not in urls:
                urls.append(u)
        if (u := valid_url(picked[2].get('metadata', {}).get('residentUrl'))) and u not in urls:
            urls.append(u)
    stable = sha((canton + '|' + name_key(incoming['company']) + '|' + street_key(incoming.get('street')) + '|' + norm(incoming.get('city'))).encode())[:20]
    return dict(id=f'basel-company-v1:{canton.lower()}:{stable}', canton=canton, name=incoming['company'], address=', '.join(x for x in [incoming.get('street'), ' '.join(x for x in [incoming.get('zip'),incoming.get('city')] if x)] if x), companyId=company_id, reviewedCantonRecordId=picked[2]['id'] if picked else None, evidenceState=state, supportSourceIds=list(dict.fromkeys(support)), supportUrls=urls, evidenceExplanation=explanation, sourceRow=incoming, sourceFile=file_name, sourceFileSha256=file_hash, sourceRowIndex=index, reviewedCantonId=picked[0]['cantonId'] if picked else None)

def numeric(value):
    value = str(value or '').strip()
    return float(value) if re.fullmatch(r'\d+(?:\.\d+)?', value) else None

def property_row(canton, row, file_name, file_hash, index):
    stable = sha((canton + '|' + norm(row['campus']) + '|' + norm(row['building']) + '|' + street_key(row.get('street')) + '|' + norm(row.get('city'))).encode())[:20]
    return dict(id=f'basel-property-v1:{canton.lower()}:{stable}', canton=canton, campus=row['campus'], building=row['building'], floor=None, address=', '.join(x for x in [row.get('street'), ' '.join(x for x in [row.get('zip'),row.get('city')] if x)] if x), useType=row.get('use_type') or 'unspecified', areaM2=numeric(row.get('available_m2')), areaBasis='Incoming available_m2, provider-reported and not reviewed' if row.get('available_m2') else 'No measured current marketed area established; building/site size is separate', availabilityState='property_context', availableFrom=None, observedAsOf=None, publishedDate=None, sourceIds=['basel-register-v1:file:' + file_hash[:18]], sourceUrls=list(dict.fromkeys(u for v in [row.get('source_url'), row.get('second_source_url')] if (u := valid_url(v)))), overlapGroup=None, includeInTotal=False, exclusionReason='Availability assembly pending explicit primary-source handoff; original property row preserved as context', notes=' | '.join(x for x in [row.get('availability_note'),row.get('notes')] if x), originalRow=row, sourceFile=file_name, sourceFileSha256=file_hash, sourceRowIndex=index)

def measured(records, state, require_include=False):
    return [r for r in records if r['availabilityState'] == state and r['areaM2'] is not None and r['areaM2'] > 0 and r['observedAsOf'] and r['sourceIds'] and (not require_include or r['includeInTotal']) and not (r.get('exclusionReason') or '').startswith('Conflict')]

def totals(companies, properties):
    result = {}
    for canton in ['BS','BL']:
        c = [r for r in companies if r['canton'] == canton]
        p = [r for r in properties if r['canton'] == canton]
        groups = {s: measured(p, s, True) for s in ['current_marketed','future_marketed','refurbishment_planned']}
        def area(s):
            return sum(r['areaM2'] for r in groups[s]) if groups[s] else None
        def buckets(s):
            b = collections.defaultdict(float)
            for r in groups[s]: b[r['useType']] += r['areaM2']
            return dict(b)
        result[canton] = dict(sourceCompanyRows=EXPECTED[(canton,'company')], companyRecords=len(c), evidenceCounts={s:sum(r['evidenceState']==s for r in c) for s in STATES}, sourcePropertyRows=EXPECTED[(canton,'property')], availabilityRecords=len(p), currentMarketedM2=area('current_marketed'),futureMarketedM2=area('future_marketed'),underRefurbishmentM2=area('refurbishment_planned'), currentMarketedRecordIds=[r['id'] for r in groups['current_marketed']],futureMarketedRecordIds=[r['id'] for r in groups['future_marketed']],underRefurbishmentRecordIds=[r['id'] for r in groups['refurbishment_planned']], subtotalLabels={'current':'Selected measured current marketed offers, mixed use; not vacancy or laboratory-only supply','future':'Selected measured future marketed offers; not current vacancy','refurbishment':'Selected measured offers under refurbishment/planned; not ready current supply'}, measuredCurrentMarketedOfferM2=area('current_marketed'),measuredCurrentOfferRecords=len(groups['current_marketed']),measuredCurrentMarketedOfferByUseTypeM2=buckets('current_marketed'),futureMarketedOfferByUseTypeM2=buckets('future_marketed'),underRefurbishmentByUseTypeM2=buckets('refurbishment_planned'),futureMarketedRecords=sum(r['availabilityState']=='future_marketed' for r in p),refurbishmentPlannedRecords=sum(r['availabilityState']=='refurbishment_planned' for r in p),excludedFromMeasuredTotalRecords=sum(not r['includeInTotal'] for r in p),notes=['Source rows are observations, not unique verified companies or a complete census.','All marketed area subtotals are source-selected, use-type bucketed and non-overlapping. Null means no defensible measured subtotal; it is not zero vacancy.','Building/campus sizes, unknown offers, future projects and refurbishment are not actual vacancy; no canton absorption or years-supply inference.'])
        result[canton].update(confirmedVacancyM2=None, confirmedLaboratoryVacancyM2=None, denominatorScope='Bounded selected reviewed marketed contribution units only; not an exhaustive market or campus vacancy denominator')
    return result

def validate(register):
    companies = register['companyRecords']; properties = register['availabilityRecords']
    assert len(companies) == 245
    assert len({r['id'] for r in companies}) == len(companies), 'Duplicate company stable key needs explicit source-row discriminator'
    assert len({r['id'] for r in properties}) == len(properties), 'Duplicate property stable key'
    source_ids = {r['id'] for r in register['sources']}
    assert len(source_ids) == len(register['sources']), 'Duplicate source IDs'
    primary_offer_ids = {r['id'] for r in register['sources'] if r['kind'] == 'primary_offer' and r['primary'] and valid_url(r['url'])}
    for r in properties:
        assert r['availabilityState'] in ['current_marketed','future_marketed','refurbishment_planned','fully_let','historical','unresolved','property_context']
        assert r['areaM2'] is None or isinstance(r['areaM2'], (int,float)) and not isinstance(r['areaM2'],bool) and math.isfinite(r['areaM2']) and r['areaM2'] >= 0
        assert set(r['sourceIds']) <= source_ids, r['id']
    for r in companies:
        assert set(r['supportSourceIds']) <= source_ids, r['id']
        if r['evidenceState'] in ['registry_only','unresolved','conflict','campus_resident']:
            assert r['companyId'] is None, 'Unverified incoming address cannot link master company'
    included = [r for r in properties if r['includeInTotal']]
    for r in included:
        assert r['areaM2'] is not None and r['areaM2'] > 0 and r['observedAsOf'] and r['sourceIds']
        assert r['availabilityState'] in ['current_marketed','future_marketed','refurbishment_planned']
        assert not r['exclusionReason']
        assert set(r['sourceIds']) <= source_ids
        assert set(r['sourceIds']).intersection(primary_offer_ids), 'Contributing area requires reviewed primary offer evidence, not incoming CSV size'
        if r['availabilityState'] == 'current_marketed':
            stated_year = re.match(r'^(\d{4})(?:\b|-)', r['availableFrom'] or '')
            assert not stated_year or int(stated_year.group(1)) <= int(AS_OF[:4]), 'Future offer counted as current'
            if re.fullmatch(r'\d{4}-\d{2}-\d{2}', r['availableFrom'] or ''):
                assert r['availableFrom'] <= AS_OF, 'Future offer counted as current'
    overlap = [r['overlapGroup'] for r in included if r['overlapGroup']]
    assert len(overlap) == len(set(overlap)), 'Overlapping offer double counted'
    for canton in ['BS','BL']:
        for kind, records, key in [('company',companies,'sourceRow'),('property',properties,'originalRow')]:
            incoming = [r for r in records if r['canton']==canton and r[key] is not None]
            assert len(incoming) == EXPECTED[(canton,kind)], (canton,kind)
            assert {r['sourceRowIndex'] for r in incoming} == set(range(1,EXPECTED[(canton,kind)]+1))
    assert sha(SNAPSHOT.read_bytes()) == register['preservation']['masterSnapshotSha256']
    assert sha(COMPANION.read_bytes()) == register['preservation']['reviewedCompanionSha256']
    # URL path segments such as news/home are not local files; match URI/boundary paths only.
    serialized = json.dumps(register, ensure_ascii=False)
    assert not re.search(r'(?:^|[\s"\'(])/(?:home|mnt|tmp|Users|private)/|file://', serialized), 'Public register leaks a local/private path'
    for source in register['sources']:
        assert source.get('fileName') is None or '/' not in source['fileName'], 'Source snapshots must use basenames only'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, default=Path('/home/ubuntu/upload'))
    parser.add_argument('--reviewed-handoff', type=Path)
    args=parser.parse_args()
    WORK.mkdir(parents=True,exist_ok=True); INPUT.mkdir(exist_ok=True)
    companion=json.loads(COMPANION.read_text()); snapshot=json.load(gzip.open(SNAPSHOT,'rt'))
    master_ids={r['id'] for r in snapshot['profiles']}
    reviewed_index=[]; source_lookup={}
    for doc in companion['documents'].values():
        for s in doc['sources']: source_lookup[s['id']]=s
        for cluster in doc['clusters']:
            for s in cluster['sources']: source_lookup[s['id']]=s
            for kind in ['companySites','residentReferences','excludedOrUnresolvedLeads']:
                reviewed_index.extend((doc,cluster,r,kind) for r in cluster[kind])
    sources=[dict(id=s['id'],title=s['title'],publisher=None,url=valid_url(s.get('url')),publishedDate=s.get('publishedDate'),observedAsOf=s.get('retrievedDate'),kind='reviewed_canton',primary=False,fileName=COMPANION.name,fileSha256=sha(COMPANION.read_bytes()),notes='Existing reviewed canton source reused without modifying its facts. Original source-specific evidence and access restrictions remain in the reviewed companion.') for s in source_lookup.values()]
    companies=[]; properties=[]; source_files=[]
    url_sources={}
    for canton,kind,file_name in FILES:
        path=INPUT/file_name
        original=args.source_dir/file_name
        if not path.exists(): path.write_bytes(original.read_bytes())
        elif original.exists(): assert path.read_bytes()==original.read_bytes(), 'Source file hash changed; new version required'
        data=path.read_bytes(); file_hash=sha(data)
        with path.open(newline='',encoding='utf-8-sig') as f: rows=list(csv.DictReader(f))
        assert len(rows)==EXPECTED[(canton,kind)]
        assert all(None not in row for row in rows), 'Malformed CSV row'
        source_files.append(dict(fileName=file_name,sha256=file_hash,rowCount=len(rows),recordClass=kind))
        sources.append(dict(id='basel-register-v1:file:'+file_hash[:18],title=file_name,publisher='User-supplied incoming source register',url=None,publishedDate=None,observedAsOf=None,kind='incoming_csv',primary=False,fileName=file_name,fileSha256=file_hash,notes='Exact original CSV bytes retained. Provider labels and verification flags are source claims, not atlas verification.'))
        for i,row in enumerate(rows,1):
            if kind=='company':
                if u:=valid_url(row.get('source_url')):
                    url_sources[source_id_for_url(u)]=dict(id=source_id_for_url(u),title='Incoming row citation (not newly independently researched)',publisher=None,url=u,publishedDate=None,observedAsOf=None,kind='incoming_csv',primary=False,fileName=file_name,fileSha256=file_hash,notes='Citation preserved as incoming provenance. Not proof that all imported claims or physical operations were checked.')
                companies.append(reconcile(row,reviewed_index,source_lookup,file_name,file_hash,i,canton,master_ids))
            else: properties.append(property_row(canton,row,file_name,file_hash,i))
    sources.extend(url_sources.values())
    forecast=dict(label='JLL regional laboratory leasing forecast (slide 12)',geography='Basel region, not either canton independently',sector='Laboratory leasing only; other sectors excluded',metric='Average annual laboratory leasing forecast',annualLowerM2=10000,annualUpperM2=15000,horizon='2-3 year outlook',sourceIds=['basel-register-v1:jll-slide-12'],notes='User-authorized interpretation of JLL slide 12: a forecast of regional average annual laboratory leasing, not measured canton absorption, current vacancy or a years-supply denominator. Do not compare mixed-use marketed offers to this forecast.',cantonAbsorption=None,yearsSupply=None)
    report=Path('/home/ubuntu/upload/EMEA2026_ClusterReport.pptx')
    sources.append(dict(id='basel-register-v1:jll-slide-12',title='JLL EMEA 2026 Life Sciences Industry & Cluster Report, slide 12',publisher='JLL Research',url=None,publishedDate=None,observedAsOf=AS_OF,kind='user_supplied_report',primary=True,fileName=report.name,fileSha256=sha(report.read_bytes()) if report.exists() else None,notes=forecast['notes']))
    register=dict(format=1,version='V1',asOf=AS_OF,status='company_reconciliation_complete_availability_pending',availabilityRecords=properties,companyRecords=companies,sources=sources,totals=totals(companies,properties),preservation=dict(masterSnapshotFile='scripts/offline-cache/snapshot_V8.json.gz',masterSnapshotSha256=sha(SNAPSHOT.read_bytes()),reviewedCompanionFile='data/baselCantonDetail_offline_V3.json',reviewedCompanionSha256=sha(COMPANION.read_bytes()),masterCompanyIdCount=len(master_ids),companyMasterWrites=0,siteMasterWrites=0,originalReviewedFactsModified=False,clientEditsModified=False,sourceFiles=source_files),forecast=forecast)
    if args.reviewed_handoff:
        handoff=json.loads(args.reviewed_handoff.read_text())
        assert handoff['asOf']==AS_OF and handoff['reviewed'] is True
        by_key={(r['canton'],r['sourceRowIndex']):r for r in properties}
        for patch in handoff.get('propertyPatches',[]):
            target=by_key[(patch['canton'],patch['sourceRowIndex'])]
            forbidden={'id','canton','originalRow','sourceFile','sourceFileSha256','sourceRowIndex'}
            assert not forbidden.intersection(patch['fields']), 'Handoff may not alter incoming provenance or IDs'
            target.update(patch['fields'])
        properties.extend(handoff.get('additionalAvailabilityRecords',[]))
        register['sources'].extend(handoff.get('sources',[]))
        register['status']='complete'
        register['totals']=totals(companies,properties)
        for c,notes in handoff.get('cantonNotes',{}).items(): register['totals'][c]['notes'].extend(notes)
    validate(register)
    serialized=json.dumps(register,ensure_ascii=False,indent=2)+'\n'
    if OUTPUT.exists() and OUTPUT.read_text()!=serialized:
        previous=json.loads(OUTPUT.read_text())
        assert previous['status']!='complete', 'Immutable completed V1 exists; use a new version'
        draft=WORK/'company-reconciliation_pending-availability_V1.json'
        if not draft.exists(): draft.write_bytes(OUTPUT.read_bytes())
    OUTPUT.write_text(serialized,encoding='utf-8')
    manifest=dict(format=1,version='V1',asOf=AS_OF,status=register['status'],output=str(OUTPUT.relative_to(ROOT)),outputSha256=sha(serialized.encode()),sourceFiles=source_files,exactRowCoverage={c:{'companies':len([r for r in companies if r['canton']==c]),'properties':len([r for r in properties if r['canton']==c and r['originalRow'] is not None])} for c in ['BS','BL']},evidenceCounts={c:register['totals'][c]['evidenceCounts'] for c in ['BS','BL']},totals=register['totals'],preservation=register['preservation'],verificationScope='Deterministic reconciliation to reviewed canton evidence, not bulk independent re-verification or exhaustive census',availabilityAssembly='Explicit reviewed handoff only' if args.reviewed_handoff else 'Pending parent primary-source handoff')
    dump(WORK/'integration-manifest_V1.json',manifest)
    print(json.dumps({k:manifest[k] for k in ['status','exactRowCoverage','evidenceCounts','outputSha256']},indent=2))

if __name__=='__main__': main()

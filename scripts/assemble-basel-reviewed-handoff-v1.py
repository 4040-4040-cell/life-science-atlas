#!/usr/bin/env python3
"""Assemble authorized bounded evidence handoff; never scrape or change master rows."""
import collections
import copy
import hashlib
import json
import re
import shutil
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'data/basel-availability_V1'
RESEARCH = Path('/home/ubuntu/life-science-atlas/basel_availability_V1/research')
HANDOFF = ROOT / 'data/reviewed_handoff_V1.json'
AS_OF = '2026-11-04'
PROJECTS = ['campus-klybeck', 'neues-klybeck', 'all', 'hope', 'scale', 'sonuvo', 'stuecki', 'muttenz', 'hortus']
CANTONS = {p: ('BS' if p in ['campus-klybeck', 'neues-klybeck', 'stuecki'] else 'BL') for p in PROJECTS}
CAMPUSES = {'campus-klybeck': 'Swiss Life Campus Klybeck', 'neues-klybeck': 'Rhystadt Neues Klybeck', 'all': 'SIP Main Campus Allschwil', 'hope': 'SIP Main Campus Allschwil', 'scale': 'SIP Main Campus Allschwil', 'sonuvo': 'SONUVO Allschwil', 'stuecki': 'Stücki Park', 'muttenz': 'Muttenz', 'hortus': 'SIP Main Campus Allschwil'}
SCOPED_EXCLUSION = 'Outside the bounded nine-project freshly reviewed offer selection; prior reviewed offer retained as context pending a fresh property/unit check. Exclusion does not assert no offer, no availability or zero vacancy.'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def slug(value):
    s = unicodedata.normalize('NFKD', str(value or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-') or 'unspecified'


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, str):
        value = re.sub(r'file:///(?:home|mnt|tmp|Users|private)/[^\s"\']+', lambda m: Path(m.group(0)).name, value)
        value = re.sub(r'(?<![a-zA-Z0-9])/(?:home|mnt|tmp|Users|private)/[^\s"\']+', lambda m: Path(m.group(0)).name, value)
    return value


def public_url(value):
    return value if value and re.match(r'^https?://', value) else None


def publisher(project, url):
    if 'senn.com' in url or 'allbasel.com' in url or 'scalebasel.com' in url or 'hortus.ch' in url:
        return 'SENN / SENN Resources AG'
    if 'sip-baselarea.com' in url:
        return 'Switzerland Innovation Park Basel Area'
    if project == 'campus-klybeck':
        if 'walter-spaces.com' in url: return 'Walter Spaces (laboratory/coworking operator)'
        if 'the5thfloor.ch' in url: return 'The 5th Floor (coworking operator)'
        if 'k-25.ch' in url: return 'Swiss Life Asset Managers / Extra Immobilien GmbH (appointed letting agent)'
        return 'Swiss Life Asset Managers / Campus Klybeck'
    if project == 'neues-klybeck': return 'Rhystadt AG / Neues Klybeck; JLL letting contact'
    if project == 'sonuvo': return 'H&B Real Estate AG (appointed marketer; property owner not established)'
    if project == 'stuecki':
        return 'Superlab Suisse Basel AG (operator)' if 'superlabsuisse.com' in url else 'Swiss Prime Site Immobilien / Stücki Park; Wincasa property management'
    if project == 'scale' and 'homegate.ch' in url: return 'SENN Resources AG (advertiser on Homegate)'
    return 'Homegate (original portal; former advertiser not established)'


def main():
    draft = json.loads((WORK / 'company-reconciliation_pending-availability_V1.json').read_text())
    assert draft['status'] != 'complete'
    evidence = {p: json.loads((RESEARCH / (p + '.json')).read_text()) for p in PROJECTS}
    assert all(d['retrievedDate'] == AS_OF for d in evidence.values())
    (WORK / 'research').mkdir(exist_ok=True)
    for p in PROJECTS:
        dest = WORK / 'research' / (p + '.json')
        if dest.exists(): assert dest.read_bytes() == (RESEARCH / (p + '.json')).read_bytes()
        else: shutil.copyfile(RESEARCH / (p + '.json'), dest)
    sources = {}
    url_ids = {}
    for p, d in evidence.items():
        for s in d['sources']:
            url = public_url(s.get('url'))
            if not url: continue
            sid = 'basel-register-v1:reviewed-primary:' + sha(url.encode())[:18]
            url_ids[url] = sid
            notes = clean('Evidence excerpt: ' + s.get('evidenceExcerpt', '') + ' | ' + s.get('notes', '') + ' | Public primary-source page reviewed in completed targeted source-resolution pass; retrieval date is not publication or update date. No specific physical-vacancy confirmation obtained.')
            if sid not in sources:
                sources[sid] = dict(id=sid, title=s['title'], publisher=publisher(p, url), url=url, publishedDate=s.get('publishedDate'), observedAsOf=AS_OF, kind='owner_market_note' if p == 'muttenz' else 'primary_offer', primary=True, fileName=p + '.json', fileSha256=sha((RESEARCH / (p + '.json')).read_bytes()), notes=notes)
    csv_sources = {c: next(s['id'] for s in draft['sources'] if s['kind'] == 'incoming_csv' and s.get('fileName') == f'Basel_Basel{"Stadt" if c == "BS" else "Landschaft"}_CampusesBuildings_V1.csv' and s['url'] is None) for c in ['BS', 'BL']}
    additions = []
    units_by_project = {}
    exclusions_by_project = {}
    for p, d in evidence.items():
        converted = []
        for i, u in enumerate(d['units'], 1):
            canton = CANTONS[p]
            key = '|'.join([p, slug(u['building']), slug(u.get('floor')), slug(u['useType']), slug(u.get('address'))])
            stable = sha(key.encode())[:20]
            raw_group = u.get('overlapGroup')
            include = bool(u['includeInTotal'])
            state = {'unknown': 'unresolved', 'under_refurbishment': 'refurbishment_planned'}.get(u['availabilityState'], u['availabilityState'])
            reason = None if include else ('Unquantified, overlapping, ancillary, conflicting, stock or committed premises; not eligible as a separate measured contribution. ' + u.get('notes', ''))
            basis = u['areaBasis'] + ' | Qualifier: ' + u.get('areaQualifier', 'not stated')
            if p == 'scale':
                include = False
                reason = 'Up-to development capacity, not a measured remaining offer' if i == 1 else 'Indicative subdivision or minimum-size option overlaps future development capacity; not a measured remaining offer'
                basis += ' | Future 2030 development capacity ceiling or illustrative subdivision only; exact remaining inventory not established.'
            if p == 'campus-klybeck' and ('aggregate' in u['building'].lower() or u['building'].startswith('K-420')):
                state = 'property_context'
            source_url = public_url(u.get('sourceUrl'))
            ids = [url_ids[source_url]] if source_url else [csv_sources[canton]]
            urls = [source_url] if source_url else []
            if p == 'muttenz':
                removal_url = d['sources'][0]['url']
                ids.append(url_ids[removal_url]); urls.append(removal_url)
                reason = 'Expired/removed original listing; current marketed availability unresolved. Imported 3,791 m² mixed-use observation retained only as context, not laboratory-only or vacancy evidence.'
            demise = 'basel-demise-v1:' + canton.lower() + ':' + p + ':' + stable
            record = dict(id='basel-offer-v1:' + canton.lower() + ':' + p + ':' + stable, canton=canton, campus=CAMPUSES[p], building=u['building'], floor=u.get('floor'), address=u.get('address') or CAMPUSES[p] + ', ' + ('Basel' if canton == 'BS' else 'Allschwil' if p != 'muttenz' else 'Muttenz') + '; exact numbered address not established', useType=u['useType'], areaM2=u['areaM2'], areaBasis=clean(basis), areaQualifier=clean(u.get('areaQualifier')), availabilityState=state, availableFrom=u.get('availableFrom'), observedAsOf=AS_OF, publishedDate=next((s.get('publishedDate') for s in d['sources'] if s.get('url') == source_url), None), sourceIds=ids, sourceUrls=urls, overlapGroup=(raw_group or p) + ':demise:' + stable if include else raw_group, rawOverlapGroup=raw_group, demiseKey=demise if include else None, includeInTotal=include, exclusionReason=clean(reason), notes=clean(u.get('notes', '')) + (' | Disjoint contribution key denotes the stated floor/demise/use component; raw parent overlap group retained. Aggregates sharing that group are excluded.' if include else ''), originalRow=None, sourceFile=p + '.json', sourceFileSha256=sha((RESEARCH / (p + '.json')).read_bytes()), sourceRowIndex=None, researchProject=p, researchUnitIndex=i)
            additions.append(record); converted.append(record)
        units_by_project[p] = converted
        ex_converted = []
        for i, x in enumerate(d.get('excludedTotals', []), 1):
            if x.get('areaM2') is None or x.get('sourceUrl') not in url_ids: continue
            label = x.get('building') or x.get('label') or 'Excluded aggregate'
            # Identical quantified aggregate already retained as a non-contributing unit.
            if any(r['areaM2'] == x['areaM2'] and r['sourceUrls'] == [x['sourceUrl']] and not r['includeInTotal'] for r in converted): continue
            stable = sha((p + '|excluded|' + slug(label) + '|' + x['sourceUrl'] + '|' + slug(x.get('areaBasis') or x.get('areaQualifier') or x['reason'])).encode())[:20]
            r = dict(id='basel-context-v1:' + CANTONS[p].lower() + ':' + p + ':' + stable, canton=CANTONS[p], campus=CAMPUSES[p], building=label, floor=None, address=x.get('address') or CAMPUSES[p] + '; aggregate/context observation', useType='excluded aggregate / stock / alternative measurement; not a contribution unit', areaM2=x['areaM2'], areaBasis=clean(x.get('areaBasis') or x.get('reason') or 'Excluded source observation') + ' | Qualifier: ' + clean(x.get('areaQualifier') or 'not stated'), areaQualifier=clean(x.get('areaQualifier')), availabilityState='historical' if 'historical' in str(x).lower() else 'future_marketed' if p in ['all','hope','scale'] else 'property_context', availableFrom='2027' if p == 'all' else '2028' if p == 'hope' else '2030' if p == 'scale' else None, observedAsOf=AS_OF, publishedDate=None, sourceIds=[url_ids[x['sourceUrl']]], sourceUrls=[x['sourceUrl']], overlapGroup=x.get('overlapGroup') or p + ':excluded-aggregate', rawOverlapGroup=x.get('overlapGroup'), demiseKey=None, includeInTotal=False, exclusionReason=clean(x['reason']), notes='Competing aggregate or specification observation; never added to individual contribution units.', originalRow=None, sourceFile=p + '.json', sourceFileSha256=sha((RESEARCH / (p + '.json')).read_bytes()), sourceRowIndex=None, researchProject=p, researchUnitIndex=None)
            additions.append(r); ex_converted.append(r)
        exclusions_by_project[p] = ex_converted
    # Admit existing reviewed offers only as context; preserve earlier facts without a new current denominator claim.
    companion = json.loads((ROOT / 'data/baselCantonDetail_offline_V3.json').read_text())
    old_sources = {s['id']: s for s in draft['sources']}
    for d in companion['documents'].values():
        for c in d['clusters']:
            for r in c.get('availabilityEvidence', []):
                if c['id'] in ['allschwil', 'klybeck-stucki']: continue
                metadata = r.get('metadata', {})
                ids = r.get('sourceIds', [])
                assert set(ids) <= set(old_sources)
                additions.append(dict(id='basel-reviewed-context-v1:' + d['canton'].lower() + ':' + r['id'], canton=d['canton'], campus=c.get('name') or c['id'], building=r['name'], floor=metadata.get('floor'), address=r.get('address') or c.get('name') or c['id'], useType=metadata.get('use') or 'prior reviewed offer / unspecified use', areaM2=r.get('areaValue') if r.get('areaUnit') == 'm2' else None, areaBasis=r['areaBasis'], areaQualifier=r.get('areaQualifier'), availabilityState='historical' if r['facilityState'] == 'historical' else 'property_context', availableFrom=metadata.get('availableFrom'), observedAsOf=r.get('observedAsOf'), publishedDate=None, sourceIds=ids, sourceUrls=[old_sources[s]['url'] for s in ids if old_sources[s]['url']], overlapGroup='prior-reviewed:' + r['id'], rawOverlapGroup=None, demiseKey=None, includeInTotal=False, exclusionReason=SCOPED_EXCLUSION, notes=clean('Prior reviewed evidence state: ' + r['status'] + ' | ' + r.get('caveat', '') + ' | ' + json.dumps(r.get('facts', []), ensure_ascii=False)), originalRow=None, sourceFile='baselCantonDetail_offline_V3.json', sourceFileSha256=sha((ROOT / 'data/baselCantonDetail_offline_V3.json').read_bytes()), sourceRowIndex=None))
    original = {(r['canton'], r['building']): r for r in draft['availabilityRecords']}
    patches = {}
    for r in draft['availabilityRecords']:
        reason = SCOPED_EXCLUSION
        if not any(s in r['originalRow']['status'].lower() for s in ['lease','market','vacat']):
            reason = 'Original property/development/occupied-site context; no individually sourced current contribution unit established in this bounded pass. Original status and specifications retained; missing measured vacancy is null, not zero.'
        patches[(r['canton'], r['sourceRowIndex'])] = dict(canton=r['canton'], sourceRowIndex=r['sourceRowIndex'], fields=dict(availabilityState='property_context', includeInTotal=False, exclusionReason=reason, notes=r['notes'] + ' | Final bounded reviewed assembly completed; this original source observation is not itself a contribution unit.'))
    def patch(canton, building, record, state=None, reason=None):
        r = original[(canton, building)]
        fields = {k: copy.deepcopy(v) for k, v in record.items() if k not in ['id','canton','campus','building','originalRow','sourceFile','sourceFileSha256','sourceRowIndex','demiseKey','researchUnitIndex']}
        fields.update(includeInTotal=False, demiseKey=None, exclusionReason=reason or record.get('exclusionReason') or 'Original source observation overlaps individually counted reviewed contribution units; excluded to prevent duplication.', notes=fields['notes'] + ' | Original CSV observation retained; only separate disjoint reviewed units can contribute.')
        fields['sourceIds'] = list(dict.fromkeys([*r['sourceIds'], *fields['sourceIds']]))
        if state: fields['availabilityState'] = state
        patches[(canton, r['sourceRowIndex'])]['fields'].update(fields)
    def unit(p, name, floor=None):
        rows = [r for r in units_by_project[p] if r['building'] == name and (floor is None or r['floor'] == floor)]
        assert len(rows) == 1, (p, name, floor)
        return rows[0]
    def excluded(p, area):
        rows = [r for r in exclusions_by_project[p] if r['areaM2'] == area]
        assert len(rows) == 1, (p, area)
        return rows[0]
    patch('BS','Campus Klybeck (site level)',units_by_project['campus-klybeck'][0],'property_context')
    patch('BS','K-25',unit('campus-klybeck','K-25 (campus aggregate)'),'property_context')
    patch('BS','K-410',unit('campus-klybeck','K-410 (owner total-area/refurbishment observation)'),'refurbishment_planned')
    patch('BS','K-420',unit('campus-klybeck','K-420 — IOB'),'property_context')
    patch('BS','WKL-132',excluded('neues-klybeck',4168),'current_marketed')
    patch('BS','WKL-136',excluded('neues-klybeck',2600),'current_marketed')
    patch('BL','ALL',excluded('all',5400),'future_marketed')
    patch('BL','HOPE (House of Partnership and Engagement)',units_by_project['hope'][0],'future_marketed')
    patch('BL','SCALE',units_by_project['scale'][0],'future_marketed','Up-to development capacity, not a measured remaining offer')
    patch('BL','HORTUS',units_by_project['hortus'][0],'fully_let')
    patch('BL','H89 (former Idorsia)',unit('sonuvo','H89','Entire building — headline aggregate'),'current_marketed')
    patch('BL','G06 (former Idorsia)',unit('sonuvo','G06','Entire building — headline aggregate'),'current_marketed')
    patch('BL','Wildensteinerstrasse 1 (lab/cleanroom building)',units_by_project['muttenz'][0],'unresolved')
    patch('BS','Hochbergerstrasse 60A',unit('stuecki','HO60A'),'current_marketed')
    patch('BS','Tech Park Basel (linear building, 2011)',unit('stuecki','HO60C'),'property_context','Incoming Tech Park building mapping not established; same 522 m² offer counted once under exact reviewed HO60C floor identity only.')
    patch('BS','Superlab Suisse Basel (lab-as-a-service)',unit('stuecki','Superlab Suisse Basel'),'current_marketed')
    for name, area in [('Stücki Business Park (site level)',60000),("Stücki Park II (four 'finger' buildings)",28000),('Lonza building (first expansion building)',8000)]:
        patch('BS',name,excluded('stuecki',area),'property_context')
    handoff = dict(asOf=AS_OF, reviewed=True, propertyPatches=list(patches.values()), additionalAvailabilityRecords=additions, sources=list(sources.values()), cantonNotes={c: [SCOPED_EXCLUSION, 'Only positive individually sourced disjoint contribution units enter marketed totals. Confirmed vacancy and confirmed laboratory vacancy are explicitly null. Current means selected marketed, not an exhaustive inventory.'] + [clean(p + ': ' + gap) for p in PROJECTS if CANTONS[p] == c for gap in evidence[p]['gaps']] for c in ['BS','BL']})
    serialized = json.dumps(clean(handoff),ensure_ascii=False,indent=2)+'\n'
    assert not re.search(r'(?:^|[\s"\'(])/(?:home|mnt|tmp|Users|private)/|file://',serialized)
    assert not HANDOFF.exists(), 'Final reviewed V1 handoff already exists; do not overwrite'
    HANDOFF.write_text(serialized)
    summary = {p: dict(researchedUnits=len(evidence[p]['units']), contributionUnits=sum(r['includeInTotal'] for r in units_by_project[p]), selectedCurrentM2=sum(r['areaM2'] for r in units_by_project[p] if r['includeInTotal'] and r['availabilityState']=='current_marketed'), selectedFutureM2=sum(r['areaM2'] for r in units_by_project[p] if r['includeInTotal'] and r['availabilityState']=='future_marketed')) for p in PROJECTS}
    (WORK/'reviewed-handoff-summary_V1.json').write_text(json.dumps(dict(handoff=HANDOFF.name,propertyPatches=len(patches),additionalRecords=len(additions),primarySources=len(sources),projects=summary),indent=2)+'\n')
    print(json.dumps(dict(handoff=str(HANDOFF),propertyPatches=len(patches),additionalRecords=len(additions),primarySources=len(sources),projects=summary),indent=2))

if __name__ == '__main__':
    main()

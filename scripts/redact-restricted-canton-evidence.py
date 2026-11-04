#!/usr/bin/env python3
"""Version-preserving client-output restriction for supplied confidential reports.

Source/page/date metadata and record IDs remain. No company, parent, suite or
source status is inferred. The complete internal inputs remain untouched.
"""
import argparse
import copy
import hashlib
import json
import re
from pathlib import Path

NOTICE = 'Restricted internal report evidence withheld from client distribution; obtain a permitted primary source or release approval.'
QUANT_KEY = re.compile(r'value|amount|minimum|maximum|lower|upper|area|size|capacity|employees|headcount|workforce|rent|cost|capital|investment|expiry|leaseTerm|deliveryYear|completionYear|renewal', re.I)
SAFE_META = re.compile(r'^(?:id|sourceId|sourceIds|originalSourceId|sourceKey|companyId|siteId|recordId|asOf|sourceAsOf|observedAsOf|publishedDate|publicationDate|retrievedDate|retrievedAt|documentPage|documentPages|page|pages|unit|title|name|address|municipality|canton|country|latitude|longitude|coordinates|pin|postalPointNativePixel|labelNativePixel|sourceHash|contentHash|sourceSha256|inputSourceSha256)$', re.I)
TEXT_KEY = re.compile(r'note|caveat|quote|excerpt|description|summary|narrative|text|role|capabilit|scope|basis', re.I)


def sources_in(value):
    if isinstance(value, dict):
        if value.get('id') and value.get('title') and ('visibility' in value or 'url' in value):
            yield value
        for child in value.values():
            yield from sources_in(child)
    elif isinstance(value, list):
        for child in value:
            yield from sources_in(child)


def sanitizer(value):
    restricted = set()
    for source in sources_in(value):
        title = str(source.get('title', ''))
        visibility = str(source.get('visibility', ''))
        if 'confidential' in visibility.lower() or re.search(r'(?:EMEA.*cluster|Basel.*Study|Study.*Basel)', title, re.I):
            restricted.update(str(source[k]) for k in ('id', 'originalSourceId') if source.get(k))
    changes = []

    def walk(item, inherited=False, trail='root'):
        if isinstance(item, list):
            return [walk(child, inherited, f'{trail}[{n}]') for n, child in enumerate(item)]
        if not isinstance(item, dict):
            return item
        # Field-level source IDs take precedence over broad record provenance.
        references = item.get('sourceIds')
        if references is None:
            references = [item['sourceId']] if item.get('sourceId') else None
        reference_set = set(map(str, references or []))
        sensitive = bool(reference_set & restricted) if reference_set else inherited
        source_stub = bool(item.get('id') and item.get('title') and ('visibility' in item or 'url' in item))
        private_only_record = bool(reference_set and reference_set <= restricted and (item.get('name') or item.get('recordType')) and not source_stub)
        result = {}
        for key, child in item.items():
            path = trail + '.' + key
            if source_stub and str(item.get('id')) in restricted and key == 'url':
                result[key] = None
                continue
            if private_only_record and key in ('name', 'companyId', 'siteId'):
                result[key] = 'Restricted internal reference' if key == 'name' else None
                changes.append({'path': path, 'reason': 'private-only association without public corroboration'})
                continue
            if sensitive and not source_stub and not SAFE_META.match(key):
                if QUANT_KEY.search(key) and child is not None and not isinstance(child, (dict, list)):
                    result[key] = None
                    changes.append({'path': path, 'reason': 'restricted quantitative evidence'})
                    continue
                if TEXT_KEY.search(key) and isinstance(child, str) and re.search(r'\d', child):
                    result[key] = NOTICE
                    changes.append({'path': path, 'reason': 'restricted numerical narrative'})
                    continue
                if private_only_record and TEXT_KEY.search(key) and isinstance(child, str):
                    result[key] = NOTICE
                    changes.append({'path': path, 'reason': 'private-only record statement'})
                    continue
            if isinstance(child, str) and TEXT_KEY.search(key) and not sensitive:
                blocks = re.split(r'\n\s*\n', child)
                safe_blocks = []
                for block in blocks:
                    if re.search(r'\d', block) and any(f'[{sid}]' in block for sid in restricted):
                        safe_blocks.append(NOTICE)
                        changes.append({'path': path, 'reason': 'restricted source-cited narrative block'})
                    else:
                        safe_blocks.append(block)
                child = '\n\n'.join(safe_blocks)
            result[key] = walk(child, sensitive, path)
        if sensitive and not source_stub and any(change['path'].startswith(trail + '.') for change in changes):
            result['clientRestrictionNotice'] = NOTICE
            if 'evidenceStatus' in result:
                result['evidenceStatus'] = 'restricted_evidence_withheld'
            if 'status' in result and 'value' in result:
                result['status'] = 'restricted_evidence_withheld'
        return result

    return walk(copy.deepcopy(value)), restricted, changes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--receipt', required=True)
    args = parser.parse_args()
    source = Path(args.input)
    target, receipt = Path(args.output), Path(args.receipt)
    if target.exists() or receipt.exists():
        raise SystemExit('Refusing to overwrite a source or prior client edition.')
    raw = source.read_bytes()
    safe, restricted, changes = sanitizer(json.loads(raw))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(safe, ensure_ascii=False, indent=2) + '\n')
    receipt.write_text(json.dumps({'inputSha256': hashlib.sha256(raw).hexdigest(), 'outputSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'restrictedSourceIds': sorted(restricted), 'withheldFieldCount': len(changes), 'changes': changes, 'originalInputUnchanged': hashlib.sha256(source.read_bytes()).hexdigest() == hashlib.sha256(raw).hexdigest(), 'policy': NOTICE}, indent=2) + '\n')
    print(json.dumps({'output': str(target), 'restrictedSources': len(restricted), 'withheldFields': len(changes)}))


if __name__ == '__main__':
    main()

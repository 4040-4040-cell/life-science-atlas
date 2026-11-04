#!/usr/bin/env python3
"""Bind new register PDFs/data to the existing app after final source assembly."""
import csv
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path
import pymupdf

APP = Path('/home/ubuntu/bioatlas')
OUT = Path('/home/ubuntu/life-science-atlas/basel_availability_V1/output')
DATA = APP / 'client/src/lib/baselAvailabilityRegisterV1.json'
transfers_path = APP / 'data/asset-transfer.json'
transfers = json.loads(transfers_path.read_text())

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def upload(path):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    old = transfers.get(str(path))
    if old and old['sha256'] == digest:
        return old['url']
    result = subprocess.run(['manus-upload-file', '--webdev', str(path)], cwd=APP,
                            capture_output=True, text=True, timeout=240)
    match = re.search(r'Storage Path:\s*(/manus-storage/\S+)', result.stdout)
    if result.returncode or not match:
        raise RuntimeError(result.stdout + result.stderr)
    transfers[str(path)] = {'url': match.group(1), 'sha256': digest}
    dump(transfers_path, transfers)
    print('Stored ' + path.name, flush=True)
    return match.group(1)

def safe_cell(value):
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    if isinstance(value, str) and value.startswith(('=', '+', '-', '@', '\t', '\r')):
        value = "'" + value
    return value

def export_csv(path, rows):
    columns = list(dict.fromkeys(key for row in rows for key in row))
    with path.open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows({key: safe_cell(value) for key, value in row.items()} for row in rows)

register = json.loads(DATA.read_text())
assert not re.search(r'file://|/(?:home|mnt|Users)/',
                     re.sub(r'https?://[^\s"<>]+', '', json.dumps(register)))
source_files = []
for canton in ['BS', 'BL']:
    for key, title in [('availabilityRecords', 'Availability'), ('companyRecords', 'Company_Evidence')]:
        path = OUT / f'Basel_{canton}_{title}_V1.csv'
        export_csv(path, [row for row in register[key] if row['canton'] == canton])
        source_files.append(path)
archive = OUT / 'Basel_Corrected_Register_and_Print_V1.zip'
if not archive.exists():
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for file in source_files:
            z.write(file, file.name)
        z.write(DATA, 'Basel_Corrected_Register_V1.json')
        for filename in ['basel_intelligence_V4.pdf', 'basel-stadt_availability_V5.pdf',
                         'basel-landschaft_availability_V5.pdf']:
            z.write(OUT / filename, filename)
register_zip = upload(archive)
old_market = json.loads((APP / 'client/src/lib/marketPrintAssetsV3.json').read_text())
old_canton = json.loads((APP / 'client/src/lib/baselCantonPrintAssetsV4.json').read_text())
new_market = {**old_market, 'edition': 'V4', 'asOf': register['asOf']}
new_canton = {**old_canton, 'edition': 'V5', 'asOf': register['asOf'],
              'paper': 'Tabloid landscape', 'sourceDataZipUrl': register_zip,
              'priorEvidenceZipUrl': old_canton['sourceDataZipUrl'], 'cantons': {}}
for slug, filename, title in [
    ('basel', 'basel_intelligence_V4.pdf', 'Basel'),
    ('basel-stadt', 'basel-stadt_availability_V5.pdf', 'Basel-Stadt'),
    ('basel-landschaft', 'basel-landschaft_availability_V5.pdf', 'Basel-Landschaft')]:
    pdf = OUT / filename
    png = pdf.with_suffix('.png')
    with pymupdf.open(pdf) as document:
        assert len(document) == 1
        assert abs(document[0].rect.width - 1224) < 1 and abs(document[0].rect.height - 792) < 1
        if not png.exists():
            document[0].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5)).save(png)
    entry = {'title': title, 'imageUrl': upload(png), 'pdfUrl': upload(pdf),
             'asOf': register['asOf'], 'pages': 1, 'widthPoints': 1224, 'heightPoints': 792,
             'paper': {'widthInches': 17, 'heightInches': 11, 'name': 'Tabloid'},
             'dataZipUrl': register_zip}
    if slug == 'basel':
        new_market['markets']['basel'] = {**old_market['markets']['basel'], **entry}
    else:
        new_canton['cantons'][slug] = {**old_canton['cantons'][slug], **entry}
new_market['allMarketsPdfUrl'] = upload(OUT / 'life-science-atlas_all-markets-and-basel_V4.pdf')
new_market['individualPdfZipUrl'] = upload(OUT / 'individual-maps_V4.zip')
new_market['allMarketsAndCantons'] = True
new_market['sheetCount'] = 13
new_market['registerDataZipUrl'] = register_zip
new_canton['allMarketsPdfUrl'] = new_market['allMarketsPdfUrl']
dump(APP / 'client/src/lib/marketPrintAssetsV4.json', new_market)
dump(APP / 'client/src/lib/baselCantonPrintAssetsV5.json', new_canton)
dump(APP / 'client/src/lib/baselRegisterDownloadV1.json',
     {'url': register_zip, 'asOf': register['asOf'],
      'availabilityCsvUrls': {code: upload(OUT / f'Basel_{code}_Availability_V1.csv') for code in ['BS', 'BL']},
      'companyCsvUrls': {code: upload(OUT / f'Basel_{code}_Company_Evidence_V1.csv') for code in ['BS', 'BL']}})
dump(OUT / 'durable-release_V1.json', {'market': new_market, 'canton': new_canton})
print('Bound all-market and canton print/data manifests.', flush=True)

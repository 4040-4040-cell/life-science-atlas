#!/usr/bin/env python3
"""Read-only proof of the real market print route and paper pagination."""
import argparse
import json
from pathlib import Path
import fitz
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('--origin', required=True)
p.add_argument('--output', default='assets/intelligence-print-proof_V2')
a = p.parse_args()
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'client/src/lib/marketPrintAssetsV3.json').read_text())
out = root / a.output
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    for region_id, market in manifest['markets'].items():
        page.goto(a.origin.rstrip('/') + '/print/' + region_id, wait_until='domcontentloaded')
        button = page.get_by_role('button', name='Print this market', exact=True)
        button.wait_for(state='visible')
        page.wait_for_function("() => document.querySelector('.market-print-sheet img')?.complete && document.querySelector('.market-print-sheet img')?.naturalWidth > 0")
        assert button.is_enabled(), region_id + ': Print must wait for a working image'
        image = page.locator('.market-print-sheet img')
        assert image.count() == 1
        assert page.locator('.hub-rail,.company-matrix,.profile-drawer').count() == 0
        paper = out / f'{region_id}_browser-print.pdf'
        page.pdf(path=str(paper), prefer_css_page_size=True, print_background=True, display_header_footer=False)
        doc = fitz.open(paper)
        assert len(doc) == 1, f'{region_id}: {len(doc)} pages instead of 1'
        assert abs(doc[0].rect.width - 1224) < 1 and abs(doc[0].rect.height - 792) < 1
        if region_id in ['basel', 'biotech-beach', 'genetown', 'biomidwest']:
            doc[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(str(out / f'{region_id}_actual-print.png'))
        results.append({'region': region_id, 'pages': len(doc), 'paper': 'Tabloid landscape', 'imageLoaded': True, 'navigationExcluded': True})
        doc.close()
    assert not errors, errors
    page.goto(a.origin.rstrip('/') + '/print/does-not-exist', wait_until='domcontentloaded')
    page.get_by_role('heading', name='This print sheet is not available.').wait_for()
    browser.close()
report = {'markets': results, 'passed': len(results) == 11, 'pageErrors': errors, 'invalidMarket': 'Explicit unavailable state'}
(out / 'print-proof.json').write_text(json.dumps(report, indent=2) + '\n')
assert report['passed']
print(json.dumps(report, indent=2))

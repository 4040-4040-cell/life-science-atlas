#!/usr/bin/env python3
"""Actual double-click-equivalent proof. No HTTP server and all HTTP(S) blocked.
Run with --package /new/package --output /new/versioned/proof-dir.
A failed/incomplete integration is reported as failed, never visually certified.
"""
import argparse
import csv
import io
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
import pymupdf

parser = argparse.ArgumentParser()
parser.add_argument('--package', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
package = Path(args.package).resolve()
out = Path(args.output).resolve()
out.mkdir(parents=True, exist_ok=False)
index = (package / 'index.html').as_uri()
manifest = json.loads((package / 'package-manifest.json').read_text())
report = {'package': str(package), 'runtime': 'actual file:// Chromium', 'externalRequests': [], 'pageErrors': [], 'consoleErrors': [], 'markets': [], 'profiles': [], 'paper': [], 'csv': [], 'allSavedImages': [], 'savedPdfChecks': [], 'issues': []}

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    def local_only(route):
        if route.request.url.startswith(('http://', 'https://')):
            report['externalRequests'].append(route.request.url)
            route.abort()
        else:
            route.continue_()
    context.route('**/*', local_only)
    page = context.new_page()
    page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
    page.on('console', lambda msg: report['consoleErrors'].append(msg.text) if msg.type == 'error' else None)
    try:
        page.goto(index, wait_until='domcontentloaded')
        page.wait_for_selector('.offline-hub-index button')
        assert page.locator('.offline-hub-index button').count() == 11
        assert page.evaluate('window.__ATLAS_OFFLINE__') is True
        # User navigation, not just direct hash loading, must work on opaque file origins.
        page.locator('.offline-hub-index button').first.click()
        page.wait_for_selector('main table tbody tr button')
        assert '#/hub/' in page.url
        report['hashUserNavigation'] = True
        overview = page.evaluate("async () => (await fetch('/api/atlas/overview')).json()")
        regions = {}
        for region in overview['regions']:
            slug = region['id']
            page.goto(index + '#/hub/' + slug, wait_until='domcontentloaded')
            page.wait_for_selector('main table tbody tr button')
            data = page.evaluate('(id) => fetch("/api/atlas/regions/" + id).then(r => r.json())', slug)
            regions[slug] = data
            map_loaded = page.locator('.offline-raster-image').count() > 0
            if map_loaded:
                page.wait_for_function("() => document.querySelector('.offline-raster-image')?.complete && document.querySelector('.offline-raster-image')?.naturalWidth > 0")
            else:
                report['issues'].append(slug + ': map blocked/missing (check relative-path hooks)')
            assert page.locator('.google-map-canvas').count() == 0
            report['markets'].append({'region': slug, 'savedMapLoaded': map_loaded, 'matrixLoaded': True, 'printAction': page.get_by_role('link', name='Print this market', exact=True).count() == 1})
            if slug == 'basel':
                page.screenshot(path=str(out / 'basel-hub.png'))
                # Test a saved site-list click before the deeper overlap/filter flow.
                sites = page.locator('.offline-site-rows button')
                if sites.count():
                    sites.first.click()
                    page.get_by_role('dialog').wait_for()
                    report['profiles'].append({'region': 'basel', 'siteListClick': True})
                    page.get_by_role('button', name='Close company profile', exact=True).last.click()
            if slug not in ['basel', 'biotech-beach', 'genetown'] or not map_loaded:
                continue
            page.get_by_role('tab', name=re.compile('Aerial', re.I)).click()
            page.wait_for_selector('#aerial-view-select')
            page.wait_for_function("() => document.querySelector('.offline-raster-image')?.complete && document.querySelector('.offline-raster-image')?.naturalWidth > 0")
            page.locator('.offline-atlas-map').screenshot(path=str(out / (slug + '-aerial.png')))
            points = page.locator('.offline-map-pin')
            assert points.count() > 0
            overlap_opened = False
            # Prefer a real overlapping marker to reproduce the prior stale-selection crash.
            for n in range(min(points.count(), 20)):
                points.nth(n).click(force=True)
                if page.locator('.offline-overlap-list').count():
                    overlap_opened = True
                    page.locator('.offline-overlap-list button').nth(1).click()
                    page.get_by_role('dialog').wait_for()
                    page.get_by_role('button', name='Close company profile', exact=True).last.click()
                    break
                if page.get_by_role('dialog').count():
                    page.get_by_role('button', name='Close company profile', exact=True).last.click()
            target = 'Vertex' if slug == 'genetown' else 'Neurocrine'
            company = next(c for c in data['companies'] if target.lower() in c['name'].lower() and c['kind'] != 'reported_research')
            ids = {s['id'] for s in data['sites'] if s['profileId'] == company['id']}
            frame = next(f for f in data['aerials'] if ids.intersection(f['siteIds']))
            page.locator('#aerial-view-select').select_option(frame['id'])
            page.get_by_role('searchbox').fill(target)
            row = page.locator('main table tbody tr button').filter(has_text=company['name']).first
            row.click()
            dialog = page.get_by_role('dialog')
            dialog.locator('.profile-tabs button').filter(has_text=re.compile('^Company')).click()
            label = page.locator('.fact-label').filter(has_text=re.compile('^Operating cash flow$'))
            section = dialog.locator('.profile-fact-section').filter(has=label)
            if not section.evaluate('(element) => element.open'):
                section.locator(':scope > summary').click()
            fact = section.locator('.fact-row').filter(has=label)
            value = fact.locator('.fact-value').inner_text()
            number = re.search(r'-?[\d,]+(?:\.\d+)?', value)
            assert number and float(number.group().replace(',', '')) > 0
            report['profiles'].append({'region': slug, 'company': company['name'], 'displayedOperatingCashFlow': value, 'periodAndScope': fact.locator('.fact-meta').first.inner_text(), 'mapClick': True, 'overlapThenFilterNoCrash': overlap_opened})
            fact.scroll_into_view_if_needed()
            page.screenshot(path=str(out / (slug + '-positive-CFO.png')))
            page.get_by_role('button', name='Close company profile', exact=True).last.click()
            # Actual browser Blob export from the existing matrix action.
            with page.expect_download() as pending:
                page.get_by_role('link', name='Export filtered CSV', exact=True).click()
            download = pending.value
            csv_path = out / (slug + '-filtered.csv')
            download.save_as(csv_path)
            text = csv_path.read_text(encoding='utf-8-sig')
            rows = list(csv.DictReader(io.StringIO(text)))
            assert rows and any(target.lower() in json.dumps(r).lower() for r in rows)
            report['csv'].append({'region': slug, 'blobDownload': True, 'filename': download.suggested_filename, 'rows': len(rows), 'companyFilter': target})
        # Independently decode every retained macro/aerial/exhibit image, even
        # if a pending URL-guard integration prevented app placement.
        asset_urls = sorted({r['region']['macroUrl'] for r in regions.values()} | {a[k] for r in regions.values() for a in r['aerials'] for k in ['imageUrl', 'exhibitUrl'] if a.get(k)})
        image_urls = [url for url in asset_urls if not url.lower().endswith('.pdf')]
        for url in asset_urls:
            if not url.lower().endswith('.pdf'): continue
            assert url.startswith('./offline-assets/'), 'Saved PDF must be local: ' + url
            saved_pdf = package / url[2:]
            with pymupdf.open(saved_pdf) as doc:
                assert len(doc) > 0, 'Saved PDF is empty: ' + url
                report['savedPdfChecks'].append({'src': url, 'pages': len(doc), 'bytes': saved_pdf.stat().st_size})
        for start in range(0, len(image_urls), 12):
            decoded = page.evaluate('''async urls => Promise.all(urls.map(src => new Promise(resolve => {
                const image = new Image(); image.onload = () => resolve({src, width:image.naturalWidth, height:image.naturalHeight});
                image.onerror = () => resolve({src,error:true}); image.src = src;
            })))''', image_urls[start:start+12])
            report['allSavedImages'].extend(decoded)
        assert all(not image.get('error') for image in report['allSavedImages']), 'Failed raster image: ' + str([i['src'] for i in report['allSavedImages'] if i.get('error')])
        assert len(image_urls) >= 68
        # Current paper routes are separate from the interactive matrix.
        for slug in overview['regions']:
            slug = slug['id']
            page.goto(index + '#/print/' + slug, wait_until='domcontentloaded')
            page.wait_for_function("() => document.querySelector('.market-print-sheet img')?.complete && document.querySelector('.market-print-sheet img')?.naturalWidth > 0", timeout=20000)
            assert page.get_by_role('button', name='Print this market', exact=True).is_enabled()
            pdf = out / (slug + '-browser-print.pdf')
            page.pdf(path=str(pdf), prefer_css_page_size=True, print_background=True, display_header_footer=False)
            doc = pymupdf.open(pdf)
            report['paper'].append({'region': slug, 'pages': len(doc), 'widthPoints': doc[0].rect.width, 'heightPoints': doc[0].rect.height})
            assert len(doc) == 1
            assert abs(doc[0].rect.width - 1224) < 1 and abs(doc[0].rect.height - 792) < 1, 'Actual Tabloid landscape dimensions'
            doc.close()
            # Prepared download URLs must resolve to files inside this package.
            for href in page.locator('a[href]').evaluate_all('(nodes) => nodes.map(n => n.getAttribute("href"))'):
                if href.startswith('./offline-assets/'):
                    assert (package / href[2:]).is_file(), href
        # Package manifest contains no private local paths and every asset exists.
        assert '/home/ubuntu/' not in json.dumps(manifest)
        for asset in manifest['assets']:
            assert (package / asset['localUrl'][2:]).is_file()
        page.goto(index + '#/hub/basel', wait_until='domcontentloaded')
        page.wait_for_selector('main table tbody tr button')
        page.get_by_role('link', name='Market intelligence', exact=True).click()
        assert '#/intelligence/basel' in page.url
        page.wait_for_selector('.market-brief')
        page.screenshot(path=str(out / 'basel-intelligence.png'), full_page=True)
        report['intelligenceHashNavigation'] = True
    except Exception as error:
        report['issues'].append(type(error).__name__ + ': ' + str(error))
    finally:
        browser.close()
report['passed'] = not any(report[k] for k in ['externalRequests', 'pageErrors', 'issues'])
(out / 'offline-file-browser-proof.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'allSavedImages'}, indent=2))
raise SystemExit(0 if report['passed'] else 1)

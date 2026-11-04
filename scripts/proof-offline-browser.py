#!/usr/bin/env python3
"""Read-only proof of packaged app with all non-loopback requests forbidden."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/offline-browser-proof_V2'
OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = 'http://127.0.0.1:8787'
report = {'externalRequests': [], 'pageErrors': [], 'httpErrors': [], 'markets': [], 'profiles': [], 'paper': []}
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440, 'height':1000})
    def local_only(route):
        u = urlsplit(route.request.url)
        if u.scheme in ['http','https'] and route.request.url.startswith(ORIGIN + '/'):
            route.continue_()
        else:
            report['externalRequests'].append(route.request.url)
            route.abort()
    context.route('**/*', local_only)
    page = context.new_page()
    page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
    page.on('response', lambda r: report['httpErrors'].append({'status':r.status,'url':r.url}) if r.status >= 400 else None)
    page.goto(ORIGIN, wait_until='domcontentloaded')
    page.wait_for_selector('.offline-hub-index button')
    assert page.locator('.offline-hub-index button').count() == 11
    assert page.evaluate('window.__ATLAS_OFFLINE__') is True
    page.screenshot(path=str(OUT / 'offline-overview.png'))
    overview = page.request.get(ORIGIN + '/api/atlas/overview').json()
    for region in overview['regions']:
        slug = region['id']
        page.goto(ORIGIN + '/hub/' + slug, wait_until='domcontentloaded')
        page.wait_for_selector('.offline-raster-image')
        page.wait_for_function("() => document.querySelector('.offline-raster-image')?.complete && document.querySelector('.offline-raster-image')?.naturalWidth > 0")
        page.wait_for_selector('main table tbody tr button')
        assert page.locator('.google-map-canvas').count() == 0
        assert page.get_by_role('link',name='Print this market',exact=True).count() == 1
        report['markets'].append({'region':slug,'savedMapLoaded':True,'matrixLoaded':True,'printAction':True})
        if slug not in ['basel','biotech-beach','genetown']:
            continue
        data = page.request.get(ORIGIN + '/api/atlas/regions/' + slug).json()
        page.get_by_role('tab', name=re.compile('Aerial', re.I)).click()
        page.wait_for_selector('#aerial-view-select')
        page.wait_for_function("() => document.querySelector('.offline-raster-image')?.complete && document.querySelector('.offline-raster-image')?.naturalWidth > 0")
        page.locator('.offline-atlas-map').screenshot(path=str(OUT / (slug + '-aerial.png')))
        assert page.locator('.offline-map-pin').count() > 0
        point = page.locator('.offline-map-pin').first
        point.click(force=True)
        if page.locator('.offline-overlap-list').count():
            page.locator('.offline-overlap-list button').nth(1).click()
        page.get_by_role('dialog').wait_for()
        page.get_by_role('button',name='Close company profile',exact=True).last.click()
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
        row = section.locator('.fact-row').filter(has=label)
        value = row.locator('.fact-value').inner_text()
        number = re.search(r'-?[\d,]+(?:\.\d+)?',value)
        assert number and float(number.group().replace(',','')) > 0
        report['profiles'].append({'region':slug,'company':company['name'],'displayedOperatingCashFlow':value,'periodAndScope':row.locator('.fact-meta').first.inner_text(),'mapClick':True})
        row.scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / (slug + '-company-profile.png')))
        page.get_by_role('button',name='Close company profile',exact=True).last.click()
        page.get_by_role('link',name='Print this market',exact=True).click()
        page.wait_for_function("() => document.querySelector('.market-print-sheet img')?.complete && document.querySelector('.market-print-sheet img')?.naturalWidth > 0")
        assert page.get_by_role('button',name='Print this market',exact=True).is_enabled()
        pdf = OUT / (slug + '-offline-browser-print.pdf')
        page.pdf(path=str(pdf),prefer_css_page_size=True,print_background=True,display_header_footer=False)
        import fitz
        doc = fitz.open(pdf)
        assert len(doc) == 1
        report['paper'].append({'region':slug,'pages':len(doc)})
        doc.close()
    assert not report['externalRequests'], report['externalRequests']
    assert not report['pageErrors'], report['pageErrors']
    assert not report['httpErrors'], report['httpErrors']
    browser.close()
report['passed'] = True
(OUT / 'offline-browser-proof.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))

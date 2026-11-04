#!/usr/bin/env python3
import argparse, csv, io, json
from pathlib import Path
import pymupdf
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('--package', required=True)
p.add_argument('--output', required=True)
p.add_argument('--origin', default='http://127.0.0.1:3000')
a = p.parse_args()
out = Path(a.output).resolve(); out.mkdir(parents=True, exist_ok=False)
package = Path(a.package).resolve(); index = (package / 'index.html').as_uri()
register = json.loads(Path('client/src/lib/baselAvailabilityRegisterV1.json').read_text())
assert register['status'] == 'complete'
report = {'passed': False, 'checks': [], 'errors': [], 'externalRequests': []}
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    try:
        for mode in ['online', 'offline']:
            ctx = browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True)
            if mode == 'offline':
                def local_only(route):
                    if route.request.url.startswith(('https://','http://')):
                        report['externalRequests'].append(route.request.url); route.abort()
                    else: route.continue_()
                ctx.route('**/*', local_only)
            page = ctx.new_page(); page.on('pageerror', lambda e: report['errors'].append(str(e)))
            for slug, code in [('basel-stadt','BS'),('basel-landschaft','BL')]:
                root = a.origin if mode == 'online' else index + '#'
                page.goto(root + '/canton/' + slug, wait_until='domcontentloaded')
                page.wait_for_selector('.canton-aerial-raster img', timeout=90000)
                page.wait_for_function("() => document.querySelector('.canton-aerial-raster img')?.complete && document.querySelector('.canton-aerial-raster img')?.naturalWidth > 0")
                page.locator('.canton-map-pin').first.click()
                group = page.get_by_role('dialog', name='Nearby source-address records')
                if group.count(): group.locator('[data-address-record]').first.click()
                close = page.get_by_role('button', name='Close local source record', exact=True)
                close.wait_for(); close.click()
                reg = page.locator('#basel-corrected-register')
                assert reg.count() == 1
                assert 'Availability reconciliation is still pending' not in reg.inner_text()
                current_expected = sum(1 for row in register['availabilityRecords'] if row['canton']==code and row['availabilityState']=='current_marketed')
                rows = reg.locator('[data-availability-record]')
                assert rows.count() == current_expected, (mode, slug, rows.count(), current_expected)
                if rows.count():
                    rows.first.locator('button').first.click()
                    dialog = page.get_by_role('dialog', name='Basel register source evidence')
                    dialog.wait_for(); assert 'Marketing is not owner-confirmed vacancy' in dialog.inner_text()
                    page.get_by_role('button', name='Close register evidence', exact=True).click()
                reg.get_by_role('button', name='Company crosswalk', exact=True).click()
                reg.get_by_label('Company evidence', exact=True).select_option('source_supported_operating')
                expected = register['totals'][code]['evidenceCounts']['source_supported_operating']
                assert reg.locator('[data-company-crosswalk]').count() == expected
                with page.expect_download() as pending:
                    reg.get_by_role('button', name='Download filtered CSV', exact=True).click()
                path = out / f'{mode}-{slug}-operating.csv'; pending.value.save_as(path)
                records = list(csv.DictReader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
                assert len(records) == expected
                reg.screenshot(path=str(out / f'{mode}-{slug}-register.png'))
                page.set_viewport_size({'width':390,'height':844})
                page.goto(root + '/canton/' + slug, wait_until='domcontentloaded')
                page.wait_for_selector('.canton-aerial-raster img')
                page.wait_for_function("() => document.querySelector('.canton-aerial-raster img')?.complete && document.querySelector('.canton-aerial-raster img')?.naturalWidth > 0")
                assert page.evaluate('() => document.documentElement.scrollWidth') <= 391
                page.screenshot(path=str(out / f'{mode}-{slug}-phone.png'))
                page.set_viewport_size({'width':1440,'height':1000})
                page.goto(root + '/print/canton/' + slug, wait_until='domcontentloaded')
                page.wait_for_function("() => document.querySelector('.market-print-sheet img')?.complete && document.querySelector('.market-print-sheet img')?.naturalWidth > 0")
                assert page.get_by_role('button', name='Print canton overview', exact=True).is_enabled()
                pdf = out / f'{mode}-{slug}-paper.pdf'
                page.pdf(path=str(pdf), prefer_css_page_size=True, print_background=True, display_header_footer=False)
                with pymupdf.open(pdf) as doc:
                    assert len(doc) == 1
                    assert abs(doc[0].rect.width-1224)<1 and abs(doc[0].rect.height-792)<1
                    doc[0].get_pixmap(matrix=pymupdf.Matrix(1)).save(out / f'{mode}-{slug}-paper.png')
                report['checks'].append({'mode':mode,'canton':slug,'actualMapRecordClick':True,'currentOfferRows':current_expected,'operatingEvidenceRows':expected,'filteredCsv':True,'phoneNoOverflow':True,'oneTabloidPage':True})
            ctx.close()
        assert not report['errors'], report['errors']
        assert not report['externalRequests'], report['externalRequests']
        report['passed'] = True
    except Exception as e:
        report['errors'].append(type(e).__name__ + ': ' + str(e))
    finally: browser.close()
(out / 'proof.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
raise SystemExit(0 if report['passed'] else 1)

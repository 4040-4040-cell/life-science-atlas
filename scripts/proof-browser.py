#!/usr/bin/env python3
"""Proof actual Preview interactions and capture screens for separate human review."""
import argparse, json, pathlib, re, urllib.parse
from playwright.sync_api import sync_playwright

p = argparse.ArgumentParser()
p.add_argument('--origin', required=True)
p.add_argument('--output', required=True)
p.add_argument('--regions', default='basel,biotech-beach,genetown')
p.add_argument('--all-hubs', action='store_true')
a = p.parse_args()
out = pathlib.Path(a.output); out.mkdir(parents=True, exist_ok=True)
report = {'human_visual_review': 'required', 'captures': [], 'interactions': [], 'errors': [], 'requests_failed': []}

def redact(text):
    return re.sub(r'([?&](?:key|token|api[_-]?key)=)[^&\s\"\']+', r'\1[redacted]', str(text))[:600]

def capture(page, label):
    page.screenshot(path=str(out / (label + '.png')), full_page=False)
    stats = page.evaluate('''() => ({viewport: [innerWidth,innerHeight], bodyWidth:document.body.scrollWidth,
      title: document.querySelector('h1')?.textContent,
      brokenImages: [...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>new URL(i.src,location.href).pathname).slice(0,20),
      mapProvider: document.querySelector('.gm-style') ? 'google' : document.querySelector('.leaflet-container') ? 'leaflet' : 'absent',
      mapTop: document.querySelector('.atlas-map,.overview-map')?.getBoundingClientRect().top,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].filter(e=>e.getBoundingClientRect().width>0).length})''')
    report['captures'].append({'file': label + '.png', **stats})
    if stats['bodyWidth'] > stats['viewport'][0]:
        report['errors'].append(label + ': horizontal viewport overflow')
    if stats['brokenImages']:
        report['errors'].append(label + ': broken images')
    print(label, json.dumps(stats), flush=True)

def wait_map(page):
    page.wait_for_selector('.gm-style', timeout=30000)
    page.wait_for_selector('.gmap-service-state', state='hidden', timeout=30000)
    page.wait_for_selector('.gmap-image-state', state='hidden', timeout=30000)
    page.wait_for_timeout(600)

def settle(page, route):
    page.goto(a.origin + route, wait_until='domcontentloaded', timeout=60000)
    page.wait_for_selector('main h1', timeout=40000)
    if route.startswith('/hub/'):
        page.wait_for_selector('main table tbody tr button', timeout=40000)
    else:
        page.wait_for_selector('.metric-strip', timeout=40000)
    wait_map(page)

def close_profile(page):
    dialog = page.get_by_role('dialog').filter(has=page.locator('.profile-header'))
    if dialog.count():
        dialog.locator('button[aria-label*="Close"]').first.click()
        dialog.wait_for(state='hidden', timeout=10000)

def map_click(page, label):
    canvas = page.locator('.atlas-map .google-map-canvas')
    canvas.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    box = canvas.bounding_box()
    for pin in page.locator('.gmap-site-pin.is-cluster').all():
        b = pin.bounding_box()
        if b and box and b['x'] > box['x']+5 and b['x']+b['width'] < box['x']+box['width']-5 and b['y'] > box['y']+60 and b['y']+b['height'] < box['y']+box['height']-90:
            pin.click(timeout=5000)
            popup = page.locator('.gmap-company-popup')
            popup.wait_for(state='visible', timeout=7000)
            row = popup.locator('button').first
            clicked = row.inner_text().splitlines()[0]
            row.click()
            dialog = page.get_by_role('dialog').filter(has=page.locator('.profile-header'))
            dialog.locator('h2').first.wait_for(timeout=15000)
            report['interactions'].append({'view':label,'action':'map cluster -> company row -> profile','clicked':clicked,'profile':dialog.locator('h2').first.inner_text()})
            close_profile(page)
            return
    # Isolated markers also need an actual pointer click, not a programmatic callback.
    for pin in page.locator('.gmap-site-pin:not(.is-cluster)').all():
        b = pin.bounding_box()
        if b and box and b['x'] > box['x']+5 and b['x']+b['width'] < box['x']+box['width']-5 and b['y'] > box['y']+60 and b['y']+b['height'] < box['y']+box['height']-90:
            clicked = pin.get_attribute('aria-label')
            pin.click(timeout=5000)
            dialog = page.get_by_role('dialog').filter(has=page.locator('.profile-header'))
            dialog.locator('h2').first.wait_for(timeout=15000)
            report['interactions'].append({'view':label,'action':'map marker -> profile','clicked':clicked,'profile':dialog.locator('h2').first.inner_text()})
            close_profile(page)
            return
    report['interactions'].append({'view':label,'action':'no central marker available for pointer test'})

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    try:
        for device, size in [('desktop', {'width':1440,'height':1000}), ('phone', {'width':390,'height':844})]:
            ctx = browser.new_context(viewport=size, is_mobile=device=='phone', has_touch=device=='phone', device_scale_factor=1)
            page = ctx.new_page()
            page.on('pageerror', lambda e: report['errors'].append(redact(e)))
            page.on('requestfailed', lambda r: report['requests_failed'].append({'path':urllib.parse.urlsplit(r.url).path,'failure':redact(r.failure)}))
            settle(page, '/')
            capture(page, device + '-overview')
            overview = page.request.get(a.origin + '/api/atlas/overview').json()
            regions = [r['id'] for r in overview['regions']] if a.all_hubs and device=='desktop' else a.regions.split(',')
            for region in regions:
                settle(page, '/hub/' + region)
                capture(page, device + '-' + region + '-hub')
                if region not in a.regions.split(','):
                    continue
                data = page.request.get(a.origin + '/api/atlas/regions/' + region).json()
                aerial_tab = page.get_by_role('tab', name=re.compile('Aerial', re.I))
                if aerial_tab.count():
                    aerial_tab.click()
                    page.wait_for_selector('#aerial-view-select', timeout=10000)
                    wait_map(page)
                    page.evaluate('scrollTo(0,0)')
                    capture(page, device + '-' + region + '-aerial')
                    page.locator('.atlas-map').screenshot(path=str(out / (device+'-'+region+'-map-detail.png')))
                    map_click(page, device + '-' + region)
                target = 'Vertex' if region=='genetown' else 'Neurocrine'
                company = next((c for c in data['companies'] if target.lower() in c['name'].lower() and c['kind']!='reported_research'), None)
                if company:
                    ids = {s['id'] for s in data['sites'] if s['profileId']==company['id']}
                    frame = next((f for f in data['aerials'] if set(f['siteIds']) & ids), None)
                    if frame:
                        page.locator('#aerial-view-select').select_option(frame['id'])
                        wait_map(page)
                    page.get_by_role('searchbox').fill(target)
                    page.wait_for_timeout(300)
                    row = page.locator('main table tbody button').filter(has_text=company['name']).first
                    row.click(timeout=10000)
                    dialog = page.get_by_role('dialog').filter(has=page.locator('.profile-header'))
                    dialog.locator('h2').first.wait_for(timeout=15000)
                    page.wait_for_timeout(250)
                    capture(page, device + '-' + region + '-profile')
                    tabs = dialog.locator('.profile-tabs button')
                    company_tab = tabs.filter(has_text=re.compile('^Company'))
                    if company_tab.count():
                        company_tab.first.click()
                        flow_label = page.locator('.fact-label').filter(has_text=re.compile('^Operating cash flow$'))
                        section = dialog.locator('.profile-fact-section').filter(has=flow_label)
                        if section.count():
                            if not section.first.evaluate('(el) => el.open'):
                                section.first.locator(':scope > summary').click()
                            row = section.locator('.fact-row').filter(has=flow_label).first
                            row.scroll_into_view_if_needed()
                            shown = row.locator('.fact-value').inner_text()
                            parsed = re.search(r'-?[\d,]+(?:\.\d+)?', shown)
                            assert parsed and float(parsed.group().replace(',', '')) > 0, 'Retained positive SEC cash flow must display positive'
                            report['interactions'].append({'view':device+'/'+region,'action':'displayed positive SEC operating cash flow','value':shown,'period':row.locator('.fact-meta').first.inner_text()})
                            capture(page, device + '-' + region + '-cashflow')
                    sources = tabs.filter(has_text=re.compile('^Sources'))
                    if sources.count():
                        sources.first.click()
                        page.wait_for_timeout(200)
                        report['interactions'].append({'view':device+'/'+region,'action':'profile sources','links':dialog.locator('a[href^="https://"]').count()})
                    close_profile(page)
            if device=='phone':
                page.get_by_role('button',name='Open navigation',exact=True).click()
                page.locator('.hub-links a[href="/hub/biotech-bay"]').click()
                page.wait_for_selector('h1',timeout=10000)
                wait_map(page)
                page.wait_for_selector('main table tbody tr button',timeout=30000)
                report['interactions'].append({'view':'phone','action':'navigation -> Biotech Bay','heading':page.locator('h1').inner_text()})
            ctx.close()
    except Exception as e:
        report['errors'].append(redact(e))
        try: page.screenshot(path=str(out/'failure.png'),full_page=False)
        except Exception: pass
    finally:
        browser.close()
        (out/'browser-proof.json').write_text(json.dumps(report,indent=2)+'\n')
print('Actual interaction results and screenshots saved. Human visual review remains required.',flush=True)
if report['errors']:
    print(json.dumps(report['errors'],indent=2),flush=True)
    raise SystemExit(1)

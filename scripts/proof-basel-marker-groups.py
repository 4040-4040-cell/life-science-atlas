import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('/home/ubuntu/bioatlas/assets/basel-marker-group-proof_V1')
OUT.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(1440, 1000), (390, 844)]:
        context = browser.new_context(viewport={'width': width, 'height': height})
        context.route_web_socket('ws://127.0.0.1:3000/**', lambda socket: socket.on_message(lambda message: None))
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        for canton in ['basel-stadt', 'basel-landschaft']:
            page.goto('http://127.0.0.1:3000/canton/' + canton, wait_until='domcontentloaded')
            page.wait_for_selector('.canton-aerial-raster img', timeout=90000)
            page.wait_for_function("() => document.querySelector('.canton-aerial-raster img')?.complete && document.querySelector('.canton-aerial-raster img')?.naturalWidth > 0")
            page.wait_for_timeout(300)
            image_top = page.locator('.canton-aerial-raster img').bounding_box()['y']
            groups = page.locator('.canton-map-pin')
            group_ids = groups.evaluate_all('(nodes) => nodes.map(node => node.dataset.addressGroup)')
            members = []
            for group_id in group_ids:
                print(f'{canton} width={width} group={group_id}', flush=True)
                group = page.locator('[data-address-group="' + group_id + '"]')
                count = int(group.get_attribute('data-record-count'))
                group.click(timeout=30000, no_wait_after=True)
                if count > 1:
                    dialog = page.get_by_role('dialog', name='Nearby source-address records')
                    dialog.wait_for()
                    record_ids = dialog.locator('[data-address-record]').evaluate_all('(nodes) => nodes.map(node => node.dataset.addressRecord)')
                    assert len(record_ids) == count
                    for index, record_id in enumerate(record_ids):
                        if index:
                            group.click(timeout=30000, no_wait_after=True)
                        page.locator('[data-address-record="' + record_id + '"]').click(timeout=30000, no_wait_after=True)
                        page.get_by_role('button', name='Close local source record', exact=True).wait_for(timeout=30000)
                        page.get_by_role('button', name='Close local source record', exact=True).click(timeout=30000, no_wait_after=True)
                        page.wait_for_function('() => !document.querySelector("dialog[open]")', timeout=60000)
                        members.append(record_id)
                        print(f'  pointer source card passed {record_id}', flush=True)
                else:
                    page.get_by_role('button', name='Close local source record', exact=True).wait_for(timeout=5000)
                    page.get_by_role('button', name='Close local source record', exact=True).click(timeout=30000, no_wait_after=True)
                    page.wait_for_function('() => !document.querySelector("dialog[open]")', timeout=60000)
                    members.append(group_id)
            assert len(set(members)) == len(members)
            # A focused group can be activated by Enter; its native dialog traps focus and closes with Escape.
            first = page.locator('.canton-map-pin').first
            first.focus()
            first.press('Enter')
            if int(first.get_attribute('data-record-count')) > 1:
                page.get_by_role('dialog', name='Nearby source-address records').wait_for()
                button = page.locator('[data-address-record]').first
                button.focus()
                button.press('Enter')
            page.get_by_role('button', name='Close local source record', exact=True).wait_for()
            page.keyboard.press('Escape')
            page.wait_for_function('() => !document.querySelector("dialog[open]")')
            page.evaluate('window.scrollTo(0, 0)')
            page.screenshot(path=str(OUT / f'{canton}-{width}.png'))
            results.append({'canton': canton, 'width': width, 'nativePointerGroups': len(group_ids), 'nativePointerRecords': len(members), 'keyboardActivated': True, 'imageTop': image_top, 'errors': list(errors)})
            assert not errors, errors
        context.close()
    browser.close()
(OUT / 'proof.json').write_text(json.dumps({'passed': True, 'results': results}, indent=2) + '\n')
print(json.dumps(results, indent=2))

import json
from pathlib import Path
from playwright.sync_api import sync_playwright
import pymupdf
OUT=Path('assets/final-canton-browser-proof_V4');OUT.mkdir(exist_ok=True)
LOCAL=Path('/home/ubuntu/life-science-atlas/offline_browser_atlas_V8/index.html').as_uri()
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for mode in ['online','offline']:
  errors=[];external=[];ctx=browser.new_context(viewport={'width':1440,'height':1000})
  if mode=='offline':
   def route_handler(route):
    if route.request.url.startswith(('https://','http://')):external.append(route.request.url);route.abort()
    else:route.continue_()
   ctx.route('**/*',route_handler)
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  for canton in ['basel-stadt','basel-landschaft']:
   root='http://127.0.0.1:3000' if mode=='online' else LOCAL+'#'
   page.goto(root+'/canton/'+canton,wait_until='domcontentloaded');page.wait_for_selector('.canton-aerial-raster img',timeout=90000)
   page.wait_for_function("() => document.querySelector('.canton-aerial-raster img')?.complete && document.querySelector('.canton-aerial-raster img')?.naturalWidth>0")
   page.screenshot(path=str(OUT/f'{mode}-{canton}-desktop.png'))
   map_top=page.locator('.canton-aerial').bounding_box()['y'];inventory=page.locator('#canton-inventory');assert not inventory.count() or map_top<inventory.bounding_box()['y']
   marker=page.locator('.canton-map-pin:not(:disabled)').first;marker.wait_for();marker.click();page.get_by_role('button',name='Close local source record',exact=True).wait_for();page.screenshot(path=str(OUT/f'{mode}-{canton}-record.png'));page.get_by_role('button',name='Close local source record',exact=True).click()
   page.set_viewport_size({'width':390,'height':844});page.goto(root+'/canton/'+canton);page.wait_for_selector('.canton-aerial-raster img');page.wait_for_function("() => document.querySelector('.canton-aerial-raster img')?.complete && document.querySelector('.canton-aerial-raster img')?.naturalWidth>0");page.screenshot(path=str(OUT/f'{mode}-{canton}-phone.png'));page.set_viewport_size({'width':1440,'height':1000})
   page.goto(root+'/print/canton/'+canton);button=page.get_by_role('button',name='Print canton overview',exact=True);button.wait_for();page.wait_for_function("() => document.querySelector('.market-print-sheet img')?.complete && document.querySelector('.market-print-sheet img')?.naturalWidth>0");assert button.is_enabled()
   file=OUT/f'{mode}-{canton}-actual-browser-print.pdf';page.pdf(path=str(file),prefer_css_page_size=True,print_background=True,display_header_footer=False);doc=pymupdf.open(file);assert len(doc)==1 and abs(doc[0].rect.width-1190.551)<1 and abs(doc[0].rect.height-841.89)<1
   results.append({'mode':mode,'canton':canton,'realMapAndRecordClick':True,'phoneRendered':True,'oneA3Page':True,'errors':list(errors),'externalRequestsBlocked':list(external)})
  assert not errors,errors;assert not external,external
  ctx.close()
 browser.close()
(OUT/'proof.json').write_text(json.dumps({'passed':True,'checks':results},indent=2)+'\n');print('Online/file-offline, both cantons, actual map clicks, phone and one-page A3 print passed')

#!/usr/bin/env python3
from pathlib import Path
import json
ROOT = Path('/home/ubuntu/bioatlas')
for name in ['marketPrintAssetsV4.json', 'baselCantonPrintAssetsV5.json', 'baselRegisterDownloadV1.json']:
    file = ROOT / 'client/src/lib' / name
    assert file.is_file(), f'Durable final manifest missing: {name}'
    json.loads(file.read_text())
for file in [ROOT / 'client/src/App.tsx', ROOT / 'client/src/pages/AtlasMarketPrint.tsx',
             ROOT / 'client/src/pages/AtlasHub.tsx', ROOT / 'client/src/pages/AtlasOverview.tsx',
             ROOT / 'client/src/pages/AtlasMarketIntelligence.tsx', ROOT / 'client/src/pages/BaselCantonDetail.tsx']:
    content = file.read_text()
    content = content.replace('marketPrintAssetsV3.json', 'marketPrintAssetsV4.json')
    content = content.replace('baselCantonPrintAssetsV4.json', 'baselCantonPrintAssetsV5.json')
    file.write_text(content)
file = ROOT / 'client/src/components/atlas/BaselAvailabilityRegister.tsx'
content = file.read_text()
content = content.replace("import registerData from '@/lib/baselAvailabilityRegisterV1.json';",
                          "import registerData from '@/lib/baselAvailabilityRegisterV1.json';\nimport releaseData from '@/lib/baselRegisterDownloadV1.json';")
start = content.index('// The parent owns the release manifest.')
end = content.index('\n\nfunction RegisterSources', start)
content = content[:start] + "// Static import works in both Vite and the no-network IIFE edition.\nconst release = releaseData;" + content[end:]
file.write_text(content)
print('Activated final V4 market and V5 canton assets; removed unsupported offline import.meta.glob.')

#!/usr/bin/env python3
"""Convert a complete verified browser snapshot into a portable static HTTP site.
No source research is edited; the previous edition is never overwritten.
The output can be served from any directory on an ordinary static web host.
"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True, help='Verified complete offline browser edition')
parser.add_argument('--output', required=True, help='New static website directory')
args = parser.parse_args()
source, output = Path(args.input).resolve(), Path(args.output).resolve()
if output.exists() or output == source or source in output.parents:
    raise SystemExit('Output must be a new directory outside the original edition.')
manifest = json.loads((source / 'package-manifest.json').read_text())
if manifest.get('profiles') != 1276 or len(manifest.get('markets', [])) != 11 or manifest.get('aerialViews') != 81:
    raise SystemExit('Use the final complete V9 release; incomplete census/snapshots are refused.')
html = (source / 'index.html').read_text()
if re.search(r'/manus-storage/[A-Za-z0-9_.%/-]+', html):
    raise SystemExit('Unmapped storage reference in runtime entry point.')
for file in source.rglob('*'):
    if file.is_symlink():
        raise SystemExit('Symlinks cannot be used for branch-based Pages: ' + file.name)
    if file.is_file() and file.stat().st_size >= 100 * 1024 * 1024:
        raise SystemExit('File exceeds GitHub ordinary Git limit: ' + file.name)
shutil.copytree(source, output)
html = html.replace('img-src file: data: blob:', "img-src 'self' file: data: blob:")
html = html.replace('media-src file: data: blob:', "media-src 'self' file: data: blob:")
html = html.replace('Life Science Atlas | Offline Browser', 'Life Science Atlas | Independent Edition')
html = html.replace('OFFLINE REGIONAL INDEX', 'RESEARCH HUB INDEX')
if "img-src 'self'" not in html or "connect-src 'none'" not in html:
    raise SystemExit('Unexpected source security policy; do not silently relax it.')
(output / 'index.html').write_text(html)
(output / '.nojekyll').write_text('')
(output / 'print-downloads.html').write_text((source / 'print-downloads.html').read_text().replace('Open the full offline atlas', 'Open the interactive atlas'))
(output / 'README.md').write_text('''# Life Science Atlas / independently hosted research edition

This is the final retained, read-only interactive research snapshot. It is a
separate product from Claude's Hotbed Census. All company evidence and dates,
Basel availability exclusions, imagery credits and printable sheets are retained.

Serve this entire directory with any static web host. All display assets and
print downloads use relative paths; application routes use `#/`. No Manus
hosting, database, maps proxy, storage, external scripts or fonts are needed.
External source citations only open when a user follows a link.

GitHub Pages uses the root of the `gh-pages` branch. `.nojekyll` is required.
Do not move or delete `offline-assets` or change retained record identifiers.
GitHub Pages is not a writable database: refresh requires a vetted snapshot and
redeployment. The server/database source is retained separately on `main`.

Repository: https://github.com/4040-4040-cell/life-science-atlas
Claude's separate repository is not part of this edition.
''')
files = []
for file in sorted(output.rglob('*')):
    if file.is_file():
        data = file.read_bytes()
        files.append({'path': file.relative_to(output).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
total = sum(f['bytes'] for f in files)
if total >= 1024 ** 3:
    raise SystemExit('Published site exceeds GitHub Pages 1 GB limit.')
release = {
    'edition': 'Independent GitHub-hosted read-only research snapshot',
    'sourceRepository': 'https://github.com/4040-4040-cell/life-science-atlas',
    'sourcePackageHash': hashlib.sha256((source / 'package-manifest.json').read_bytes()).hexdigest(),
    'profiles': manifest['profiles'], 'markets': manifest['markets'],
    'aerialViews': manifest['aerialViews'],
    'runtimeNetwork': 'Same-origin images and downloads only; embedded data and CSV transport',
    'updates': 'Vetted snapshot and redeployment, not a writable or live-refresh database',
    'bytes': total, 'files': files,
}
(output / 'hosting-manifest.json').write_text(json.dumps(release, indent=2) + '\n')
print(json.dumps({k: v for k, v in release.items() if k not in ['files', 'markets']}, indent=2))

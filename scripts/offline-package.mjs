import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { zipDirectory } from './offline-zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--output', '--print-dir'].includes(process.argv[i]) || !process.argv[i + 1]) throw new Error('Usage: node scripts/offline-package.mjs --output /absolute/new/package-dir [--print-dir /absolute/print/output]');
  options.set(process.argv[i], process.argv[i + 1]);
}
const output = path.resolve(options.get('--output') || '/home/ubuntu/life-science-atlas/offline_atlas_V1');
const printDir = path.resolve(options.get('--print-dir') || '/home/ubuntu/life-science-atlas/print_markets_V1/output');
try { await fs.stat(output); throw new Error('Package destination already exists. Choose a new versioned --output directory; existing deliveries are never overwritten.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const snapshotBytes = await fs.readFile(path.join(root, 'scripts/offline-cache/snapshot.json.gz'));
const snapshot = JSON.parse(gunzipSync(snapshotBytes));
const seedBytes = await fs.readFile(path.join(root, 'data/atlas-seed_V5.json.gz'));
if (snapshot.correctedSeed.sha256 !== createHash('sha256').update(seedBytes).digest('hex')) throw new Error('Snapshot belongs to another corrected seed. Run offline-capture.mjs.');
const dist = path.join(root, 'dist/public');
await fs.access(path.join(dist, 'index.html'));
const builtJavascript = (await fs.readdir(path.join(dist, 'assets'))).filter(file => file.endsWith('.js'));
const builtCode = (await Promise.all(builtJavascript.map(file => fs.readFile(path.join(dist, 'assets', file), 'utf8')))).join('\n');
if (!builtCode.includes('offline-atlas-map') || !builtCode.includes('offline-overview-map') || !builtCode.includes('__ATLAS_OFFLINE__')) throw new Error('Final compiled client lacks offline map integration. Add the wrappers and run pnpm build first.');
const printManifest = JSON.parse(await fs.readFile(path.join(root, 'client/src/lib/marketPrintAssets.json'), 'utf8'));
if (Object.keys(printManifest.markets || {}).length !== 11) throw new Error('Final print manifest must include all 11 markets.');
const transfers = JSON.parse(await fs.readFile(path.join(root, 'data/asset-transfer.json'), 'utf8'));
// This link is hidden in offline mode. A package must not include a copy of itself.
let onlineDownloadUrl = '';
try { onlineDownloadUrl = JSON.parse(await fs.readFile(path.join(root, 'client/src/lib/offlineDownload.json'), 'utf8')).url || ''; } catch (error) { if (error.code !== 'ENOENT') throw error; }
const stripOnlineDownload = text => onlineDownloadUrl ? text.split(onlineDownloadUrl).join('') : text;
const mapping = new Map();
const assetFiles = new Map();
for (const [local, value] of Object.entries(transfers)) {
  const localUrl = '/offline-assets/' + path.basename(new URL(value.url, 'http://local').pathname);
  mapping.set(value.url, localUrl);
  assetFiles.set(localUrl, { local, sha256: value.sha256 });
}
function collectUrls(value, results = new Set()) {
  if (typeof value === 'string') { for (const match of value.matchAll(/\/manus-storage\/[A-Za-z0-9_.%/-]+/g)) results.add(match[0]); }
  else if (Array.isArray(value)) for (const item of value) collectUrls(item, results);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectUrls(item, results);
  return results;
}
for (const url of collectUrls(printManifest)) {
  if (mapping.has(url)) continue;
  const filename = path.basename(url).replace(/_[a-f0-9]{8}(?=\.[^.]+$)/, '');
  const local = path.join(printDir, filename);
  await fs.access(local);
  const localUrl = '/offline-assets/print/' + filename;
  mapping.set(url, localUrl);
  assetFiles.set(localUrl, { local });
}
const needed = collectUrls(snapshot);
async function textFiles(dir) {
  const results = [];
  for (const file of await fs.readdir(dir, { withFileTypes: true })) {
    if (file.isSymbolicLink()) throw new Error('No symlinks may enter the offline bundle.');
    const name = path.join(dir, file.name);
    if (file.isDirectory()) results.push(...await textFiles(name));
    else if (/\.(?:html|js|mjs|css|json|svg)$/i.test(file.name)) results.push(name);
  }
  return results;
}
for (const file of await textFiles(dist)) collectUrls(stripOnlineDownload(await fs.readFile(file, 'utf8')), needed);
collectUrls(printManifest, needed);
for (const url of needed) if (!mapping.has(url)) throw new Error(`No cached local asset for ${url}; refusing a partially-online package.`);
const checks = [];
for (const url of needed) {
  const target = mapping.get(url); const asset = assetFiles.get(target);
  const stat = await fs.stat(asset.local);
  if (!stat.isFile()) throw new Error('Asset is not a local file.');
  const hash = createHash('sha256').update(await fs.readFile(asset.local)).digest('hex');
  if (asset.sha256 && asset.sha256 !== hash) throw new Error(`Cached asset hash mismatch: ${url}`);
  checks.push({ sourceUrl: url, localUrl: target, sha256: hash, bytes: stat.size });
}
console.log(`Assembling ${snapshot.profiles.length} profiles, ${needed.size} cached media/print assets; no downloads.`);
await fs.mkdir(path.join(output, 'data'), { recursive: true });
await fs.cp(dist, path.join(output, 'public'), { recursive: true, dereference: false });
await fs.rm(path.join(output, 'public/__manus__'), { recursive: true, force: true });
function remapText(text) {
  return stripOnlineDownload(text).replace(/\/manus-storage\/[A-Za-z0-9_.%/-]+/g, url => {
    const replacement = mapping.get(url);
    if (!replacement) throw new Error(`Unmapped storage URL ${url}`);
    return replacement;
  });
}
for (const file of await textFiles(path.join(output, 'public'))) {
  let text = remapText(await fs.readFile(file, 'utf8'));
  if (file.endsWith('index.html')) {
    text = text.replace(/<script[^>]+src="\/__manus__\/[^\"]+"[^>]*><\/script>/g, '');
    text = text.replace(/<link[^>]+(?:rel="(?:preconnect|dns-prefetch)"|href="https?:\/\/fonts\.)[^>]*>/g, '');
  }
  await fs.writeFile(file, text);
}
for (const check of checks) {
  const asset = assetFiles.get(check.localUrl);
  const target = path.join(output, 'public', check.localUrl);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(asset.local, target);
}
// Copy every prepared PDF, combined PDF and ZIP, plus printable PNGs. Do not copy private research sources.
for (const file of await fs.readdir(printDir, { withFileTypes: true })) {
  if (!file.isFile() || !/\.(?:pdf|png|zip)$/i.test(file.name)) continue;
  const dir = path.join(output, 'public/offline-assets/print');
  await fs.mkdir(dir, { recursive: true });
  await fs.copyFile(path.join(printDir, file.name), path.join(dir, file.name));
}
await fs.writeFile(path.join(output, 'data/snapshot.json.gz'), gzipSync(remapText(JSON.stringify(snapshot)), { level: 9 }));
await fs.writeFile(path.join(output, 'data/print-assets.json'), remapText(JSON.stringify(printManifest, null, 2)) + '\n');
await fs.writeFile(path.join(output, 'data/package-manifest.json'), JSON.stringify({ format: 1, assembledAt: new Date().toISOString(), snapshotCapturedAt: snapshot.capturedAt, correctedSeed: snapshot.correctedSeed, profiles: snapshot.profiles.length, sites: snapshot.regions.reduce((n, r) => n + r.sites.length, 0), markets: Object.keys(printManifest.markets), assets: checks }, null, 2) + '\n');
await build({ entryPoints: [path.join(root, 'server/offline-api.ts')], outfile: path.join(output, 'offline-api.mjs'), bundle: true, platform: 'node', target: 'node20', format: 'esm', packages: 'bundle' });
await fs.copyFile(path.join(root, 'server/offline-start.mjs'), path.join(output, 'start.mjs'));
await fs.writeFile(path.join(output, 'Run Atlas.bat'), '@echo off\r\ncd /d "%~dp0"\r\nnode start.mjs\r\nif errorlevel 1 pause\r\n');
await fs.writeFile(path.join(output, 'run-atlas.sh'), '#!/bin/sh\ncd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 1\nexec node start.mjs "$@"\n', { mode: 0o755 });
await fs.writeFile(path.join(output, 'README.md'), `# Life Science Atlas — offline research site\n\n## Open the complete atlas\n\nUnzip this entire folder on a Windows, macOS or Linux computer with **Node.js 20 or newer already installed**. In a terminal, change to this folder and run:\n\n\`\`\`sh\nnode start.mjs\n\`\`\`\n\nOpen **http://127.0.0.1:8787** in your browser. Keep the terminal running; stop with Ctrl+C. No npm install, account, database, online maps or internet connection is required to run the package. Windows users can use “Run Atlas.bat”; macOS/Linux users can run \`sh run-atlas.sh\`. If the port is busy, run \`node start.mjs --port 8788\` and open that port instead. The server is read-only and listens only on 127.0.0.1; it cannot be reached from another device.\n\n**Do not double-click index.html:** the full workstation requires its local API. This ZIP is not an iPhone app and does not run in ordinary iPhone Safari without a Node runtime. The individual and combined PDFs in \`public/offline-assets/print\` can be opened directly on an iPhone or any PDF-capable device.\n\n## Included and unchanged\n\nThis is the complete bounded snapshot captured ${snapshot.capturedAt}, with ${snapshot.profiles.length} retained profiles and all 11 research markets. It uses the corrected ${snapshot.correctedSeed.version} seed, checked against the live read-only API, and retains source/evidence and analyst overlays. Dataset dates and accounting periods appear with each field; capture date does not make older evidence current. Profiles, nearby/city context, matrix searches, filters, paging, CSV export, saved geographic maps, aerial images, supplied logos and ready-made market print downloads work locally. Missing marks use company names.\n\nThe CSV uses the same formula-injection sanitization as the hosted atlas. A selected analytical frame requires explicit retained site-ID membership and evidence on the same site. Companywide financials are not local capital or guaranteed lease credit. Positive operating cash flow means cash provided by operations, not burn or infinite runway. Missing facts remain unknown.\n\nSaved macro figures retain their original city-group index; the separately clickable list follows current filters and is not pinned against a padded map. Aerial dots are coordinate-mapped at native raster bounds, with only exhibit-linked address-matched baseline sites; dashed squares separately mark campus references, not verified company suites. Provider attribution, catalog acquisition years and capture caveats are retained. Analytical frames are not official boundaries.\n\n## Sources, privacy and limits\n\nExternal evidence/website links require internet when intentionally opened. They are not downloaded or fabricated. A restrictive local browser content policy blocks remote map, image, font and API requests. This snapshot does not refresh itself, permit edits or contact the hosted database. Original private brochures, credentials and local research paths are not included.\n\nThe compressed API snapshot is in \`data/snapshot.json.gz\`; asset hashes and original-to-local URL associations are in \`data/package-manifest.json\`. Do not remove or move individual package files. Prepared single-market PDFs, one combined 11-market PDF, and the individual-PDF ZIP are in \`public/offline-assets/print\`.\n`);
// Static index links remain useful without the app runtime for prepared PDFs.
const manifest = JSON.parse(remapText(JSON.stringify(printManifest)));
const htmlEscape = text => String(text).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const links = Object.values(manifest.markets).map(m => `<li><a href=".${htmlEscape(m.pdfUrl)}">${htmlEscape(m.title)} — one-page PDF</a></li>`).join('\n');
await fs.writeFile(path.join(output, 'public/print-downloads.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas print downloads</title></head><body><h1>Life Science Atlas — prepared print maps</h1><p>These PDFs can be opened directly without the local API. The full atlas requires Node.js 20+ and node start.mjs.</p><ul><li><a href=".${htmlEscape(manifest.allMarketsPdfUrl)}">All 11 markets — combined PDF</a></li><li><a href=".${htmlEscape(manifest.individualPdfZipUrl)}">Individual PDFs — ZIP</a></li>${links}</ul></body></html>\n`);
await zipDirectory(output, output + '.zip');
console.log(`Ready: ${output}\nDownload: ${output}.zip\nRun: cd "${output}" && node start.mjs`);

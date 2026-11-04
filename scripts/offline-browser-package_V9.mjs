import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build as esbuild } from 'esbuild';
import { build as viteBuild } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { zipDirectory } from './offline-zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--output', '--print-dir', '--snapshot', '--cantons'].includes(process.argv[i]) || !process.argv[i + 1] || args.has(process.argv[i]))
    throw new Error('Usage: node scripts/offline-browser-package.mjs --output /absolute/new-version [--print-dir /absolute/print/output] [--snapshot /absolute/versioned-snapshot.json.gz] [--cantons /absolute/versioned-canton-companion.json]');
  args.set(process.argv[i], process.argv[i + 1]);
}
const output = path.resolve(args.get('--output') || '/home/ubuntu/life-science-atlas/offline_browser_atlas_V1');
const printDir = path.resolve(args.get('--print-dir') || '/home/ubuntu/life-science-atlas/market_intelligence_V2/output');
for (const destination of [output, output + '.zip']) {
  try { await fs.access(destination); throw new Error(`Never overwrite an earlier delivery: ${destination}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const hash = data => createHash('sha256').update(data).digest('hex');
const snapshotPath = path.resolve(args.get('--snapshot') || path.join(root, 'scripts/offline-cache/snapshot.json.gz'));
const snapshotBytes = await fs.readFile(snapshotPath);
const snapshot = JSON.parse(gunzipSync(snapshotBytes));
const companionPath = path.resolve(args.get('--cantons') || path.join(root, 'data/baselCantonDetail_offline_V2.json'));
const companionBytes = await fs.readFile(companionPath);
const companion = JSON.parse(companionBytes);
const canonicalJson = value => Array.isArray(value) ? '[' + value.map(canonicalJson).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => JSON.stringify(key) + ':' + canonicalJson(v)).join(',') + '}' : JSON.stringify(value) ?? 'null';
if (companion.format !== 1 || !/^[a-f0-9]{64}$/.test(companion.sourceHash) || Object.keys(companion.documents || {}).length !== 2) throw new Error('Incomplete or unverified canton companion. Never replace it with an old company census.');
for (const id of ['basel-stadt', 'basel-landschaft']) {
  const document = companion.documents[id]; const { contentHash, ...payload } = document || {};
  if (!document || document.cantonId !== id || document.sourceHash !== companion.sourceHash || document.version !== companion.version || hash(canonicalJson(payload)) !== contentHash) throw new Error('Canton document source/content hash mismatch: ' + id);
}
if (/file:\/\/|\/(?:home|mnt|Users)\//i.test(JSON.stringify(companion).replace(/https?:\/\/[^\s"<>]+/g, ''))) throw new Error('Private filesystem paths cannot be included in the public offline companion.');
let seedMatch;
for (const filename of await fs.readdir(path.join(root, 'data'))) {
  if (!/^atlas-seed_V\d+\.json\.gz$/.test(filename)) continue;
  if (hash(await fs.readFile(path.join(root, 'data', filename))) === snapshot.correctedSeed.sha256) { seedMatch = filename; break; }
}
if (snapshot.format !== 1 || snapshot.profiles.length !== 1276 || snapshot.regions.length !== 11 || !seedMatch)
  throw new Error('Incomplete snapshot or retained corrected-source hash mismatch. Do not replace it with another company master.');
await fs.access(printDir);
const transfers = JSON.parse(await fs.readFile(path.join(root, 'data/asset-transfer.json'), 'utf8'));
let onlineDownloadUrl = '';
try { onlineDownloadUrl = JSON.parse(await fs.readFile(path.join(root, 'client/src/lib/offlineDownload.json'), 'utf8')).url || ''; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const stripOnlineDownload = value => onlineDownloadUrl ? value.split(onlineDownloadUrl).join('') : value;
const urlsIn = (value, result = new Set()) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const match of text.matchAll(/\/manus-storage\/[A-Za-z0-9_.%/-]+/g)) result.add(match[0]);
  return result;
};
const temp = await fs.mkdtemp(path.join(root, 'scripts/.offline-browser-build-'));
try {
  console.log('Bundling current React app and the pure retained API for the browser…');
  const cssPaths = new Set();
  const result = await esbuild({
    absWorkingDir: root, entryPoints: ['scripts/offline-browser-entry.tsx'], outfile: path.join(temp, 'app.js'),
    bundle: true, platform: 'browser', format: 'iife', target: ['chrome100', 'firefox100', 'safari16'],
    minify: true, legalComments: 'none', write: false, jsx: 'automatic',
    alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' },
    plugins: [{ name: 'collect-css', setup(build) {
      build.onLoad({ filter: /\.css$/ }, async ({ path: cssPath }) => {
        cssPaths.add(cssPath); return { contents: '', loader: 'js' };
      });
    } }],
  });
  let code = stripOnlineDownload(result.outputFiles.find(f => f.path.endsWith('app.js')).text);
  if (!code.includes('offline-atlas-map') || !code.includes('__ATLAS_OFFLINE__')) throw new Error('Current App has no offline map wrappers.');
  const cssEntry = path.join(temp, 'styles.css');
  await fs.writeFile(cssEntry, [...cssPaths].map(p => `@import ${JSON.stringify(p)};`).join('\n') + '\n');
  const cssBuild = await viteBuild({
    root, configFile: false, publicDir: false, plugins: [tailwindcss()], logLevel: 'warn',
    build: { write: false, minify: 'esbuild', cssCodeSplit: true, rollupOptions: { input: cssEntry } },
  });
  const cssOutputs = (Array.isArray(cssBuild) ? cssBuild : [cssBuild]).flatMap(r => r.output);
  let css = cssOutputs.filter(o => o.type === 'asset' && o.fileName.endsWith('.css')).map(o => typeof o.source === 'string' ? o.source : Buffer.from(o.source).toString()).join('\n');
  if (!css) throw new Error('No compiled CSS was produced.');
  // CSS is fully bundled; no external imports or fonts are allowed.
  if (/@import\s|url\(\s*["']?https?:/i.test(css)) throw new Error('Compiled CSS contains an external import or asset.');
  const needed = urlsIn(snapshot);
  urlsIn(code, needed); urlsIn(css, needed); urlsIn(companion, needed);
  const imageUrls = new Set(snapshot.regions.flatMap(r => [r.region.macroUrl, ...r.aerials.flatMap(a => [a.imageUrl, a.exhibitUrl])]).filter(Boolean));
  const lookup = new Map(Object.entries(transfers).map(([local, value]) => [value.url, { local, sha256: value.sha256 }]));
  const currentPrintFiles = await fs.readdir(printDir, { withFileTypes: true });
  const oldPrintDir = '/home/ubuntu/life-science-atlas/print_markets_V1/output';
  const mapping = new Map();
  const tasks = [];
  const records = [];
  const targets = new Map();
  async function addAsset(url, source, expectedHash, directory = '') {
    const sourceStat = await fs.lstat(source);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`Not a regular cached file: ${source}`);
    const sourceBytes = await fs.readFile(source);
    if (expectedHash && hash(sourceBytes) !== expectedHash) throw new Error(`Cached asset hash mismatch: ${url}`);
    let filename = path.basename(url);
    const raster = imageUrls.has(url) || (/\.(?:jpe?g|png)$/i.test(filename) && !/logo/i.test(source) && directory === 'print');
    const kind = /\.pdf$/i.test(filename) ? 'pdf' : raster ? 'image' : 'copy';
    if (kind === 'image') filename = filename.replace(/\.[^.]+$/, '.jpg');
    const localUrl = './offline-assets/' + (directory ? directory + '/' : '') + filename;
    const collision = targets.get(localUrl);
    if (collision && collision !== source) throw new Error(`Asset filename collision: ${localUrl}`);
    mapping.set(url, localUrl);
    if (collision) return;
    targets.set(localUrl, source);
    const id = tasks.length;
    tasks.push({ id, source, target: path.join(output, localUrl.slice(2)), kind });
    records.push({ id, sourceUrl: url, localUrl, originalSha256: hash(sourceBytes), originalBytes: sourceStat.size });
  }
  for (const url of needed) {
    const cached = lookup.get(url);
    if (cached) { if (/intelligence-sources/i.test(cached.local)) throw new Error('Unsanitized historical source archive cannot ship: ' + url); await addAsset(url, cached.local, cached.sha256); continue; }
    const filename = path.basename(url).replace(/_[a-f0-9]{8}(?=\.[^.]+$)/i, '');
    let source;
    for (const dir of [printDir, oldPrintDir]) {
      for (const name of [filename, path.basename(url)]) {
        const candidate = path.join(dir, name);
        try { await fs.access(candidate); source = candidate; break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      if (source) break;
    }
    if (!source) throw new Error(`No local cached media/print asset for ${url}. Check --print-dir; no downloads are attempted.`);
    await addAsset(url, source, undefined, 'print');
  }
  // Retain every current intelligence PDF, combined PDF and prepared ZIP;
  // do not include private sources, redundant full-resolution PNGs or old workstation ZIPs.
  for (const file of currentPrintFiles) {
    if (!file.isFile() || !/\.(?:pdf|zip)$/i.test(file.name) || /intelligence-sources/i.test(file.name)) continue;
    const source = path.join(printDir, file.name);
    if ([...targets.values()].includes(source)) continue;
    await addAsset('/prepared-print/' + file.name, source, undefined, 'print');
  }
  const remap = text => stripOnlineDownload(text).replace(/\/manus-storage\/[A-Za-z0-9_.%/-]+/g, url => {
    if (!mapping.has(url)) throw new Error(`Unmapped storage URL: ${url}`);
    return mapping.get(url);
  });
  code = remap(code); css = remap(css);
  const data = remap(JSON.stringify(snapshot));
  const localCompanion = JSON.parse(remap(JSON.stringify(companion)));
  for (const document of Object.values(localCompanion.documents)) {
    const originalContentHash = document.contentHash;
    document.metadata = { ...document.metadata, offlineAssetMapping: { originalContentHash, note: 'Only packaged asset destinations changed; source, dates, facts and original document hash retained.' } };
    const { contentHash: _oldHash, ...payload } = document;
    document.contentHash = hash(canonicalJson(payload));
  }
  const cantonData = JSON.stringify(localCompanion);
  // Preserve raw JSON safely in a classic inline script, avoiding all module/CORS
  // restrictions and avoiding DecompressionStream as a browser prerequisite.
  const safeScript = text => text.replace(/<\//g, '<\\/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src file: data: blob:; font-src data:; connect-src 'none'; media-src file: data: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><title>Life Science Atlas | Offline Browser</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"><div style="padding:32px;font-family:Arial,sans-serif"><h1>Life Science Atlas</h1><p>Opening the embedded offline workstation… No installation, server, account or internet connection is required.</p><noscript>Enable JavaScript in this browser to use the atlas. Prepared PDFs are available in offline-assets/print.</noscript></div></div><script>window.__ATLAS_OFFLINE__=true;window.__ATLAS_BROWSER_SNAPSHOT__=${safeScript(data)};window.__ATLAS_CANTON_DOCUMENTS__=${safeScript(cantonData)};</script><script>${safeScript(code)}</script></body></html>\n`;
  if (/<script[^>]+\bsrc=|<script[^>]+type=["']module|<link[^>]+href=["']https?:/i.test(html)) throw new Error('External/module startup dependency detected.');
  await fs.mkdir(output, { recursive: false });
  const taskFile = path.join(temp, 'media-tasks.json');
  const receiptFile = path.join(temp, 'media-results.json');
  await fs.writeFile(taskFile, JSON.stringify(tasks));
  console.log(`Assembling ${snapshot.profiles.length} profiles, ${imageUrls.size} saved macro/aerial/exhibit assets, ${tasks.length} cached media/print files. No network downloads.`);
  execFileSync('python3', [path.join(root, 'scripts/offline-browser-media_V9.py'), taskFile, receiptFile], { stdio: 'inherit', timeout: 600000 });
  const receipts = new Map(JSON.parse(await fs.readFile(receiptFile, 'utf8')).map(r => [r.id, r]));
  for (const record of records) {
    const receipt = receipts.get(record.id);
    delete receipt.id; Object.assign(record, receipt);
    record.sha256 = hash(await fs.readFile(path.join(output, record.localUrl.slice(2))));
    delete record.id;
  }
  await fs.writeFile(path.join(output, 'index.html'), html);
  const manifest = { format: 2, runtime: 'browser-file', assembledAt: new Date().toISOString(), snapshotCapturedAt: snapshot.capturedAt,
    correctedSeed: snapshot.correctedSeed, profiles: snapshot.profiles.length, markets: snapshot.regions.map(r => r.region.id),
    sites: snapshot.regions.reduce((n, r) => n + r.sites.length, 0), aerialViews: snapshot.regions.reduce((n, r) => n + r.aerials.length, 0),
    snapshotSha256: hash(snapshotBytes), embeddedSnapshotSha256: hash(data), cantonCompanionSha256: hash(companionBytes), cantonSourceHash: companion.sourceHash, cantonVersion: companion.version, cantonIds: Object.keys(companion.documents), embeddedCantonSha256: hash(cantonData), htmlBytes: Buffer.byteLength(html), assets: records };
  await fs.writeFile(path.join(output, 'package-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const escape = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pdfLinks = records.filter(r => /\.pdf$/i.test(r.localUrl)).map(r => `<li><a href="${escape(r.localUrl)}">${escape(path.basename(r.localUrl))}</a></li>`).join('\n');
  await fs.writeFile(path.join(output, 'print-downloads.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atlas PDF downloads</title><body><h1>Atlas prepared PDFs</h1><p><a href="./index.html">Open the full offline atlas</a>. These PDFs open directly without installation.</p><ul>${pdfLinks}</ul></body></html>\n`);
  await fs.writeFile(path.join(output, 'README.md'), `# Life Science Atlas | double-click offline browser edition\n\nUnzip this **entire folder**, then double-click **index.html** in Chrome, Edge, Firefox or Safari on a desktop computer. No Node, terminal, installation, local server, account, cloud service or internet connection is required. Keep offline-assets beside index.html. Do not try to open index.html inside a ZIP preview.\n\nThis is the same retained React research workstation with ${snapshot.profiles.length} profiles across all 11 markets. Hash routes such as index.html#/hub/basel work directly, including navigation, maps, profile drawers, filters, CSV export and prepared print downloads. The API and dataset are embedded in classic inline JavaScript; there are no local JSON fetches or module-script/CORS requirements. The browser content policy blocks all data-network requests and remote imagery/fonts/scripts. External evidence websites require internet only when deliberately opened.\n\n## Retained evidence, not a refreshed census\n\nSnapshot captured ${snapshot.capturedAt}, hash-bound to corrected ${snapshot.correctedSeed.version}. Capture time does not make older accounting periods or site evidence current. Original IDs, sources, dates, image bounds, acquisition-year caveats, analytical overlays and companywide financial scope are retained. Missing evidence remains unknown. Positive operating cash flow is cash provided by operations, not burn or infinite runway. Companywide cash is not local capital or guaranteed lease credit. Frame/evidence filters use explicit membership and evidence on the same site.\n\nAll completed aerial views and saved macro imagery are local. Macro city groups are orientation references, not building pins. Aerial positions retain native raster bounds; baseline address matches and campus references remain distinct. Images are compact full-aspect JPEGs, longest edge at most 1800px, quality 80, with no crop. PDF oversize raster objects are compacted while retaining page dimensions, vector content, text, links and annotations. Original-to-local URLs and transformation/hash receipts are in package-manifest.json. The corrected input snapshot and prior Node editions are not overwritten.\n\nPrepared intelligence single-market and combined PDFs, optional retained Letter maps, and aerial PDFs are in offline-assets/print or linked by print-downloads.html. Browser printing uses the current app's print layout; prepared PDFs are recommended for exact pagination. Browser file downloads may ask permission and mobile OS file-preview apps may not execute embedded JavaScript; prepared PDFs remain directly readable. No original private brochures, credentials, local research paths or private full text are included. This edition is read-only and never refreshes itself.\n`);
  await zipDirectory(output, output + '.zip');
  console.log(`Ready: ${output}\nZIP: ${output}.zip\nEnd-user launch: double-click index.html (no Node or server).`);
} finally { await fs.rm(temp, { recursive: true, force: true }); }

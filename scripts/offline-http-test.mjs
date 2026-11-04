import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supplied = process.argv[2] && path.resolve(process.argv[2]);
const dir = supplied || path.join(root, 'scripts/offline-cache/runtime-proof');
if (!supplied) {
  await fs.mkdir(path.join(dir, 'data'), { recursive: true });
  await fs.copyFile(path.join(root, 'scripts/offline-cache/snapshot.json.gz'), path.join(dir, 'data/snapshot.json.gz'));
  await fs.copyFile(path.join(root, 'scripts/offline-cache/offline-api.mjs'), path.join(dir, 'offline-api.mjs'));
  await fs.copyFile(path.join(root, 'server/offline-start.mjs'), path.join(dir, 'start.mjs'));
  await fs.cp(path.join(root, 'dist/public'), path.join(dir, 'public'), { recursive: true });
}
const port = Number(process.env.ATLAS_TEST_PORT || 8787);
const child = spawn(process.execPath, [path.join(dir, 'start.mjs'), '--port', String(port)], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
const origin = `http://127.0.0.1:${port}`;
const get = (url, options = {}) => fetch(origin + url, options);
let count = 0;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await get('/api/health')).ok; } catch {}
    if (ready) break;
    if (child.exitCode != null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, output); count++;
  for (const route of ['/', '/hub/biotech-beach', '/print/biotech-beach', '/methodology']) {
    const res = await get(route); assert.equal(res.status, 200);
    const html = await res.text(); assert.ok(html.includes('window.__ATLAS_OFFLINE__=true')); assert.ok(res.headers.get('content-security-policy').includes("connect-src 'self'")); count++;
  }
  const config = await get('/api/platform/config.js'); assert.ok((await config.text()).includes('window.__MANUS_CONFIG__={}')); count++;
  const overview = await get('/api/atlas/overview'); assert.equal((await overview.json()).regions.length, 11); count++;
  const profile = await get('/api/atlas/profile/gco_e2dfe3f6013a3ea81210'); const p = await profile.json(); assert.equal(p.facts.find(f => f.key === 'operating_cash_flow').value, 43.094); count++;
  const companies = await get('/api/atlas/companies?region=biotech-beach&frame=beach-torrey-core&evidence=research'); assert.equal((await companies.json()).total, 0); count++;
  const csv = await get('/api/atlas/export.csv?region=biotech-beach&frame=beach-torrey-core&evidence=baseline'); assert.equal(csv.status, 200); assert.ok(csv.headers.get('content-disposition').includes('.csv')); const csvText = await csv.text(); assert.ok(csvText.includes('selected_frame_id')); assert.ok(csvText.includes('beach-torrey-core')); count++;
  for (const [route, options, status] of [['/api/atlas/companies', { method: 'POST', body: '{}' }, 405], ['/api/atlas/companies?limit=999', {}, 400], ['/api/not-supported', {}, 404], ['/assets/not-a-real-file.js', {}, 404], ['/offline-assets/not-a-real-file.pdf', {}, 404]]) {
    const res = await get(route, options); assert.equal(res.status, status); assert.ok(res.headers.get('content-type').includes('application/json')); count++;
  }
  const hostileHost = await new Promise((resolve, reject) => {
    import('node:http').then(({ request }) => { const req = request({ hostname: '127.0.0.1', port, path: '/api/health', headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  });
  assert.equal(hostileHost, 403); count++;
  // Percent-encoded raw dot segments are rejected before URL normalization.
  const raw = await new Promise((resolve, reject) => {
    import('node:http').then(({ request }) => { const req = request({ hostname: '127.0.0.1', port, path: '/%2e%2e/README.md' }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  });
  assert.equal(raw, 400); count++;
  const head = await get('/api/atlas/overview', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal((await head.text()).length, 0); count++;
  const result = { status: 'passed', testedAt: new Date().toISOString(), checks: count, port, bindAddress: '127.0.0.1', runtimeOnlyProof: !supplied, compiledPackage: supplied || null, note: supplied ? 'Final package HTTP/API proof.' : 'Real snapshot and server proof; final integrated client/browser proof remains for package assembly.' };
  await fs.writeFile(path.join(root, 'scripts/offline-http-results.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  child.kill('SIGTERM');
  await new Promise(resolve => { if (child.exitCode != null) resolve(); else child.once('exit', resolve); });
}

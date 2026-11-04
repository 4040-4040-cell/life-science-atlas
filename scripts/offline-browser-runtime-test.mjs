import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--snapshot', '--results'].includes(process.argv[i]) || !process.argv[i + 1]) throw new Error('Usage: node scripts/offline-browser-runtime-test.mjs [--snapshot /absolute/versioned.json.gz] [--results /absolute/results.json]');
  flags.set(process.argv[i], process.argv[i + 1]);
}
const temp = await fs.mkdtemp(path.join(root, 'scripts/.offline-browser-test-'));
const snapshot = JSON.parse(gunzipSync(await fs.readFile(path.resolve(flags.get('--snapshot') || path.join(root, 'scripts/offline-cache/snapshot.json.gz')))));
const calls = [];
globalThis.window = { location: { href: 'file:///tmp/Atlas%20With%20Spaces/index.html' }, fetch: async (...args) => { calls.push(args); return new Response('native'); } };
try {
  await build({ entryPoints: [path.join(root, 'scripts/offline-browser-data.ts')], outfile: path.join(temp, 'data.mjs'), bundle: true, platform: 'browser', format: 'esm', logLevel: 'silent' });
  await build({ entryPoints: [path.join(root, 'server/offline-api.ts')], outfile: path.join(temp, 'api.mjs'), bundle: true, platform: 'browser', format: 'esm', logLevel: 'silent' });
  const { installOfflineBrowserApi } = await import(pathToFileURL(path.join(temp, 'data.mjs')));
  const { createOfflineApi } = await import(pathToFileURL(path.join(temp, 'api.mjs')));
  const expected = createOfflineApi(snapshot);
  installOfflineBrowserApi(snapshot);
  const checked = [];
  const endpoints = ['/overview', '/coverage', ...snapshot.regions.map(r => '/regions/' + r.region.id), '/companies?evidence=baseline&sort=cash&limit=250', '/companies?evidence=research&sort=score&limit=250', '/companies?region=basel&evidence=all&q=roche&sort=name', '/export.csv?region=basel&evidence=baseline'];
  for (const region of snapshot.regions) {
    const frame = region.aerials[0] || region.zones[0];
    if (frame) endpoints.push(`/companies?region=${region.region.id}&frame=${frame.id}&evidence=baseline&limit=250`, `/export.csv?region=${region.region.id}&frame=${frame.id}&evidence=baseline`);
  }
  const target = snapshot.profiles.find(p => /neurocrine/i.test(p.name) && p.kind !== 'reported_research');
  endpoints.push('/profile/' + target.id);
  for (const endpoint of endpoints) {
    const url = new URL(endpoint, 'https://expected.invalid');
    const result = expected.handle(url.pathname, url.searchParams);
    const response = await window.fetch('/api/atlas' + endpoint);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), result.type);
    assert.equal(response.url, 'file:///api/atlas' + endpoint);
    if (result.type.includes('json')) assert.deepEqual(await response.json(), result.body);
    else { assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(result.body)); assert.match(response.headers.get('Content-Disposition'), /life-science-atlas.csv/); }
    checked.push(endpoint);
  }
  for (const [endpoint, status] of [['/profile/missing',404],['/companies?evidence=invalid',400],['/companies?page=0',400],['/companies?q=a&q=b',400],['/companies?frame=missing',400],['/profile/%E0%A4%A',400],['/unknown',404]]) {
    const response = await window.fetch('/api/atlas' + endpoint);
    assert.equal(response.status,status); assert.ok((await response.json()).error.code);
  }
  const post = await window.fetch('/api/atlas/overview',{method:'POST'});
  assert.equal(post.status,405);assert.equal(post.headers.get('Allow'),'GET, HEAD');
  assert.equal(await (await window.fetch('/api/atlas/overview',{method:'HEAD'})).text(),'');
  const before = new AbortController();before.abort();
  await assert.rejects(window.fetch('/api/atlas/overview',{signal:before.signal}),{name:'AbortError'});
  const during = new AbortController(); const promise = window.fetch('/api/atlas/overview',{signal:during.signal});during.abort();
  await assert.rejects(promise,{name:'AbortError'});
  const request = new Request('file:///api/atlas/overview');
  assert.deepEqual(await (await window.fetch(request)).json(),snapshot.overview);
  assert.equal(calls.length,0,'Atlas transport must never use native fetch');
  await window.fetch('https://remote.example/api/atlas/overview');
  await window.fetch('./snapshot.json');
  assert.equal(calls.length,2,'Only local atlas endpoints may be intercepted');
  const result = { passed: true, snapshotCapturedAt: snapshot.capturedAt, correctedSeed: snapshot.correctedSeed, profiles: snapshot.profiles.length, checked, errors: '400/404/405 preserved', abort: 'before and during fetch reject AbortError', csv: 'byte-for-byte parity including source/scope and formula sanitization', nativeFetchCallsForAtlas: 0 };
  await fs.writeFile(path.resolve(flags.get('--results') || path.join(root,'scripts/offline-browser-runtime-results.json')),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally { await fs.rm(temp,{recursive:true,force:true}); }

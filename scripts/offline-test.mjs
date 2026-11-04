import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = process.argv[2] && path.resolve(process.argv[2]);
const modulePath = packageDir ? path.join(packageDir, 'offline-api.mjs') : path.join(root, 'scripts/offline-cache/offline-api.mjs');
const snapshotPath = packageDir ? path.join(packageDir, 'data/snapshot.json.gz') : path.join(root, 'scripts/offline-cache/snapshot.json.gz');
const { createOfflineApi, OfflineApiError } = await import(pathToFileURL(modulePath));
const snapshot = JSON.parse(gunzipSync(await fs.readFile(snapshotPath)));
const api = createOfflineApi(snapshot);
const request = (endpoint, query = '') => api.handle(endpoint, new URLSearchParams(query)).body;
let checks = 0;
const pass = () => checks++;
assert.equal(request('/overview').regions.length, 11); pass();
assert.equal(request('/companies', 'limit=250').total, 1276); pass();
const all = [];
for (let page = 1; page <= 6; page++) all.push(...request('/companies', `limit=250&page=${page}`).items);
assert.equal(new Set(all.map(c => c.id)).size, 1276); pass();
const cfo = request('/profile/gco_e2dfe3f6013a3ea81210').facts.find(f => f.key === 'operating_cash_flow');
assert.equal(cfo.value, 43.094); assert.equal(cfo.asOf, '2026-06-30'); assert.equal(cfo.periodStart, '2026-01-01'); assert.ok(cfo.sourceIds.length > 0); pass();
assert.equal(snapshot.profiles.filter(p => p.priority != null).length, 774); pass();
for (const region of snapshot.regions) {
  for (const frame of region.zones) {
    const accepted = new Set(frame.siteIds);
    for (const evidence of ['all', 'baseline', 'research']) {
      const query = `region=${region.region.id}&frame=${frame.id}&evidence=${evidence}&limit=250`;
      const result = request('/companies', query);
      const ids = new Set(region.sites.filter(s => accepted.has(s.id) && (evidence === 'all' || s.evidence === evidence)).map(s => s.profileId));
      assert.deepEqual(new Set(result.items.map(c => c.id)), ids, `${frame.id}: ${evidence}`); pass();
      const csv = request('/export.csv', query);
      assert.ok(csv.startsWith('\uFEFF')); assert.equal(csv.split('\r\n').length - 2, result.total); pass();
      if (result.items.length) assert.ok(csv.includes(`"${frame.id}","${region.region.id}"`)); pass();
    }
  }
}
for (const [query, code] of [['frame=missing', 'FRAME_REQUIRES_REGION'], ['region=biotech-bay&frame=beach-torrey-core', 'FRAME_REGION_MISMATCH'], ['region=biotech-beach&frame=missing', 'FRAME_NOT_FOUND'], ['limit=999', 'INVALID_QUERY'], ['page=0', 'INVALID_QUERY'], ['evidence=no', 'INVALID_QUERY'], ['unknown=1', 'INVALID_QUERY'], ['q=a&q=b', 'INVALID_QUERY']]) {
  assert.throws(() => request('/companies', query), e => e instanceof OfflineApiError && e.code === code); pass();
}
assert.throws(() => request('/profile/missing'), e => e.code === 'PROFILE_NOT_FOUND'); pass();
const injected = structuredClone(snapshot);
injected.summaries[0].name = '=HYPERLINK("https://example.test")';
const injectedCsv = createOfflineApi(injected).handle('/export.csv', new URLSearchParams()).body;
assert.ok(injectedCsv.includes('"\'=HYPERLINK(""https://example.test"")"')); pass();
if (process.env.ATLAS_TEST_LIVE === '1') {
  for (const query of ['region=biotech-beach&frame=beach-torrey-core&evidence=baseline&limit=250', 'region=genetown&frame=gene-cambridge-kendall-east&evidence=research&limit=250', 'region=basel&frame=basel-allschwil-bachgraben-main-campus&evidence=all&limit=250', 'region=biotech-bay&q=10x&limit=250', 'region=biocapital&evidence=research&priority=High&limit=250']) {
    const response = await fetch(`http://127.0.0.1:3000/api/atlas/companies?${query}`);
    assert.equal(response.status, 200);
    const live = await response.json(); const local = request('/companies', query);
    assert.equal(local.total, live.total);
    assert.deepEqual(new Set(local.items.map(c => c.id)), new Set(live.items.map(c => c.id))); pass();
  }
}
const result = { status: 'passed', checks, testedAt: new Date().toISOString(), profiles: snapshot.profiles.length, markets: snapshot.regions.length, frameEvidenceCombinations: snapshot.regions.reduce((n, r) => n + r.zones.length * 3, 0), correctedPositiveCfo: { profileId: 'gco_e2dfe3f6013a3ea81210', value: cfo.value, unit: cfo.unit, asOf: cfo.asOf, periodStart: cfo.periodStart, sourceIds: cfo.sourceIds }, liveParity: process.env.ATLAS_TEST_LIVE === '1' };
await fs.writeFile(path.join(root, 'scripts/offline-test-results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));

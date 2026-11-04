import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.ATLAS_CAPTURE_ORIGIN || 'http://127.0.0.1:3000';
const origin = new URL(base);
if (!['127.0.0.1', 'localhost'].includes(origin.hostname)) throw new Error('Capture only supports an explicitly local live API.');
const cache = path.join(root, 'scripts/offline-cache');
await fs.mkdir(cache, { recursive: true });
const seedBytes = await fs.readFile(path.join(root, 'data/atlas-seed_V5.json.gz'));
const seedHash = createHash('sha256').update(seedBytes).digest('hex');
const seed = JSON.parse(gunzipSync(seedBytes));
if (seed.companies.length !== 1276) throw new Error('Unexpected corrected profile population. Review the capture bound before changing it.');
async function get(endpoint) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${base}/api/atlas${endpoint}`, { signal: AbortSignal.timeout(90000), headers: { Accept: 'application/json' } });
      if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) throw new Error(`Live capture failed: ${endpoint} (${res.status})`);
      return await res.json();
    } catch (error) { if (attempt === 2) throw error; await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
}
const overview = await get('/overview');
const coverage = await get('/coverage');
const regions = [];
for (const r of seed.regions) regions.push(await get(`/regions/${encodeURIComponent(r.id)}`));
const summaries = [];
for (let page = 1; page <= 6; page++) {
  const data = await get(`/companies?limit=250&page=${page}`);
  if (data.total !== seed.companies.length) throw new Error('Live company population differs from corrected seed.');
  summaries.push(...data.items);
  if (summaries.length >= data.total) break;
}
const known = new Set(seed.companies.map(p => p.id));
if (new Set(summaries.map(s => s.id)).size !== known.size || summaries.some(s => !known.has(s.id))) throw new Error('Live identity set mismatch.');
let cursor = 0, completed = 0;
const profiles = new Array(seed.companies.length);
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < seed.companies.length) {
    const index = cursor++;
    const corrected = seed.companies[index];
    const filename = path.join(cache, `profile-${corrected.id}.json`);
    let live;
    if (process.argv.includes('--reuse')) {
      try { live = JSON.parse(await fs.readFile(filename, 'utf8')); } catch {}
    }
    live ||= await get(`/profile/${encodeURIComponent(corrected.id)}`);
    if (live.id !== corrected.id) throw new Error('Profile identity mismatch.');
    const cfo = corrected.facts.find(f => f.key === 'operating_cash_flow');
    const liveCfo = live.facts.find(f => f.key === 'operating_cash_flow');
    if (cfo?.value != null && JSON.stringify([cfo.value, cfo.unit, cfo.asOf, cfo.periodStart, [...cfo.sourceIds].sort()]) !== JSON.stringify([liveCfo?.value, liveCfo?.unit, liveCfo?.asOf, liveCfo?.periodStart, [...(liveCfo?.sourceIds || [])].sort()])) {
      throw new Error(`Corrected CFO does not match live profile ${live.id}; refusing to package stale financial data.`);
    }
    await fs.writeFile(filename, JSON.stringify(live));
    profiles[index] = live;
    completed++;
    if (completed % 50 === 0) console.log(`Read-only capture: ${completed}/${profiles.length} profiles`);
  }
}));
for (const r of regions) {
  const source = seed.regions.find(s => s.id === r.region.id);
  if (!source) throw new Error('Unexpected region.');
  const ownSites = seed.sites.filter(s => s.regionId === source.id);
  if (JSON.stringify(r.sites.map(s => s.id).sort()) !== JSON.stringify(ownSites.map(s => s.id).sort())) throw new Error(`Site identity mismatch in ${source.id}`);
  for (const frame of [...r.zones, ...r.aerials]) {
    const original = [...seed.zones, ...seed.aerials].find(f => f.id === frame.id && (('imageUrl' in f) === ('imageUrl' in frame)));
    if (!original || JSON.stringify([...frame.siteIds].sort()) !== JSON.stringify([...original.siteIds].sort())) throw new Error(`Source-safe frame membership changed: ${frame.id}`);
  }
}
const snapshot = { format: 1, capturedAt: new Date().toISOString(), correctedSeed: { version: seed.version, sha256: seedHash }, overview, coverage, regions, summaries, profiles };
const output = path.join(cache, 'snapshot.json.gz');
await fs.writeFile(output, gzipSync(JSON.stringify(snapshot), { level: 9 }));
console.log(`Completed ${profiles.length} profiles, ${regions.length} regions. ${output}`);

import { readFile } from 'node:fs/promises';
import { cleanText, prepareCantonCompanion, sha256, validateDocumentHash, validateSourceRefs } from '../server/atlas/canton-detail/contract';
import type { BaselCantonCompanion } from '../shared/baselCantonDetail';

type RecordValue = Record<string, unknown>;
const object = (v: unknown): RecordValue => v && typeof v === 'object' && !Array.isArray(v) ? v as RecordValue : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const input = process.argv[2]; const offline = process.argv[3];
if (!input) throw new Error('Usage: tsx scripts/verify-basel-canton-detail.ts INPUT [OFFLINE_COMPANION] [VERSION]');
async function main() {
  const bytes = await readFile(input); const raw = JSON.parse(bytes.toString('utf8')) as unknown;
  const sourceHash = sha256(bytes);
  const loaded: BaselCantonCompanion | undefined = offline ? JSON.parse(await readFile(offline, 'utf8')) : undefined;
  const prepared = prepareCantonCompanion(raw, process.argv[4] ?? loaded?.version ?? 'V1', '2026-11-04', sourceHash);
  const companion: BaselCantonCompanion = loaded ?? prepared;
  if (companion.sourceHash !== sourceHash) throw new Error('Companion source-byte hash mismatch');
  if (JSON.stringify(companion) !== JSON.stringify(prepared)) throw new Error('Companion differs from exact normalized source');
  const sourceIndex = new Map<string, RecordValue>();
  function gather(v: unknown): void {
    if (Array.isArray(v)) v.forEach(gather);
    else for (const [key, x] of Object.entries(object(v))) {
      if (key === 'sources') array(x).forEach(s => sourceIndex.set(String(object(s).id), object(s))); else gather(x);
    }
  }
  gather(raw);
  const withheld = new Set([...sourceIndex.values()].filter(s => /private|internal|restricted|confidential/i.test(String(s.visibility))).map(s => s.url).filter((v): v is string => typeof v === 'string'));
  function leaves(v: unknown, path = ''): { path: string; value: unknown }[] {
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'string' && withheld.has(v)) return [];
      return [{ path, value: typeof v === 'string' ? cleanText(v) : v }];
    }
    return Object.entries(v).flatMap(([key, x]) => /path$/i.test(key) ? [] : leaves(x, `${path}.${key}`));
  }
  const failures: unknown[] = []; let auditedRecords = 0; let auditedAttributes = 0;
  for (const [key, canton] of Object.entries(object(object(raw).cantons))) {
    const doc = companion.documents[key as keyof typeof companion.documents];
    for (const rawCluster of array(object(canton).clusters)) {
      const c = object(rawCluster); const normalized = doc.clusters.find(n => n.id === c.id);
      if (!normalized) throw new Error(`Missing cluster ${c.id}`);
      for (const section of ['companySites', 'institutions', 'propertyEvidence', 'datedActions', 'metrics'] as const) {
        const originals = array(c[section]); const records = normalized[section];
        if (originals.length !== records.length) failures.push({ cluster: c.id, section, kind: 'count_mismatch' });
        originals.forEach((row, i) => {
          auditedRecords++;
          const pool = new Set(leaves(records[i]).map(x => JSON.stringify(x.value)));
          leaves(row).forEach(leaf => { auditedAttributes++; if (!pool.has(JSON.stringify(leaf.value))) failures.push({ cluster: c.id, section, row: i, field: leaf.path }); });
        });
      }
    }
  }
  const publicSourceIds = new Set(Object.values(companion.documents).flatMap(d => d.sources.map(s => s.id)));
  for (const id of sourceIndex.keys()) if (!publicSourceIds.has(id)) failures.push({ kind: 'missing_public_source_label', id });
  for (const d of Object.values(companion.documents)) {
    if (!validateDocumentHash(d)) failures.push({ kind: 'invalid_document_hash', cantonId: d.cantonId });
    validateSourceRefs(d, new Set(d.sources.map(s => s.id)));
  }
  if (failures.length) { console.error(JSON.stringify({ sourceHash, auditedRecords, auditedAttributes, failures }, null, 2)); process.exitCode = 1; return; }
  console.log(JSON.stringify({ sourceHash, immutableCompanionVerified: Boolean(offline), auditedRecords, auditedAttributes, missingAttributes: 0, inputSources: sourceIndex.size, publicSources: publicSourceIds.size, documentHashes: Object.values(companion.documents).map(d => ({ cantonId: d.cantonId, contentHash: d.contentHash })) }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'Canton verification failed'); process.exitCode = 1; });

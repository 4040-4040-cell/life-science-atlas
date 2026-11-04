import { and, desc, eq } from 'drizzle-orm';
import type { BaselCantonDocument, BaselCantonId } from '../../../shared/baselCantonDetail';
import { BASEL_CANTONS } from '../../../shared/baselCantonDetail';
import { getAtlasDb } from '../connection';
import { AtlasError } from '../validation';
import { atlasCantonResearchDocuments as table } from './schema';
import { validateDocumentHash, validateSourceRefs } from './contract';

export function parseCantonId(value: unknown): BaselCantonId {
  if (typeof value !== 'string' || !Object.hasOwn(BASEL_CANTONS, value)) throw new AtlasError(404, 'CANTON_NOT_FOUND', 'Choose Basel-Stadt or Basel-Landschaft.');
  return value as BaselCantonId;
}
export async function getCantonDocument(cantonId: BaselCantonId, version?: string): Promise<BaselCantonDocument> {
  if (version && !/^[A-Za-z0-9_.:-]{1,191}$/.test(version)) throw new AtlasError(400, 'INVALID_VERSION', 'Invalid document version.');
  const rows = await getAtlasDb().select().from(table).where(and(eq(table.cantonId, cantonId), version ? eq(table.version, version) : undefined)).orderBy(desc(table.asOf), desc(table.createdAt), desc(table.version)).limit(1);
  const row = rows[0];
  if (!row) throw new AtlasError(503, 'CANTON_DETAIL_NOT_READY', 'This canton research document has not been imported. No code fallback is served.');
  const d = row.payload;
  if (d.id !== row.id || d.cantonId !== cantonId || d.version !== row.version || d.sourceHash !== row.sourceHash || d.contentHash !== row.contentHash || !validateDocumentHash(d)) throw new AtlasError(503, 'CANTON_INTEGRITY_FAILURE', 'The immutable research document failed validation.');
  try { validateSourceRefs(d, new Set(d.sources.map(s => s.id))); } catch { throw new AtlasError(503, 'CANTON_SOURCE_FAILURE', 'The research source references failed validation.'); }
  return d;
}
export async function listCantonVersions(cantonId: BaselCantonId) {
  return getAtlasDb().select({ id: table.id, cantonId: table.cantonId, version: table.version, asOf: table.asOf, sourceHash: table.sourceHash, contentHash: table.contentHash }).from(table).where(eq(table.cantonId, cantonId)).orderBy(desc(table.asOf), desc(table.createdAt), desc(table.version));
}

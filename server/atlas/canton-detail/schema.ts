import { index, json, mysqlTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import type { BaselCantonDocument } from '../../../shared/baselCantonDetail';

export const atlasCantonResearchDocuments = mysqlTable('atlas_canton_research_documents', {
  id: varchar('id', { length: 191 }).primaryKey(),
  cantonId: varchar('canton_id', { length: 64 }).notNull(),
  version: varchar('version', { length: 191 }).notNull(),
  sourceHash: varchar('source_hash', { length: 64 }).notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  asOf: varchar('as_of', { length: 64 }).notNull(),
  payload: json('payload').$type<BaselCantonDocument>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, t => [uniqueIndex('atlas_canton_doc_version_idx').on(t.cantonId, t.version), index('atlas_canton_doc_latest_idx').on(t.cantonId, t.asOf, t.createdAt)]);

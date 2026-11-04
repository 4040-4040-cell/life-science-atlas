-- Additive, immutable source-safe research layer. Existing company/site tables are untouched.
CREATE TABLE IF NOT EXISTS atlas_canton_research_documents (
  id varchar(191) NOT NULL PRIMARY KEY,
  canton_id varchar(64) NOT NULL,
  version varchar(191) NOT NULL,
  source_hash varchar(64) NOT NULL,
  content_hash varchar(64) NOT NULL,
  as_of varchar(64) NOT NULL,
  payload json NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY atlas_canton_doc_version_idx (canton_id, version),
  KEY atlas_canton_doc_latest_idx (canton_id, as_of, created_at)
);

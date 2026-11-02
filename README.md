# Life Science Atlas

A private-preview life-science CRE research workstation with regional comparison, interactive hub maps, completed aerial studies, source-aware company profiles and a persistent managed MySQL back end. The implementation follows the approved `plan.md` and retains the original V6 company baseline, separately labeled imported research and completed aerial work. It is not a complete company census or a published public website.

## Run and maintain

Use `pnpm dev` for the port configured by the project, currently 3000. `pnpm check`, `pnpm test` and `pnpm build` run the application checks and production build. The production container runs `pnpm start`; durable application data lives in managed MySQL and assets in project storage, not container-local files. API health is `/api/health` and read-only research endpoints are under `/api/atlas`.

Apply committed additive migrations with `pnpm db:migrate`. Reconstruct the imported dataset only with the versioned seed command, using the actual seed edition documented in `data/seed-counts.json` and the latest checkpoint. The checked-in compressed seed contains full source-safe profiles and metadata; plain JSON working copies and duplicate image files stay local. The seed importer accepts an explicit `--input` path and does not overwrite existing company/site records or silently fall back to memory. Development and publication share the database. Never truncate tables to reseed.

The final evidence edition is `data/atlas-seed_V4.json.gz`. Use `pnpm exec tsx scripts/seed-atlas.ts --migrate --input data/atlas-seed_V4.json.gz --aerial-georef data/aerial-georef_V1.json` for a fresh or guarded repeat import. It retains all original clinical program IDs, original financing-amount scope and actual raster bounds. Read the importer result; a conflicting prior value is a blocking issue, not permission to overwrite it.

## Evidence and data grain

Companies, corporate parents, physical sites, regional memberships, metric observations, sources, events, aerial views and ingestion versions are stored separately. Global financial values retain their accounting period, unit and scope. Companywide cash is not local capital or a lease guaranty. Imported records and priorities remain reported/unverified observations, including when their names link exactly to a baseline company. Unknown does not mean zero or Hold.

City-gazetteer coordinates are macro reference locations, not building pins. Source-address and official address-point matches are not verified company suites or tenancy. Only accepted baseline address points appear in the aerial overlays. Analytical view frames can overlap; they are not formal JLL submarket boundaries. Preserve imagery attribution and capture-date caveats, including unconfirmed Swiss WMS acquisition dates.

## Structure and privacy

The React client is under `client/src`, public route declarations under `client/public`, REST queries and validation under `server/atlas`, persistent schema/migrations under `drizzle`, and import/integrity helpers under `scripts`. `shared/atlas.ts` is the browser/API contract. Source preparation reads the original research workspace but the running app reads managed MySQL. The original private JLL brochures are not included. Public payloads do not expose local paths, credentials or internal document contents.

Application publication is separate from saving a checkpoint. This approved build is delivered in private Preview; no unattended refresh job or public release is configured.

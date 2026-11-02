# Life Science Atlas

A private-preview life-science CRE research workstation with regional comparison, interactive hub maps, completed aerial studies, source-aware company profiles and a persistent managed MySQL back end. The implementation follows the approved `plan.md` and retains the original V6 company baseline, separately labeled imported research and completed aerial work. It is not a complete company census or a published public website.

## Run and maintain

Use `pnpm dev` for the port configured by the project, currently 3000. `pnpm check`, `pnpm test` and `pnpm build` run the application checks and production build. The production container runs `pnpm start`; durable application data lives in managed MySQL and assets in project storage, not container-local files. API health is `/api/health` and read-only research endpoints are under `/api/atlas`.

Apply committed additive migrations with `pnpm db:migrate`. Reconstruct the imported dataset only with the versioned seed command, using the actual seed edition documented in `data/seed-counts_V5.json` and the latest checkpoint. The checked-in compressed seed contains full source-safe profiles and metadata; plain JSON working copies and duplicate image files stay local. The seed importer accepts an explicit `--input` path and does not overwrite existing company/site records or silently fall back to memory. Development and publication share the database. Never truncate tables to reseed.

The current corrective evidence edition is `data/atlas-seed_V5.json.gz`, with its hash-bound `data/financial-corrections_V5.json`. Fresh restoration uses `pnpm exec tsx scripts/seed-atlas.ts --migrate --input data/atlas-seed_V5.json.gz --financial-corrections data/financial-corrections_V5.json --aerial-georef data/aerial-georef_V1.json`. For an existing database with migrations already applied, use `pnpm exec tsx scripts/seed-atlas.ts --input data/atlas-seed_V5.json.gz --financial-corrections data/financial-corrections_V5.json`. No service restart, reset or table truncation is required.

V5 preserves every V4 fact except 91 source-backed operating-cash-flow values and their erroneous cash-use notes. Signed cash use is the inverse of signed CFO: conversion is `-cash_use`, never `-abs(cash_use)`; native CFO fields keep their original sign. Sources, accounting periods, cash-only values, null runway, original clinical facts, financing scope, model overlays and raster bounds remain unchanged. Positive CFO is cash provided by operations, not burn; it does not imply an infinite runway or a lease guaranty.

On upgrade, the importer appends financial observations only when the full expected original and current fact (including value, unit, period, source IDs and notes), retained original evidence, and source records match the reviewed manifest. A mismatch returns `SKIP_CLIENT_EDITS` and is not permission to overwrite. Inspect `financialCorrectionsAdded` and `financialSkips`; an identical completed version is a no-op. Skips are intentional preservation of client changes. Never alter a completed version to force a retry; review a new corrective version instead.

The reproducible V4-to-V5 finalizer is `python3 scripts/finalize_seed_v5.py`. It verifies the bounded audit against retained native SEC USD facts and refuses to overwrite existing outputs. To reproduce alongside the immutable release, use `python3 scripts/finalize_seed_v5.py --output /tmp/atlas-seed_V5-reproduced.json --manifest /tmp/financial-corrections_V5-reproduced.json`. It requires the retained audit and SEC cache in the original research workspace; the normal restore command above does not. For future upstream rebuilds, copy the archived builder to a new working filename and apply `data/builder-cfo-sign_V1.patch` there; point the next-version orchestrator at that corrected copy. Never edit the archived V5/V6 builders, old cards or the correct signed cash-use ledger. Recheck native SEC source, USD units, accession and period before issuing any next-version app seed.

## Evidence and data grain

Companies, corporate parents, physical sites, regional memberships, metric observations, sources, events, aerial views and ingestion versions are stored separately. Global financial values retain their accounting period, unit and scope. Companywide cash is not local capital or a lease guaranty. Imported records and priorities remain reported/unverified observations, including when their names link exactly to a baseline company. Unknown does not mean zero or Hold.

City-gazetteer coordinates are macro reference locations, not building pins. Source-address and official address-point matches are not verified company suites or tenancy. Only accepted baseline address points appear in the aerial overlays. Analytical view frames can overlap; they are not formal JLL submarket boundaries. Preserve imagery attribution and capture-date caveats, including unconfirmed Swiss WMS acquisition dates.

## Structure and privacy

The React client is under `client/src`, public route declarations under `client/public`, REST queries and validation under `server/atlas`, persistent schema/migrations under `drizzle`, and import/integrity helpers under `scripts`. `shared/atlas.ts` is the browser/API contract. Source preparation reads the original research workspace but the running app reads managed MySQL. The original private JLL brochures are not included. Public payloads do not expose local paths, credentials or internal document contents.

Application publication is separate from saving a checkpoint. This approved build is delivered in private Preview; no unattended refresh job or public release is configured.

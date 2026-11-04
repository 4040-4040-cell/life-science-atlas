# Life Science Atlas

A life-science commercial-real-estate research workstation across the requested regional hubs. It includes interactive company and site views, a persistent managed MySQL back end, source-aware profiles, a primary research-area comparison, dated physical-space actions and the retained granular aerial studies. Source-supported profiles, imported candidates, institutional references and planned projects remain distinct. This is not an exhaustive company census or a lease-credit opinion.

## Use the finished product

Open a hub in the managed Preview. **Market intelligence** opens its takeaway, coverage measures, analytical research-area comparison and linked company profiles. Clicking an area lists both its primary assigned companies and other retained physical-site operators. Parent financials are not reassigned to an outside plant.

**Print this market** opens a dedicated one-page intelligence sheet with no navigation, interactive matrix or profile drawer. Use **17 × 11 inch Tabloid, landscape**. Letter paper requires “Fit to page” and reduces the type size; a simpler legacy Letter map remains separately downloadable. The prepared market PDF fixes pagination. The directory offers the combined one-page-per-market intelligence PDF and a desktop offline download.

The current **double-click offline browser edition** needs no Node, installation, terminal, account, hosted database or local server. Extract the entire ZIP, then open **index.html** in a desktop browser. Keep **offline-assets** beside the file. Do not open the HTML inside a ZIP preview. Maps, the research dataset, profiles, filters, CSV exports and print assets are local. External source websites require internet only when deliberately opened. Mobile file-preview apps may not execute the application; the PDF sheets remain directly readable on an iPhone.

The earlier Node-based offline editions remain archived. They are not the default final download.

## Evidence and the corrected source edition

The current research snapshot is V6, captured on 4 November 2026. Capture time does not refresh an older accounting period or confirm tenancy. Company, parent, regional membership, physical site, fact observation, event and source identities are stored separately.

V6 adds the three source-supported current Fricktal plants and a separate unlocated Bachem Sisslerfeld planned project. It qualifies the disputed Basel residency evidence, preserves acquired operating businesses without inventing closures, and corrects the source-backed Bay Area status flags. The Fricktal sites have no invented address pins. Its operating-site count is separate from its address-match count and from a parent's primary headquarters assignment.

The V6 cash corrections use exact source-identified consolidated cash-and-equivalents lines, native USD units, actual filing periods and accession URLs. Combined investments or restricted-cash concepts are not blanket substitutes. A historical or undated retained balance is warned visibly; missing evidence is not zero. Positive operating cash flow remains cash provided by operations, not burn or an infinite runway. Global reporting-entity cash is not local capital or guaranteed lease credit. Cross-hub company memberships and cash totals are not additive.

The analyst tiers preserve the retained model assumptions, not credit ratings. Unscored companies remain visible. City locations, campus references and source-address matches are not interchangeable with verified occupied suites. Analytical frames can overlap and are not formal JLL submarket boundaries. Imagery attribution, capture vintage and unknown-date caveats remain with each view.

## Run and restore the managed application

`pnpm dev` uses the configured project port, currently 3000. `pnpm check`, `pnpm test`, `pnpm exec vitest run --config client/vitest.config.ts` and `pnpm build` run the checks and production build. The production container uses `pnpm start`. Durable data is in managed MySQL and project storage, not container-local files. Health is `/api/health`; read-only research endpoints are under `/api/atlas`.

For a fresh restoration, seed the preserved V5 predecessor and then apply the guarded V6 upgrade:

```sh
pnpm exec tsx scripts/seed-atlas.ts --migrate --input data/atlas-seed_V5.json.gz --financial-corrections data/financial-corrections_V5.json --aerial-georef data/aerial-georef_V1.json
pnpm exec tsx scripts/import-presence-cash-v6.ts
```

V6's immutable source is `data/atlas-seed_V6.json.gz`; its correction witnesses are `data/presence-cash-corrections_V6.json`. The upgrade records complete before/after witnesses, appends observations and audits materialized site and membership changes. It applies preferred display only when expected old values and source identity agree. An edited client record is skipped, not overwritten. An identical completed version is a no-op. Development and publication share the database. Never truncate tables or alter a completed version to force a retry.

The V5 predecessor preserves the signed operating-cash-flow correction. Cash use is the inverse of signed CFO, `-cash_use`, never `-abs(cash_use)`. Prior source facts, clinical programs, financing scope, model observations and raster bounds are retained.

## Reproduce the offline browser and print files

`client/src/lib/marketPrintAssetsV2.json` and `marketIntelligence.json` are safe public manifests. Earlier Letter assets remain in `marketPrintAssets.json`. The print production sources are retained in the versioned intelligence-source archive; the application does not depend on that original research workspace at runtime.

The file-browser assembler bundles the actual React application and the pure read-only API in classic inline JavaScript, rather than requiring local JSON fetches or module scripts. Its source capture is hash-bound to the corrected V6 seed. It resolves media from the retained local cache and refuses missing assets rather than silently downloading replacements:

```sh
node scripts/offline-browser-package.mjs --output /absolute/new-edition --print-dir /absolute/intelligence/output --snapshot scripts/offline-cache/snapshot_V6.json.gz
python3 scripts/proof-offline-file-browser.py --package /absolute/new-edition --output /absolute/new-proof-directory
```

Never overwrite a previous delivery. The assembler retains attribution and full image aspect ratios, compacts large raster objects without changing PDF page dimensions or links, and includes transformation hashes in the package manifest. Private brochures, credentials and local source paths are not included. The offline edition is read-only and does not automatically update itself.

## Structure and delivery boundaries

The React client is under `client/src`; page declarations are under `client/public`. REST validation and queries are under `server/atlas`; persistent schema is under `drizzle`; source ingestion, packaging and integrity helpers are under `scripts`. `shared/atlas.ts` is the browser/API contract. Production source data is reconstructable from the committed compressed snapshots and guarded correction manifests.

Saving a canonical source version is separate from publishing a website. The current website remains a private Preview unless publication is explicitly approved. There is no unattended refresh or public release configured. Runtime/API checks are not visual certification: final delivery requires the actual print and offline-file browser proofs and the applied product/design reviews.

## Corrected Basel register release

Basel register V1 is complete as of 4 November 2026. The read-only endpoint is `GET /api/atlas/registers/basel-availability`; the same immutable data is embedded in the no-install offline browser edition V9. It preserves all 245 supplied company observations and 95 supplied property observations, adds 122 individually reviewed space observations, and separates supported operations, official contacts, campus residents, legal-register-only leads and unresolved records. It is not an independently exhaustive company or vacancy census.

Measured selected current marketed offers are 16,429.5 m² in Basel-Stadt and 20,646 m² in Basel-Landschaft, with mixed uses and explicit source dates. The measured future offer is ALL, 5,100 m² from 2027. Campus/building stock, overlapping offers, SCALE and HOPE capacity ceilings, expired Muttenz marketing and confirmed laboratory vacancy are not added to these measures. Confirmed vacancy remains unknown. The regional JLL laboratory leasing forecast is not canton absorption or a years-supply denominator.

Final print edition V4 contains 11 regional sheets plus the two corrected canton sheets, each one Tabloid landscape page. Previous print/book editions remain retained as historical evidence. New PDFs and register CSVs are bound by `scripts/bind-basel-register-release-v1.py`. Final client manifests are `marketPrintAssetsV4.json` and `baselCantonPrintAssetsV5.json`. The offline folder opens by double-clicking `index.html` on a desktop browser; iPhone file previews may not execute the app, so use the published website or PDFs there. Full offline package includes saved imagery and detailed study books and is approximately 414 MB.

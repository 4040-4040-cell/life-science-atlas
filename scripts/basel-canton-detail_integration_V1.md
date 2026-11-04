# Basel canton detail integration V1

Prepared against `basel_canton_detail_brief_V1.md`, including the building-level clarification. Final researched JSON and new aerial metadata are not imported yet. No research, polling, shared browser/server interaction, master edits, commit or publication was performed by this implementation subtask.

## Owned files

- `shared/baselCantonDetail.ts`: public DTOs, not a global company master.
- `client/src/pages/BaselCantonDetail.tsx` and `.css`: complete evidence page.
- `client/src/components/atlas/BaselCantonAerial.tsx`: labeled, uncropped retained aerials.
- `client/src/lib/baselCantonDetail.ts`: live persistent query, explicit offline companion and region bridge, uncapped inventory filtering.
- `server/atlas/canton-detail/{contract,schema,repository,router}.ts`: normalized source-safe documents, immutable storage, hash validation and read-only endpoints.
- `drizzle/migrations/0004_atlas_canton_research_documents.sql`: isolated additive table.
- `scripts/import-basel-canton-detail.ts`: source-hash-bound prepare/import CLI.
- `server/atlas/canton-detail/contract.test.ts`: source, identity, geography and no-cap regressions.

Existing integration files were intentionally not edited.

## Live React hook

In `client/src/App.tsx`, import the new page and add **two explicit routes**, before the fallback. They use the existing profile drawer callback:

```tsx
import BaselCantonDetail from './pages/BaselCantonDetail';

<Route path="/canton/basel-stadt">
  <BaselCantonDetail cantonId="basel-stadt" onCompany={setCompanyId} />
</Route>
<Route path="/canton/basel-landschaft">
  <BaselCantonDetail cantonId="basel-landschaft" onCompany={setCompanyId} />
</Route>
```

Use explicit routes rather than casting an arbitrary route string to a canton ID. Add navigation links on the Basel hub/intelligence page only:

```tsx
<Link className="button button-small" href="/canton/basel-stadt">Basel-Stadt detail</Link>
<Link className="button button-small" href="/canton/basel-landschaft">Basel-Landschaft detail</Link>
```

Add both page paths/titles to `client/public/manus-routes.json`. The page itself links between cantons and back to `/hub/basel`. It has the requested six industry sections. Clicking an existing company opens the shared drawer; additional `companyId: null` operators open meaningful source-detail dialogs, not baseline profiles.

## Live API hook

In `server/atlas/router.ts`, import the new router and mount it **before the existing final 404 handler**:

```ts
import { cantonDetailRouter } from './canton-detail/router';
atlasRouter.use('/canton-detail', cantonDetailRouter);
```

Endpoints:

- `GET /api/atlas/canton-detail/basel-stadt`
- `GET /api/atlas/canton-detail/basel-landschaft`
- Either document endpoint accepts one `?version=V1` argument.
- `GET /api/atlas/canton-detail/:cantonId/versions`

GET/HEAD only; no code/JSON fallback in live mode. An absent document or failed database/hash validation returns an explicit unavailable state. Version listing includes ID, dates and source/content hashes, not raw source data. The isolated schema works with `getAtlasDb()` without altering its global schema or the existing masters. The importer applies its own migration; do not use `db:push` as a substitute.

## Final JSON preparation and import

Expected factual input is `{clusters: [...]}` or the brief's cluster array. The normalizer also accepts `records` or a `cantons` object containing cluster arrays. Each cluster follows the common brief contract. Unknown generated TypeScript object inference is not used.

Do not run these until the parent confirms the final JSON and aerial metadata are ready. Compute the exact final file-byte SHA-256 and explicitly supply it:

```sh
cd /home/ubuntu/bioatlas
INPUT=/home/ubuntu/life-science-atlas/market_intelligence_V2/data/baselCantonDetail_V1.json
HASH=$(sha256sum "$INPUT" | cut -d' ' -f1)
pnpm exec tsx scripts/import-basel-canton-detail.ts \
  --input "$INPUT" --sha256 "$HASH" --version V1 --as-of 2026-11-04 \
  --mode prepare --offline-out data/baselCantonDetail_offline_V1.json
```

Preparation is read-only with respect to the DB. It writes only a new source-safe companion, never raw private research, and refuses different content at an existing output path. Then, once reviewed and all supplied aerial IDs are present in the persistent Basel aerial table:

```sh
pnpm exec tsx scripts/import-basel-canton-detail.ts \
  --input "$INPUT" --sha256 "$HASH" --version V1 --as-of 2026-11-04 \
  --mode import --offline-out data/baselCantonDetail_offline_V1.json
```

Import validates the exact input-byte hash, duplicate source IDs against their complete raw source records, every source-ID reference, BS/BL municipalities, global company IDs, retained site IDs/ownership and retained Basel aerial IDs. It stores both documents in one transaction in `atlas_canton_research_documents`, with per-document public content hashes. Only INSERTs to the new research table are used. No updates/deletes or new company/site master rows occur. An identical repeat is skipped; different content under the same version is rejected.

Preserve every final companySites row. Source-linked campus/residency references and unresolved leads remain accessible through the address-evidence filter. A verified physical address requires explicit source-supported/primary/verified address evidence, an actual address and exact source IDs. The normalizer does not promote residency listings to suites. Property areas retain their reported area basis and are never converted into occupied/leased/available area. Dates and evidence states remain apparent; historical marketing is not current vacancy. Numeric metrics/property areas without source IDs are rejected.

The importer requires supplied new aerial metadata to be imported first. This subtask intentionally does not add or alter the global aerial master. Unknown IDs fail explicitly rather than being silently dropped or assigned to another image.

## File-only offline hook

The existing offline entry deletes `window.__ATLAS_BROWSER_SNAPSHOT__` after installation. Aerial metadata therefore needs the bridge below **before that deletion**, not a later server request. `useCantonDocument` reads its companion directly; in explicit offline mode it never calls the persistent endpoint.

In `scripts/offline-browser-entry.tsx`:

```ts
import { installBaselCantonOffline } from '../client/src/lib/baselCantonDetail';

// After obtaining snapshot and setting __ATLAS_OFFLINE__, before deleting the global:
const cantonCompanion = window.__ATLAS_CANTON_DOCUMENTS__;
if (cantonCompanion) {
  installBaselCantonOffline(
    cantonCompanion,
    snapshot.regions.find(r => r.region.id === 'basel')
  );
}
```

In the **new version** of the offline packager, read `data/baselCantonDetail_offline_V1.json`, verify its `sourceHash` against the final research JSON hash/receipt and its document hashes, then embed it next to the existing snapshot using the packager's safe classic-script escaping:

```js
const cantonCompanion = JSON.parse(await fs.readFile(path.join(root, 'data/baselCantonDetail_offline_V1.json'), 'utf8'));
const cantonData = remap(JSON.stringify(cantonCompanion));
// Initial inline script, before app.js runs:
window.__ATLAS_CANTON_DOCUMENTS__ = /* safeScript(cantonData) */;
```

The actual insertion is `${safeScript(cantonData)}` within the generated inline script. Include the companion in the packaging manifest with sourceHash and embedded hash. If choosing a compiled JSON import instead, it is permitted only in the explicit offline entry, **not** the live page or server query. Pass it through `installBaselCantonOffline(companion, baselRegion)` before snapshot deletion.

The region bridge uses the existing offline snapshot's retained aerial DTOs and remapped local image URLs. Append new supplied aerial DTOs to a **new source-safe offline snapshot/version** before packaging, preserving `imageBounds`, `bounds`, source IDs and capture caveats; do not overwrite V6. The same IDs must appear in the live `/api/atlas/regions/basel` response. No URL downloads or new client-side global company master are required by this page. Local `./offline-assets/` is accepted only under the existing explicit offline-mode guard.

The current offline entry already intercepts section anchors and preserves hash routing. Keep that behavior when adding the two routes. External source links are deliberate links only; no automatic external data, map, script or font requests are made by the new page in offline mode.

## Checks and pending work

`pnpm check` passed after implementation. Fourteen contract tests passed with the existing Vitest configuration. No final dataset import or final factual page certification is claimed before the parent supplies the completed research file. Run prepare on that file, inspect any strict source/geography/address classification failures, then import and perform parent-owned full integration checks. No shared Preview interactions were used.

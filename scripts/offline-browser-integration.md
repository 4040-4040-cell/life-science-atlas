# Browser-only offline edition integration

The assembler and entry are new files; existing App, views and maps remain parent-owned.

Required hooks in parent-owned code:

1. `safeUrl` and `offlineAssetUrl` must accept strictly validated **`./offline-assets/...`** paths, only when `isAtlasOffline()` is true. Reject decoded dot/parent segments, backslashes, controls, encoded delimiters and malformed escapes. Keep ordinary HTTP source links intentional. The browser assembler converts storage asset URLs to these package-relative paths.
2. Existing offline map wrappers stay unchanged: the entry sets `window.__ATLAS_OFFLINE__ = true` before mounting.
3. Internal routes should use wouter `<Link>` / `useLocation` (not raw `/hub/...` anchors). Entry wraps App in `<Router hook={useHashLocation}>`; routes therefore resolve as `index.html#/hub/basel`. Print/document file links remain ordinary `./offline-assets/...` anchors.
4. New intelligence views/data can import ordinary JSON and CSS: the assembler reads and bundles the current App at assembly time. Any `/manus-storage/...` image/PDF/ZIP URLs in those imports must have a file in supplied `--print-dir`, or in `data/asset-transfer.json`; missing files fail the assembly. Public URL hashes immediately before an extension are removed when matching print filenames.
5. The old hosted self-ZIP link is removed in the bundle, while the live app stays untouched.

Final assembly (choose a never-before-used output version):

```sh
node scripts/offline-browser-package.mjs --output /home/ubuntu/life-science-atlas/offline_browser_atlas_V1 --print-dir /home/ubuntu/life-science-atlas/market_intelligence_V2/output
```

End users only unzip the whole folder and double-click `index.html`; Node is a build-time tool, never a user runtime requirement. No module script, local JSON fetch, CDN script/font, hosted API or local server is used.

Implementation notes discovered during actual file work:

- Installed wouter 3.7's official hash navigator constructs `new URL(..., location.origin)`, which fails when file origin is `null`. The new entry uses the official `useHashLocation` subscription/hrefs and a file-safe history/hashchange navigator adapter. No App hook is needed.
- The hosted matrix export is a raw API anchor. The entry delegates `/api/atlas/export.csv?...` clicks to the embedded API, then creates a Blob download. No CompanyMatrix edit is needed. The skip link is handled without changing the hash route.
- Current provisional assembly succeeds against the existing Letter print workspace. Actual final intelligence assembly remains required after the parent updates the print manifest/print files and relative-asset guards.

Parent authorization received: `client/src/lib/offlineAtlas.ts` now accepts strictly guarded relative `./offline-assets/...` **only in explicit offline mode**, preserving guarded rooted paths for the old Node edition. Parent's `safeUrl` remaining minimal hook:

```ts
// Import offlineAssetUrl from './offlineAtlas'; before other URL branches:
if (url.startsWith('./offline-assets/')) return offlineAssetUrl(url);
```

Hold final assembly until parent signals the Fricktal/site-flag intelligence upgrade and final V2 print manifest/files. Current proof edition is preliminary, not final content certification. `scripts/proof-offline-file-browser.py --package /new/package --output /new/versioned/proof` provides the actual no-HTTP file proof. `scripts/offline-browser-runtime-test.mjs` compares API and encoded CSV byte parity, status errors and abort behavior against the retained V5 snapshot.

The authorized helper passed checks for offline-only acceptance, literal/encoded/double-encoded parent traversal, encoded `/` and `\\`, null/control characters, malformed escapes and empty/dot path segments. Existing `safeUrl` still needs its parent hook until confirmed. New transport checks passed 24 exact endpoints, all 11 regional responses, same-site frame/evidence filters, encoded CSV byte parity, read-only 405, invalid-query 400, missing-record 404, and both pre-aborted and in-flight abort rejection.

## Runtime proof completed; final content proof still required

Actual Chromium `file://` proof passed in `assets/offline-file-browser-proof_V3/offline-file-browser-proof.json` against preliminary package `offline_browser_atlas_proof_V2`: 11 hubs/maps/matrices, 125 saved macro/aerial/exhibit image decodes, all three deep aerial flows including real overlap → filter changes, four site/profile checks, three positive CFO displays with scope/period, three Blob CSV downloads, 11 one-page **prior Letter** print routes, and intelligence hash navigation. Zero HTTP(S) requests, zero page errors. The preliminary archive is 114,506,681 bytes. The three aerial PDFs decreased from 130,278,104 to 40,838,833 bytes while retaining all 523 links (no annotations were present in originals).

The new final V6 snapshot and V2 Tabloid content are **not** certified by that preliminary proof. Do not distribute the preliminary package as the final product. Once the parent signals final data/manifest readiness:

```sh
node scripts/offline-browser-package.mjs \
  --output /home/ubuntu/life-science-atlas/offline_browser_atlas_V1 \
  --print-dir /home/ubuntu/life-science-atlas/market_intelligence_V2/output \
  --snapshot /home/ubuntu/bioatlas/scripts/offline-cache/snapshot_V6.json.gz

node scripts/offline-browser-runtime-test.mjs \
  --snapshot /home/ubuntu/bioatlas/scripts/offline-cache/snapshot_V6.json.gz \
  --results /home/ubuntu/bioatlas/scripts/offline-browser-runtime-results_V6.json

python3 scripts/proof-offline-file-browser.py \
  --package /home/ubuntu/life-science-atlas/offline_browser_atlas_V1 \
  --output /home/ubuntu/bioatlas/assets/offline-file-browser-final-proof_V1
```

Omit `--snapshot` only to deliberately use the original retained V5 fallback. The assembler verifies the capture against an exact matching retained `data/atlas-seed_V*.json.gz` hash. It discovers all media/PDF URLs from the current bundled React App, automatically including both imported V1 and V2 print manifests and the intelligence JSON. It rejects any unresolvable local cached asset; it never downloads missing assets. All current print-directory PDFs/ZIPs are included, with referenced print images compacted locally. Input editions, prior ZIPs and parent-owned views remain untouched.

# Basel canton aerial and source-record execution V3

The final producer adapter and canton UI are implemented and the additions are persisted. The definitive companion is `data/baselCantonDetail_offline_V3.json`. Use this file explicitly with the offline packager’s `--cantons` option. V1/V2 companions and raw research/producer inputs remain unchanged. No company, profile, site or source master rows were changed; no commit or publication was performed.

## Executed persistent result

The managed database received 24 INSERT-only new aerial records with IDs prefixed `basel-canton-v3:` and two immutable `atlas_canton_research_documents` rows, one for each canton at V3. Exact-existing repeat execution skipped both insert sets successfully. The live canton API returned HTTP 200, V3 and original research source hash for both cantons. The regional Basel API contains the 24 additions alongside the 15 retained Basel frames; all 57 original global aerial payloads are unchanged.

The source-address register retains all 482 producer records: 311 BS and 171 BL. Exactly 150 have accepted postal coordinates and 332 retain null geometry. There are 421 conservative exact name/address/full-source-ID-set canonical crosswalks and 61 source-card fallbacks. These are evidence records, not active companies, occupied suites or a company census. Null company IDs never open a phantom global profile. Every record opens its own full source card; exact existing profile links and exact matched normalized canton records are separate options.

All accepted plotted positions use `postalPointNativePixel / pixelDimensions`. Displaced producer labels remain metadata only. Overlapping native frames retain neighboring-cluster source records within the same canton. Campus references remain distinct from verified company postal addresses, and no complete-building/suite tenancy is inferred.

## Assets and public-data boundaries

All 24 uncropped native images and all 24 individual prepared aerial PDFs were copied to `assets/basel-canton-V3/`, verified against native input hashes and uploaded with `manus-upload-file --webdev`. The asset registry merge added only these entries and retained every prior key/value, including existing hash aliases. Every new image/PDF passed HTTP 200 and exact-byte SHA-256 verification through the registered storage gateway.

The user’s 4 Nov 2026 supplied-material authorization, reported by the parent at 06:34:15 PT, superseded the provisional withholding request. No expanded restrictive sanitizer was applied to this final companion or source cards. Authorized supplied figures and notes remain with their source/date/basis; original internal/private visibility is retained as provenance, not relabeled public. Original private decks/brochures and local filesystem paths are not exposed or bundled. This authorization is not a forecast-validation claim or publication approval.

## Exact hashes

| Input/output | SHA-256 |
|---|---|
| Original raw V2 canton source | `aaa18b80a88edfa904a5c16857574e5edbec70d2e8342874dc26169331b2f07a` |
| Actual producer envelope | `24494b6369d0ba3cb9a6606b4874631a29416f8e1f9d91bbd0c5253383f39ce1` |
| Native asset manifest | `d9cd022fffba088cb4be1ec527b712791a5cb326354bc279b2aa592178e11b2d` |
| Original V2 companion | `a7c0cd37f1fc87358b0773c9d5c10410842b19f649048054ddf1194cff90cfec` |
| Final V3 companion bytes | `2fde5aecbec9afe81ee32cdf5ed8992656812c727edbe2f88b91e3bcf4959fe0` |
| Final V3 frame DTO bytes | `4cebfdf4e7761bfe6cfcc9d515082129863c22ae7a60f62d0a2230917968bdbf` |
| BS canonical V3 content | `fbd3008cf458ee30040424f21d2b4cd6993ab2216b288208a4406364809a10ec` |
| BL canonical V3 content | `7cf6ca44e345209370b02d0b9495697b1b04cd50483262f901694ef7b6f43a9e` |

## Validation and receipts

`data/baselCanton_execution_receipt_V3.json` records the actual original insert counts, exact new IDs, input/output hashes and before/after master fingerprints. Company and profile counts remain 1,276 each; sites remain 1,652; source associations remain 5,239. Global aerial count is now 81 and Basel aerial count is 39. These are measured managed database counts as of the executed 4 Nov 2026 import, not updated tenancy claims.

`data/baselCanton_idempotency_receipt_V3.json` records the successful exact-existing repeat: zero new inserts. `data/baselCanton_live_api_verification_V3.json` records both live document GETs and regional readiness. `data/baselCanton_asset_gateway_verification_V3.json` and `data/baselCantonAssets_upload_receipt_V3.json` record the verified assets. `data/baselCanton_preservation_verification_V3.json` records original-field/source preservation and authorization context.

Affected checks passed: app `pnpm check`, explicit finalizer-script TypeScript checking, and 33 tests across the four canton contract/schema/producer/geometry suites. Logs are `scripts/basel-canton-typecheck_V3.log`, `scripts/basel-canton-finalizer-typecheck_V3.log` and `scripts/basel-canton-tests_V3.log`.

## Narrow shared-file changes and remaining parent-owned work

`client/src/pages/AtlasHub.tsx` now hides `cantonOnly` frames from the legacy master-company selector. The frames remain in the DB/regional response and accessible on the canton pages. This avoids empty native-map company counts for source-only frames. No root map components were changed.

`server/_core/index.ts` received only an import and registration of the already-existing `registerStorageProxy` helper before SPA fallback. The unregistered helper had caused `/manus-storage/` GETs on the direct development gateway to return SPA HTML. All 48 asset GETs now return their real original bytes. Platform-owned storage routing still takes precedence where supplied.

The parent still owns the final root snapshot capture, book visual checks and file-only package assembly. A strict V7 capture script that compares all frames to the prior snapshot will need to admit the independently validated `data/baselCantonAerials_V3.json` additions rather than demand legacy-only equality. The final snapshot must include 24 new source-linked frames (81 global), and the package must explicitly use `--cantons /home/ubuntu/bioatlas/data/baselCantonDetail_offline_V3.json`. No further data import or handoff preparation is needed for this subtask.

Compared with V2 as the designated source of truth: every original factual row/source/metadata field is retained; only cluster aerial links, version identity and derived source/geometry binding additions changed. This receipt reports executed state and bounded parent-owned finishing work, not publication certification.

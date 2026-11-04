# BioAtlas bounded location and presence corrections V7

The confirmed data defects are corrected in the persistent database, the new immutable source snapshot and the current producer/public aggregate. This is a bounded correction, not a new company eligibility, headquarters, operating occupancy or market census review. No ambiguous company/parent identity was merged. No commit or publication was made.

## Exact canonical site corrections

| Site ID | Company/profile ID | Before | After |
|---|---|---|---|
| `boulder:site:corden-colorado` | `gco_70cd08d154f30063bd4f` | `physicalStatus: current` at 5505 Central, Boulder, Colorado | `physicalStatus: lease_signed_opening_not_confirmed`; non-operating typed plan record |
| `uk:site:randox-laboratories-uk-hq` | `gco_9e75314396ae9567e3cb` | City reference `51.67778, -3.13528` | City reference `54.62054, -6.21414`, retained GeoNames ID `2651804`, country `GB`, admin1 `NIR` |

CordenPharma retains its baseline admission, company profile, original source `boulder:s15`, address, city-reference coordinates, original facts and lease action. The retained March 4, 2026 disclosure supports a signed lease and a completed building, not lab opening or occupancy commencement. No older operating site, opening date, FTE or additional area was invented. Boulder operating-site records change from 14 to 13; typed plan records change from 0 to 1. Its 15 retained baseline admissions and 14 research assignment records remain unchanged.

Randox's retained `BT29 4QY` address and GB context select the unique Crumlin entry in Northern Ireland in the already-retained Gazetteer. `precision: city_centroid` remains unchanged; this is not a building point or verified tenancy. Sources `uk:s125` and `uk:s126` are preserved. One new association, `v7:geonames:2651804:crumlin-gb-nir`, records the retained Gazetteer provenance. The manifest contains the full Gazetteer line and file hash.

Both corrected sites retain a complete `retainedPresenceObservations[0].site` copy of their prior raw record. Each also receives one new source-linked site observation. Their old facts, original profile payloads and source rows are not rewritten. Full before/after evidence is additionally stored in `atlas_v7_preservation_audit`.

## Adial primary assignment and callout

Only Adial's primary site selector changes. Profile ID `gco_859f011c4ffa88b7a469` previously selected unchecked import `claude_csv:5c6eedfb4fa8:site:111`, at 1180 Seminole Trail, Suite 495, Charlottesville. It now selects `biocapital:site:adial-pharmaceuticals-hq`, at 4870 Sadler Road, Suite 300, Glen Allen, using retained annual-report source `biocapital:S38`.

The producer override requires the exact reviewed company ID, site ID, current/baseline classification, city, address and source-ID list. A later edited address does not satisfy that override. All unrelated primary-site assignments retain their previous selection rule; no broad headquarters reassignment was introduced. The eight reviewed BioCapital callout IDs remain in their original order, including Adial, whose callout now carries Glen Allen and the current source-backed address. Its unchecked import is intact. Adial's reporting-entity cash moves to its Glen Allen analytical assignment once; all hub cash totals remain unchanged.

## Comparison families and record labels

The exact aliases Washington/Washington DC and Wilmington/Wilmington DE now resolve to `biocapital-washington-dc-comparison` and `biocapital-wilmington-de-comparison`. Each family now includes its two retained operating-site records. Source IDs and original area names/IDs remain available.

Rockville city remains a separate physical-site component: `biocapital-rockville-city-component`, with eight operating-site records and `nestedWithinFamilyId: biocapital-rockville-i270-comparison`. The wider family retains its own primary assignments; the city records are not copied into a parent subtotal. The mapping/print owner must keep this named nested component visible rather than burying it in an unnamed Others row. Neither family is asserted as a formal boundary.

All research counts are now described as selected company/site observation assignment records, not unique or incremental companies. Baseline companies are assigned once per hub; each selected research assignment record is assigned once, while the same entity may recur across locations and evidence layers. A/B/C/U and combined totals count assignment records. Legacy numeric fields such as `researchCompanyCandidates` remain unchanged for compatibility, accompanied by explicit `researchAssignmentRecords`, `assignmentRecordCount` and `countingMetadata`. Research sites attached to baseline profiles remain retained and are separately described, not silently deleted or merged into new masters.

Seattle retains the two wider Washington records separately: Absci in Vancouver/Clark County, `claude_csv:5c6eedfb4fa8:966`, and Jubilant HollisterStier in Spokane, `claude_csv:5c6eedfb4fa8:987`. Both have `outsideCore: true` and an explicit outside-Puget-Sound-core label. The research pool remains 21 assignment records, with 19 other core/reference records; the metric explicitly discloses the two outside King/Snohomish/Pierce observations. The map extent is not expanded.

`countingMetadata.typedPlans` and area-level `typedPlanRecords` define the tally as explicitly typed planned, planned-not-commissioned or signed/opening-unconfirmed site records only. A zero does not mean no planned or construction actions in the separate event layer. The print owner can label the column **Typed plan records** and use the supplied universe/zero footnote without inventing new sites or quantities.

The machine-readable audit lists every exact affected assignment ID and before/after canonical field. There are 40 assignment records with an area/name/source or primary-field change; only Adial changes its primary site ID. Most of the remaining changes are exact city-family aliases, explicit Seattle outside-core labels, and Randox's added Gazetteer source ID.

## Preservation and hashes

The source-linked V7 snapshot preserves all 1,276 profile IDs and 1,652 site IDs. The retained baseline remains 479 unique company admissions and 502 company-region memberships. The parent's corrected `baselineDelta` object is unchanged, including its distinction between unique companies and memberships; Orbis's V6 classification is preserved. These are retained admission counts, not newly certified current-company census counts.

The guarded import added exactly one raw source association and two metric observations. Raw coverage association totals move from 5,238 to 5,239 source records and from 44,197 to 44,199 metric observations. No company-region membership was changed, no raw company profile was rewritten, and no company/site ID was added or removed. Full-payload SQL old-value guards, retained source comparisons, exact identity-set checks, immutable ingestion content hashes and a transaction-wide rollback on client-edit skips protect the update.

- Version: `atlas-web-v7-20261104`
- Immutable snapshot: `/home/ubuntu/bioatlas/scripts/offline-cache/snapshot_V7.json.gz`
- Snapshot SHA-256: `2706723384a341e5fdb9e07ae9da74fc0b08be436cf3c1dce7b3e555cb888db7`
- Compressed corrected-seed SHA-256: `a6788af941ab4a39dea32f56611e9ae0eb047cb33684b30d74fdc2d77a8549d4`
- Correction-manifest SHA-256: `ad49214612e9287479d07d5b9203e3f0fa71cc5724d1704b65e320b1be3c7027`
- Preserved V6 snapshot SHA-256: `c01b8146f1f22b2006942d39df360ce696bfc35360d2f99106b7159970bdbe11`

The capture fetched all eleven regional responses, all 1,276 summaries, overview/coverage, and the three affected full profiles. The other 1,273 full profiles are carried unchanged from V6, not claimed as a renewed full-live census. Current API parity was rechecked for the affected profiles and regions, headers and raw coverage totals. Unordered SQL coverage groups are compared by their complete record contents rather than incidental row order.

## Files and validation

New preparation/import/capture/verification scripts are:

- `/home/ubuntu/bioatlas/scripts/prepare-location-presence-v7.py`
- `/home/ubuntu/bioatlas/scripts/import-location-presence-v7.ts`
- `/home/ubuntu/bioatlas/scripts/offline-capture-v7.mjs`
- `/home/ubuntu/bioatlas/scripts/verify-location-presence-v7.py`

Guard and type definitions are `/home/ubuntu/bioatlas/server/atlas/location-presence-corrections.ts` and `/home/ubuntu/bioatlas/shared/locationPresenceCorrections.ts`; `shared/atlas.ts` adds only the optional retained-presence observation field. The producer, aliases and aggregate type contract are updated under `/home/ubuntu/life-science-atlas/market_intelligence_V2/source`. Original producer/alias/data inputs are retained as `*_before_V7` files.

Tests passed: seven existing V6 tests, five new V7 correction tests, eight producer regressions, and `pnpm check`. The tests exercise the actual Randox postcode/Gazetteer mismatch, noncurrent Corden lab, Adial current site and preserved callout/cash allocation, exact aliases/nested counts, research-record semantics, outside-core Seattle records, zero-plan tally semantics, all ID/raw-field preservation, and client/source edit rejection. Logs are retained in `scripts/location-presence-regression_V7.log`, `scripts/typecheck_V7.log` and `market_intelligence_V2/data/location_presence_regression_V7.log`.

The current producer/public aggregate is refreshed through the parent's unchanged `public_data.py` serializer. No renderer, map builder, uploader, App, router root, offline packager, root TODO or root plan was edited. Map/print regeneration and final offline-bundle selection remain with their owners; use snapshot_V7 rather than overwriting snapshot_V6. This data audit does not certify final print layout or rebuilt offline release behavior.

Pre-ship data/wording checks passed. Compared against the immutable V6 source and retained pre-V7 aggregate; intended changes and preservation checks verified. The V7 ledger fragment is additive and awaits parent merge, without rewriting historical ledger values.

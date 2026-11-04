# V7 retained ownership and count-semantics addendum

This addendum addresses the subsequent T3/NBE ownership critique. The original V7 correction report, manifest, verification and snapshot are retained unchanged. No further database or canonical raw-profile correction was needed: both companies were already correctly classified as subsidiaries of Boehringer Ingelheim, with current operating sites.

| Retained profile | ID | Existing parent | Existing listing | Existing admission kind |
|---|---|---|---|---|
| T3 Pharmaceuticals AG | `gco_4770f3a112b9769fac17` | Boehringer Ingelheim | subsidiary | baseline_company |
| NBE Therapeutics AG | `gco_7a1b3460a09f20347048` | Boehringer Ingelheim | subsidiary | baseline_company |

The baseline kind describes admission to the retained source layer; it is not a declaration of an independent private company. The profile header now replaces that generic displayed kind with **Operating affiliate of Boehringer Ingelheim**, only when the exact profile ID, parent, subsidiary listing, original admission kind and retained public primary-source ID/URL all match. Later parent/kind/source edits invalidate the display projection. Raw parent, kind, listing, events, sites and cash remain untouched.

T3's retained ownership witness is `v6:presence:t3-basel:t3_parent_portfolio`, the BI Venture Fund portfolio entry explicitly titled as acquired by BI in 2023. NBE's witness is `v6:presence:nbe-allschwil:nbe_parent_opening_20250403`, BI's retained April 3, 2025 NBE R&D-center disclosure. No new acquisition research, parent-alias merge or financing inference was performed.

The current producer adds source-linked `ownershipClass: operating_affiliate`, `ownershipLabel`, `parent` and `ownershipSourceIds` fields to these two retained Basel assignments, plus `markets.basel.ownershipRecords`. Count notes explicitly state that baseline profile IDs include operating legal entities, brands and affiliates. Counts are not unique consolidated parents, independent private firms or independent borrowers. Each profile ID is assigned once per hub; physical sites remain in their own geography. Reporting-entity/parent cash is allocated once and is never imputed to an affiliate. No BI local employee or consolidated group total is invented.

Both brands and their current sites remain present. Their own cash is still unknown, not replaced with parent cash. The retained counts remain 479 unique baseline admissions, 502 company-region memberships, 1,276 profile IDs and 1,652 site IDs. The original V7 raw-source delta remains one source association and two metric observations; this addendum adds no raw database source, observation or count change.

Orbis remains research-only for its operator-reported Allschwil association, with current company-specific address/function unresolved. The producer now states explicitly that known Epalinges headquarters do not prove absence of an Allschwil association. No closure, brand deletion or nonpresence finding is inferred.

The display helper is `/home/ubuntu/bioatlas/shared/operatingAffiliate.ts`; its only component edit is the guarded identifier-label substitution in `client/src/components/atlas/CompanyProfileDrawer.tsx`. The existing parent field remains intact. The producer and type contract carry the same ownership/count semantics. No App, router root, map builder, renderer, uploader, offline packager, root TODO or root plan was changed.

Latest validation passed: 15 Vitest tests across V6/V7 corrections and ownership guards, nine producer regressions, and `pnpm check`. The immutable source remains `/home/ubuntu/bioatlas/scripts/offline-cache/snapshot_V7.json.gz`, SHA-256 `2706723384a341e5fdb9e07ae9da74fc0b08be436cf3c1dce7b3e555cb888db7`. Its raw T3/NBE parent/listing fields were already correct and match the API. Final print presentation and rebuilt offline-bundle behavior remain delegated, not certified by these data tests.

Pre-ship checks passed for this addendum. Compared with retained V6/V7 raw ownership fields; intended display/semantic additions only, with operating sites and baselineDelta preserved. No commit or publication was made.

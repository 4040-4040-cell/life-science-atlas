# Basel canton detail final preparation V2

The existing implementation has been extended against the real source schema, not rebuilt. Both V1 and V2 companions have been prepared. No database import, master changes, commits, publication, external research, file polling, App/router edits or offline-packager edits were performed.

## Immutable prepared data

Final V2 input: `/home/ubuntu/life-science-atlas/market_intelligence_V2/data/baselCantonDetail_V2.json`.

Input-byte SHA-256: `aaa18b80a88edfa904a5c16857574e5edbec70d2e8342874dc26169331b2f07a`.

Public offline companion: `/home/ubuntu/bioatlas/data/baselCantonDetail_offline_V2.json`.

Companion-byte SHA-256: `a7c0cd37f1fc87358b0773c9d5c10410842b19f649048054ddf1194cff90cfec`.

Basel-Stadt document hash: `6436403ef9d13365e261282f30d78e6424249785f3ed99ef10d60e8080a26047`.

Basel-Landschaft document hash: `d91f075e3fab7a43ec019781c12a10e21a3716988b8ebf038b8c120039cd087d`.

V1 remains independently immutable at `/home/ubuntu/bioatlas/data/baselCantonDetail_offline_V1.json`, bound to source hash `c8f633df4ea8e6528da22dd3dddea8c28c0a0cb8511dabcb9424b7fa612e2554`; its companion hash is `90163453f7b08270c97c46595650628cc12cb40c309ea9d20b34edd044adad3a`. The prepare/import CLI refuses different content under an existing companion filename or imported document version.

Preparation receipts and preservation audits are in `data/baselCantonDetail_prepare_receipt_V{1,2}.json` and `data/baselCantonDetail_preservation_audit_V{1,2}.json`. These are operational handoff records, not raw private documents.

## Full contract and preservation

V2 retains six clusters per canton, 49 Basel-Stadt company/site rows and 38 Basel-Landschaft company/site rows. The conservative existing-ID sets remain separate from the full evidence registers: 19 BS and 14 BL, with one overlap. BÜHLMANN in Schönenbuch is the additional V2 BL record, with the exact existing company ID, primary company address and null site ID. Directory residents and other null-ID operators are not added to the company or site master.

The source registry contains 440 unique IDs in the actual V2 input and companion. This is the measured complete registry including retained baseline aliases, assembly sources and explicit external boundary evidence; it is not restricted to the earlier stated namespaced-source subtotal. Every raw source label is retained. External AG, French, German and other out-of-canton references remain boundary evidence, never admitted main-canton occupiers.

The normalized DTO exposes `buildingSchedule`, `developmentPipeline`, `availabilityEvidence`, `residentReferences`, `excludedOrUnresolvedLeads`, full `detailedNarrative`, `narrativeCitationIndex` and sanitized `assemblyProvenance`. Object-valued containers, their shared basis/rules/common unknowns and original structured next checks are preserved under `metadata.evidenceContainers`. Other useful source attributes remain in typed recursive `CantonMetadata`, rendered with human labels and the exact source key, not discarded or coerced to raw object strings.

Facts retain scalar, array-range and minimum/maximum-object values, exact units, scope, basis, comparator/qualifier, source/observation dates and original attributes. Singular `sourceId` is normalized without mixing a unit's citation with a container's broader citation list. Metric-ID fields resolve to the exact source metrics while retaining their original source keys. Nested tenure, executed/asking/unnormalized rent, capability evidence, address observations, floor/suite, ownership and explicit nulls remain available in uncapped table details.

Source URLs are withheld for private/internal/restricted/confidential source visibility, including when accidentally repeated in notes. Local file/path fields are removed or redacted. Human source labels, page references and date-basis notes remain. A public URL containing `/home/` is not mistaken for a local filesystem path.

The leaf-level audit compares all original company/site, institution, property, action and metric record attributes with their normalized records, excluding intentional private-path redactions. V2 audits 498 records and 7,577 attributes with zero missing useful attributes, and checks every source ID and immutable public content hash. Container/roster expansions are covered by real-source fixtures. Ironwood's current physical operations remain unresolved; the legacy merger-derived not-active flag is not adopted as closure or availability proof.

## Actual aerial enrichment contract

`shared/baselCantonDetail.ts` now defines `CantonAerialFrame extends AerialView` with optional `frameKind: 'street_address'` and `addressReferences: CantonAerialAddressReference[]`. Existing regional DTOs stay structurally compatible. Attach the enriched frames to the parent-owned live Basel regional response and new offline snapshot. No change to the immutable canton evidence companion is necessary.

Each accepted address reference must contain:

```ts
{
  id: string;
  recordId: string; // exact normalized evidence row/property id in this companion
  clusterId: string;
  recordType: 'occupier' | 'property';
  name: string;
  address: string;
  companyId: string | null;
  siteId: string | null;
  latitude: number;
  longitude: number;
  referenceKind: 'verified_address' | 'campus_reference';
  coordinateStatus: string;
  sourceIds: string[];
  metadata: CantonMetadata;
}
```

Supply actual accepted geocoder coordinates and exact native `imageBounds`/analytical `bounds`. Never copy a campus coordinate to an unverified resident, fabricate a master/site, infer a suite or reuse the older Stücki frame for the new 60-series streets. The page admits an enriched frame by matching `addressReferences[].clusterId` even if that frame's new ID was not known in the final research JSON. The aerial component plots against native image bounds, suppresses duplicate legacy site pins, distinguishes campus references, labels new frames “STREET-ADDRESS AERIAL”, and keeps a complete mapped-record index. Clicking a reference calls the page's own occupier/property source-detail dialog; null company IDs are never treated as fake global profiles. Exact mapping from producer reference IDs to normalized `recordId` is still required when the actual producer metadata arrives.

## Current seed command — not executed

After the parent imports/adopts the final aerial DTOs and verifies the enriched Basel regional response, seed the additive persistent document version:

```sh
cd /home/ubuntu/bioatlas
pnpm exec tsx scripts/import-basel-canton-detail.ts \
  --input /home/ubuntu/life-science-atlas/market_intelligence_V2/data/baselCantonDetail_V2.json \
  --sha256 aaa18b80a88edfa904a5c16857574e5edbec70d2e8342874dc26169331b2f07a \
  --version V2 --as-of 2026-11-04 --mode import \
  --offline-out data/baselCantonDetail_offline_V2.json
```

This import remains an INSERT-only transaction for the isolated `atlas_canton_research_documents` table, with exact source/content version checks and retained master/site/aerial validation. It does not import aerials or modify companies/sites. The actual new aerial references have not been supplied to this subtask, so no aerial pin positions or final map wiring are certified here. Parent owns offline assembly and actual aerial import.

Read-only revalidation:

```sh
pnpm exec tsx scripts/verify-basel-canton-detail.ts \
  /home/ubuntu/life-science-atlas/market_intelligence_V2/data/baselCantonDetail_V2.json \
  data/baselCantonDetail_offline_V2.json V2
pnpm exec vitest run server/atlas/canton-detail/contract.test.ts server/atlas/canton-detail/final-schema.test.ts
pnpm check
```

Prepared source and public DTO have been compared against the designated final inputs. The implementation diff is confined to owned adapters/types/page components and preparation/verification scripts. Final actual aerial metadata and parent integration/runtime checks remain the explicit release gate.

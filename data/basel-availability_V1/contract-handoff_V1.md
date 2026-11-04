# Basel register data integration V1

The shared contract is `shared/baselAvailability.ts`. The bundled client-safe payload is `client/src/lib/baselAvailabilityRegisterV1.json`. HTTP clients use `GET /api/atlas/registers/basel-availability`; offline clients import that same JSON, without re-fetching or changing the immutable V8 snapshot.

Root keys are `format`, `version`, `asOf`, `status`, `availabilityRecords`, `companyRecords`, `sources`, `totals` (keyed `BS` and `BL`), `preservation` and `forecast`. The draft status is `company_reconciliation_complete_availability_pending`; final assembly will change it to `complete` only after the parent's research handoff. Stable IDs and original source rows do not change in final assembly.

Canton totals contain nullable `currentMarketedM2`, `futureMarketedM2`, `underRefurbishmentM2` and the corresponding contributing record-ID arrays. Use the explicit subtotal labels and use-type buckets. `includeInTotal` denotes eligibility in the matching state subtotal only; it never means actual vacancy. Null is not zero. No grand laboratory supply figure is authorized. `measuredCurrentMarketedOfferM2` is a compatibility alias for `currentMarketedM2`.

`availabilityState` is one of `current_marketed`, `future_marketed`, `refurbishment_planned`, `fully_let`, `historical`, `unresolved`, `property_context`. Keep the original source status in `originalRow.status`. Property-source context rows may coexist with individually reviewed marketed units; do not sum their `areaM2` unless their contribution flag is true. Campus totals and constituent building sizes are not additive marketed offers.

Company evidence states are `source_supported_operating`, `source_supported_contact`, `campus_resident`, `registry_only`, `unresolved`, `conflict`. Campus residency never proves the incoming exact numbered address. Only reviewed name/alias plus city/street evidence gates can attach existing master IDs. Registry and unresolved rows are research leads, not verified tenants; this register is not an exhaustive independently reverified census.

Exact incoming coverage: BS 138 company observations and 57 property observations; BL 107 company observations and 38 property observations. Source CSV basenames, hashes and original rows are retained. Neither the V8 master snapshot, master company IDs, original reviewed canton facts nor client edits are changed. No Git operation or website publishing is performed.

Build: `python3 scripts/build-basel-register-v1.py`; final assembly additionally requires `--reviewed-handoff FILE`. Handoff schema: `{ asOf: "2026-11-04", reviewed: true, propertyPatches: [{ canton, sourceRowIndex, fields }], additionalAvailabilityRecords: [...], sources: [...], cantonNotes: { BS: [...], BL: [...] } }`. Patches cannot alter IDs or original row/file provenance. Sources must conform to the public shared contract and use basenames, never local paths.

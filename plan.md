# Life Science Atlas / implementation plan

## Product and scope

Build the working interactive equivalent of the supplied Claude reference, not another static export. Cover BioMidwest, Biotech Bay, Biotech Beach, BioCapital, Bio NC, Genetown, Pharm Country, Basel/Switzerland, Seattle/Puget Sound, Boulder/Front Range and the United Kingdom. Keep French and German Basel extensions explicitly labeled.

The experience includes a cross-region comparison, a dedicated hub view, searchable and sortable company matrix, clickable company-logo and map views, and a company profile drawer. Integrate the completed granular aerial exhibits for Biotech Beach, Genetown and Basel with region/submarket selection and downloadable regional PDFs. Other hubs remain geographic hub views until an aerial phase is commissioned for them.

## Existing data and depth

Use the existing V6 company profiles and site cards, V6 imported-observation layer, V5 hub maps and completed aerial release. Preserve original files and IDs. Do not restart the census or create a second company master. Resolve exact identity links, retain unresolved candidates separately, and distinguish source-supported baseline records from imported research observations in both filters and company profiles.

Profiles implement the supplied commercial-real-estate question set: local address/function, footprint and tenure, landlord/expiry where disclosed, employees and trend, companywide liquidity/operating cash flow/runway, public float and financing, products and active trials, clinical dates, modality and manufacturing, dated footprint/sublease/transaction events, revenue, peer context, analyst priority, sources, dates and gaps. Reuse supported research, expose the complete field structure and populate additional supported fields from retained primary evidence. Missing facts remain null and visible; the build will not invent lease expiries, landlords, local headcount or company-occupied area.

Companywide financial information is never presented as local capital or guaranteed lease credit. Historical float is not current market capitalization. Registry primary completion is not a guided readout. Funding alone is not a space commitment. An unsupported occupancy outlook reads Insufficient evidence, not Hold.

## Data and back end

Use the initialized React/TypeScript, Express/tRPC and managed MySQL project. Store durable region, company, physical-site, dated observation, source, event, aerial-view and ingestion-version records. Separate companies, parents and sites. Use indexed IDs and filters with paginated/lazy API responses, rather than downloading every full research payload to the browser.

Retain per-field value, unit/currency, entity/geographic scope, reporting period, source date, retrieval date, evidence state and source IDs. Seed through a versioned, repeatable import that cannot silently overwrite later client edits or original evidence. Export the filtered matrix with evidence/source metadata.

Keep PDF/aerial assets in durable project storage, not large Git blobs. Keep reliable logo provenance and use typeset company names when a mark is missing. Do not publish original private JLL brochures or expose local filesystem paths, private credentials or internal source contents in browser payloads. Publication is separate from implementation; initially deliver in private Preview for review.

## Map behavior

Use a muted geographic basemap for hub views and the completed attributed aerial frames for the granular views. Macro city-reference coordinates are visually and verbally distinguished from address-matched points. Imported unchecked coordinates remain a separately labeled research overlay and never become verified aerial pins. The analytical frames overlap and are not official JLL submarket boundaries. Preserve provider credits and imagery-vintage caveats, including unconfirmed Swiss acquisition dates.

Clicking a company name, logo, table row or company map item opens its profile. Region/submarket/category/evidence/priority filters operate on the same record IDs across views. Submarket peers use supported zone membership where available; otherwise show explicitly labeled nearby/city context.

## Design

Reuse the user's JLL direction and Claude's information architecture. White background, charcoal typography, a single JLL-red accent, thin rules, restrained map callouts and a persistent left-hand hub rail. A wide map/workspace dominates the page; a compact matrix and optional right-side profile drawer support comparison without covering the map unnecessarily. No gradients, 3D, decorative hero illustration or personal name.

Use an editorial institutional hierarchy with a narrow tracked product eyebrow, strong concise page titles, tabular numerals for metrics and clear subdued source/date labels. Use a neutral sans-serif text family and a restrained mono face for data labels. Motion is limited to short drawer/filter transitions. On phones, collapse navigation and use a full-height profile sheet with readable touch targets.

## Project structure

- `client/src/pages`: region comparison, hub workspace and methodology/data coverage views.
- `client/src/components/atlas`: map/exhibit, company matrix, filters, region navigation, source-aware profile drawer and aerial-view browser.
- `shared`: typed public API models, evidence states, labels and formatting rules.
- `server/atlas`: indexed data queries, region/profile APIs, filtered exports and safe public payload projection.
- `drizzle`: persistent business schema and additive migrations.
- `scripts`: versioned dataset preparation, asset transfer and safe import/seeding.
- `data`: compact versioned import metadata and reproducible evidence handoffs, not private document copies.

## Delivery

Provide the functioning atlas in Preview with a saved Manus checkpoint and persistent back-end data. Include the populated supported fields, visible source gaps and incorporated map work. Do not represent Preview as a published website or add unattended refresh jobs without a separate request.

## Final product and print extension, 4 November 2026

Add a dedicated `/print/:regionId` page and a prominent “Print this market” action to each hub. Use a fixed landscape Letter print layout with a baseline map and city-group index. Export a prepared single-page PDF for each market and a combined file. These fixed sheets use the retained baseline date and figures rather than live filtered totals or unchecked research imports; company detail stays in the full workstation.

Package the compiled client with a dependency-free local Node server, a read-only source-safe dataset snapshot and locally remapped logo, macro, aerial and print assets. Offline endpoints must retain the same identity, regional evidence and CSV filtering rules. Use local saved maps with explicit city/address precision in offline mode rather than attempting a live Google basemap. The offline ZIP is not an automatic refresh service and does not include private brochures or credentials. Hosted permanent publication remains subject to the pending user choice.

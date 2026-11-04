# Basel corrected frontend integration V1

The reusable UI is `BaselAvailabilityRegister`, imported from `@/components/atlas/BaselAvailabilityRegister`. Props: `cantonId?: BaselCantonId`, `compact?: boolean`, `onCompany: (id: string) => void`. Data import: `client/src/lib/baselAvailabilityRegisterV1.json`, typed using `shared/baselAvailability.ts`, both owned by the data agent. The optional parent download manifest is read using Vite's eager JSON glob, so the final release build binds it when present. Client-generated filtered CSV remains available for online and file-offline use.

Full searchable availability and company tables belong below the aerial on canton detail. Hub and brief use a compact canton subtotal/evidence-state panel with direct links to the full registers, never a second 245-row mobile list. Current marketed offers are the default; future marketing and refurbishment remain separate. Company contacts, campus residency and registry observations do not enter the source-supported operating count. Current marketing is not confirmed vacancy.

Marker groups replace blocked overlapping targets without changing postal coordinates or native raster bounds. A numbered group opens a native modal list, and every member opens its original exact source detail with a normal pointer or keyboard activation. Unplotted records remain in the full accessible index. The original V4 proof needs to select a member when a group opens; it must not force clicks.

No Git, publishing, producer print renderer or data builder edits are made by frontend integration. Parent owns print bindings, final packaging and Tabloid 17 by 11 inch paper checks.

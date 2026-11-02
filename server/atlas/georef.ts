import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import { atlasAerials } from "../../drizzle/atlas-schema";
import { safeUrl } from "./validation";

const extent = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90), z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]).refine(b => b[0] < b[2] && b[1] < b[3], "Invalid west/south/east/north extent");
export function parseGeoref(input: unknown) {
  const rows = z.array(z.object({ id: z.string().min(1).max(191), imageUrl: z.string().transform(safeUrl).refine(v => v !== null), imageBounds: extent })).min(1).parse(input);
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Duplicate aerial georeference ID.");
  return rows;
}
export async function addMissingImageBounds(connection: Connection, patches: ReturnType<typeof parseGeoref>) {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT('atlas-seed:', DATABASE()), 30) AS acquired");
  if (Number(rows[0]?.acquired) !== 1) throw new Error("Another Atlas ingestion holds the database lock.");
  try {
    return await drizzle(connection).transaction(async tx => {
      let added = 0; let preserved = 0;
      for (const patch of patches) {
        const [current] = await tx.select().from(atlasAerials).where(eq(atlasAerials.id, patch.id)).limit(1).for("update");
        if (!current) throw new Error(`Aerial does not exist: ${patch.id}`);
        if (current.payload.imageUrl !== patch.imageUrl) throw new Error(`Image URL mismatch; refusing georeference change: ${patch.id}`);
        const existing = current.payload.imageBounds;
        if (existing !== undefined && existing !== null) {
          if (JSON.stringify(existing) !== JSON.stringify(patch.imageBounds)) throw new Error(`Conflicting image bounds; refusing overwrite: ${patch.id}`);
          preserved++; continue;
        }
        // Only this JSON member changes. Analytical bounds, image provenance,
        // annotations and any later edits to all other properties are preserved.
        await tx.update(atlasAerials).set({ payload: sql`json_set(${atlasAerials.payload}, '$.imageBounds', json_extract(${JSON.stringify(patch.imageBounds)}, '$'))` }).where(eq(atlasAerials.id, patch.id));
        added++;
      }
      return { aerialImageBoundsAdded: added, alreadyPresent: preserved };
    });
  } finally { await connection.query("SELECT RELEASE_LOCK(CONCAT('atlas-seed:', DATABASE()))"); }
}

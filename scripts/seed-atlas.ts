import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { parseSeed, safeText } from "../server/atlas/validation";
import { ingestAtlas, keyHash } from "../server/atlas/ingest";
import { addMissingImageBounds, parseGeoref } from "../server/atlas/georef";

async function main() {
  const args = process.argv.slice(2);
  const inputFlag = args.indexOf("--input");
  const georefFlag = args.indexOf("--aerial-georef");
  if (args.some((arg, i) => !["--migrate", "--input", "--aerial-georef"].includes(arg) && !(inputFlag >= 0 && i === inputFlag + 1) && !(georefFlag >= 0 && i === georefFlag + 1))) throw new Error("Usage: pnpm exec tsx scripts/seed-atlas.ts [--migrate] [--input seed.json[.gz]] [--aerial-georef patch.json]");
  if (georefFlag >= 0 && (!args[georefFlag + 1] || args[georefFlag + 1].startsWith("--"))) throw new Error("--aerial-georef requires a JSON patch file.");
  if (inputFlag >= 0 && (!args[inputFlag + 1] || args[inputFlag + 1].startsWith("--"))) throw new Error("--input requires a JSON file.");
  // A missing real handoff is a hard failure, before any DB connection or DDL.
  const path = resolve(inputFlag < 0 ? "data/atlas-seed.json" : args[inputFlag + 1]);
  const buffer = await readFile(path);
  const input: unknown = JSON.parse((path.endsWith(".gz") ? gunzipSync(buffer) : buffer).toString("utf8"));
  const seed = parseSeed(input);
  const georef = georefFlag < 0 ? null : parseGeoref(JSON.parse(await readFile(resolve(args[georefFlag + 1]), "utf8")));
  const contentHash = keyHash(input);
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL is required; no in-memory fallback exists.");
  const connection = await mysql.createConnection({ uri, connectTimeout: 30_000 });
  try {
    if (args.includes("--migrate")) {
      console.log("Applying checked-in additive database migrations.");
      await migrate(drizzle(connection), { migrationsFolder: resolve("drizzle") });
    }
    if (georef) console.log(JSON.stringify(await addMissingImageBounds(connection, georef)));
    console.log(`Validated ${seed.companies.length} profiles and ${seed.sites.length} sites; importing version ${seed.version}.`);
    const result = await ingestAtlas(connection, seed, contentHash);
    console.log(JSON.stringify(result));
  } finally { await connection.end(); }
}
main().catch((error: unknown) => {
  const e = error as { code?: string; name?: string; message?: string };
  if (e.name === "ZodError") console.error(`Atlas seed validation failed: ${safeText(e.message ?? "invalid handoff")}`);
  else if (e.code && /^ER_|^E(?:CONN|TIMEDOUT|NOTFOUND)/.test(e.code)) console.error(`Atlas database operation failed (${e.code}); no ingestion completion was recorded.`);
  else console.error(`Atlas seed failed: ${safeText(e.message ?? "Unknown failure")}`);
  process.exitCode = 1;
});

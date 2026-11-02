import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { parseSeed, safeText } from "../server/atlas/validation";
import { ingestAtlas, keyHash } from "../server/atlas/ingest";
import { addMissingImageBounds, parseGeoref } from "../server/atlas/georef";
import { assertFinancialManifest, type FinancialCorrections } from "../server/atlas/financial-corrections";

async function main() {
  const args = process.argv.slice(2);
  const flags = ["--input", "--aerial-georef", "--financial-corrections"];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--migrate") continue;
    if (!flags.includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error("Usage: pnpm exec tsx scripts/seed-atlas.ts [--migrate] [--input seed.json[.gz]] [--aerial-georef patch.json] [--financial-corrections manifest.json]");
    i++;
  }
  const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  // Validate all immutable inputs before opening the shared DB connection.
  const path = resolve(value("--input") ?? "data/atlas-seed_V5.json.gz");
  const buffer = await readFile(path);
  const input: unknown = JSON.parse((path.endsWith(".gz") ? gunzipSync(buffer) : buffer).toString("utf8"));
  const seed = parseSeed(input);
  const georefPath = value("--aerial-georef");
  const georef = georefPath ? parseGeoref(JSON.parse(await readFile(resolve(georefPath), "utf8"))) : null;
  let financial: FinancialCorrections | undefined;
  const financialPath = value("--financial-corrections") ?? (seed.sourceHashes.financial_corrections_V5 ? "data/financial-corrections_V5.json" : undefined);
  if (financialPath) {
    const bytes = await readFile(resolve(financialPath));
    if (createHash("sha256").update(bytes).digest("hex") !== seed.sourceHashes.financial_corrections_V5) throw new Error("Financial manifest hash does not match this immutable seed.");
    financial = JSON.parse(bytes.toString("utf8"));
    assertFinancialManifest(financial!, seed.version);
  }
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
    console.log(JSON.stringify(await ingestAtlas(connection, seed, contentHash, financial)));
  } finally { await connection.end(); }
}
main().catch((error: unknown) => {
  const e = error as { code?: string; name?: string; message?: string };
  if (e.name === "ZodError") console.error(`Atlas seed validation failed: ${safeText(e.message ?? "invalid handoff")}`);
  else if (e.code && /^ER_|^E(?:CONN|TIMEDOUT|NOTFOUND)/.test(e.code)) console.error(`Atlas database operation failed (${e.code}); no ingestion completion was recorded.`);
  else console.error(`Atlas seed failed: ${safeText(e.message ?? "Unknown failure")}`);
  process.exitCode = 1;
});

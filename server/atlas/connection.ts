import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/atlas-schema";
import { AtlasError } from "./validation";

let pool: mysql.Pool | undefined;
export function getAtlasDb() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new AtlasError(503, "DATABASE_UNAVAILABLE", "The persistent Atlas database is unavailable.");
  if (!pool) pool = mysql.createPool({ uri, connectionLimit: 8, waitForConnections: true, connectTimeout: 15_000, enableKeepAlive: true });
  return drizzle(pool, { schema, mode: "default" });
}
// Finite test/tool invocations must release their connection resources.
export async function closeAtlasDb() { if (pool) { await pool.end(); pool = undefined; } }

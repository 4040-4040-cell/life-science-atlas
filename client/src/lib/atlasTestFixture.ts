// Test-only fixture. Never import into the browser application.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { AtlasSeed } from "../../../shared/atlas";

export const atlasTestSeed = JSON.parse(
  gunzipSync(
    readFileSync(new URL("../../../data/atlas-seed_V5.json.gz", import.meta.url))
  ).toString("utf8")
) as AtlasSeed;

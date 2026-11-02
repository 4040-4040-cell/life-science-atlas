import { Router, type Request, type Response, type NextFunction, type ErrorRequestHandler } from "express";
import { companiesCsv } from "./csv";
import { getCompanies, getCoverage, getExportRows, getOverview, getProfile, getRegion, readyIngestion } from "./repository";
import { AtlasError, parseFilters, parseId } from "./validation";

const asyncRoute = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res)).catch(next); };
export const atlasRouter = Router();
atlasRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") { res.set("Allow", "GET, HEAD"); res.status(405).json({ error: { code: "READ_ONLY", message: "Atlas endpoints are read-only." } }); return; }
  next();
});
atlasRouter.get("/overview", asyncRoute(async (_req, res) => res.json(await getOverview())));
atlasRouter.get("/regions/:id", asyncRoute(async (req, res) => res.json(await getRegion(parseId(req.params.id)))));
atlasRouter.get("/companies", asyncRoute(async (req, res) => res.json(await getCompanies(parseFilters(req.query)))));
atlasRouter.get("/profile/:id", asyncRoute(async (req, res) => res.json(await getProfile(parseId(req.params.id)))));
atlasRouter.get("/coverage", asyncRoute(async (_req, res) => res.json(await getCoverage())));
atlasRouter.get("/export.csv", asyncRoute(async (req, res) => {
  const filters = parseFilters(req.query);
  const ingestion = await readyIngestion();
  const rows = await getExportRows(filters);
  const csv = companiesCsv(rows, ingestion.asOf, filters.frame, filters.region);
  res.set("Content-Disposition", 'attachment; filename="life-science-atlas.csv"');
  res.type("text/csv; charset=utf-8").send(csv);
}));
atlasRouter.use((_req, res) => { res.status(404).json({ error: { code: "ENDPOINT_NOT_FOUND", message: "Atlas endpoint not found." } }); });
const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AtlasError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
  // MySQL errors may embed SQL, private JSON payloads and connection details.
  // Log only a bounded error class/code, never the raw object or message.
  const candidate = error as { code?: unknown };
  const code = typeof candidate?.code === "string" && /^[A-Z0-9_]{1,64}$/.test(candidate.code) ? candidate.code : "QUERY_FAILURE";
  console.error(`[Atlas] Persistent request failed (${code})`);
  const unavailable = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ER_NO_SUCH_TABLE", "ER_BAD_DB_ERROR", "ER_ACCESS_DENIED_ERROR", "PROTOCOL_CONNECTION_LOST"].includes(code);
  res.status(unavailable ? 503 : 500).json({ error: { code: unavailable ? "DATABASE_UNAVAILABLE" : "ATLAS_REQUEST_FAILED", message: unavailable ? "The persistent Atlas database is not ready or is unavailable." : "Atlas could not complete this request. No substitute dataset was returned." } });
};
atlasRouter.use(errors);

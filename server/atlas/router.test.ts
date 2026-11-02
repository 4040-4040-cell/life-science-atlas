import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { atlasRouter } from "./router";
import * as repository from "./repository";
import { AtlasError } from "./validation";

vi.mock("./repository", () => ({ getOverview: vi.fn(), getCompanies: vi.fn(), getRegion: vi.fn(), getProfile: vi.fn(), getCoverage: vi.fn(), readyIngestion: vi.fn(), getExportRows: vi.fn() }));
const app = express();
let server: ReturnType<typeof app.listen>;
let base: string;
beforeAll(async () => {
  app.use("/api/atlas", atlasRouter);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Test server did not bind");
  base = `http://127.0.0.1:${address.port}/api/atlas`;
});
afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
beforeEach(() => { vi.resetAllMocks(); });

describe("Atlas HTTP endpoints", () => {
  it("returns a 400 for invalid filters before calling the database", async () => {
    const response = await fetch(`${base}/companies?evidence=verified`);
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: { code: "INVALID_QUERY" } });
    expect(repository.getCompanies).not.toHaveBeenCalled();
  });
  it("returns pagination metadata for validated queries", async () => {
    vi.mocked(repository.getCompanies).mockResolvedValue({ items: [], total: 0, page: 2, limit: 10 });
    const response = await fetch(`${base}/companies?page=2&limit=10&evidence=baseline`);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ items: [], total: 0, page: 2, limit: 10 });
    expect(repository.getCompanies).toHaveBeenCalledWith(expect.objectContaining({ evidence: "baseline", page: 2, limit: 10 }));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("returns real ID 404s as errors", async () => {
    vi.mocked(repository.getProfile).mockRejectedValue(new AtlasError(404, "PROFILE_NOT_FOUND", "Company profile not found."));
    const response = await fetch(`${base}/profile/does-not-exist`);
    expect(response.status).toBe(404); expect(await response.json()).toMatchObject({ error: { code: "PROFILE_NOT_FOUND" } });
  });
  it("keeps DB failures non-successful and redacts raw failure details", async () => {
    vi.mocked(repository.getOverview).mockRejectedValue(Object.assign(new Error("mysql://private:credential@host/db SQL and internal data"), { code: "ECONNREFUSED" }));
    const response = await fetch(`${base}/overview`); const text = await response.text();
    expect(response.status).toBe(503); expect(text).toContain("DATABASE_UNAVAILABLE"); expect(text).not.toContain("credential"); expect(text).not.toContain("mysql://");
  });
  it("reports incomplete ingestion as not ready", async () => {
    vi.mocked(repository.getOverview).mockRejectedValue(new AtlasError(503, "ATLAS_NOT_READY", "Atlas ingestion has not completed."));
    expect((await fetch(`${base}/overview`)).status).toBe(503);
  });
  it("never emits a successful empty export after a DB error", async () => {
    vi.mocked(repository.readyIngestion).mockResolvedValue({ version: "unit-test", asOf: "2026-11-02", completedAt: new Date() });
    vi.mocked(repository.getExportRows).mockRejectedValue(new Error("query failed"));
    const response = await fetch(`${base}/export.csv`);
    expect(response.status).toBe(500); expect(response.headers.get("content-type")).toContain("application/json");
  });
  it("does not allow writes", async () => {
    const response = await fetch(`${base}/companies`, { method: "POST" });
    expect(response.status).toBe(405); expect(response.headers.get("allow")).toBe("GET, HEAD");
  });
  it("handles unknown API routes before SPA fallback", async () => {
    const response = await fetch(`${base}/unknown`);
    expect(response.status).toBe(404); expect(await response.json()).toMatchObject({ error: { code: "ENDPOINT_NOT_FOUND" } });
  });
});

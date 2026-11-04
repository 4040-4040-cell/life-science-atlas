// server/atlas/csv.ts
function csvCell(value) {
  let text = value === null || value === void 0 ? "" : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
var factColumns = (fact) => [fact?.value ?? null, fact?.unit ?? null, fact?.scope ?? null, fact?.asOf ?? null, fact?.periodStart ?? null, fact?.status ?? null, fact?.sourceIds.join(" | ") ?? null];
var metricHeaders = (name) => [name, `${name}_unit`, `${name}_scope`, `${name}_as_of`, `${name}_period_start`, `${name}_evidence_status`, `${name}_source_ids`];
function companiesCsv(rows, datasetAsOf, selectedFrameId, selectedRegionId) {
  const headers = ["id", "company", "evidence", "category", "priority", "ticker", "listing", "parent", "regions", "cities", "stage", "score", "coverage", "occupancy_read", "occupancy_reason", ...metricHeaders("cash"), ...metricHeaders("runway"), ...metricHeaders("employees"), "source_ids", "source_titles", "source_urls", "source_published_dates", "source_retrieved_dates", "source_visibility", "dataset_as_of", "financial_scope_caveat", "imported_observation_ids", "gaps"];
  headers.push("selected_frame_id", "selected_region_id", "company_locations_scope");
  const lines = [headers.map(csvCell).join(",")];
  for (const { summary: c, profile: p } of rows) {
    const sources = [...p.sources, ...p.imported.flatMap((i) => i.sources)];
    const unique = [...new Map(sources.map((s) => [s.id, s])).values()];
    const values = [c.id, c.name, c.evidence, c.category, c.priority, c.ticker, c.listing, c.parent, c.regionIds.join(" | "), c.cities.join(" | "), c.stage, c.score, c.coverage, c.occupancyRead, c.occupancyReason, ...factColumns(c.cash), ...factColumns(c.runway), ...factColumns(c.employees), unique.map((s) => s.id).join(" | "), unique.map((s) => s.title).join(" | "), unique.map((s) => s.url ?? "").join(" | "), unique.map((s) => `${s.id}: ${s.publishedDate ?? "unknown"}`).join(" | "), unique.map((s) => `${s.id}: ${s.retrievedDate ?? "unknown"}`).join(" | "), unique.map((s) => `${s.id}: ${s.visibility}`).join(" | "), datasetAsOf, "Companywide financial metrics are not local capital or guaranteed lease credit; currency conversion is not implied.", p.imported.map((i) => i.id).join(" | "), p.gaps.join(" | ")];
    values.push(selectedFrameId ?? "", selectedRegionId ?? "", "The regions and cities columns describe company locations across all covered regions, not only the selected hub or aerial frame.");
    lines.push(values.map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r
`;
}

// server/offline-api.ts
var OfflineApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
function offlineId(value) {
  if (!value || value.length > 191 || /[\s/\\?#\x00-\x1f]/.test(value)) throw new OfflineApiError(400, "INVALID_ID", "Invalid record ID.");
  return value;
}
function offlineFilters(params) {
  const allowed = /* @__PURE__ */ new Set(["region", "frame", "q", "evidence", "category", "priority", "page", "limit", "sort"]);
  const invalid = () => {
    throw new OfflineApiError(400, "INVALID_QUERY", "Invalid filters. Use evidence=baseline|research|all, sort=name|cash|employees|score, page>=1, and limit=1..250.");
  };
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) invalid();
  const region = params.has("region") ? offlineId(params.get("region")) : void 0;
  const frame = params.has("frame") ? offlineId(params.get("frame")) : void 0;
  const q = params.get("q")?.trim();
  const evidence = params.get("evidence") ?? "all";
  const sort = params.get("sort") ?? "name";
  const category = params.get("category")?.trim();
  const priority = params.get("priority")?.trim();
  const pageText = params.get("page") ?? "1";
  const limitText = params.get("limit") ?? "50";
  if (!["all", "baseline", "research"].includes(evidence) || !["name", "cash", "employees", "score"].includes(sort) || (q?.length ?? 0) > 200 || params.has("category") && (!category || category.length > 191) || params.has("priority") && (!priority || priority.length > 191) || !/^[1-9]\d*$/.test(pageText) || !/^[1-9]\d*$/.test(limitText) || Number(pageText) > 1e5 || Number(limitText) > 250) invalid();
  if (frame && !region) throw new OfflineApiError(400, "FRAME_REQUIRES_REGION", "A frame filter requires its selected region.");
  return { region, frame, q, evidence, category, priority, page: Number(pageText), limit: Number(limitText), sort };
}
function numericMetric(fact) {
  if (!fact || typeof fact.value !== "number" || !Number.isFinite(fact.value)) return null;
  const unit = (fact.unit ?? "").trim().toLowerCase();
  const multiplier = /billion|(?:^|\s|\$)bn(?:$|\s)/.test(unit) ? 1e9 : /million|(?:^|\s|\$)m(?:$|\s)/.test(unit) ? 1e6 : /thousand|(?:^|\s|\$)k(?:$|\s)/.test(unit) ? 1e3 : 1;
  return fact.value * multiplier;
}
var order = new Intl.Collator("en", { sensitivity: "base" });
function createOfflineApi(snapshot) {
  if (snapshot.format !== 1 || snapshot.profiles.length !== 1276) throw new Error("Invalid or incomplete offline snapshot.");
  const regions = new Map(snapshot.regions.map((r) => [r.region.id, r]));
  const profiles = new Map(snapshot.profiles.map((p) => [p.id, p]));
  const sites = snapshot.regions.flatMap((r) => r.sites);
  const ownSites = /* @__PURE__ */ new Map();
  for (const site of sites) ownSites.set(site.profileId, [...ownSites.get(site.profileId) || [], site]);
  const requireRegion = (id) => {
    const value = regions.get(id);
    if (!value) throw new OfflineApiError(404, "REGION_NOT_FOUND", "Region not found.");
    return value;
  };
  function rows(f) {
    const r = f.region ? requireRegion(f.region) : void 0;
    let frameIds;
    if (f.frame) {
      const zone = snapshot.regions.flatMap((r2) => r2.zones).find((z) => z.id === f.frame);
      const frame = zone || snapshot.regions.flatMap((r2) => r2.aerials).find((a) => a.id === f.frame);
      if (!frame) throw new OfflineApiError(404, "FRAME_NOT_FOUND", "Analytical frame not found.");
      if (frame.regionId !== f.region) throw new OfflineApiError(400, "FRAME_REGION_MISMATCH", "The analytical frame does not belong to the selected region.");
      frameIds = new Set(frame.siteIds);
    }
    const regional = new Map(r?.companies.map((c) => [c.id, c]));
    const term = f.q?.normalize("NFD").replace(new RegExp("\\p{Diacritic}", "gu"), "").toLocaleLowerCase();
    const items = snapshot.summaries.filter((c) => {
      if (r && !regional.has(c.id)) return false;
      const relevant = (ownSites.get(c.id) || []).filter((s) => !f.region || s.regionId === f.region);
      if (frameIds && !relevant.some((s) => frameIds.has(s.id) && (f.evidence === "all" || s.evidence === f.evidence))) return false;
      if (!frameIds && f.evidence !== "all" && !relevant.some((s) => s.evidence === f.evidence)) return false;
      if (f.category && c.category !== f.category) return false;
      if (f.priority && c.priority !== f.priority) return false;
      if (term && ![c.name, c.ticker || "", JSON.stringify(c.cities)].some((value) => value.normalize("NFD").replace(new RegExp("\\p{Diacritic}", "gu"), "").toLocaleLowerCase().includes(term))) return false;
      return true;
    }).map((c) => ({ ...c, evidence: f.evidence === "all" ? regional.get(c.id)?.evidence ?? c.evidence : f.evidence }));
    items.sort((a, b) => {
      if (f.sort !== "name") {
        const av = f.sort === "score" ? a.score : numericMetric(f.sort === "cash" ? a.cash : a.employees);
        const bv = f.sort === "score" ? b.score : numericMetric(f.sort === "cash" ? b.cash : b.employees);
        if (av !== bv) {
          if (av == null) return 1;
          if (bv == null) return -1;
          return bv - av;
        }
      }
      return order.compare(a.name, b.name) || order.compare(a.id, b.id);
    });
    return items;
  }
  return {
    handle(pathname, params) {
      if (pathname === "/overview") return { type: "application/json", body: snapshot.overview };
      if (pathname === "/coverage") return { type: "application/json", body: snapshot.coverage };
      if (pathname.startsWith("/regions/")) return { type: "application/json", body: requireRegion(offlineId(decodeURIComponent(pathname.slice(9)))) };
      if (pathname.startsWith("/profile/")) {
        const p = profiles.get(offlineId(decodeURIComponent(pathname.slice(9))));
        if (!p) throw new OfflineApiError(404, "PROFILE_NOT_FOUND", "Company profile not found.");
        return { type: "application/json", body: p };
      }
      if (pathname === "/companies" || pathname === "/export.csv") {
        const f = offlineFilters(params);
        const items = rows(f);
        if (pathname === "/export.csv") return { type: "text/csv; charset=utf-8", download: "life-science-atlas.csv", body: companiesCsv(items.map((summary) => ({ summary, profile: profiles.get(summary.id) })), snapshot.overview.asOf, f.frame, f.region) };
        return { type: "application/json", body: { items: items.slice((f.page - 1) * f.limit, f.page * f.limit), total: items.length, page: f.page, limit: f.limit } };
      }
      throw new OfflineApiError(404, "ENDPOINT_NOT_FOUND", "Atlas endpoint not found.");
    }
  };
}
export {
  OfflineApiError,
  createOfflineApi,
  offlineFilters,
  offlineId
};

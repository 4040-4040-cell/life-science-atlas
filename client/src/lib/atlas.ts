import { useQuery } from "@tanstack/react-query";
import type { CompanySummary, Fact, MapSite } from "@shared/atlas";

export class AtlasApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
export function useAtlas<T>(path: string | null) {
  return useQuery<T, AtlasApiError>({
    queryKey: ["atlas", path],
    enabled: !!path,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/atlas${path}`, {
        signal,
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new AtlasApiError(
          response.status,
          response.status === 404
            ? "This record is not available in the current release."
            : "The research service is temporarily unavailable. Please try again."
        );
      const type = response.headers.get("content-type") || "";
      if (!type.includes("application/json"))
        throw new AtlasApiError(
          503,
          "The research service is not ready yet. Retry to reconnect."
        );
      return response.json();
    },
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
export type Filters = {
  q: string;
  evidence: string;
  category: string;
  priority: string;
  frame?: string;
};
export const emptyFilters: Filters = {
  q: "",
  evidence: "all",
  category: "",
  priority: "",
};
export function filterQuery(filters: Filters, region?: string) {
  const params = new URLSearchParams();
  if (region) params.set("region", region);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  params.set("evidence", filters.evidence);
  if (filters.category) params.set("category", filters.category);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.frame) params.set("frame", filters.frame);
  return params;
}
export function matchesFilters(company: CompanySummary, filters: Filters) {
  const query = filters.q.trim().toLocaleLowerCase();
  return (
    (!query ||
      [company.name, company.ticker, ...company.cities].some(value =>
        value?.toLocaleLowerCase().includes(query)
      )) &&
    (filters.evidence === "all" || company.evidence === filters.evidence) &&
    (!filters.category || company.category === filters.category) &&
    (!filters.priority || company.priority === filters.priority)
  );
}

/** Local evidence comes from site records, never a global profile's evidence label.
 * Frame membership is an explicit retained site-ID link, not a coordinate guess.
 * Missing/unknown frame membership fails closed instead of exporting a region.
 */
export function filterRegionalWorkspace(
  companies: CompanySummary[],
  sites: MapSite[],
  filters: Filters,
  frameSiteIds?: readonly string[]
) {
  const frameIds = new Set(frameSiteIds);
  const scopedSites = filters.frame
    ? sites.filter(site => frameIds.has(site.id))
    : sites;
  const baselineIds = new Set(
    scopedSites
      .filter(site => site.evidence === "baseline")
      .map(site => site.profileId)
  );
  const researchIds = new Set(
    scopedSites
      .filter(site => site.evidence === "research")
      .map(site => site.profileId)
  );
  const membershipIds =
    filters.evidence === "baseline"
      ? baselineIds
      : filters.evidence === "research"
        ? researchIds
        : new Set(scopedSites.map(site => site.profileId));
  const filteredCompanies = companies
    .filter(company => membershipIds.has(company.id))
    .map(company => ({
      ...company,
      evidence: (filters.evidence === "research" || !baselineIds.has(company.id)
        ? "research"
        : "baseline") as CompanySummary["evidence"],
    }))
    .filter(company => matchesFilters(company, filters));
  const allowedCompanyIds = new Set(
    filteredCompanies.map(company => company.id)
  );
  return {
    companies: filteredCompanies,
    allowedCompanyIds,
    sites: scopedSites.filter(
      site =>
        allowedCompanyIds.has(site.profileId) &&
        (filters.evidence === "all" || site.evidence === filters.evidence)
    ),
  };
}

export const count = (value: number | null | undefined) =>
  value == null ? "Unknown" : value.toLocaleString("en-US");
export const humanize = (value: string) =>
  value.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
export function dateLabel(value?: string | null) {
  if (!value) return "Date not disclosed";
  if (/^\d{4}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value))
    return new Date(`${value}-01T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}
export function factValue(fact?: Fact | null) {
  if (fact?.value == null || fact.value === "") return "Not disclosed";
  const value =
    typeof fact.value === "number"
      ? fact.value.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : fact.value;
  return `${value}${fact.unit ? ` ${fact.unit}` : ""}`;
}
export type Precision = "address" | "city" | "research";
export function precisionOf(site: MapSite): Precision {
  const precision =
    `${site.precision} ${site.referenceType || ""}`.toLowerCase();
  if (
    site.evidence === "research" ||
    /unchecked|unverified|import|approximate/.test(precision)
  )
    return "research";
  if (/city|centroid|macro|reference/.test(precision)) return "city";
  if (/address|rooftop|exact|verified|precise/.test(precision))
    return "address";
  return "city";
}
export const validCoordinates = (
  site: MapSite
): site is MapSite & { latitude: number; longitude: number } =>
  site.latitude != null &&
  site.longitude != null &&
  Number.isFinite(site.latitude) &&
  Number.isFinite(site.longitude) &&
  Math.abs(site.latitude) <= 90 &&
  Math.abs(site.longitude) <= 180;
export function safeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (
    url.startsWith("/manus-storage/") ||
    url.startsWith("/api/atlas/") ||
    url.startsWith("/assets/")
  )
    return url;
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol)
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function regionCode(name: string) {
  const clean = name
    .replace(/^Biotech\s+/i, "")
    .replace(/^Bio\s*/i, "")
    .replace(/\s*\/.*$/, "");
  return clean.slice(0, 2).toUpperCase();
}

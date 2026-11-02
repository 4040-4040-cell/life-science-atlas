import type { AtlasRegion, MapSite } from "@shared/atlas";
import { precisionOf } from "./atlas";

/** Open the established core first; preserve every other retained frame and its ID. */
export function defaultAerialId(regionId: string, views: readonly { id: string }[]) {
  const core: Record<string, string> = {
    "biotech-beach": "beach-torrey-core",
    genetown: "gene-cambridge-kendall-east",
    basel: "basel-allschwil-bachgraben-main-campus",
  };
  return views.find(view => view.id === core[regionId])?.id ?? views[0]?.id ?? "";
}

/** Presentation labels only. Retained region IDs, geography and membership stay unchanged. */
const regions: Record<
  string,
  { label: string; subtitle: string; navSubtitle?: string }
> = {
  "biotech-beach": { label: "Biotech Beach", subtitle: "Southern California" },
  genetown: {
    label: "Genetown",
    subtitle: "Boston, Cambridge & Massachusetts",
    navSubtitle: "Massachusetts",
  },
  "biotech-bay": { label: "Biotech Bay", subtitle: "San Francisco Bay Area" },
  basel: {
    label: "Basel",
    subtitle: "Switzerland · cross-border extensions",
    navSubtitle: "Switzerland + FR / DE",
  },
  "pharm-country": {
    label: "Pharm Country",
    subtitle: "CT · NY · NJ · PA · RI",
  },
  biocapital: {
    label: "BioCapital",
    subtitle: "Maryland · DC · Delaware · Virginia",
    navSubtitle: "MD · DC · DE · VA",
  },
  "bio-nc": {
    label: "Bio NC",
    subtitle: "Research Triangle & North Carolina",
    navSubtitle: "North Carolina",
  },
  biomidwest: { label: "BioMidwest", subtitle: "Eight-state Midwest coverage" },
  seattle: {
    label: "Seattle / Puget Sound",
    subtitle: "King, Snohomish & Pierce counties",
    navSubtitle: "Seattle metropolitan area",
  },
  boulder: {
    label: "Boulder / Front Range",
    subtitle: "Boulder & qualifying Front Range sites",
    navSubtitle: "Boulder & Front Range",
  },
  uk: {
    label: "United Kingdom",
    subtitle: "National coverage · local subclusters",
    navSubtitle: "National overview",
  },
};

export function regionPresentation(region: Pick<AtlasRegion, "id" | "name">): {
  label: string;
  subtitle: string;
  navSubtitle?: string;
} {
  return (
    regions[region.id] || {
      label: region.name,
      subtitle: "Regional research coverage",
    }
  );
}

/** Remove a non-public editorial placeholder, not research scope or a source quotation. */
export function coverageText(value: string) {
  return value.replace(
    /:\s*\[internal reference\]/gi,
    ". Public boundary link not available in this release."
  );
}

export function isCampusReference(site: {
  precision: string;
  referenceType?: string | null;
}) {
  return (
    site.precision === "campus_reference_address" ||
    site.referenceType === "campus_reference_address"
  );
}

/** Groups the same retained records for display; does not change workspace membership. */
export function groupDocumentedLocations(sites: MapSite[], regionId?: string) {
  const documented = sites.filter(
    site => site.evidence === "baseline" && precisionOf(site) !== "research"
  );
  return {
    selected: documented.filter(
      site => !regionId || site.regionId === regionId
    ),
    other: documented.filter(site => !!regionId && site.regionId !== regionId),
    imported: sites.filter(site => !documented.includes(site)),
  };
}

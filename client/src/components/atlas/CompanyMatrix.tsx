import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type {
  CompanyListResponse,
  CompanySummary,
  MapSite,
} from "@shared/atlas";
import {
  count,
  factValue,
  filterQuery,
  humanize,
  precisionOf,
  useAtlas,
  type Filters,
} from "@/lib/atlas";
import {
  CompanyLogo,
  EmptyState,
  ErrorState,
  EvidenceBadge,
  Loading,
} from "./Primitives";

export function CompanyFilters({
  filters,
  onChange,
  companies,
  regionId,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  companies: CompanySummary[];
  regionId: string;
}) {
  const categories = useMemo(
    () => [...new Set(companies.map(c => c.category).filter(Boolean))].sort(),
    [companies]
  );
  const priorities = useMemo(
    () =>
      [
        ...new Set(
          companies.map(c => c.priority).filter((v): v is string => !!v)
        ),
      ].sort(),
    [companies]
  );
  const active =
    !!filters.q ||
    filters.evidence !== "all" ||
    !!filters.category ||
    !!filters.priority;
  const update = (key: keyof Filters, value: string) =>
    onChange({ ...filters, [key]: value });
  return (
    <div className="filter-bar">
      <div className="search-field">
        <Search size={16} />
        <input
          type="search"
          value={filters.q}
          onChange={e => update("q", e.target.value)}
          placeholder="Search company, ticker or city"
          aria-label="Search company, ticker or city"
        />
        {filters.q && (
          <button
            className="icon-button"
            onClick={() => update("q", "")}
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="filter-select">
        <label htmlFor="evidence-filter">Evidence</label>
        <select
          id="evidence-filter"
          value={filters.evidence}
          onChange={e => update("evidence", e.target.value)}
        >
          <option value="all">All evidence</option>
          <option value="baseline">Source-supported</option>
          <option value="research">Research imports</option>
        </select>
      </div>
      <div className="filter-select">
        <label htmlFor="category-filter">Category</label>
        <select
          id="category-filter"
          value={filters.category}
          onChange={e => update("category", e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map(c => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-select">
        <label htmlFor="priority-filter">Priority</label>
        <select
          id="priority-filter"
          value={filters.priority}
          onChange={e => update("priority", e.target.value)}
        >
          <option value="">All priorities</option>
          {priorities.map(p => (
            <option key={p} value={p}>
              {humanize(p)}
            </option>
          ))}
        </select>
      </div>
      {active && (
        <button
          className="clear-filters"
          onClick={() =>
            onChange({ q: "", evidence: "all", category: "", priority: "" })
          }
        >
          <X size={12} />
          Clear
        </button>
      )}
      <a
        className="export-link"
        href={`/api/atlas/export.csv?${filterQuery(filters, regionId).toString()}`}
      >
        <ArrowDownToLine size={14} />
        <span>Export CSV</span>
      </a>
    </div>
  );
}

export function CompanyMatrix({
  regionId,
  filters,
  companies,
  onCompany,
  onReset,
}: {
  regionId: string;
  filters: Filters;
  companies?: CompanySummary[];
  onCompany: (id: string) => void;
  onReset: () => void;
}) {
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(1), [filterKey, regionId, sort]);
  const params = filterQuery(filters, regionId);
  params.set("sort", sort);
  params.set("page", String(page));
  params.set("limit", "25");
  const query = useAtlas<CompanyListResponse>(`/companies?${params}`);
  const allowedCompanies = useMemo(
    () =>
      companies
        ? new Map(companies.map(company => [company.id, company]))
        : undefined,
    [companies]
  );
  const items = (query.data?.items || []).flatMap(company => {
    const scoped = allowedCompanies?.get(company.id);
    if (allowedCompanies && !scoped) return [];
    return [{ ...company, evidence: scoped?.evidence || company.evidence }];
  });
  const total = companies?.length ?? query.data?.total;
  const totalPages = Math.max(1, Math.ceil((total || 0) / 25));
  return (
    <section className="matrix-section" aria-label="Company matrix">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE COMPANY MATRIX</span>
          <h2>
            Evidence at a glance
            <span className="heading-count">{count(total)}</span>
          </h2>
        </div>
        <label className="sort-control">
          <ArrowUpDown size={13} />
          Sort by
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            aria-label="Sort company matrix"
          >
            <option value="name">Company name</option>
            <option value="cash">Reported cash</option>
            <option value="employees">Reported employees</option>
            <option value="score">Source score</option>
          </select>
        </label>
      </div>
      <div className="matrix-note">
        <SlidersHorizontal size={12} />
        <span>
          Filters apply to the map, city index, matrix and CSV.{" "}
          {filters.frame &&
            "This analytical frame is not a formal boundary; membership follows retained site links, not unchecked coordinates. "}
          Financials and headcount are companywide unless explicitly scoped
          otherwise.
        </span>
      </div>
      {query.isLoading ? (
        <Loading label="Loading company matrix" />
      ) : query.isError ? (
        <ErrorState
          retry={() => query.refetch()}
          message={query.error.message}
        />
      ) : !items.length ? (
        <EmptyState
          action={
            <button className="button button-small" onClick={onReset}>
              Reset filters
            </button>
          }
        />
      ) : (
        <>
          <div className="matrix-scroll">
            <table className="company-matrix">
              <thead>
                <tr>
                  <th>Company / location</th>
                  <th>Evidence / category</th>
                  <th>Occupancy read</th>
                  <th>
                    Reported cash <span>companywide</span>
                  </th>
                  <th>
                    Employees <span>check scope</span>
                  </th>
                  <th>Analyst priority</th>
                  <th aria-label="Open profile" />
                </tr>
              </thead>
              <tbody>
                {items.map(company => (
                  <tr key={company.id} onClick={() => onCompany(company.id)}>
                    <td>
                      <button
                        className="matrix-company"
                        onClick={e => {
                          e.stopPropagation();
                          onCompany(company.id);
                        }}
                      >
                        <CompanyLogo company={company} />
                        <span>
                          <strong>{company.name}</strong>
                          {company.kind === "institution_reference" && (
                            <span className="institution-tag">
                              Institution / campus reference
                            </span>
                          )}
                          <small>
                            {company.cities.join(" / ") ||
                              "Local city not disclosed"}
                            {company.ticker ? ` · ${company.ticker}` : ""}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <EvidenceBadge evidence={company.evidence} />
                      <span className="cell-secondary">
                        {humanize(company.category || "Unclassified")}
                      </span>
                    </td>
                    <td>
                      <span className="occupancy-label">
                        {company.occupancyRead || "Insufficient evidence"}
                      </span>
                      <span
                        className="cell-secondary short-reason"
                        title={company.occupancyReason}
                      >
                        {company.occupancyReason ||
                          "No supported local occupancy conclusion."}
                      </span>
                    </td>
                    <td className="numeric-cell">
                      {factValue(company.cash)}
                      <span className="cell-secondary">
                        {company.cash?.asOf || "As-of date not disclosed"}
                        {company.cash?.scope ? ` · ${company.cash.scope}` : ""}
                      </span>
                    </td>
                    <td className="numeric-cell">
                      {factValue(company.employees)}
                      <span className="cell-secondary">
                        {company.employees?.scope || "Scope not disclosed"}
                      </span>
                    </td>
                    <td>
                      <span className="priority-label">
                        {company.priority
                          ? humanize(company.priority)
                          : "Not assigned"}
                      </span>
                      {company.score != null && (
                        <span className="cell-secondary">
                          Source score {company.score}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="row-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {count((page - 1) * 25 + 1)}–
              {count(Math.min(page * 25, total || 0))} of {count(total)}{" "}
              profiles
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => setPage(v => v - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                className="icon-button"
                aria-label="Next page"
                disabled={page >= totalPages}
                onClick={() => setPage(v => v + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function CityCompanyIndex({
  sites,
  companies,
  onCompany,
}: {
  sites: MapSite[];
  companies: CompanySummary[];
  onCompany: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cities = useMemo(() => {
    const result = new Map<string, CompanySummary[]>();
    companies.forEach(company => {
      const localCities = [
        ...new Set(
          sites
            .filter(s => s.profileId === company.id)
            .map(s => s.city)
            .filter(Boolean)
        ),
      ];
      const names = localCities.length
        ? localCities
        : company.cities.length
          ? company.cities
          : ["City not disclosed"];
      names.forEach(city =>
        result.set(city, [...(result.get(city) || []), company])
      );
    });
    return [...result].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
    );
  }, [sites, companies]);
  return (
    <aside className="city-index">
      <div className="city-index-heading">
        <span className="eyebrow">LOCAL COMPANY INDEX</span>
        <h3>Companies in context</h3>
        <p>
          City groupings are reference context, not verified submarket or
          tenancy peers.
        </p>
      </div>
      <div className="city-index-list">
        {!cities.length && (
          <div className="city-empty">No companies match these filters.</div>
        )}
        {(expanded ? cities : cities.slice(0, 5)).map(
          ([city, cityCompanies], index) => (
            <details
              className="city-group"
              key={city}
              open={index === 0 || undefined}
            >
              <summary>
                <span>{city}</span>
                <b>{cityCompanies.length}</b>
              </summary>
              <div className="city-group-meta">
                {
                  cityCompanies.filter(
                    c =>
                      c.evidence === "baseline" &&
                      c.kind !== "institution_reference"
                  ).length
                }{" "}
                supported ·{" "}
                {cityCompanies.filter(c => c.evidence === "research").length}{" "}
                research ·{" "}
                {
                  cityCompanies.filter(c => c.kind === "institution_reference")
                    .length
                }{" "}
                reference
              </div>
              <div className="city-company-list">
                {cityCompanies.map(company => (
                  <button
                    className="city-company"
                    key={company.id}
                    onClick={() => onCompany(company.id)}
                  >
                    <CompanyLogo company={company} />
                    <span>
                      <strong>{company.name}</strong>
                      {company.kind === "institution_reference" && (
                        <span className="institution-tag">
                          Institution / campus reference
                        </span>
                      )}
                      <small>
                        {company.kind === "institution_reference"
                          ? "Institution / campus reference"
                          : company.evidence === "research"
                            ? "Unchecked research import"
                            : sites.some(
                                  s =>
                                    s.profileId === company.id &&
                                    s.city === city &&
                                    precisionOf(s) === "address"
                                )
                              ? "Address-matched site"
                              : "City context only"}
                      </small>
                    </span>
                    <span className="city-company-arrow">↗</span>
                  </button>
                ))}
              </div>
            </details>
          )
        )}
      </div>
      {cities.length > 5 && (
        <button
          className="city-show-all"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer cities" : `Show all ${cities.length} cities`}
          <ChevronRight size={13} />
        </button>
      )}
    </aside>
  );
}

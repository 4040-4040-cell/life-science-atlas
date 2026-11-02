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
  dateLabel,
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
import { isCampusReference } from "@/lib/regionPresentation";

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
      <details className="filter-options">
        <summary>
          <SlidersHorizontal size={16} /> Filters
          {active && (
            <span className="filter-active-dot" aria-label="Active filters" />
          )}
        </summary>
        <div className="advanced-filters">
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
        </div>
      </details>
      <a
        className="export-link"
        href={`/api/atlas/export.csv?${filterQuery(filters, regionId).toString()}`}
        aria-label="Export filtered CSV"
        title="Export filtered CSV"
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
  sites = [],
  onCompany,
  onReset,
}: {
  regionId: string;
  filters: Filters;
  companies?: CompanySummary[];
  sites?: MapSite[];
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
          <h2>
            Company matrix
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
          {companies?.some(
            company => company.kind === "institution_reference"
          ) &&
            `${count(companies.filter(company => company.kind === "institution_reference").length)} institution / campus references are included and labeled separately. `}
          Shared filters: map, index, matrix and CSV. Open a profile for
          sources, dates and field gaps.{" "}
          {filters.frame &&
            "This analytical frame is not a formal boundary; membership follows retained site links, not unchecked coordinates. "}
          Cash is companywide. Employee scope varies. “Not in release” is a
          research gap, not a statement about company disclosure.
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
                  <th>Local presence</th>
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
                {items.map(company => {
                  const localSites = sites.filter(
                    site => site.profileId === company.id
                  );
                  const localCities = [
                    ...new Set(
                      localSites.map(site => site.city).filter(Boolean)
                    ),
                  ];
                  const matched = localSites.filter(
                    site => precisionOf(site) === "address"
                  ).length;
                  const campuses = localSites.filter(isCampusReference).length;
                  const references = localSites.filter(
                    site =>
                      precisionOf(site) === "city" && !isCampusReference(site)
                  ).length;
                  const imports = localSites.filter(
                    site => precisionOf(site) === "research"
                  ).length;
                  const cashKnown =
                    company.cash?.value != null && company.cash.value !== "";
                  const employeesKnown =
                    company.employees?.value != null &&
                    company.employees.value !== "";
                  return (
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
                              {localCities.join(" / ") || "City not in release"}
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
                        {company.kind === "institution_reference" ? (
                          <>
                            <span>Campus reference</span>
                            <span className="cell-secondary">
                              Not a verified company suite
                            </span>
                          </>
                        ) : (
                          <>
                            <span>
                              {matched
                                ? `${matched} address-matched`
                                : campuses
                                  ? "Campus reference"
                                  : references
                                    ? `${references} city reference${references === 1 ? "" : "s"}`
                                    : imports
                                      ? `${imports} unchecked import${imports === 1 ? "" : "s"}`
                                      : "Not in release"}
                            </span>
                            {campuses > 0 && (
                              <span className="cell-secondary">
                                Not a verified company suite
                              </span>
                            )}
                            {matched > 0 && (references > 0 || imports > 0) && (
                              <span className="cell-secondary">
                                {[
                                  references
                                    ? `${references} city reference${references === 1 ? "" : "s"}`
                                    : "",
                                  imports ? `${imports} unchecked` : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                            {company.occupancyRead &&
                              company.occupancyRead !==
                                "Insufficient evidence" && (
                                <span className="cell-secondary">
                                  {company.occupancyRead}
                                </span>
                              )}
                          </>
                        )}
                      </td>
                      <td className="numeric-cell">
                        <span className={cashKnown ? "" : "missing-value"}>
                          {cashKnown
                            ? factValue(company.cash)
                            : "Not in release"}
                        </span>
                        {cashKnown && company.cash?.asOf && (
                          <span className="cell-secondary">
                            {dateLabel(company.cash.asOf)}
                          </span>
                        )}
                      </td>
                      <td className="numeric-cell">
                        <span className={employeesKnown ? "" : "missing-value"}>
                          {employeesKnown
                            ? factValue(company.employees)
                            : "Not in release"}
                        </span>
                        {employeesKnown && (
                          <span
                            className="cell-secondary"
                            title={company.employees?.scope || undefined}
                          >
                            {company.employees?.scope &&
                            /global|companywide|reporting entity/i.test(
                              company.employees.scope
                            )
                              ? "Companywide"
                              : "See profile for scope"}
                            {company.employees?.asOf
                              ? ` · ${dateLabel(company.employees.asOf)}`
                              : ""}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="priority-label">
                          {company.priority
                            ? humanize(company.priority)
                            : "Not assigned"}
                        </span>
                      </td>
                      <td>
                        <span className="row-arrow" aria-hidden="true">
                          ↗
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              {count((page - 1) * 25 + 1)}–
              {count(Math.min(page * 25, total || 0))} of {count(total)} records
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
        <h3>Company index</h3>
        <p>Grouped by city, not confirmed tenancy peers.</p>
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
                                    isCampusReference(s)
                                )
                              ? "Campus reference · not a verified company suite"
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

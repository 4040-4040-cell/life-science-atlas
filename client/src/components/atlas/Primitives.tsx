import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  Database,
  Loader2,
} from "lucide-react";
import type { CompanySummary, Fact, Source } from "@shared/atlas";
import { dateLabel, factValue, humanize, safeUrl } from "@/lib/atlas";
import { cashObservationWarning } from "@/lib/factFreshness";

export function CompanyLogo({
  company,
  large = false,
}: {
  company: Pick<CompanySummary, "name" | "logoUrl">;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = safeUrl(company.logoUrl);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className={`company-logo ${large ? "large" : ""}`} aria-hidden="true">
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span>
          {company.name
            .replace(/^(the)\s+/i, "")
            .slice(0, 2)
            .toUpperCase()}
        </span>
      )}
    </span>
  );
}
export function EvidenceBadge({ evidence }: { evidence: string }) {
  return (
    <span
      className={`evidence-badge ${evidence === "research" ? "research" : ""}`}
    >
      <i />
      {evidence === "research" ? "Research import" : "Source-supported"}
    </span>
  );
}
export function Loading({
  label = "Retrieving research",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div className={`load-state ${compact ? "compact" : ""}`} role="status">
      <Loader2 className="loading-icon" size={20} />
      <span>
        {label}
        <small>Connecting to the retained evidence</small>
      </span>
    </div>
  );
}
export function ErrorState({
  retry,
  message,
}: {
  retry: () => void;
  message?: string;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={25} />
      <div>
        <h3>Research connection interrupted</h3>
        <p>
          {message ||
            "The research service is temporarily unavailable. No sample records are displayed."}
        </p>
        <button className="button button-small" onClick={retry}>
          <RefreshCw size={14} /> Reconnect
        </button>
      </div>
    </div>
  );
}
export function EmptyState({
  title = "No matching companies",
  text = "Try clearing a filter or broadening your search.",
  action,
}: {
  title?: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Database size={22} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function External({
  url,
  children,
  className = "",
}: {
  url?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const href = safeUrl(url);
  return href ? (
    <a
      className={`external-link ${className}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  ) : null;
}
export function SourceLinks({
  ids,
  sources,
}: {
  ids: string[];
  sources: Source[];
}) {
  const resolved = [...new Set(ids)]
    .map(id => sources.find(s => s.id === id))
    .filter((s): s is Source => !!s);
  if (!resolved.length)
    return <span className="source-unknown">Source reference unavailable</span>;
  return (
    <details className="source-details">
      <summary>
        {resolved.length} source{resolved.length === 1 ? "" : "s"}{" "}
        <ExternalLink size={10} />
      </summary>
      <div>
        {resolved.map(source => (
          <div className="source-item" key={source.id}>
            {safeUrl(source.url) ? (
              <External url={source.url}>{source.title}</External>
            ) : (
              <span>{source.title}</span>
            )}
            <small>
              {source.publishedDate
                ? `Published ${dateLabel(source.publishedDate)}`
                : "Publication date not disclosed"}
              {source.retrievedDate
                ? ` · Retrieved ${dateLabel(source.retrievedDate)}`
                : ""}
              {!safeUrl(source.url)
                ? " · Retained evidence; public link unavailable"
                : ""}
            </small>
          </div>
        ))}
      </div>
    </details>
  );
}
export function FactRow({ fact, sources }: { fact: Fact; sources: Source[] }) {
  const missing = fact.value == null || fact.value === "";
  const value = missing ? "Not in release" : factValue(fact);
  const isDisclosure = value.length > 240;
  const cashWarning = cashObservationWarning(fact);
  return (
    <div className={`fact-row ${missing ? "unknown-fact" : ""}`}>
      <div className="fact-label">{fact.label}</div>
      {isDisclosure ? (
        <details className="retained-disclosure">
          <summary>Read full retained disclosure</summary>
          <p>{value}</p>
        </details>
      ) : (
        <div className="fact-value">{value}</div>
      )}
      <div className="fact-meta">
        {fact.scope && <span>{fact.scope}</span>}
        {fact.asOf && <span>As of {dateLabel(fact.asOf)}</span>}
        {fact.periodStart && (
          <span>Period from {dateLabel(fact.periodStart)}</span>
        )}
      </div>
      {cashWarning && <p className="cash-age-warning">{cashWarning}</p>}
      <details className="fact-evidence">
        <summary>Evidence details</summary>
        <div>
          <div className="fact-meta">
            <span>Status: {humanize(fact.status || "Not in release")}</span>
            {!fact.scope && <span>Scope not in release</span>}
            {!fact.asOf && <span>As-of date not in release</span>}
            {fact.unit && <span>Unit: {fact.unit}</span>}
          </div>
          {fact.notes && <p className="fact-note">{fact.notes}</p>}
          <SourceLinks ids={fact.sourceIds} sources={sources} />
        </div>
      </details>
    </div>
  );
}

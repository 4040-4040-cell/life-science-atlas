import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Compass,
  Globe2,
  Menu,
  X,
} from "lucide-react";
import type { OverviewResponse } from "@shared/atlas";
import { useAtlas, count } from "@/lib/atlas";
import { regionPresentation } from "@/lib/regionPresentation";
import { Loading } from "./Primitives";

export function AtlasShell({
  children,
  profileOpen,
}: {
  children: React.ReactNode;
  profileOpen: boolean;
}) {
  const overview = useAtlas<OverviewResponse>("/overview");
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const activeRegion = location.match(/^\/(?:hub|intelligence)\/([a-z0-9-]+)$/)?.[1];
  return (
    <div
      className={`atlas-shell ${profileOpen ? "profile-open" : ""} ${activeRegion ? "is-hub" : ""}`}
    >
      <div className="mobile-topbar">
        <Link href="/" className="mobile-brand">
          LIFE SCIENCE{" "}
          <b>
            ATLAS<span>↗</span>
          </b>
        </Link>
        <button
          className="icon-button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
      {menuOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`hub-rail ${menuOpen ? "is-open" : ""}`}>
        <Link
          href="/"
          className="brand"
          onClick={() => setMenuOpen(false)}
          aria-label="Life Science Atlas home"
        >
          <span className="brand-top">LIFE SCIENCE</span>
          <span className="brand-main">
            ATLAS<span className="brand-arrow">↗</span>
          </span>
          <span className="brand-sub">Companies, sites, capital</span>
        </Link>
        <div className="rail-rule" />
        <nav aria-label="Atlas navigation">
          <Link
            href="/"
            className={`rail-overview ${location === "/" ? "active" : ""}`}
            onClick={() => setMenuOpen(false)}
          >
            <Globe2 size={17} />
            <span>All hubs</span>
            <span className="rail-count">
              {overview.data?.regions.length ?? "Unknown"}
            </span>
          </Link>
          <div className="rail-section-label">REGIONAL INDEX</div>
          <div className="hub-links">
            {overview.isLoading && <Loading label="Loading hubs" compact />}
            {overview.data?.regions.map((region, index) => (
              <Link
                key={region.id}
                href={`/hub/${region.id}`}
                className={`hub-link ${activeRegion === region.id ? "active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                <span className="hub-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="hub-name">
                  {regionPresentation(region).label}
                  <small>
                    {regionPresentation(region).navSubtitle ||
                      regionPresentation(region).subtitle}
                  </small>
                </span>
                <span className="hub-link-arrow">↗</span>
              </Link>
            ))}
          </div>
          <Link
            href="/methodology"
            className={`rail-method ${location === "/methodology" ? "active" : ""}`}
            onClick={() => setMenuOpen(false)}
          >
            <BookOpen size={16} /> Methodology & coverage
            <ArrowUpRight size={13} />
          </Link>
        </nav>
        <div className="rail-bottom">
          <span className="rail-release">
            {overview.data?.asOf
              ? `Release ${overview.data.asOf}`
              : "Private research workspace"}
          </span>
        </div>
      </aside>
      <main className="atlas-main" id="main-content">
        <div className="topline">
          <span>
            <Compass size={15} /> Companies, sites, capital
          </span>
          <Link href="/methodology">
            Coverage & sources <ArrowUpRight size={14} />
          </Link>
        </div>
        {children}
        <footer className="site-footer">
          <span>LIFE SCIENCE ATLAS</span>
          <p>Research context, not a credit opinion or a space commitment.</p>
          <Link href="/methodology">
            Read the methodology <ArrowUpRight size={12} />
          </Link>
        </footer>
      </main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">
          <span />
          {eyebrow}
        </div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="header-actions">{children}</div>}
    </header>
  );
}
export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null | undefined;
  note?: string;
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <strong>{count(value)}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function DownloadLink({
  url,
  children,
}: {
  url?: string | null;
  children: React.ReactNode;
}) {
  return url ? (
    <a
      className="button button-small"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <ArrowDownToLine size={14} />
      {children}
    </a>
  ) : null;
}

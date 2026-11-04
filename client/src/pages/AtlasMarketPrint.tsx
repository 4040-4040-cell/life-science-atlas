import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, Printer, RotateCcw } from "lucide-react";
import printAssets from "../lib/marketPrintAssets.json";
import "./AtlasMarketPrint.css";

type MarketPrintAsset = {
  title: string;
  imageUrl: string;
  pdfUrl: string;
  asOf: string;
};

export default function AtlasMarketPrint({ regionId }: { regionId: string }) {
  const market = (printAssets.markets as Record<string, MarketPrintAsset>)[regionId];
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    const previousTitle = document.title;
    document.title = market ? `${market.title} | One-page market map` : "Market not found";
    document.body.classList.add("market-print-mode");
    return () => {
      document.title = previousTitle;
      document.body.classList.remove("market-print-mode");
    };
  }, [regionId, market]);

  if (!market) return (
    <main className="market-print-missing">
      <h1>This market print sheet is not available.</h1>
      <Link href="/">Back to the atlas</Link>
    </main>
  );

  return (
    <main className="market-print-page">
      <div className="market-print-toolbar">
        <Link className="button" href={`/hub/${regionId}`}><ArrowLeft size={15} />Back to market</Link>
        <div>
          <h1>{market.title}</h1>
          <p>One-page landscape map. Retained baseline, 28 October 2026.</p>
        </div>
        <div className="market-print-actions">
          <a className="button" href={market.pdfUrl} target="_blank" rel="noopener noreferrer"><Download size={15} />Download one-page PDF</a>
          <button className="button print-primary" onClick={() => window.print()} disabled={!loaded || failed}><Printer size={15} />Print this market</button>
        </div>
      </div>
      <p className="market-print-instructions">Use Landscape and Letter paper. The prepared PDF gives a fixed one-page output on any device. This sheet shows geographic city groups, not the full company matrix or active workspace filters.</p>
      {!loaded && !failed && <p className="market-print-state" role="status">Loading the print sheet…</p>}
      {failed && (
        <div className="market-print-state" role="alert">
          <p>The print image did not load. Use the prepared PDF or retry.</p>
          <button className="button" onClick={() => { setFailed(false); setLoaded(false); setAttempt(value => value + 1); }}><RotateCcw size={14} />Retry image</button>
        </div>
      )}
      <article className={`market-print-sheet ${loaded ? "is-loaded" : ""}`} aria-label={`${market.title} one-page map`}>
        <img key={`${regionId}-${attempt}`} src={market.imageUrl} alt={`${market.title}: baseline geographic map, selected company coverage, city-group index and source notes`} onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setFailed(true); }} />
      </article>
    </main>
  );
}

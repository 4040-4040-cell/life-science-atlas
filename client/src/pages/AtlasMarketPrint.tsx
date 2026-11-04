import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Download, Printer, RotateCcw } from "lucide-react";
import printAssets from "../lib/marketPrintAssetsV4.json";
import letterMaps from "../lib/marketPrintAssets.json";
import "./AtlasMarketPrint.css";

export type MarketPrintAsset = { title: string; imageUrl: string; pdfUrl: string; asOf: string; bookPdfUrl?: string; dataZipUrl?: string };
export default function AtlasMarketPrint({ regionId, asset, canton = false }: { regionId: string; asset?: MarketPrintAsset; canton?: boolean }) {
  const market = asset || (printAssets.markets as Record<string, MarketPrintAsset>)[regionId];
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setLoaded(false); setFailed(false);
    const previousTitle = document.title;
    document.title = market ? `${market.title} | One-page research sheet` : "Market not found";
    document.body.classList.add("market-print-mode");
    if (canton) document.body.classList.add("canton-print-mode");
    return () => { document.title = previousTitle; document.body.classList.remove("market-print-mode", "canton-print-mode"); };
  }, [regionId, market, canton]);
  if (!market) return <main className="market-print-missing"><h1>This print sheet is not available.</h1><Link href="/">Back to the atlas</Link></main>;
  return <main className="market-print-page">
    <div className="market-print-toolbar">
      <Link className="button" href={canton ? `/canton/${regionId}` : `/hub/${regionId}`}><ArrowLeft size={15} />Back to {canton ? "canton" : "market"}</Link>
      <div><h1>{market.title}</h1><p>{canton ? "One-page canton overview. Detailed addresses and source evidence remain in the full study." : "One-page market intelligence. Baseline and research observations remain separate."}</p></div>
      <div className="market-print-actions">
        <a className="button" href={market.pdfUrl} target="_blank" rel="noopener noreferrer"><Download size={15} />Download one-page PDF</a>
        {canton && market.bookPdfUrl && <a className="button" href={market.bookPdfUrl} target="_blank" rel="noopener noreferrer">Full canton study</a>}
        {canton && market.dataZipUrl && <a className="button" href={market.dataZipUrl} target="_blank" rel="noopener noreferrer">Complete print and data pack</a>}
        <button className="button print-primary" onClick={() => window.print()} disabled={!loaded || failed}><Printer size={15} />{canton ? "Print canton overview" : "Print this market"}</button>
      </div>
    </div>
    <p className="market-print-instructions">Use 11 × 17 inch Tabloid landscape. Letter or A3 paper requires Fit to page. The prepared PDF fixes pagination. Print figures describe this research edition, not active workspace filters. {!canton && <><Link href={`/intelligence/${regionId}`}>Read the interactive brief</Link>. {(letterMaps.markets as Record<string, MarketPrintAsset>)[regionId]?.pdfUrl && <a href={(letterMaps.markets as Record<string, MarketPrintAsset>)[regionId].pdfUrl} target="_blank" rel="noopener noreferrer">Download the simpler Letter map</a>}</>}</p>
    {!loaded && !failed && <p className="market-print-state" role="status">Loading the print sheet…</p>}
    {failed && <div className="market-print-state" role="alert"><p>The print image did not load. Use the prepared PDF or retry.</p><button className="button" onClick={() => { setFailed(false); setLoaded(false); setAttempt(value => value + 1); }}><RotateCcw size={14} />Retry image</button></div>}
    <article className={`market-print-sheet ${loaded ? "is-loaded" : ""}`} aria-label={`${market.title} one-page research sheet`}>
      <img key={`${regionId}-${attempt}`} src={market.imageUrl} alt={`${market.title}: geographic context, source-scoped measures, district comparison and dated source notes`} onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setFailed(true); }} />
    </article>
  </main>;
}

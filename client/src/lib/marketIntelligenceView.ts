type Source = { id?: string; url?: string; title?: string };
type RawSignal = {
  [key: string]: unknown; companyName?: string; company?: string; summary?: string; text?: string; title?: string;
  eventDate?: string; date?: string; eventStatus?: string; status?: string; printStatus?: string;
  areaName?: string; area?: string; sources?: Source[]; sourceRecords?: Source[]; sourceIds?: string[]; sourceUrls?: string[];
  quantities?: unknown;
};
type RawBrief = {
  [key: string]: unknown; pdfUrl?: string; printPdfUrl?: string; signals?: RawSignal[]; sources?: Source[];
  metrics?: { label: string; value: string | number | null; note?: string; [key: string]: unknown }[];
};
const labels = ["Source-supported profiles", "Research candidates", "Operating / address sites", "Tier A / analyst priority", "Companywide cash / USDm", "Dated space actions"];
/** Producer names are retained alongside the view aliases; this never changes evidence. */
export function normalizeMarketBrief(source: unknown) {
  const brief = source as RawBrief;
  return {
    ...brief,
    pdfUrl: brief.printPdfUrl || brief.pdfUrl,
    metrics: brief.metrics?.map((metric, index) => ({ ...metric, label: labels[index] || metric.label, value: index === 4 && typeof metric.value === "number" ? `$${metric.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : metric.value })),
    signals: brief.signals?.map(signal => ({
      ...signal,
      companyName: signal.companyName || signal.company,
      text: signal.summary || signal.text || signal.title,
      eventDate: signal.date || signal.eventDate,
      eventStatus: signal.printStatus || signal.status || signal.eventStatus,
      areaName: signal.areaName || signal.area,
      sources: signal.sources?.length ? signal.sources : signal.sourceRecords?.length ? signal.sourceRecords : (brief.sources || []).filter(s => signal.sourceIds?.includes(s.id || "") || signal.sourceUrls?.includes(s.url || "")),
    })),
  };
}

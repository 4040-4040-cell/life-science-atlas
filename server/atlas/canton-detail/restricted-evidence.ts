import type { CantonPublicValue } from '../../../shared/baselCantonDetail';

/** Restriction applies to the proprietary EMEA report, not every internal/public campus brochure. */
export function quarantineRestrictedEmea<T>(input: T, sourceDirectory: unknown[]): { value: T; redactions: string[] } {
  const restricted = new Set<string>(); const publicIds = new Set<string>();
  const sources = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(sources);
    if (!v || typeof v !== 'object') return;
    const r = v as Record<string, unknown>;
    if (typeof r.id === 'string' && typeof r.title === 'string') {
      if (/private|internal|restricted|confidential/i.test(String(r.visibility)) && /EMEA|life.science.*cluster.*2026/i.test(r.title)) restricted.add(r.id);
      else if (!/private|internal|restricted|confidential/i.test(String(r.visibility))) publicIds.add(r.id);
    }
    Object.values(r).forEach(sources);
  };
  sources(sourceDirectory); sources(input);
  const redactions: string[] = [];
  const withheld = '[Restricted EMEA report-derived forecast withheld from public delivery]';
  const visit = (v: unknown, path: string, inherited: boolean, field = ''): CantonPublicValue => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const annualRange = /10[,.\s]?000\s*(?:[-–—]|to|bis|and|\/|\.)\s*15[,.\s]?000/i;
      if (annualRange.test(v) && (/lab|forecast|take.?up|per.year|annual|EMEA|m[²2]/i.test(v) || inherited)) {
        redactions.push(path); return withheld;
      }
      if (inherited && /forecast|take.?up|reportedRange|areaForecast|projectedDemand/i.test(field) && /\d/.test(v)) { redactions.push(path); return withheld; }
      return v;
    }
    if (typeof v === 'number') {
      if (inherited && /^(value|areaValue|min|max|minimum|maximum|forecast.*|.*forecast|.*takeup.*)$/i.test(field)) { redactions.push(path); return null; }
      return v;
    }
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.map((x,i) => visit(x,`${path}/${i}`,inherited,field));
    const r = v as Record<string,unknown>;
    const ids = [...(Array.isArray(r.sourceIds) ? r.sourceIds : []), ...(typeof r.sourceId === 'string' ? [r.sourceId] : [])] as string[];
    const explicitlyRestricted = ids.some(id => restricted.has(id));
    const factualObject = ['value','areaValue','forecast','takeupForecast','labTakeupForecast'].some(k => Object.hasOwn(r,k));
    const reportBasis = /EMEA|proprietary.*forecast|JLL.*forecast/i.test([r.basis,r.scope,r.label,r.notes,r.evidenceStatus].join(' '));
    const context = factualObject && explicitlyRestricted && (!ids.some(id => publicIds.has(id)) || reportBasis) ? true : ids.length ? false : inherited;
    const out: Record<string,CantonPublicValue> = {};
    for (const [key,x] of Object.entries(r)) out[key] = visit(x,`${path}/${key}`,context,key);
    return out;
  };
  return { value: visit(input,'',false) as T, redactions };
}

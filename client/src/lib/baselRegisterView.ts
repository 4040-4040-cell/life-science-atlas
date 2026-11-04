import type { BaselAvailabilityRecord, BaselAvailabilityState, BaselCompanyEvidenceState, BaselCompanyRecord } from '@shared/baselAvailability';

export const COMPANY_EVIDENCE_LABELS: Record<BaselCompanyEvidenceState, string> = {
  source_supported_operating: 'Source-supported operating',
  source_supported_contact: 'Source-supported contact only',
  campus_resident: 'Campus resident reference',
  registry_only: 'Registry only',
  unresolved: 'Unresolved',
  conflict: 'Conflicting evidence',
};
export const AVAILABILITY_LABELS: Record<BaselAvailabilityState, string> = {
  current_marketed: 'Current marketed offer',
  future_marketed: 'Future marketed offer',
  refurbishment_planned: 'Refurbishment / planned release',
  fully_let: 'Fully let / not offered',
  property_context: 'Property context / not a measured offer',
  unresolved: 'Unknown / unresolved',
  historical: 'Historical marketing',
};
export const cleanRegisterText = (value: unknown): string => value == null || value === '' ? 'Not disclosed' : typeof value === 'object' ? JSON.stringify(value).replaceAll('\u2014', ' - ') : String(value).replaceAll('\u2014', ' - ');
export const areaText = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} m²` : 'Not measured';
export function filterRegisterRecords<T extends BaselAvailabilityRecord | BaselCompanyRecord>(records: T[], q: string, state: string): T[] {
  const needle = q.trim().toLocaleLowerCase();
  const filtered = records.filter(record => (state === 'all' || ('availabilityState' in record ? record.availabilityState : record.evidenceState) === state) && (!needle || Object.values(record).map(value => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')).join(' ').toLocaleLowerCase().includes(needle)));
  const order = Object.keys(AVAILABILITY_LABELS);
  return filtered.sort((a, b) => 'availabilityState' in a && 'availabilityState' in b ? order.indexOf(a.availabilityState) - order.indexOf(b.availabilityState) : 0);
}
/** Escape source text and guard CSV formulas without changing the embedded register. */
export function registerCsv(records: (BaselAvailabilityRecord | BaselCompanyRecord)[]): string {
  if (!records.length) return 'id\r\n';
  const columns = [...new Set(records.flatMap(record => Object.keys(record)))];
  const cell = (value: unknown) => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [columns.map(cell).join(','), ...records.map(record => columns.map(column => cell((record as unknown as Record<string, unknown>)[column])).join(','))].join('\r\n') + '\r\n';
}
export function downloadRegisterCsv(records: (BaselAvailabilityRecord | BaselCompanyRecord)[], filename: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', registerCsv(records)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

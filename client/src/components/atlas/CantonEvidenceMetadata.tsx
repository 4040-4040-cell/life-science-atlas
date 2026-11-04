import type { CantonMetadata, CantonPublicValue, CantonSource } from '@shared/baselCantonDetail';
import { SourceLinks } from './Primitives';

const label = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
function Value({ value, sources, field }: { value: CantonPublicValue; sources: CantonSource[]; field?: string }) {
  if (value === null) return <span className="canton-unknown-value">Not disclosed / unknown</span>;
  if (Array.isArray(value)) {
    if (/sourceIds$/i.test(field || '') && value.every(v => typeof v === 'string')) return <SourceLinks ids={value as string[]} sources={sources} />;
    if (!value.length) return <span>No entries retained</span>;
    return <ul>{value.map((v, i) => <li key={i}><Value value={v} sources={sources} /></li>)}</ul>;
  }
  if (typeof value === 'object') return <CantonEvidenceMetadata metadata={value} sources={sources} />;
  if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'number') return <span>{value.toLocaleString('en-US')}</span>;
  if (/^(?:sourceId|operatorResidencySourceId|companySourceId)$/.test(field || '')) return <SourceLinks ids={[value]} sources={sources} />;
  if (/^https?:\/\//.test(value)) return <a href={value} target="_blank" rel="noreferrer">{value}</a>;
  return <span className="canton-preserved-text">{value}</span>;
}
/** Complete source-scoped values, including explicit nulls, units and exact original keys. */
export function CantonEvidenceMetadata({ metadata, sources }: { metadata: CantonMetadata; sources: CantonSource[] }) {
  return <dl className="canton-evidence-metadata">{Object.entries(metadata).map(([key, value]) => <div key={key}><dt>{label(key)}<small>Source field: {key}</small></dt><dd><Value value={value} sources={sources} field={key} /></dd></div>)}</dl>;
}

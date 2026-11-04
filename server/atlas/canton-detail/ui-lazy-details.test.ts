import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const disclosureState = vi.hoisted(() => ({ value: undefined as boolean | undefined, set: vi.fn() }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: boolean) => {
      disclosureState.value ??= initial;
      disclosureState.set.mockImplementation((value: boolean) => { disclosureState.value = value; });
      return [disclosureState.value, disclosureState.set];
    },
    useEffect: (effect: () => void) => effect(),
  };
});
import { LazyDetails } from '../../../client/src/components/atlas/LazyDetails';

beforeEach(() => { disclosureState.value = undefined; disclosureState.set.mockReset(); });

describe('native lazy canton disclosures', () => {
  it('retains summary and native attributes but does not evaluate or mount closed metadata', () => {
    const content = vi.fn(() => React.createElement('p', null, 'Exact retained attributes'));
    const html = renderToStaticMarkup(LazyDetails({ summary: 'Source detail', children: content, id: 'evidence', className: 'metadata', 'aria-label': 'Source attributes' }));
    expect(html).toContain('<summary>Source detail</summary>');
    expect(html).toContain('id="evidence"');
    expect(html).toContain('class="metadata"');
    expect(html).toContain('aria-label="Source attributes"');
    expect(html).not.toContain('Exact retained attributes');
    expect(content).not.toHaveBeenCalled();
  });
  it('mounts complete metadata only after the native disclosure opens and unmounts on closing', () => {
    const metadata = vi.fn(() => React.createElement('div', null,
      React.createElement('p', null, 'JLL retained value, source date and basis'),
      React.createElement('a', { href: 'https://example.org/source' }, 'Exact source'),
    ));
    const onToggle = vi.fn();
    const props = { summary: 'Evidence', children: metadata, onToggle };
    const boundary = LazyDetails(props);
    const target = { open: true };
    boundary.props.onToggle({ target, currentTarget: target });
    const opened = renderToStaticMarkup(LazyDetails(props));
    expect(opened).toContain('JLL retained value, source date and basis');
    expect(opened).toContain('href="https://example.org/source"');
    target.open = false;
    boundary.props.onToggle({ target, currentTarget: target });
    expect(renderToStaticMarkup(LazyDetails(props))).not.toContain('JLL retained value');
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(metadata).toHaveBeenCalledTimes(1);
  });
  it('keeps nested toggle events from changing the outer boundary', () => {
    const onToggle = vi.fn();
    const boundary = LazyDetails({ summary: 'Outer', children: 'Inner', onToggle });
    boundary.props.onToggle({ target: { open: true }, currentTarget: { open: false } });
    expect(disclosureState.set).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });
  it('preserves explicitly initially open content', () => {
    expect(renderToStaticMarkup(LazyDetails({ summary: 'Initially open', children: 'Retained body', defaultOpen: true }))).toContain('Retained body');
  });
});

describe('canton workspace source-preserving layout', () => {
  const page = readFileSync('client/src/pages/BaselCantonDetail.tsx', 'utf8');
  const frames = JSON.parse(readFileSync('data/baselCantonAerials_V3.json', 'utf8')).frames;
  it('places the real canvas before inventory, with the complete producer register later', () => {
    expect(page.indexOf('id="canton-aerials"')).toBeLessThan(page.indexOf('id="canton-inventory"'));
    expect(page.indexOf('id="canton-inventory"')).toBeLessThan(page.indexOf('id="canton-source-addresses"'));
    expect(page).toContain('onRecord={openAerialRecord}');
    expect(page).toContain('sourceRegister.map(r =>');
    expect(page).toContain('All retained public producer records; no row cap');
    expect(page).toContain("['source-addresses', 'Producer source-address register']");
  });
  it('uses real canton-specific St Johann and Allschwil source-supported core frames', () => {
    for (const [cantonId, id] of [
      ['basel-stadt', 'basel-canton-v3:basel-st-johann-novartis-campus'],
      ['basel-landschaft', 'basel-canton-v3:basel-allschwil-bachgraben-main-campus'],
    ]) {
      expect(page).toContain(id);
      expect(frames.find((frame: { id: string }) => frame.id === id)?.cantonId).toBe(cantonId);
    }
  });
  it('uses lazy boundaries for every outer metadata disclosure without deleting metadata renderers', () => {
    expect(page).not.toMatch(/<\/?details(?:\s|>)/);
    expect(page.match(/<LazyDetails(?:\s|>)/g)).toHaveLength(14);
    expect(page).toContain('metadata={fact.metadata}');
    expect(page).toContain('metadata={c.assemblyProvenance ?? {}}');
    expect(page).toContain('metadata={s.metadata}');
    expect(page).toContain('metadata={d.metadata ?? {}}');
  });
  it('retains compact KPIs, all filters, source-scope safeguards and both print routes', () => {
    for (const label of ['Supported entity IDs', 'Reviewed postal-address records', 'Separate residency references', 'Covered clusters', 'not a canton census', 'unique firms, buildings or tenancies', 'Print canton overview']) expect(page).toContain(label);
    for (const filter of ['filters.q', 'filters.clusterId', 'filters.addressKind']) expect(page).toContain(filter);
    expect(page.match(/href={`\/print\/canton\//g)).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BaselCantonCompanion } from '../../../shared/baselCantonDetail';
import { prepareProducerV3, type ProducerEnvelope, type PublicAsset, type UploadedAsset } from './aerial-producer';
import { validateDocumentHash, sha256 } from './contract';
import { quarantineRestrictedEmea } from './restricted-evidence';

const root = '/home/ubuntu/life-science-atlas/basel_building_detail_V1/data/';
const base = JSON.parse(readFileSync('data/baselCantonDetail_offline_V2.json','utf8')) as BaselCantonCompanion;
const producer = JSON.parse(readFileSync(root+'basel_client_aerial_DTOs_V2.json','utf8')) as ProducerEnvelope;
const manifest = JSON.parse(readFileSync(root+'public_asset_manifest_V2.json','utf8')) as { assets: PublicAsset[] };
const assets = (JSON.parse(readFileSync('data/baselCantonAssets_upload_receipt_V3.json','utf8')) as { assets: UploadedAsset[] }).assets;
const prepare = () => prepareProducerV3(base,producer,manifest,assets,sha256(readFileSync(root+'basel_client_aerial_DTOs_V2.json')),sha256(readFileSync(root+'public_asset_manifest_V2.json')));

describe('actual Basel producer envelope V3', () => {
  it('keeps exactly 24 new globally unique frames and source-scoped company counts', () => {
    const {companion,frames}=prepare();
    expect(frames).toHaveLength(24); expect(new Set(frames.map(f=>f.id)).size).toBe(24);
    expect(frames.every(f=>f.id.startsWith('basel-canton-v3:') && f.cantonOnly && f.siteIds.length===0)).toBe(true);
    expect(companion.documents['basel-stadt'].supportedCompanyIds).toEqual(base.documents['basel-stadt'].supportedCompanyIds);
    expect(companion.documents['basel-landschaft'].supportedCompanyIds).toEqual(base.documents['basel-landschaft'].supportedCompanyIds);
    expect(Object.values(companion.documents).every(validateDocumentHash)).toBe(true);
    expect(Object.values(companion.documents).flatMap(d=>d.clusters.flatMap(c=>c.aerialIds)).every(id=>frames.some(f=>f.id===id))).toBe(true);
  });
  it('retains every actual source card and 332 null-geometry references without a row cap', () => {
    const {companion,frames}=prepare();
    const refs=Object.values(companion.documents).flatMap(d=>d.canonicalAddressReferences??[]);
    expect(refs).toHaveLength(482); expect(refs.filter(r=>r.latitude===null && r.longitude===null)).toHaveLength(332);
    expect(refs.filter(r=>r.latitude!==null && r.longitude!==null)).toHaveLength(150);
    for (const frame of frames) for (const ref of frame.addressReferences??[]) {
      const original=producer.addressReferences.find(r=>r.recordId===ref.producerRecordId)!;
      expect(ref.sourceIds).toEqual(original.sourceIds);
      expect(ref.companyId).toBe(original.companyId); expect(ref.siteId).toBe(original.siteId);
      expect(ref.sourceCard).toBeTruthy(); expect(ref.postalPointNativePixel).toBeTruthy();
      expect(ref.pixelDimensions).toEqual(frame.pixelDimensions);
    }
    expect(refs.some(r=>r.companyId===null && r.canonicalRecordId===null && r.sourceCard)).toBe(true);
    expect(refs.some(r=>r.referenceKind==='campus_reference')).toBe(true);
  });
  it('uses matching native images/bounds/capture notes without replacing dates or private originals', () => {
    const {frames,companion}=prepare();
    for(const f of frames) {
      const original=producer.aerials.find(a=>a.id===f.producerFrameId)!;
      expect(f.nativeExtent3857).toEqual(original.nativeExtent3857);
      expect(f.captureYears).toEqual(original.acquisitionYears);
      expect(f.captureNote).toContain(original.dateNote);
      expect(f.imageUrl).toMatch(/^\/manus-storage\//);expect(f.exhibitUrl).toMatch(/^\/manus-storage\//);
    }
    expect(JSON.stringify({frames,companion})).not.toMatch(/(?:file:|[\s"']\/home\/ubuntu\/)/);
  });
  it('rejects a pin that cannot join its exact top-level source record', () => {
    const bad=structuredClone(producer);bad.aerials[0].pins[0].recordId='nonexistent';
    expect(()=>prepareProducerV3(base,bad,manifest,assets,'a'.repeat(64),'b'.repeat(64))).toThrow(/source-card/);
  });
});

describe('restricted EMEA report quarantine',()=>{
  const sources=[{id:'internal:emea2026',title:'JLL EMEA life science clusters 2026 proprietary report',visibility:'internal'}, {id:'public:hortus',title:'SENN HORTUS official usable area',visibility:'public'}, {id:'internal:campus',title:'Historical campus brochure',visibility:'internal'}];
  it('withholds restricted numeric forecasts but retains public operator areas and unrelated campus sources',()=>{
    const input={forecast:{label:'Annual laboratory take-up forecast',value:[10000,15000],unit:'m2/year',sourceIds:['internal:emea2026']},publicArea:{value:10000,unit:'m2',sourceIds:['public:hortus']},campus:{value:40000,unit:'m2',sourceIds:['internal:campus']},narrative:'EMEA 2026 lab take-up forecast 10,000–15,000 m2/year.'};
    const result=quarantineRestrictedEmea(input,sources);
    expect(result.value.forecast.value).toEqual([null,null]);expect(result.value.publicArea.value).toBe(10000);expect(result.value.campus.value).toBe(40000);
    expect(result.value.narrative).not.toContain('15,000');expect(result.redactions.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getBaselAvailabilityRegister } from './basel-availability';
import imported from '../../client/src/lib/baselAvailabilityRegisterV1.json';
import express from 'express';
import { atlasRouter } from './router';

const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
describe('Basel immutable register companion', () => {
  it('returns the bundled register over HTTP without requiring a persistent query', async () => {
    const app = express();
    app.use('/api/atlas', atlasRouter);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test HTTP address');
    const url = `http://127.0.0.1:${address.port}/api/atlas/registers/basel-availability`;
    try {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(imported);
      expect((await fetch(url, { method: 'POST' })).status).toBe(405);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
  it('serves exactly the JSON import and freezes every row', () => {
    const r = getBaselAvailabilityRegister();
    expect(r).toEqual(imported);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.companyRecords)).toBe(true);
    expect(Object.isFrozen(r.companyRecords[0].sourceRow)).toBe(true);
    expect(Object.isFrozen(r.availabilityRecords[0])).toBe(true);
  });
  it('preserves the designated V8 and reviewed-canton byte hashes', () => {
    const r = getBaselAvailabilityRegister();
    expect(hash(r.preservation.masterSnapshotFile)).toBe(r.preservation.masterSnapshotSha256);
    expect(hash(r.preservation.reviewedCompanionFile)).toBe(r.preservation.reviewedCompanionSha256);
    expect(r.preservation.companyMasterWrites).toBe(0);
    expect(r.preservation.siteMasterWrites).toBe(0);
    expect(r.preservation.originalReviewedFactsModified).toBe(false);
  });
  it('does not confuse source observations or campus references with verified operating companies', () => {
    const r = getBaselAvailabilityRegister();
    expect(r.companyRecords.filter(x => x.canton === 'BS')).toHaveLength(138);
    expect(r.companyRecords.filter(x => x.canton === 'BL')).toHaveLength(107);
    for (const x of r.companyRecords) {
      if (['campus_resident', 'registry_only', 'unresolved', 'conflict'].includes(x.evidenceState)) expect(x.companyId).toBeNull();
    }
    expect(r.forecast.cantonAbsorption).toBeNull();
    expect(r.forecast.yearsSupply).toBeNull();
  });
  it('uses basenames and contains no private file URLs or local root paths', () => {
    const r = getBaselAvailabilityRegister();
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/(?:^|[\s"'(])\/(?:home|mnt|tmp|Users|private)\/|file:\/\//);
    for (const s of r.sources) if (s.fileName !== null) expect(s.fileName).not.toContain('/');
  });
});

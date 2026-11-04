import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupAddressMarkers } from '../client/src/lib/cantonMarkerGroups';
import { filterRegisterRecords, registerCsv, COMPANY_EVIDENCE_LABELS, AVAILABILITY_LABELS } from '../client/src/lib/baselRegisterView';
import type { BaselAvailabilityRegister } from '../shared/baselAvailability';

const points = [
  { id: 'building210', position: { x: 50, y: 50 }, record: { name: 'Building 210' } },
  { id: 'ultragenyx', position: { x: 50, y: 50 }, record: { name: 'Ultragenyx' } },
  { id: 'nextPostalPoint', position: { x: 52, y: 51 }, record: { name: 'Nearby address' } },
  { id: 'far', position: { x: 90, y: 90 }, record: { name: 'Far postal address' } },
];
const before = JSON.stringify(points);
for (const [width, height] of [[356, 237], [1000, 666], [4000, 2664]]) {
  const groups = groupAddressMarkers(points, width, height);
  assert.equal(groups.flatMap(group => group.members).length, points.length);
  assert.equal(new Set(groups.flatMap(group => group.members.map(member => member.id))).size, points.length);
  assert(groups.find(group => group.members.some(member => member.id === 'building210'))?.members.some(member => member.id === 'ultragenyx'));
  for (const group of groups) assert(points.some(point => point.position === group.position));
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const dx = Math.abs(groups[i].position.x - groups[j].position.x) * width / 100;
    const dy = Math.abs(groups[i].position.y - groups[j].position.y) * height / 100;
    assert(dx >= 52 || dy >= 52, 'Independent pointer targets overlap');
  }
}
assert.equal(JSON.stringify(points), before, 'Grouping changed source coordinates');
const register = JSON.parse(readFileSync('client/src/lib/baselAvailabilityRegisterV1.json', 'utf8')) as BaselAvailabilityRegister;
for (const canton of ['BS', 'BL'] as const) {
  const records = register.companyRecords.filter(record => record.canton === canton);
  const counts = register.totals[canton].evidenceCounts;
  for (const state of Object.keys(COMPANY_EVIDENCE_LABELS)) assert.equal(records.filter(record => record.evidenceState === state).length, counts[state as keyof typeof counts]);
  const operating = filterRegisterRecords(records, '', 'source_supported_operating');
  assert(operating.every(record => record.evidenceState === 'source_supported_operating'));
  assert(!operating.some(record => record.evidenceState as string === 'source_supported_contact' || record.evidenceState as string === 'registry_only'));
  const availability = register.availabilityRecords.filter(record => record.canton === canton);
  const current = filterRegisterRecords(availability, '', 'current_marketed');
  assert(current.every(record => record.availabilityState === 'current_marketed'));
  for (const record of availability) assert(AVAILABILITY_LABELS[record.availabilityState], `Missing state label ${record.availabilityState}`);
}
const csv = registerCsv(register.companyRecords.slice(0, 2));
for (const key of Object.keys(register.companyRecords[0])) assert(csv.split('\r\n')[0].includes(`"${key}"`), `CSV omitted ${key}`);
assert(csv.includes('sourceRow'));
assert(registerCsv([{ ...register.companyRecords[0], name: '=HYPERLINK("bad")' }]).includes("'=HYPERLINK"), 'CSV formula not guarded');
assert.equal(register.forecast.cantonAbsorption, null);
assert.equal(register.forecast.yearsSupply, null);
console.log(JSON.stringify({ passed: true, grouping: 'pointer targets separated without coordinate mutations', countStates: 'operating/contact/resident/registry/unresolved/conflict checked separately', availabilityRecords: register.availabilityRecords.length, companyRecords: register.companyRecords.length, status: register.status, csv: 'all record keys retained with formula guard' }, null, 2));

import { describe, expect, it } from 'vitest';
import type { CantonAerialAddressReference, CantonAerialFrame } from '../../../shared/baselCantonDetail';
import { cantonReferencePosition } from '../../../client/src/lib/cantonAerialGeometry';
const aerial={bounds:[7.5,47.5,7.7,47.7],imageBounds:[7.5,47.5,7.7,47.7],pixelDimensions:[2400,1600]} as CantonAerialFrame;
const reference: CantonAerialAddressReference = {id:'test',recordId:'test',clusterId:'test',recordType:'source_record',name:'Test source',address:'Source address',companyId:null,siteId:null,referenceKind:'verified_address',coordinateStatus:'matched',sourceIds:[],latitude:47.6,longitude:7.6,postalPointNativePixel:[1200,400],pixelDimensions:[2400,1600],metadata:{pin:{labelNativePixel:[2200,1300],labelDisplaced:true}}};
describe('native producer postal geometry',()=>{
 it('positions the exact postal pixel, not a displaced label or approximate geographic interpolation',()=>{
  expect(cantonReferencePosition(reference,aerial)).toEqual({x:50,y:25});
 });
 it('keeps null and unaccepted geography unplotted even if accidental pixels exist',()=>{
  expect(cantonReferencePosition({...reference,latitude:null,longitude:null},aerial)).toBeNull();
 });
 it('never clamps an off-image point into a fake pin',()=>{
  expect(cantonReferencePosition({...reference,postalPointNativePixel:[-1,400]},aerial)).toBeNull();
 });
});

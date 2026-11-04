import type { CantonAerialAddressReference, CantonAerialFrame } from '@shared/baselCantonDetail';
import { rasterPosition } from './offlineGeography';

/** Native postal point beats geographic interpolation; labelNativePixel is never geometry. */
export function cantonReferencePosition(reference: CantonAerialAddressReference, aerial: CantonAerialFrame): { x: number; y: number } | null {
  if (reference.latitude == null || reference.longitude == null || !Number.isFinite(reference.latitude) || !Number.isFinite(reference.longitude)) return null;
  const point = reference.postalPointNativePixel;
  const size = reference.pixelDimensions ?? aerial.pixelDimensions;
  if (point && size && point.every(Number.isFinite) && size.every(n => Number.isFinite(n) && n > 0)) {
    const x = point[0] / size[0] * 100; const y = point[1] / size[1] * 100;
    return x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null;
  }
  return rasterPosition(reference.latitude, reference.longitude, aerial.imageBounds ?? aerial.bounds) ?? null;
}

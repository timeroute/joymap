import type { LngLat } from "./LngLat";

/** Clamp latitude to Web Mercator valid range. */
export const MAX_MERCATOR_LATITUDE = 85.051_128_78;

/** Normalized or world-pixel 2D point (not GeoJSON Point). */
export interface MercatorPoint {
  x: number;
  y: number;
}

/** Project WGS84 → normalized mercator [0, 1]² (y down). */
export function projectToMercator(lngLat: LngLat): MercatorPoint {
  const lat = clamp(
    lngLat.lat,
    -MAX_MERCATOR_LATITUDE,
    MAX_MERCATOR_LATITUDE,
  );
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: (lngLat.lng + 180) / 360,
    y: 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI,
  };
}

/** Unproject normalized mercator [0, 1]² → WGS84. */
export function unprojectFromMercator(
  point: MercatorPoint,
): { lng: number; lat: number } {
  const y2 = 0.5 - point.y;
  return {
    lng: point.x * 360 - 180,
    lat: (360 / Math.PI) * Math.atan(Math.exp(y2 * 2 * Math.PI)) - 90,
  };
}

/** World size in CSS pixels at a given zoom (tileSize × 2^z). */
export function worldSize(zoom: number, tileSize = 256): number {
  return tileSize * 2 ** zoom;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

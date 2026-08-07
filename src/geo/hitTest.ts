import type { Position } from "./geojson";
import type { LngLat } from "./LngLat";

/** Ray-cast point-in-polygon (exterior ring only; holes ignored for v0.3). */
export function pointInPolygon(
  lng: number,
  lat: number,
  rings: Position[][],
): boolean {
  const ring = rings[0];
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Distance in lng/lat degrees from point to segment (good enough for hit tests). */
export function distToSegment(
  lng: number,
  lat: number,
  a: Position,
  b: Position,
): number {
  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-18) return Math.sqrt(dist2(lng, lat, ax, ay));
  let t = ((lng - ax) * abx + (lat - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt(dist2(lng, lat, ax + abx * t, ay + aby * t));
}

export function distToLineString(
  lng: number,
  lat: number,
  line: Position[],
): number {
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    min = Math.min(min, distToSegment(lng, lat, line[i]!, line[i + 1]!));
  }
  return min;
}

export function distToPoint(
  lng: number,
  lat: number,
  coord: Position,
): number {
  return Math.sqrt(dist2(lng, lat, coord[0], coord[1]));
}

/** Approximate degrees-per-pixel at a latitude and zoom (Web Mercator). */
export function degreesPerPixel(
  lat: number,
  zoom: number,
  tileSize = 256,
): { lng: number; lat: number } {
  const world = tileSize * 2 ** zoom;
  const lngPerPx = 360 / world;
  const latRad = (lat * Math.PI) / 180;
  const mercScale = 1 / Math.cos(latRad);
  return { lng: lngPerPx, lat: lngPerPx / mercScale };
}

export function screenDistToLngLat(
  screenDistPx: number,
  mapLat: number,
  zoom: number,
  tileSize = 256,
): number {
  const dpp = degreesPerPixel(mapLat, zoom, tileSize);
  return screenDistPx * Math.max(dpp.lng, dpp.lat);
}

export function featureHitsPoint(
  featureLngLat: LngLat,
  lng: number,
  lat: number,
  toleranceDeg: number,
): boolean {
  return distToPoint(lng, lat, [featureLngLat.lng, featureLngLat.lat]) <= toleranceDeg;
}

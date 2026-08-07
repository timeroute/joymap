/** Minimal GeoJSON types used by joymap (WGS84). */

export type Position = [number, number] | [number, number, number];

export interface Point {
  type: "Point";
  coordinates: Position;
}

export interface MultiPoint {
  type: "MultiPoint";
  coordinates: Position[];
}

export interface LineString {
  type: "LineString";
  coordinates: Position[];
}

export interface MultiLineString {
  type: "MultiLineString";
  coordinates: Position[][];
}

export interface Polygon {
  type: "Polygon";
  coordinates: Position[][];
}

export interface MultiPolygon {
  type: "MultiPolygon";
  coordinates: Position[][][];
}

export interface GeometryCollection {
  type: "GeometryCollection";
  geometries: Geometry[];
}

export type Geometry =
  | Point
  | MultiPoint
  | LineString
  | MultiLineString
  | Polygon
  | MultiPolygon
  | GeometryCollection;

export interface Feature<G extends Geometry = Geometry> {
  type: "Feature";
  geometry: G | null;
  properties: Record<string, unknown> | null;
  id?: string | number;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

export type GeoJSON = Geometry | Feature | FeatureCollection;

export type PaintColor = string | [number, number, number, number?];

/** Parse `#rgb` / `#rrggbb` / `#rrggbbaa` or `[r,g,b,a?]` (0–1) → RGBA 0–1. */
export function parseColor(color: PaintColor): [number, number, number, number] {
  if (Array.isArray(color)) {
    return [color[0], color[1], color[2], color[3] ?? 1];
  }
  let hex = color.trim();
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (hex.length !== 6 && hex.length !== 8) {
    throw new Error(`Invalid color: ${color}`);
  }
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

import earcut from "earcut";
import { LngLat } from "../geo/LngLat";
import { projectToMercator } from "../geo/mercator";
import type {
  Feature,
  GeoJSON,
  Geometry,
  Position,
} from "../geo/geojson";

export interface FillMesh {
  /** Mercator positions [x,y,...] in [0,1]. */
  positions: Float32Array;
  indices: Uint32Array;
}

export interface LineMesh {
  /** Interleaved: posX, posY, otherX, otherY, side (±1). */
  vertices: Float32Array;
  /** Vertex count (vertices.length / 5). */
  count: number;
}

/** Normalized mercator XY used by vector meshes. */
export interface MercatorXY {
  x: number;
  y: number;
}

/** Per-feature GPU meshes for data-driven paint. */
export interface FeatureBucket {
  feature: Feature;
  fills: FillMesh[];
  lines: LineMesh[];
  points: MercatorXY[];
  lineJoints: MercatorXY[];
  /** [west, south, east, north] in lng/lat; null when empty. */
  bbox: [number, number, number, number] | null;
}

export interface SetDataAsyncOptions {
  /** Features processed between yields. Default 64. */
  chunkSize?: number;
  signal?: AbortSignal;
}

/**
 * In-memory GeoJSON source: keeps features for picking and builds GPU meshes.
 * Prefer `setDataAsync` for large FeatureCollections to keep the UI responsive.
 */
export class GeoJSONSource {
  private _features: Feature[] = [];
  private _buckets: FeatureBucket[] = [];
  private _fills: FillMesh[] = [];
  private _lines: LineMesh[] = [];
  private _points: MercatorXY[] = [];
  private _lineJoints: MercatorXY[] = [];
  private _ingestGen = 0;

  constructor(data?: GeoJSON) {
    if (data) this.setData(data);
  }

  setData(data: GeoJSON): void {
    this._ingestGen++;
    const features = flattenFeatures(data);
    const buckets = features.map((f) => buildBucket(f));
    this._applyBuckets(buckets);
  }

  /**
   * Build meshes in chunks, yielding to the event loop between chunks.
   * Later calls / abort cancel in-flight work; only the latest apply wins.
   */
  async setDataAsync(
    data: GeoJSON,
    options?: SetDataAsyncOptions,
  ): Promise<void> {
    const gen = ++this._ingestGen;
    const chunkSize = Math.max(1, options?.chunkSize ?? 64);
    const signal = options?.signal;
    const features = flattenFeatures(data);
    const buckets: FeatureBucket[] = [];

    for (let i = 0; i < features.length; i += chunkSize) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (gen !== this._ingestGen) return;
      const end = Math.min(i + chunkSize, features.length);
      for (let j = i; j < end; j++) {
        buckets.push(buildBucket(features[j]!));
      }
      if (end < features.length) {
        await yieldToMain();
      }
    }

    if (gen !== this._ingestGen) return;
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    this._applyBuckets(buckets);
  }

  getFeatures(): readonly Feature[] {
    return this._features;
  }

  getBuckets(): readonly FeatureBucket[] {
    return this._buckets;
  }

  getFills(): readonly FillMesh[] {
    return this._fills;
  }

  getLines(): readonly LineMesh[] {
    return this._lines;
  }

  getPoints(): readonly MercatorXY[] {
    return this._points;
  }

  /** Vertices of all LineStrings — used for round joins/caps. */
  getLineJoints(): readonly MercatorXY[] {
    return this._lineJoints;
  }

  private _applyBuckets(buckets: FeatureBucket[]): void {
    this._buckets = buckets;
    this._features = buckets.map((b) => b.feature);
    this._fills = [];
    this._lines = [];
    this._points = [];
    this._lineJoints = [];
    for (const bucket of buckets) {
      this._fills.push(...bucket.fills);
      this._lines.push(...bucket.lines);
      this._points.push(...bucket.points);
      this._lineJoints.push(...bucket.lineJoints);
    }
  }
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export function flattenFeatures(data: GeoJSON): Feature[] {
  if (data.type === "FeatureCollection") return [...data.features];
  if (data.type === "Feature") return [data];
  return [{ type: "Feature", properties: {}, geometry: data }];
}

export function buildBucket(feature: Feature): FeatureBucket {
  const bucket: FeatureBucket = {
    feature,
    fills: [],
    lines: [],
    points: [],
    lineJoints: [],
    bbox: null,
  };
  if (feature.geometry) addGeometry(feature.geometry, bucket);
  return bucket;
}

function addGeometry(geometry: Geometry, bucket: FeatureBucket): void {
  switch (geometry.type) {
    case "Point":
      extendBBox(bucket, geometry.coordinates);
      bucket.points.push(toMercator(geometry.coordinates));
      break;
    case "MultiPoint":
      for (const c of geometry.coordinates) {
        extendBBox(bucket, c);
        bucket.points.push(toMercator(c));
      }
      break;
    case "LineString":
      addLine(geometry.coordinates, bucket);
      break;
    case "MultiLineString":
      for (const line of geometry.coordinates) addLine(line, bucket);
      break;
    case "Polygon":
      addPolygon(geometry.coordinates, bucket);
      break;
    case "MultiPolygon":
      for (const poly of geometry.coordinates) addPolygon(poly, bucket);
      break;
    case "GeometryCollection":
      for (const g of geometry.geometries) addGeometry(g, bucket);
      break;
  }
}

function extendBBox(bucket: FeatureBucket, pos: Position): void {
  const lng = pos[0];
  const lat = pos[1];
  if (!bucket.bbox) {
    bucket.bbox = [lng, lat, lng, lat];
    return;
  }
  const b = bucket.bbox;
  if (lng < b[0]) b[0] = lng;
  if (lat < b[1]) b[1] = lat;
  if (lng > b[2]) b[2] = lng;
  if (lat > b[3]) b[3] = lat;
}

function addLine(ring: Position[], bucket: FeatureBucket): void {
  if (ring.length < 2) return;
  for (const c of ring) extendBBox(bucket, c);
  const merc = ring.map(toMercator);
  for (const p of merc) bucket.lineJoints.push(p);

  const segCount = merc.length - 1;
  const vertices = new Float32Array(segCount * 6 * 5);
  let o = 0;
  for (let i = 0; i < segCount; i++) {
    const a = merc[i]!;
    const b = merc[i + 1]!;
    const ox = b.x + (b.x - a.x);
    const oy = b.y + (b.y - a.y);
    o = writeLineVert(vertices, o, a.x, a.y, b.x, b.y, -1);
    o = writeLineVert(vertices, o, a.x, a.y, b.x, b.y, 1);
    o = writeLineVert(vertices, o, b.x, b.y, ox, oy, -1);
    o = writeLineVert(vertices, o, a.x, a.y, b.x, b.y, 1);
    o = writeLineVert(vertices, o, b.x, b.y, ox, oy, -1);
    o = writeLineVert(vertices, o, b.x, b.y, ox, oy, 1);
  }
  bucket.lines.push({ vertices, count: segCount * 6 });
}

function addPolygon(rings: Position[][], bucket: FeatureBucket): void {
  if (rings.length === 0) return;
  const flat: number[] = [];
  const holes: number[] = [];

  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    if (ring.length < 3) continue;
    if (r > 0) holes.push(flat.length / 2);
    const last = ring.length - 1;
    const closed =
      ring.length > 1 &&
      ring[0]![0] === ring[last]![0] &&
      ring[0]![1] === ring[last]![1];
    const end = closed ? last : ring.length;
    for (let i = 0; i < end; i++) {
      const c = ring[i]!;
      extendBBox(bucket, c);
      const p = toMercator(c);
      flat.push(p.x, p.y);
    }
  }

  if (flat.length < 6) return;
  const indices = earcut(flat, holes, 2);
  if (indices.length === 0) return;
  bucket.fills.push({
    positions: new Float32Array(flat),
    indices: new Uint32Array(indices),
  });
}

function toMercator(pos: Position): MercatorXY {
  const p = projectToMercator(new LngLat(pos[0], pos[1]));
  return { x: p.x, y: p.y };
}

function writeLineVert(
  out: Float32Array,
  o: number,
  x: number,
  y: number,
  ox: number,
  oy: number,
  side: number,
): number {
  out[o++] = x;
  out[o++] = y;
  out[o++] = ox;
  out[o++] = oy;
  out[o++] = side;
  return o;
}

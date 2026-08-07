import { clamp } from "./mercator";

export interface TileID {
  z: number;
  x: number;
  y: number;
}

/** A tile covering the viewport, including which world copy it belongs to. */
export interface CoveringTile extends TileID {
  /**
   * Horizontal world copy index.
   * Drawn at mercator X = (x / 2^z) + wrap.
   */
  wrap: number;
}

export function tileKey(id: TileID): string {
  return `${id.z}/${id.x}/${id.y}`;
}

/** Immediate parent tile, or `null` at z0. */
export function parentTile(id: TileID): TileID | null {
  if (id.z <= 0) return null;
  return {
    z: id.z - 1,
    x: Math.floor(id.x / 2),
    y: Math.floor(id.y / 2),
  };
}

/**
 * UV rectangle of `child` inside `ancestor`'s texture (Y south / image down).
 * When equal, returns the full [0,0,1,1] quad.
 */
export function childUvInAncestor(
  child: TileID,
  ancestor: TileID,
): [number, number, number, number] {
  if (
    child.z === ancestor.z &&
    child.x === ancestor.x &&
    child.y === ancestor.y
  ) {
    return [0, 0, 1, 1];
  }
  if (child.z < ancestor.z) {
    throw new Error("childUvInAncestor: child must be at or below ancestor zoom");
  }
  const dz = child.z - ancestor.z;
  const scale = 2 ** dz;
  const u0 = child.x / scale - ancestor.x;
  const v0 = child.y / scale - ancestor.y;
  const s = 1 / scale;
  return [u0, v0, u0 + s, v0 + s];
}

/**
 * Enumerate XYZ tiles covering a mercator AABB at integer zoom.
 * `minX`/`maxX` may extend outside [0, 1] for cross-world (date-line) coverage.
 * Y is clamped to the valid mercator range.
 */
export function coveringTiles(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  zoom: number,
): CoveringTile[] {
  const z = Math.max(0, Math.floor(zoom));
  const n = 2 ** z;

  const x0 = Math.floor(minX * n);
  const x1 = Math.floor(maxX * n - Number.EPSILON);
  const y0 = Math.floor(clamp(minY, 0, 1 - Number.EPSILON) * n);
  const y1 = Math.floor(clamp(maxY, 0, 1 - Number.EPSILON) * n);

  if (x1 < x0 || y1 < y0) return [];

  const tiles: CoveringTile[] = [];
  for (let x = x0; x <= x1; x++) {
    const wrap = Math.floor(x / n);
    const wrappedX = x - wrap * n;
    for (let y = y0; y <= y1; y++) {
      tiles.push({ z, x: wrappedX, y, wrap });
    }
  }
  return tiles;
}

/** Unique tile ids (loading keys) from a covering list. */
export function uniqueTileIDs(tiles: CoveringTile[]): TileID[] {
  const seen = new Set<string>();
  const out: TileID[] = [];
  for (const t of tiles) {
    const key = tileKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ z: t.z, x: t.x, y: t.y });
  }
  return out;
}

/** Build a tile URL from an XYZ template (`{z}/{x}/{y}` or `{s}` subdomain). */
export function formatTileUrl(
  template: string,
  id: TileID,
  subdomains = "abc",
): string {
  const s = subdomains[(id.x + id.y) % subdomains.length] ?? "a";
  return template
    .replaceAll("{z}", String(id.z))
    .replaceAll("{x}", String(id.x))
    .replaceAll("{y}", String(id.y))
    .replaceAll("{s}", s);
}

/**
 * Pick a template from `templates` by tile x/y (load-balance across hosts),
 * then substitute XYZ placeholders.
 */
export function pickTileUrl(
  templates: readonly string[],
  id: TileID,
  subdomains = "abc",
): string {
  if (templates.length === 0) {
    throw new Error("pickTileUrl: templates must not be empty");
  }
  const template = templates[(id.x + id.y) % templates.length]!;
  return formatTileUrl(template, id, subdomains);
}

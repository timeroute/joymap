import { LngLat, type LngLatLike } from "../geo/LngLat";
import {
  clamp,
  MAX_MERCATOR_LATITUDE,
  projectToMercator,
  unprojectFromMercator,
  worldSize,
  type MercatorPoint,
} from "../geo/mercator";

/** Wrap bearing into (-180, 180]. */
export function wrapBearing(bearing: number): number {
  const x = ((((bearing + 180) % 360) + 360) % 360) - 180;
  return x === -180 ? 180 : x;
}

/**
 * Camera / view transform for a 2D Web Mercator map.
 * World units = CSS pixels at the current zoom.
 * Bearing is degrees clockwise from north (MapLibre-compatible).
 */
export class Transform {
  center = new LngLat(0, 0);
  zoom = 2;
  /** Degrees clockwise from north; 0 = north up. */
  bearing = 0;
  width = 1;
  height = 1;
  tileSize = 256;
  minZoom = 0;
  maxZoom = 22;

  get worldSize(): number {
    return worldSize(this.zoom, this.tileSize);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  setCenter(center: LngLatLike): void {
    this.center = LngLat.convert(center).wrap();
  }

  setZoom(zoom: number): void {
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
  }

  setBearing(bearing: number): void {
    this.bearing = wrapBearing(bearing);
  }

  /** Center of the viewport in world pixels (unrotated mercator frame). */
  get centerPoint(): MercatorPoint {
    const p = projectToMercator(this.center);
    const ws = this.worldSize;
    return { x: p.x * ws, y: p.y * ws };
  }

  /**
   * Rotate map-aligned eye offset → screen offset (Y down).
   * Bearing 90° puts east toward screen up.
   */
  mapToScreenDelta(ex: number, ey: number): MercatorPoint {
    const rad = (this.bearing * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return {
      x: ex * c + ey * s,
      y: -ex * s + ey * c,
    };
  }

  /** Inverse of {@link mapToScreenDelta}. */
  screenToMapDelta(sx: number, sy: number): MercatorPoint {
    const rad = (this.bearing * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return {
      x: sx * c - sy * s,
      y: sx * s + sy * c,
    };
  }

  project(lngLat: LngLatLike): MercatorPoint {
    const ll = LngLat.convert(lngLat);
    const p = projectToMercator(ll);
    const ws = this.worldSize;
    const c = this.centerPoint;
    let worldX = p.x * ws;
    worldX += Math.round((c.x - worldX) / ws) * ws;
    const screen = this.mapToScreenDelta(worldX - c.x, p.y * ws - c.y);
    return {
      x: screen.x + this.width / 2,
      y: screen.y + this.height / 2,
    };
  }

  unproject(point: MercatorPoint): LngLat {
    const c = this.centerPoint;
    const ws = this.worldSize;
    const map = this.screenToMapDelta(
      point.x - this.width / 2,
      point.y - this.height / 2,
    );
    const merc = {
      x: (c.x + map.x) / ws,
      y: (c.y + map.y) / ws,
    };
    const { lng, lat } = unprojectFromMercator(merc);
    return new LngLat(lng, lat).wrap();
  }

  /** Pan by screen-pixel delta (right/down positive). */
  panBy(dx: number, dy: number): void {
    const c = this.centerPoint;
    const ws = this.worldSize;
    const map = this.screenToMapDelta(dx, dy);
    const merc = {
      x: (c.x - map.x) / ws,
      y: (c.y - map.y) / ws,
    };
    const { lng, lat } = unprojectFromMercator(merc);
    this.center = new LngLat(
      lng,
      clamp(lat, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
    ).wrap();
  }

  /** Zoom around a screen point (default: viewport center), keeping that geo point fixed. */
  zoomAround(nextZoom: number, around?: MercatorPoint): void {
    const anchor = around ?? { x: this.width / 2, y: this.height / 2 };
    const lngLat = this.unproject(anchor);
    this.setZoom(nextZoom);
    const after = this.project(lngLat);
    this.panBy(anchor.x - after.x, anchor.y - after.y);
  }

  /**
   * Rotate around a screen point (default: viewport center), keeping that geo point fixed.
   */
  rotateBy(deltaBearing: number, around?: MercatorPoint): void {
    const anchor = around ?? { x: this.width / 2, y: this.height / 2 };
    const lngLat = this.unproject(anchor);
    this.setBearing(this.bearing + deltaBearing);
    const after = this.project(lngLat);
    this.panBy(anchor.x - after.x, anchor.y - after.y);
  }

  /** Visible mercator AABB; X may extend outside [0, 1] for world copies. */
  getVisibleMercatorBounds(padding = 0): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const ws = this.worldSize;
    const c = this.centerPoint;
    const halfW = this.width / 2 + padding;
    const halfH = this.height / 2 + padding;
    const corners: Array<[number, number]> = [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH],
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [sx, sy] of corners) {
      const map = this.screenToMapDelta(sx, sy);
      const mx = (c.x + map.x) / ws;
      const my = (c.y + map.y) / ws;
      minX = Math.min(minX, mx);
      minY = Math.min(minY, my);
      maxX = Math.max(maxX, mx);
      maxY = Math.max(maxY, my);
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Orthographic × bearing matrix in eye space (origin = map center).
   * Eye coords are mercator-aligned; rotation is applied here on the GPU.
   */
  getProjectionMatrix(): Float32Array {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const left = -halfW;
    const right = halfW;
    const top = -halfH;
    const bottom = halfH;

    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);

    const ortho = new Float32Array([
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, -1, 0,
      (left + right) * lr, (top + bottom) * bt, 0, 1,
    ]);

    const rad = (this.bearing * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Column-major: map eye → rotated eye (screen-aligned).
    const rotate = new Float32Array([
      cos, -sin, 0, 0,
      sin, cos, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);

    return multiplyMat4(ortho, rotate);
  }

  /** Center in normalized mercator [0,1]² — for relative GPU math. */
  get centerMercator(): MercatorPoint {
    return projectToMercator(this.center);
  }
}

/** Column-major 4×4 multiply: out = a * b. */
function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row]! * b[col * 4]! +
        a[4 + row]! * b[col * 4 + 1]! +
        a[8 + row]! * b[col * 4 + 2]! +
        a[12 + row]! * b[col * 4 + 3]!;
    }
  }
  return out;
}

import { describe, expect, test } from "bun:test";
import { Transform } from "../src/camera/Transform";
import { LngLat } from "../src/geo/LngLat";
import { LngLatBounds } from "../src/geo/LngLatBounds";
import {
  distToLineString,
  pointInPolygon,
  screenDistToLngLat,
} from "../src/geo/hitTest";
import { projectToMercator } from "../src/geo/mercator";

describe("hitTest", () => {
  test("pointInPolygon detects interior", () => {
    const ring: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    expect(pointInPolygon(1, 1, [ring])).toBe(true);
    expect(pointInPolygon(3, 3, [ring])).toBe(false);
  });

  test("distToLineString is near zero on the line", () => {
    const line: [number, number][] = [
      [0, 0],
      [10, 0],
    ];
    expect(distToLineString(5, 0, line)).toBeLessThan(1e-9);
    expect(distToLineString(5, 1, line)).toBeCloseTo(1, 6);
  });

  test("screenDistToLngLat shrinks at higher zoom", () => {
    const z10 = screenDistToLngLat(8, 40, 10);
    const z14 = screenDistToLngLat(8, 40, 14);
    expect(z14).toBeLessThan(z10);
  });
});

describe("fitBounds math", () => {
  test("LngLatBounds.convert accepts bbox array", () => {
    const b = LngLatBounds.convert([116, 39, 117, 40]);
    expect(b.getSouthWest().lng).toBe(116);
    expect(b.getNorthEast().lat).toBe(40);
  });

  test("computed fit zoom keeps bounds in view", () => {
    const t = new Transform();
    t.resize(800, 600);
    const sw = { lng: 116.35, lat: 39.88 };
    const ne = { lng: 116.45, lat: 39.94 };
    const s = projectToMercator(new LngLat(sw.lng, sw.lat));
    const n = projectToMercator(new LngLat(ne.lng, ne.lat));
    const mercW = Math.abs(n.x - s.x);
    const mercH = Math.abs(n.y - s.y);
    const zoom = Math.min(
      Math.log2(720 / (256 * mercW)),
      Math.log2(520 / (256 * mercH)),
    );
    t.setZoom(zoom);
    t.setCenter([(sw.lng + ne.lng) / 2, (sw.lat + ne.lat) / 2]);
    const pSW = t.project([sw.lng, sw.lat]);
    const pNE = t.project([ne.lng, ne.lat]);
    expect(Math.min(pSW.x, pNE.x)).toBeGreaterThanOrEqual(0);
    expect(Math.max(pSW.x, pNE.x)).toBeLessThanOrEqual(800);
    expect(Math.min(pSW.y, pNE.y)).toBeGreaterThanOrEqual(0);
    expect(Math.max(pSW.y, pNE.y)).toBeLessThanOrEqual(600);
  });
});

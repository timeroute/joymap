import { describe, expect, test } from "bun:test";
import { LngLat } from "../src/geo/LngLat";
import {
  projectToMercator,
  unprojectFromMercator,
  worldSize,
} from "../src/geo/mercator";
import { coveringTiles, formatTileUrl, pickTileUrl, uniqueTileIDs } from "../src/geo/tile";
import { Transform } from "../src/camera/Transform";

describe("mercator", () => {
  test("round-trips lng/lat near equator", () => {
    const ll = new LngLat(116.397, 39.908);
    const p = projectToMercator(ll);
    const back = unprojectFromMercator(p);
    expect(back.lng).toBeCloseTo(ll.lng, 6);
    expect(back.lat).toBeCloseTo(ll.lat, 6);
  });

  test("worldSize doubles per zoom", () => {
    expect(worldSize(0)).toBe(256);
    expect(worldSize(1)).toBe(512);
    expect(worldSize(2)).toBe(1024);
  });
});

describe("tiles", () => {
  test("coveringTiles returns unique ids in range", () => {
    const tiles = coveringTiles(0.4, 0.4, 0.6, 0.6, 3);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.z === 3)).toBe(true);
    expect(tiles.every((t) => t.wrap === 0)).toBe(true);
  });

  test("coveringTiles spans world copies when bounds cross antimeridian", () => {
    // Mercator X just left of 0 and just right of 1 → wraps -1 and 0
    const tiles = coveringTiles(-0.05, 0.4, 0.05, 0.6, 3);
    const wraps = new Set(tiles.map((t) => t.wrap));
    expect(wraps.has(-1)).toBe(true);
    expect(wraps.has(0)).toBe(true);
    expect(tiles.every((t) => t.x >= 0 && t.x < 8)).toBe(true);
    // Loading uses wrapped XYZ only once per tile
    const unique = uniqueTileIDs(tiles);
    expect(unique.length).toBeGreaterThan(0);
    expect(unique.length).toBeLessThanOrEqual(tiles.length);
  });

  test("coveringTiles draws multiple worlds when zoomed out", () => {
    // Wide viewport in mercator units at z=0 (n=1)
    const tiles = coveringTiles(-1.2, 0, 2.2, 1, 0);
    const wraps = [...new Set(tiles.map((t) => t.wrap))].sort((a, b) => a - b);
    expect(wraps[0]!).toBeLessThan(0);
    expect(wraps[wraps.length - 1]!).toBeGreaterThan(0);
  });

  test("formatTileUrl substitutes placeholders", () => {
    const url = formatTileUrl(
      "https://{s}.example.com/{z}/{x}/{y}.png",
      { z: 2, x: 1, y: 3 },
      "abc",
    );
    expect(url).toBe("https://b.example.com/2/1/3.png");
  });

  test("pickTileUrl load-balances across templates", () => {
    const templates = [
      "https://a.example.com/{z}/{x}/{y}.png",
      "https://b.example.com/{z}/{x}/{y}.png",
      "https://c.example.com/{z}/{x}/{y}.png",
    ];
    expect(pickTileUrl(templates, { z: 1, x: 0, y: 0 })).toBe(
      "https://a.example.com/1/0/0.png",
    );
    expect(pickTileUrl(templates, { z: 1, x: 1, y: 0 })).toBe(
      "https://b.example.com/1/1/0.png",
    );
    expect(pickTileUrl(templates, { z: 1, x: 1, y: 1 })).toBe(
      "https://c.example.com/1/1/1.png",
    );
  });
});

describe("Transform", () => {
  test("project/unproject round-trip at center", () => {
    const t = new Transform();
    t.resize(800, 600);
    t.setCenter([116.397, 39.908]);
    t.setZoom(10);
    const screen = t.project(t.center);
    expect(screen.x).toBeCloseTo(400, 5);
    expect(screen.y).toBeCloseTo(300, 5);
    const back = t.unproject(screen);
    expect(back.lng).toBeCloseTo(116.397, 5);
    expect(back.lat).toBeCloseTo(39.908, 5);
  });

  test("panBy shifts center", () => {
    const t = new Transform();
    t.resize(800, 600);
    t.setCenter([0, 0]);
    t.setZoom(3);
    const before = t.center.lng;
    t.panBy(100, 0);
    expect(t.center.lng).toBeLessThan(before);
  });

  test("zoomAround keeps geo point under screen anchor", () => {
    const t = new Transform();
    t.resize(800, 600);
    t.setCenter([116.397, 39.908]);
    t.setZoom(10);
    const anchor = { x: 120, y: 480 };
    const before = t.unproject(anchor);
    t.zoomAround(12.5, anchor);
    const after = t.unproject(anchor);
    expect(after.lng).toBeCloseTo(before.lng, 6);
    expect(after.lat).toBeCloseTo(before.lat, 6);
    const screen = t.project(before);
    expect(screen.x).toBeCloseTo(anchor.x, 5);
    expect(screen.y).toBeCloseTo(anchor.y, 5);
  });

  test("bearing rotates project/unproject consistently", () => {
    const t = new Transform();
    t.resize(800, 600);
    t.setCenter([116.4, 39.9]);
    t.setZoom(11);
    t.setBearing(45);
    const ll = new LngLat(116.45, 39.92);
    const screen = t.project(ll);
    const back = t.unproject(screen);
    expect(back.lng).toBeCloseTo(ll.lng, 6);
    expect(back.lat).toBeCloseTo(ll.lat, 6);
  });

  test("bearing 90 puts a point east of center toward screen up", () => {
    const t = new Transform();
    t.resize(800, 600);
    t.setCenter([0, 0]);
    t.setZoom(8);
    t.setBearing(90);
    const east = t.project([1, 0]);
    expect(east.x).toBeCloseTo(400, 0);
    expect(east.y).toBeLessThan(300);
  });

  test("panBy respects bearing", () => {
    const t = new Transform();
    t.resize(800, 600);
    t.setCenter([0, 0]);
    t.setZoom(8);
    t.setBearing(90);
    const before = t.center.clone();
    // Same as unrotated panBy(+x): content follows the finger.
    // Screen drag up (east when bearing=90) moves center west.
    t.panBy(0, -100);
    expect(t.center.lng).toBeLessThan(before.lng);
  });

  test("project picks nearest world copy across antimeridian", () => {
    const t = new Transform();
    t.resize(800, 600);
    t.setCenter([179.5, 0]);
    t.setZoom(4);
    // Point just across the date line should land near the center, not ±world away
    const screen = t.project([-179.5, 0]);
    expect(Math.abs(screen.x - 400)).toBeLessThan(100);
  });
});

import { describe, expect, test } from "bun:test";
import { Transform } from "../src/camera/Transform";
import { mercToScreen } from "../src/layer/SymbolLayer";
import { projectToMercator } from "../src/geo/mercator";
import { LngLat } from "../src/geo/LngLat";
import { resolveString } from "../src/style/expression";
import type { Feature } from "../src/geo/geojson";

const feature = (props: Record<string, unknown>): Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "Point", coordinates: [116.4, 39.9] },
});

describe("resolveString", () => {
  test("literal and get expression", () => {
    expect(resolveString("hello", null)).toBe("hello");
    expect(resolveString(["get", "name"], feature({ name: "天安门" }))).toBe(
      "天安门",
    );
    expect(resolveString(["get", "missing"], feature({}), "fallback")).toBe(
      "fallback",
    );
    expect(
      resolveString(["to-string", ["get", "level"]], feature({ level: 3 })),
    ).toBe("3");
  });
});

describe("mercToScreen", () => {
  test("center mercator projects near viewport center", () => {
    const tr = new Transform();
    tr.resize(800, 600);
    tr.setCenter([116.4, 39.9]);
    tr.setZoom(10);
    const merc = projectToMercator(new LngLat(116.4, 39.9));
    const screen = mercToScreen(tr, merc, 0);
    expect(screen.x).toBeCloseTo(400, 0);
    expect(screen.y).toBeCloseTo(300, 0);
  });
});

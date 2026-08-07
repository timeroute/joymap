import { describe, expect, test } from "bun:test";
import { parseColor } from "../src/geo/geojson";
import { GeoJSONSource } from "../src/source/GeoJSONSource";

describe("parseColor", () => {
  test("parses hex and rgba tuples", () => {
    expect(parseColor("#ff0000")).toEqual([1, 0, 0, 1]);
    expect(parseColor("#00ff0080")[3]).toBeCloseTo(0x80 / 255, 5);
    expect(parseColor([0.2, 0.4, 0.6, 0.5])).toEqual([0.2, 0.4, 0.6, 0.5]);
  });
});

describe("GeoJSONSource", () => {
  test("builds fill / line / point meshes", () => {
    const source = new GeoJSONSource({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: null,
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: "Feature",
          properties: null,
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0],
              [1, 1],
              [2, 0],
            ],
          },
        },
        {
          type: "Feature",
          properties: null,
          geometry: { type: "Point", coordinates: [10, 20] },
        },
      ],
    });

    expect(source.getFills().length).toBe(1);
    expect(source.getFills()[0]!.indices.length).toBeGreaterThanOrEqual(3);
    expect(source.getLines().length).toBe(1);
    expect(source.getLines()[0]!.count).toBe(12); // 2 segments × 6 verts
    expect(source.getPoints().length).toBe(1);
    expect(source.getBuckets().length).toBe(3);
    expect(source.getBuckets()[0]!.fills.length).toBe(1);
    expect(source.getBuckets()[0]!.bbox).toEqual([0, 0, 1, 1]);
    expect(source.getBuckets()[1]!.bbox).toEqual([0, 0, 2, 1]);
    expect(source.getBuckets()[2]!.bbox).toEqual([10, 20, 10, 20]);
    expect(source.getBuckets()[2]!.points.length).toBe(1);
  });

  test("setData replaces geometry", () => {
    const source = new GeoJSONSource({
      type: "Point",
      coordinates: [0, 0],
    });
    source.setData({ type: "Point", coordinates: [1, 1] });
    expect(source.getPoints().length).toBe(1);
    expect(source.getFills().length).toBe(0);
  });
});

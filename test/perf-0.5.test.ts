import { describe, expect, test } from "bun:test";
import {
  childUvInAncestor,
  parentTile,
} from "../src/geo/tile";
import { TileManager } from "../src/source/TileManager";
import { GeoJSONSource } from "../src/source/GeoJSONSource";
import type { TileEntry } from "../src/source/TileCache";

describe("parent overzoom helpers", () => {
  test("parentTile walks up the pyramid", () => {
    expect(parentTile({ z: 2, x: 2, y: 1 })).toEqual({ z: 1, x: 1, y: 0 });
    expect(parentTile({ z: 0, x: 0, y: 0 })).toBeNull();
  });

  test("childUvInAncestor covers the southern half of a parent", () => {
    const uv = childUvInAncestor(
      { z: 2, x: 2, y: 1 },
      { z: 1, x: 1, y: 0 },
    );
    expect(uv[0]).toBeCloseTo(0);
    expect(uv[1]).toBeCloseTo(0.5);
    expect(uv[2]).toBeCloseTo(0.5);
    expect(uv[3]).toBeCloseTo(1);
  });

  test("childUvInAncestor is identity for the same tile", () => {
    expect(childUvInAncestor({ z: 3, x: 4, y: 5 }, { z: 3, x: 4, y: 5 })).toEqual([
      0, 0, 1, 1,
    ]);
  });
});

describe("TileManager retain / cancel", () => {
  test("aborts in-flight tiles that leave the viewport", () => {
    const manager = new TileManager({
      url: "https://example.com/{z}/{x}/{y}.png",
    });
    const a = new AbortController();
    const b = new AbortController();
    manager.cache.set({
      id: { z: 1, x: 0, y: 0 },
      status: "loading",
      image: null,
      texture: null,
      abort: a,
      lastUsed: 1,
    });
    manager.cache.set({
      id: { z: 1, x: 1, y: 0 },
      status: "loading",
      image: null,
      texture: null,
      abort: b,
      lastUsed: 2,
    });

    manager.requestTiles([{ z: 1, x: 1, y: 0 }]);

    expect(a.signal.aborted).toBe(true);
    expect(manager.cache.get({ z: 1, x: 0, y: 0 })).toBeUndefined();
    expect(manager.cache.get({ z: 1, x: 1, y: 0 })?.status).toBe("loading");
    expect(b.signal.aborted).toBe(false);
  });

  test("resolveForDisplay falls back to a loaded parent", () => {
    const manager = new TileManager({
      url: "https://example.com/{z}/{x}/{y}.png",
    });
    const parent: TileEntry = {
      id: { z: 1, x: 1, y: 0 },
      status: "loaded",
      image: null,
      texture: {} as WebGLTexture,
      abort: null,
      lastUsed: 0,
    };
    manager.cache.set(parent);

    const resolved = manager.resolveForDisplay({ z: 2, x: 2, y: 1 });
    expect(resolved).not.toBeNull();
    expect(resolved!.sourceId).toEqual({ z: 1, x: 1, y: 0 });
    expect(resolved!.uvRect[1]).toBeCloseTo(0.5);
  });
});

describe("GeoJSONSource.setDataAsync", () => {
  test("builds the same meshes as setData", async () => {
    const data = {
      type: "FeatureCollection" as const,
      features: Array.from({ length: 5 }, (_, i) => ({
        type: "Feature" as const,
        properties: { i },
        geometry: {
          type: "Point" as const,
          coordinates: [i, i] as [number, number],
        },
      })),
    };
    const sync = new GeoJSONSource(data);
    const asyncSrc = new GeoJSONSource();
    await asyncSrc.setDataAsync(data, { chunkSize: 2 });
    expect(asyncSrc.getPoints().length).toBe(sync.getPoints().length);
    expect(asyncSrc.getBuckets().length).toBe(5);
  });

  test("newer ingest wins over an in-flight older one", async () => {
    const source = new GeoJSONSource();
    const first = source.setDataAsync(
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [0, 0] },
          },
        ],
      },
      { chunkSize: 1 },
    );
    const second = source.setDataAsync(
      {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [1, 1] },
          },
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [2, 2] },
          },
        ],
      },
      { chunkSize: 1 },
    );
    await Promise.all([first, second]);
    expect(source.getPoints().length).toBe(2);
  });
});

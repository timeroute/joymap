import { describe, expect, test } from "bun:test";
import { TileCache, type TileEntry } from "../src/source/TileCache";
import { TileManager } from "../src/source/TileManager";
import { Evented } from "../src/core/Evented";

describe("TileManager.getLoaded", () => {
  test("keeps tiles drawable after CPU bitmap is released", () => {
    const manager = new TileManager({
      url: "https://example.com/{z}/{x}/{y}.png",
    });
    const id = { z: 1, x: 0, y: 0 };
    const entry: TileEntry = {
      id,
      status: "loaded",
      image: null,
      texture: {} as WebGLTexture,
      abort: null,
      lastUsed: 0,
    };
    manager.cache.set(entry);
    expect(manager.getLoaded(id)).toBe(entry);
  });

  test("returns undefined when neither image nor texture exists", () => {
    const manager = new TileManager({
      url: "https://example.com/{z}/{x}/{y}.png",
    });
    const id = { z: 1, x: 0, y: 0 };
    manager.cache.set({
      id,
      status: "loaded",
      image: null,
      texture: null,
      abort: null,
      lastUsed: 0,
    });
    expect(manager.getLoaded(id)).toBeUndefined();
  });

  test("retries tiles that previously failed", () => {
    const manager = new TileManager({
      url: "https://example.com/{z}/{x}/{y}.png",
    });
    const id = { z: 2, x: 1, y: 1 };
    manager.cache.set({
      id,
      status: "error",
      image: null,
      texture: null,
      abort: null,
      lastUsed: 0,
    });
    manager.requestTiles([id]);
    const entry = manager.cache.get(id);
    expect(entry?.status).toBe("loading");
  });
});

describe("TileCache disposal", () => {
  test("deletes GL textures on eviction", () => {
    const deleted: WebGLTexture[] = [];
    const gl = {
      deleteTexture: (t: WebGLTexture) => {
        deleted.push(t);
      },
    } as unknown as WebGL2RenderingContext;

    const cache = new TileCache(2);
    cache.setGL(gl);

    const texA = { id: "a" } as unknown as WebGLTexture;
    const texB = { id: "b" } as unknown as WebGLTexture;
    const texC = { id: "c" } as unknown as WebGLTexture;

    cache.set({
      id: { z: 0, x: 0, y: 0 },
      status: "loaded",
      image: null,
      texture: texA,
      abort: null,
      lastUsed: 1,
    });
    cache.set({
      id: { z: 0, x: 1, y: 0 },
      status: "loaded",
      image: null,
      texture: texB,
      abort: null,
      lastUsed: 2,
    });
    cache.set({
      id: { z: 0, x: 2, y: 0 },
      status: "loaded",
      image: null,
      texture: texC,
      abort: null,
      lastUsed: 3,
    });

    expect(cache.size).toBe(2);
    expect(deleted).toContain(texA);
    expect(cache.get({ z: 0, x: 0, y: 0 })).toBeUndefined();
  });

  test("aborts in-flight loads when forced to shrink", () => {
    const cache = new TileCache(1);
    const a = new AbortController();
    const b = new AbortController();
    cache.set({
      id: { z: 0, x: 0, y: 0 },
      status: "loading",
      image: null,
      texture: null,
      abort: a,
      lastUsed: 1,
    });
    cache.set({
      id: { z: 0, x: 1, y: 0 },
      status: "loading",
      image: null,
      texture: null,
      abort: b,
      lastUsed: 2,
    });
    expect(cache.get({ z: 0, x: 0, y: 0 })).toBeUndefined();
    expect(a.signal.aborted).toBe(true);
    expect(cache.get({ z: 0, x: 1, y: 0 })?.status).toBe("loading");
    expect(cache.size).toBe(1);
  });

  test("destroy stops further notifications", () => {
    let calls = 0;
    const manager = new TileManager({
      url: "https://example.com/{z}/{x}/{y}.png",
      onTileUpdate: () => {
        calls++;
      },
    });
    manager.destroy();
    manager.requestTiles([{ z: 0, x: 0, y: 0 }]);
    expect(manager.cache.size).toBe(0);
    expect(calls).toBe(0);
  });
});

describe("Evented", () => {
  test("removeAllListeners clears handlers and isolates errors", () => {
    const bus = new Evented<{ ping: { type: "ping" } }>();
    let count = 0;
    bus.on("ping", () => {
      count++;
      throw new Error("handler boom");
    });
    bus.on("ping", () => {
      count++;
    });
    bus.fire("ping", { type: "ping" });
    expect(count).toBe(2);
    bus.removeAllListeners();
    bus.fire("ping", { type: "ping" });
    expect(count).toBe(2);
  });
});

describe("TileCache context loss", () => {
  test("loseContext drops textures and marks GPU-only tiles for reload", () => {
    const cache = new TileCache(8);
    const tex = { id: "t" } as unknown as WebGLTexture;
    cache.setGL({
      deleteTexture: () => {},
    } as unknown as WebGL2RenderingContext);
    cache.set({
      id: { z: 1, x: 0, y: 0 },
      status: "loaded",
      image: null,
      texture: tex,
      abort: null,
      lastUsed: 1,
    });
    cache.loseContext();
    const entry = cache.get({ z: 1, x: 0, y: 0 });
    expect(entry?.texture).toBeNull();
    expect(entry?.status).toBe("error");
  });
});

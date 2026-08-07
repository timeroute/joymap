import {
  childUvInAncestor,
  parentTile,
  pickTileUrl,
  tileKey,
  type TileID,
} from "../geo/tile";
import { TileCache, type TileEntry } from "./TileCache";

export interface TileSourceOptions {
  /**
   * XYZ URL template(s). Multiple entries are load-balanced by tile x/y
   * (e.g. `a/b/c.tile.host/...`). Prefer `urls` when listing several hosts;
   * `url` is a single-template shorthand.
   */
  url?: string;
  urls?: string[];
  tileSize?: number;
  subdomains?: string;
  minZoom?: number;
  maxZoom?: number;
  maxCacheSize?: number;
  /** Called when a tile finishes loading (success or error). */
  onTileUpdate?: () => void;
}

/** How many parent levels to keep warm for overzoom fallback. */
const PARENT_RETAIN_DEPTH = 4;

export class TileManager {
  readonly cache: TileCache;
  readonly tileSize: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  private readonly _urls: string[];
  private readonly _subdomains: string;
  private readonly _onTileUpdate?: () => void;
  private _alive = true;

  constructor(options: TileSourceOptions) {
    const urls =
      options.urls?.filter((u) => u.length > 0) ??
      (options.url ? [options.url] : []);
    if (urls.length === 0) {
      throw new Error("TileManager requires url or urls");
    }
    this._urls = urls;
    this.tileSize = options.tileSize ?? 256;
    this._subdomains = options.subdomains ?? "abc";
    this.minZoom = options.minZoom ?? 0;
    this.maxZoom = options.maxZoom ?? 19;
    this._onTileUpdate = options.onTileUpdate;
    this.cache = new TileCache(options.maxCacheSize ?? 256);
  }

  /** Bind GL so cache eviction can delete textures. */
  attachGL(gl: WebGL2RenderingContext): void {
    this.cache.setGL(gl);
  }

  /** Drop GPU textures after context loss; loaded tiles without bitmaps will refetch. */
  loseContext(): void {
    this.cache.loseContext();
  }

  /**
   * Request ideal-zoom tiles and cancel in-flight loads that left the viewport.
   * Loaded parent tiles covering the request are retained for overzoom fallback.
   */
  requestTiles(ids: TileID[]): void {
    if (!this._alive) return;
    const now = performance.now();
    const retain = new Set<string>();

    for (const id of ids) {
      retain.add(tileKey(id));
      let p = parentTile(id);
      for (let d = 0; d < PARENT_RETAIN_DEPTH && p; d++) {
        retain.add(tileKey(p));
        const existing = this.cache.get(p);
        if (existing?.status === "loaded") {
          existing.lastUsed = now;
        }
        p = parentTile(p);
      }
    }

    for (const entry of [...this.cache.values()]) {
      if (entry.status !== "loading") continue;
      if (retain.has(tileKey(entry.id))) continue;
      this.cache.delete(entry.id);
    }

    for (const id of ids) {
      const existing = this.cache.get(id);
      if (existing) {
        if (existing.status === "error") {
          this.cache.delete(id);
        } else {
          existing.lastUsed = now;
          continue;
        }
      }
      this._load(id);
    }
  }

  getLoaded(id: TileID): TileEntry | undefined {
    const entry = this.cache.get(id);
    if (entry?.status === "loaded" && (entry.texture || entry.image)) {
      return entry;
    }
    return undefined;
  }

  /**
   * Ideal tile if loaded; otherwise nearest loaded ancestor (for overzoom).
   * Returns UV rect into the ancestor texture covering the ideal tile.
   */
  resolveForDisplay(
    id: TileID,
    maxDepth = PARENT_RETAIN_DEPTH,
  ): {
    entry: TileEntry;
    sourceId: TileID;
    uvRect: [number, number, number, number];
  } | null {
    let cur: TileID | null = id;
    for (let d = 0; d <= maxDepth && cur; d++) {
      const entry = this.getLoaded(cur);
      if (entry) {
        entry.lastUsed = performance.now();
        return {
          entry,
          sourceId: cur,
          uvRect: childUvInAncestor(id, cur),
        };
      }
      cur = parentTile(cur);
      if (cur && cur.z < this.minZoom) break;
    }
    return null;
  }

  destroy(gl?: WebGL2RenderingContext): void {
    this._alive = false;
    if (gl) this.cache.setGL(gl);
    this.cache.clear();
    this.cache.setGL(null);
  }

  private _load(id: TileID): void {
    const abort = new AbortController();
    const entry: TileEntry = {
      id,
      status: "loading",
      image: null,
      texture: null,
      abort,
      lastUsed: performance.now(),
    };
    this.cache.set(entry);

    const url = pickTileUrl(this._urls, id, this._subdomains);
    fetch(url, { signal: abort.signal, mode: "cors" })
      .then(async (res) => {
        if (!this._alive || abort.signal.aborted) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!this._alive || abort.signal.aborted) return null;
        return createImageBitmap(blob);
      })
      .then((bitmap) => {
        if (!bitmap) return;
        if (
          !this._alive ||
          abort.signal.aborted ||
          this.cache.get(id) !== entry
        ) {
          bitmap.close();
          return;
        }
        entry.image = bitmap;
        entry.status = "loaded";
        entry.abort = null;
        this._notify();
      })
      .catch((err: unknown) => {
        if (!this._alive || abort.signal.aborted) return;
        if (this.cache.get(id) !== entry) return;
        entry.status = "error";
        entry.abort = null;
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.warn(`[joymap] tile failed ${id.z}/${id.x}/${id.y}`, err);
        }
        this._notify();
      });
  }

  private _notify(): void {
    if (!this._alive) return;
    this._onTileUpdate?.();
  }
}

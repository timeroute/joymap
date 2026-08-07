import type { TileID } from "../geo/tile";
import { tileKey } from "../geo/tile";

export type TileStatus = "loading" | "loaded" | "error";

export interface TileEntry {
  id: TileID;
  status: TileStatus;
  image: ImageBitmap | null;
  texture: WebGLTexture | null;
  abort: AbortController | null;
  lastUsed: number;
}

/**
 * LRU-ish tile cache. Always disposes CPU/GPU resources on eviction/removal.
 * Bind a WebGL context via `setGL` so textures are deleted on dispose.
 */
export class TileCache {
  private readonly _tiles = new Map<string, TileEntry>();
  private _gl: WebGL2RenderingContext | null = null;

  constructor(private readonly maxSize = 256) {}

  get size(): number {
    return this._tiles.size;
  }

  setGL(gl: WebGL2RenderingContext | null): void {
    this._gl = gl;
  }

  get(id: TileID): TileEntry | undefined {
    return this._tiles.get(tileKey(id));
  }

  set(entry: TileEntry): void {
    const key = tileKey(entry.id);
    const prev = this._tiles.get(key);
    if (prev && prev !== entry) {
      this._disposeEntry(prev);
    }
    this._tiles.set(key, entry);
    this._evict();
  }

  /** Remove one tile and dispose its resources. */
  delete(id: TileID): boolean {
    const key = tileKey(id);
    const entry = this._tiles.get(key);
    if (!entry) return false;
    this._disposeEntry(entry);
    this._tiles.delete(key);
    return true;
  }

  values(): IterableIterator<TileEntry> {
    return this._tiles.values();
  }

  clear(): void {
    for (const entry of this._tiles.values()) {
      this._disposeEntry(entry);
    }
    this._tiles.clear();
  }

  /**
   * After webglcontextlost: drop invalid textures.
   * Entries that only lived on the GPU are marked error so they refetch.
   */
  loseContext(): void {
    this._gl = null;
    for (const entry of this._tiles.values()) {
      entry.texture = null;
      if (entry.status === "loaded" && !entry.image) {
        entry.status = "error";
      }
    }
  }

  private _evict(): void {
    if (this._tiles.size <= this.maxSize) return;

    const entries = [...this._tiles.entries()].sort(
      (a, b) => a[1].lastUsed - b[1].lastUsed,
    );

    for (const [key, entry] of entries) {
      if (this._tiles.size <= this.maxSize) break;
      // Prefer dropping idle loaded/error tiles first.
      if (entry.status === "loading") continue;
      this._disposeEntry(entry);
      this._tiles.delete(key);
    }

    // Still over capacity (many in-flight loads): abort oldest loading tiles.
    if (this._tiles.size <= this.maxSize) return;
    const loading = [...this._tiles.entries()]
      .filter(([, e]) => e.status === "loading")
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, entry] of loading) {
      if (this._tiles.size <= this.maxSize) break;
      this._disposeEntry(entry);
      this._tiles.delete(key);
    }
  }

  private _disposeEntry(entry: TileEntry): void {
    entry.abort?.abort();
    entry.abort = null;
    if (entry.texture && this._gl) {
      this._gl.deleteTexture(entry.texture);
    }
    entry.texture = null;
    if (entry.image) {
      entry.image.close();
      entry.image = null;
    }
    // Mark so late async callbacks can detect disposal even if they hold a ref.
    if (entry.status === "loading") {
      entry.status = "error";
    }
  }
}

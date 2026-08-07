import type { Transform } from "../camera/Transform";
import {
  coveringTiles,
  uniqueTileIDs,
  type CoveringTile,
} from "../geo/tile";
import type { Renderer } from "../render/Renderer";
import {
  TileManager,
  type TileSourceOptions,
} from "../source/TileManager";

/** Hard cap to avoid pathological tile storms (huge viewports / many wraps). */
const MAX_COVERING_TILES = 512;

export interface TileLayerOptions extends TileSourceOptions {
  opacity?: number;
}

export class TileLayer {
  readonly id: string;
  readonly manager: TileManager;
  opacity: number;

  constructor(id: string, options: TileLayerOptions) {
    this.id = id;
    this.opacity = options.opacity ?? 1;
    this.manager = new TileManager(options);
  }

  /** Wire GL for texture disposal on cache eviction. */
  attachGL(gl: WebGL2RenderingContext): void {
    this.manager.attachGL(gl);
  }

  loseContext(): void {
    this.manager.loseContext();
  }

  update(transform: Transform): CoveringTile[] {
    const z = Math.min(
      this.manager.maxZoom,
      Math.max(this.manager.minZoom, Math.round(transform.zoom)),
    );
    const bounds = transform.getVisibleMercatorBounds(transform.tileSize);
    let covers = coveringTiles(
      bounds.minX,
      bounds.minY,
      bounds.maxX,
      bounds.maxY,
      z,
    );
    if (covers.length > MAX_COVERING_TILES) {
      covers = covers.slice(0, MAX_COVERING_TILES);
    }
    this.manager.requestTiles(uniqueTileIDs(covers));
    return covers;
  }

  render(renderer: Renderer, transform: Transform, covers: CoveringTile[]): void {
    const z = covers[0]?.z ?? Math.round(transform.zoom);
    const scale = 2 ** (transform.zoom - z);
    const size = transform.tileSize * scale;
    const n = 2 ** z;
    const ws = transform.worldSize;

    const drawList: Array<{
      entry: NonNullable<ReturnType<TileManager["getLoaded"]>>;
      worldX: number;
      worldY: number;
      size: number;
      uvRect: [number, number, number, number];
    }> = [];

    for (const tile of covers) {
      const resolved = this.manager.resolveForDisplay({
        z: tile.z,
        x: tile.x,
        y: tile.y,
      });
      if (!resolved) continue;
      const c = transform.centerPoint;
      const worldX = ((tile.x + tile.wrap * n) / n) * ws - c.x;
      const worldY = (tile.y / n) * ws - c.y;
      drawList.push({
        entry: resolved.entry,
        worldX,
        worldY,
        size,
        uvRect: resolved.uvRect,
      });
    }

    renderer.drawTiles(transform, drawList, this.opacity);
  }

  destroy(gl?: WebGL2RenderingContext): void {
    this.manager.destroy(gl);
  }
}

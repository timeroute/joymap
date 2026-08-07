import type { Transform } from "../camera/Transform";
import type { Feature } from "../geo/geojson";
import { visibleWraps } from "../geo/wraps";
import type { Renderer } from "../render/Renderer";
import type { VectorRenderer } from "../render/VectorRenderer";
import type { FillMesh, GeoJSONSource } from "../source/GeoJSONSource";
import {
  groupBucketsByPaint,
  paintGroupKey,
  resolvePaintRgba,
} from "../style/batch";
import {
  isExpression,
  type ColorExpression,
  type NumberExpression,
} from "../style/expression";
import type { CustomLayerInterface } from "./types";

export interface FillLayerOptions {
  id: string;
  source: GeoJSONSource;
  paint?: {
    "fill-color"?: ColorExpression;
    "fill-opacity"?: NumberExpression;
  };
}

export class FillLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = "fill";
  visible = true;
  private readonly _source: GeoJSONSource;
  private _color: ColorExpression;
  private _opacity: NumberExpression;

  constructor(options: FillLayerOptions) {
    this.id = options.id;
    this._source = options.source;
    this._color = options.paint?.["fill-color"] ?? "#3d9cf0";
    this._opacity = options.paint?.["fill-opacity"] ?? 0.45;
  }

  getSource(): GeoJSONSource {
    return this._source;
  }

  setPaintProperty(
    name: "fill-color" | "fill-opacity",
    value: ColorExpression | NumberExpression,
  ): void {
    if (name === "fill-color") this._color = value as ColorExpression;
    else if (name === "fill-opacity")
      this._opacity = value as NumberExpression;
    else throw new Error(`Unknown paint property: ${name as string}`);
  }

  getHitTolerancePx(_feature?: Feature): number {
    return 2;
  }

  render(
    _renderer: Renderer,
    vectors: VectorRenderer,
    transform: Transform,
  ): void {
    if (!this.visible) return;
    const wraps = visibleWraps(transform);
    const driven =
      isExpression(this._color) || isExpression(this._opacity);

    if (!driven) {
      const color = resolvePaintRgba(
        this._color,
        this._opacity,
        null,
        "#3d9cf0",
        0.45,
      );
      vectors.drawFills(transform, this._source.getFills(), wraps, color);
      return;
    }

    const groups = groupBucketsByPaint(
      this._source.getBuckets(),
      (b) => b.fills.length === 0,
      (b) => {
        const color = resolvePaintRgba(
          this._color,
          this._opacity,
          b.feature,
          "#3d9cf0",
          0.45,
        );
        return {
          key: paintGroupKey(color),
          group: { color, fills: [] as FillMesh[] },
        };
      },
      (g, b) => {
        g.fills.push(...b.fills);
      },
    );
    for (const group of groups) {
      vectors.drawFills(transform, group.fills, wraps, group.color);
    }
  }
}

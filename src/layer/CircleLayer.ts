import type { Transform } from "../camera/Transform";
import type { Feature } from "../geo/geojson";
import { visibleWraps } from "../geo/wraps";
import type { Renderer } from "../render/Renderer";
import type { VectorRenderer } from "../render/VectorRenderer";
import type { GeoJSONSource, MercatorXY } from "../source/GeoJSONSource";
import {
  groupBucketsByPaint,
  paintGroupKey,
  resolvePaintRgba,
} from "../style/batch";
import {
  isExpression,
  resolveNumber,
  type ColorExpression,
  type NumberExpression,
} from "../style/expression";
import type { CustomLayerInterface } from "./types";

export interface CircleLayerOptions {
  id: string;
  source: GeoJSONSource;
  paint?: {
    "circle-color"?: ColorExpression;
    "circle-radius"?: NumberExpression;
    "circle-opacity"?: NumberExpression;
  };
}

export class CircleLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = "circle";
  visible = true;
  private readonly _source: GeoJSONSource;
  private _color: ColorExpression;
  private _radius: NumberExpression;
  private _opacity: NumberExpression;

  constructor(options: CircleLayerOptions) {
    this.id = options.id;
    this._source = options.source;
    this._color = options.paint?.["circle-color"] ?? "#e85d4c";
    this._radius = options.paint?.["circle-radius"] ?? 7;
    this._opacity = options.paint?.["circle-opacity"] ?? 1;
  }

  getSource(): GeoJSONSource {
    return this._source;
  }

  setPaintProperty(
    name: "circle-color" | "circle-radius" | "circle-opacity",
    value: ColorExpression | NumberExpression,
  ): void {
    if (name === "circle-color") this._color = value as ColorExpression;
    else if (name === "circle-radius")
      this._radius = value as NumberExpression;
    else if (name === "circle-opacity")
      this._opacity = value as NumberExpression;
    else throw new Error(`Unknown paint property: ${name as string}`);
  }

  getHitTolerancePx(feature?: Feature): number {
    const radius = resolveNumber(this._radius, feature ?? null, 7);
    return radius + 2;
  }

  render(
    _renderer: Renderer,
    vectors: VectorRenderer,
    transform: Transform,
  ): void {
    if (!this.visible) return;
    const wraps = visibleWraps(transform);
    const driven =
      isExpression(this._color) ||
      isExpression(this._radius) ||
      isExpression(this._opacity);

    if (!driven) {
      const color = resolvePaintRgba(
        this._color,
        this._opacity,
        null,
        "#e85d4c",
        1,
      );
      const radius = resolveNumber(this._radius, null, 7);
      vectors.drawCircles(
        transform,
        this._source.getPoints(),
        wraps,
        color,
        radius,
      );
      return;
    }

    const groups = groupBucketsByPaint(
      this._source.getBuckets(),
      (b) => b.points.length === 0,
      (b) => {
        const color = resolvePaintRgba(
          this._color,
          this._opacity,
          b.feature,
          "#e85d4c",
          1,
        );
        const radius = resolveNumber(this._radius, b.feature, 7);
        return {
          key: paintGroupKey(color, radius),
          group: { color, radius, points: [] as MercatorXY[] },
        };
      },
      (g, b) => {
        g.points.push(...b.points);
      },
    );
    for (const group of groups) {
      vectors.drawCircles(
        transform,
        group.points,
        wraps,
        group.color,
        group.radius,
      );
    }
  }
}

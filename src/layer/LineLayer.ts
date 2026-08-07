import type { Transform } from "../camera/Transform";
import type { Feature } from "../geo/geojson";
import { visibleWraps } from "../geo/wraps";
import type { Renderer } from "../render/Renderer";
import type { VectorRenderer } from "../render/VectorRenderer";
import type {
  GeoJSONSource,
  LineMesh,
  MercatorXY,
} from "../source/GeoJSONSource";
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

export interface LineLayerOptions {
  id: string;
  source: GeoJSONSource;
  paint?: {
    "line-color"?: ColorExpression;
    "line-width"?: NumberExpression;
    "line-opacity"?: NumberExpression;
  };
}

export class LineLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = "line";
  visible = true;
  private readonly _source: GeoJSONSource;
  private _color: ColorExpression;
  private _width: NumberExpression;
  private _opacity: NumberExpression;

  constructor(options: LineLayerOptions) {
    this.id = options.id;
    this._source = options.source;
    this._color = options.paint?.["line-color"] ?? "#1a5f9e";
    this._width = options.paint?.["line-width"] ?? 3;
    this._opacity = options.paint?.["line-opacity"] ?? 1;
  }

  getSource(): GeoJSONSource {
    return this._source;
  }

  setPaintProperty(
    name: "line-color" | "line-width" | "line-opacity",
    value: ColorExpression | NumberExpression,
  ): void {
    if (name === "line-color") this._color = value as ColorExpression;
    else if (name === "line-width") this._width = value as NumberExpression;
    else if (name === "line-opacity")
      this._opacity = value as NumberExpression;
    else throw new Error(`Unknown paint property: ${name as string}`);
  }

  getHitTolerancePx(feature?: Feature): number {
    const width = resolveNumber(this._width, feature ?? null, 3);
    return width / 2 + 2;
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
      isExpression(this._width) ||
      isExpression(this._opacity);

    if (!driven) {
      const color = resolvePaintRgba(
        this._color,
        this._opacity,
        null,
        "#1a5f9e",
        1,
      );
      const width = resolveNumber(this._width, null, 3);
      this._draw(vectors, transform, wraps, this._source.getLines(), this._source.getLineJoints(), color, width);
      return;
    }

    const groups = groupBucketsByPaint(
      this._source.getBuckets(),
      (b) => b.lines.length === 0,
      (b) => {
        const color = resolvePaintRgba(
          this._color,
          this._opacity,
          b.feature,
          "#1a5f9e",
          1,
        );
        const width = resolveNumber(this._width, b.feature, 3);
        return {
          key: paintGroupKey(color, width),
          group: {
            color,
            width,
            lines: [] as LineMesh[],
            joints: [] as MercatorXY[],
          },
        };
      },
      (g, b) => {
        g.lines.push(...b.lines);
        g.joints.push(...b.lineJoints);
      },
    );
    for (const group of groups) {
      this._draw(
        vectors,
        transform,
        wraps,
        group.lines,
        group.joints,
        group.color,
        group.width,
      );
    }
  }

  private _draw(
    vectors: VectorRenderer,
    transform: Transform,
    wraps: number[],
    lines: readonly LineMesh[],
    joints: readonly MercatorXY[],
    color: { r: number; g: number; b: number; a: number },
    width: number,
  ): void {
    vectors.drawLines(transform, lines, wraps, color, width);
    vectors.drawCircles(transform, joints, wraps, color, width / 2);
  }
}

import type { Transform } from "../camera/Transform";
import type { Feature } from "../geo/geojson";
import { visibleWraps } from "../geo/wraps";
import type { Renderer } from "../render/Renderer";
import type { VectorRenderer } from "../render/VectorRenderer";
import type { GeoJSONSource, MercatorXY } from "../source/GeoJSONSource";
import {
  resolveColor,
  resolveNumber,
  resolveString,
  type ColorExpression,
  type NumberExpression,
  type StringExpression,
} from "../style/expression";
import type { CustomLayerInterface } from "./types";

export type TextAnchor =
  | "center"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface SymbolLayerOptions {
  id: string;
  source: GeoJSONSource;
  /** Parent overlay root (`joymap-overlay`). */
  overlay: HTMLElement;
  layout?: {
    "text-field"?: StringExpression;
    "text-size"?: NumberExpression;
    /** Pixel offset [x, y] in screen space. */
    "text-offset"?: [number, number];
    "text-anchor"?: TextAnchor;
    /** When false (default), overlapping labels are hidden. */
    "text-allow-overlap"?: boolean;
  };
  paint?: {
    "text-color"?: ColorExpression;
    "text-opacity"?: NumberExpression;
    "text-halo-color"?: ColorExpression;
    "text-halo-width"?: NumberExpression;
  };
}

const ANCHOR_TRANSFORM: Record<TextAnchor, string> = {
  center: "translate(-50%, -50%)",
  left: "translate(0, -50%)",
  right: "translate(-100%, -50%)",
  top: "translate(-50%, 0)",
  bottom: "translate(-50%, -100%)",
  "top-left": "translate(0, 0)",
  "top-right": "translate(-100%, 0)",
  "bottom-left": "translate(0, -100%)",
  "bottom-right": "translate(-100%, -100%)",
};

interface LabelPlacement {
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  halo: string;
  haloWidth: number;
  w: number;
  h: number;
}

/**
 * Point labels rendered as HTML overlays (system fonts, CJK-friendly).
 * Positions update each frame from mercator → screen with wrap support.
 */
export class SymbolLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = "symbol";
  visible = true;
  private readonly _source: GeoJSONSource;
  private readonly _root: HTMLElement;
  private readonly _pool: HTMLElement[] = [];
  private _textField: StringExpression;
  private _textSize: NumberExpression;
  private _textOffset: [number, number];
  private _textAnchor: TextAnchor;
  private _allowOverlap: boolean;
  private _textColor: ColorExpression;
  private _textOpacity: NumberExpression;
  private _haloColor: ColorExpression;
  private _haloWidth: NumberExpression;

  constructor(options: SymbolLayerOptions) {
    this.id = options.id;
    this._source = options.source;
    this._textField = options.layout?.["text-field"] ?? "";
    this._textSize = options.layout?.["text-size"] ?? 13;
    this._textOffset = options.layout?.["text-offset"] ?? [0, 0];
    this._textAnchor = options.layout?.["text-anchor"] ?? "center";
    this._allowOverlap = options.layout?.["text-allow-overlap"] ?? false;
    this._textColor = options.paint?.["text-color"] ?? "#1e293b";
    this._textOpacity = options.paint?.["text-opacity"] ?? 1;
    this._haloColor = options.paint?.["text-halo-color"] ?? "#ffffff";
    this._haloWidth = options.paint?.["text-halo-width"] ?? 1.5;

    this._root = document.createElement("div");
    this._root.className = "joymap-symbol-layer";
    this._root.dataset.layerId = this.id;
    options.overlay.appendChild(this._root);
  }

  getSource(): GeoJSONSource {
    return this._source;
  }

  setLayoutProperty(
    name:
      | "text-field"
      | "text-size"
      | "text-offset"
      | "text-anchor"
      | "text-allow-overlap",
    value: unknown,
  ): void {
    if (name === "text-field") this._textField = value as StringExpression;
    else if (name === "text-size") this._textSize = value as NumberExpression;
    else if (name === "text-offset") {
      const o = value as [number, number];
      this._textOffset = [o[0] ?? 0, o[1] ?? 0];
    } else if (name === "text-anchor") this._textAnchor = value as TextAnchor;
    else if (name === "text-allow-overlap") this._allowOverlap = !!value;
    else throw new Error(`Unknown layout property: ${name as string}`);
  }

  setPaintProperty(
    name:
      | "text-color"
      | "text-opacity"
      | "text-halo-color"
      | "text-halo-width",
    value: ColorExpression | NumberExpression,
  ): void {
    if (name === "text-color") this._textColor = value as ColorExpression;
    else if (name === "text-opacity")
      this._textOpacity = value as NumberExpression;
    else if (name === "text-halo-color")
      this._haloColor = value as ColorExpression;
    else if (name === "text-halo-width")
      this._haloWidth = value as NumberExpression;
    else throw new Error(`Unknown paint property: ${name as string}`);
  }

  getHitTolerancePx(feature?: Feature): number {
    const size = resolveNumber(this._textSize, feature ?? null, 13);
    return size * 0.6 + 4;
  }

  render(
    _renderer: Renderer,
    _vectors: VectorRenderer,
    transform: Transform,
  ): void {
    if (!this.visible) {
      this._root.style.display = "none";
      return;
    }
    this._root.style.display = "";

    const wraps = visibleWraps(transform);
    const [ox, oy] = this._textOffset;
    const anchor = ANCHOR_TRANSFORM[this._textAnchor] ?? ANCHOR_TRANSFORM.center;
    const placements: LabelPlacement[] = [];

    for (const bucket of this._source.getBuckets()) {
      if (bucket.points.length === 0) continue;
      const text = resolveString(this._textField, bucket.feature, "");
      if (!text) continue;
      const size = resolveNumber(this._textSize, bucket.feature, 13);
      const opacity = resolveNumber(this._textOpacity, bucket.feature, 1);
      const [r, g, b, a] = resolveColor(
        this._textColor,
        bucket.feature,
        "#1e293b",
      );
      const [hr, hg, hb, ha] = resolveColor(
        this._haloColor,
        bucket.feature,
        "#ffffff",
      );
      const haloWidth = resolveNumber(this._haloWidth, bucket.feature, 1.5);
      const color = rgbaCss(r, g, b, a * opacity);
      const halo = rgbaCss(hr, hg, hb, ha * opacity);
      const w = estimateTextWidth(text, size);
      const h = size * 1.25;

      for (const p of bucket.points) {
        for (const wrap of wraps) {
          const screen = mercToScreen(transform, p, wrap);
          const x = screen.x + ox;
          const y = screen.y + oy;
          if (
            x < -w ||
            y < -h ||
            x > transform.width + w ||
            y > transform.height + h
          ) {
            continue;
          }
          placements.push({ x, y, text, size, color, halo, haloWidth, w, h });
        }
      }
    }

    const shown = this._allowOverlap
      ? placements
      : collide(placements);

    let i = 0;
    for (; i < shown.length; i++) {
      const p = shown[i]!;
      const el = this._ensureEl(i);
      el.style.display = "";
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.style.transform = anchor;
      el.style.fontSize = `${p.size}px`;
      el.style.color = p.color;
      el.style.textShadow =
        p.haloWidth > 0
          ? `0 0 ${p.haloWidth}px ${p.halo}, 0 0 ${p.haloWidth}px ${p.halo}`
          : "none";
      if (el.textContent !== p.text) el.textContent = p.text;
    }
    for (; i < this._pool.length; i++) {
      this._pool[i]!.style.display = "none";
    }
  }

  destroy(): void {
    this._root.remove();
    this._pool.length = 0;
  }

  private _ensureEl(index: number): HTMLElement {
    let el = this._pool[index];
    if (!el) {
      el = document.createElement("div");
      el.className = "joymap-label";
      this._root.appendChild(el);
      this._pool[index] = el;
    }
    return el;
  }
}

/** Mercator (normalized) + wrap → CSS pixel screen position. */
export function mercToScreen(
  transform: Transform,
  p: MercatorXY,
  wrap: number,
): { x: number; y: number } {
  const cm = transform.centerMercator;
  const ws = transform.worldSize;
  const ex = (p.x + wrap - cm.x) * ws;
  const ey = (p.y - cm.y) * ws;
  const screen = transform.mapToScreenDelta(ex, ey);
  return {
    x: screen.x + transform.width / 2,
    y: screen.y + transform.height / 2,
  };
}

function rgbaCss(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}

function estimateTextWidth(text: string, size: number): number {
  let units = 0;
  for (const ch of text) {
    units += ch.codePointAt(0)! > 0xff ? 1 : 0.55;
  }
  return units * size;
}

/** Greedy collision: keep earlier labels, drop overlaps. */
function collide(placements: LabelPlacement[]): LabelPlacement[] {
  const kept: LabelPlacement[] = [];
  for (const p of placements) {
    const left = p.x - p.w / 2;
    const right = p.x + p.w / 2;
    const top = p.y - p.h / 2;
    const bottom = p.y + p.h / 2;
    let hit = false;
    for (const q of kept) {
      const ql = q.x - q.w / 2;
      const qr = q.x + q.w / 2;
      const qt = q.y - q.h / 2;
      const qb = q.y + q.h / 2;
      if (left < qr && right > ql && top < qb && bottom > qt) {
        hit = true;
        break;
      }
    }
    if (!hit) kept.push(p);
  }
  return kept;
}

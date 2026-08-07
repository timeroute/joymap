import type { Feature } from "../geo/geojson";
import type { Rgba } from "../render/VectorRenderer";
import type { FeatureBucket } from "../source/GeoJSONSource";
import {
  resolveColor,
  resolveNumber,
  type ColorExpression,
  type NumberExpression,
} from "./expression";

/** Stable key for grouping draw calls that share the same paint. */
export function rgbaKey(color: Rgba): string {
  return `${color.r.toFixed(4)},${color.g.toFixed(4)},${color.b.toFixed(4)},${color.a.toFixed(4)}`;
}

export function paintGroupKey(color: Rgba, ...nums: number[]): string {
  return `${rgbaKey(color)}|${nums.map((n) => n.toFixed(3)).join(",")}`;
}

/** Color × opacity → premultiplied-alpha-ready RGBA for draw calls. */
export function resolvePaintRgba(
  color: ColorExpression,
  opacity: NumberExpression,
  feature: Feature | null,
  defaultColor: string,
  defaultOpacity: number,
): Rgba {
  const [r, g, b, a] = resolveColor(color, feature, defaultColor);
  const o = resolveNumber(opacity, feature, defaultOpacity);
  return { r, g, b, a: a * o };
}

/**
 * Group feature buckets that share paint into draw batches.
 * `create` runs once per new key; `add` merges each matching bucket.
 */
export function groupBucketsByPaint<T>(
  buckets: readonly FeatureBucket[],
  skip: (bucket: FeatureBucket) => boolean,
  create: (bucket: FeatureBucket) => { key: string; group: T },
  add: (group: T, bucket: FeatureBucket) => void,
): T[] {
  const groups = new Map<string, T>();
  for (const bucket of buckets) {
    if (skip(bucket)) continue;
    const { key, group } = create(bucket);
    let existing = groups.get(key);
    if (!existing) {
      existing = group;
      groups.set(key, existing);
    }
    add(existing, bucket);
  }
  return [...groups.values()];
}

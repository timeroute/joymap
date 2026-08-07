import type { Transform } from "../camera/Transform";

/** Hard cap on world copies to bound draw cost when zoomed far out. */
const MAX_WRAPS = 8;

/**
 * Integer world-copy indices intersecting the current viewport (X axis).
 * Result is capped to {@link MAX_WRAPS} copies nearest the primary world.
 */
export function visibleWraps(transform: Transform, padding = 0): number[] {
  const b = transform.getVisibleMercatorBounds(padding);
  const minW = Math.floor(b.minX);
  const maxW = Math.floor(b.maxX);
  const wraps: number[] = [];
  for (let w = minW; w <= maxW; w++) wraps.push(w);
  if (wraps.length === 0) return [0];
  if (wraps.length <= MAX_WRAPS) return wraps;
  return wraps
    .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
    .slice(0, MAX_WRAPS)
    .sort((a, b) => a - b);
}

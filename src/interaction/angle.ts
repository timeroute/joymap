/** Normalize Δθ into (-π, π] so continuous drag/gesture stays smooth. */
export function wrapAngleDelta(deltaRad: number): number {
  let d = deltaRad;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

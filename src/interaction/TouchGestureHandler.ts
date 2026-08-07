import type { Transform } from "../camera/Transform";
import { wrapAngleDelta } from "./angle";

type Pt = { x: number; y: number };

/**
 * Two-finger touch gestures: pinch-zoom, rotate, and pan about the midpoint.
 * Works via Pointer Events (mobile + touch-capable desktops).
 */
export class TouchGestureHandler {
  private readonly _pointers = new Map<number, Pt>();
  private _active = false;
  private _lastDist = 0;
  private _lastAngle = 0;
  private _lastMid: Pt = { x: 0, y: 0 };

  constructor(
    private readonly el: HTMLElement,
    private readonly transform: Transform,
    private readonly onMove: () => void,
    private readonly onGestureStart?: () => void,
    private readonly onGestureEnd?: () => void,
  ) {
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  get isActive(): boolean {
    return this._active;
  }

  /** True while two or more touch points are tracked. */
  get isTouching(): boolean {
    return this._pointers.size >= 2;
  }

  enable(): void {
    this.el.addEventListener("pointerdown", this._onPointerDown);
  }

  disable(): void {
    this.el.removeEventListener("pointerdown", this._onPointerDown);
    this._endGesture();
    this._pointers.clear();
    this.el.removeEventListener("pointermove", this._onPointerMove);
    this.el.removeEventListener("pointerup", this._onPointerUp);
    this.el.removeEventListener("pointercancel", this._onPointerUp);
  }

  private _onPointerDown(e: PointerEvent): void {
    if (e.pointerType !== "touch") return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (this._pointers.size === 1) {
      this.el.addEventListener("pointermove", this._onPointerMove);
      this.el.addEventListener("pointerup", this._onPointerUp);
      this.el.addEventListener("pointercancel", this._onPointerUp);
    }
    if (this._pointers.size === 2) {
      this._beginGesture();
    }
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size < 2 || !this._active) return;

    const [a, b] = [...this._pointers.values()];
    if (!a || !b) return;

    const mid = midpoint(a, b);
    const dist = distance(a, b);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);

    // Pan by midpoint movement (screen space).
    const dx = mid.x - this._lastMid.x;
    const dy = mid.y - this._lastMid.y;
    if (dx !== 0 || dy !== 0) {
      this.transform.panBy(dx, dy);
    }

    // Pinch zoom around midpoint (map-local).
    if (this._lastDist > 0 && dist > 0) {
      const ratio = dist / this._lastDist;
      if (Math.abs(ratio - 1) > 1e-4) {
        const rect = this.el.getBoundingClientRect();
        const around = {
          x: mid.x - rect.left,
          y: mid.y - rect.top,
        };
        const nextZoom = this.transform.zoom + Math.log2(ratio);
        this.transform.zoomAround(nextZoom, around);
      }
    }

    // Two-finger rotate about midpoint.
    const deltaDeg =
      (-wrapAngleDelta(angle - this._lastAngle) * 180) / Math.PI;
    if (Math.abs(deltaDeg) > 1e-4) {
      const rect = this.el.getBoundingClientRect();
      this.transform.rotateBy(deltaDeg, {
        x: mid.x - rect.left,
        y: mid.y - rect.top,
      });
    }

    this._lastDist = dist;
    this._lastAngle = angle;
    this._lastMid = mid;
    this.onMove();
  }

  private _onPointerUp(e: PointerEvent): void {
    if (!this._pointers.has(e.pointerId)) return;
    this._pointers.delete(e.pointerId);
    try {
      if (this.el.hasPointerCapture(e.pointerId)) {
        this.el.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (this._pointers.size < 2) {
      this._endGesture();
    }
    if (this._pointers.size === 0) {
      this.el.removeEventListener("pointermove", this._onPointerMove);
      this.el.removeEventListener("pointerup", this._onPointerUp);
      this.el.removeEventListener("pointercancel", this._onPointerUp);
    } else if (this._pointers.size === 2) {
      // Returned to two fingers after a third lifted — re-baseline.
      this._beginGesture();
    }
  }

  private _beginGesture(): void {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) return;
    const a = pts[0]!;
    const b = pts[1]!;
    this._lastDist = distance(a, b);
    this._lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
    this._lastMid = midpoint(a, b);
    if (!this._active) {
      this._active = true;
      this.onGestureStart?.();
    }
  }

  private _endGesture(): void {
    if (!this._active) {
      this._lastDist = 0;
      return;
    }
    this._active = false;
    this._lastDist = 0;
    this.onGestureEnd?.();
  }
}

function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

import type { Transform } from "../camera/Transform";

/** Idle after last wheel before gesture can end. */
const WHEEL_END_MS = 120;
/** Exponential smoothing time constant (ms). Higher = softer. */
const SMOOTH_TAU_MS = 140;
const EPSILON = 1e-4;

/**
 * Wheel zoom with eased interpolation toward a target zoom.
 * Keeps the cursor's geographic point fixed while animating.
 */
export class ScrollZoomHandler {
  private _zooming = false;
  private _wheelIdle = true;
  private _endTimer = 0;
  private _raf = 0;
  private _targetZoom = 0;
  private _around = { x: 0, y: 0 };
  private _lastFrame = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly transform: Transform,
    private readonly onStart: () => void,
    private readonly onMove: () => void,
    private readonly onEnd: () => void,
  ) {
    this._onWheel = this._onWheel.bind(this);
    this._tick = this._tick.bind(this);
  }

  enable(): void {
    this.el.addEventListener("wheel", this._onWheel, { passive: false });
  }

  disable(): void {
    this.el.removeEventListener("wheel", this._onWheel);
    this.finish();
  }

  /** End an in-flight wheel gesture (e.g. before easeTo / drag). */
  finish(): void {
    if (this._endTimer) {
      clearTimeout(this._endTimer);
      this._endTimer = 0;
    }
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    if (!this._zooming) return;
    // Snap to target so the next camera owner starts from a clean zoom.
    if (Math.abs(this.transform.zoom - this._targetZoom) > EPSILON) {
      this.transform.zoomAround(this._targetZoom, this._around);
      this.onMove();
    }
    this._zooming = false;
    this._wheelIdle = true;
    this.onEnd();
  }

  private _onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    this._around = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    let delta = e.deltaY;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
    if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= 100;

    // Pixel deltas are smaller; trackpads send many tiny events — keep responsive.
    const zoomDelta = -delta / 200;

    if (!this._zooming) {
      this._zooming = true;
      this._targetZoom = this.transform.zoom;
      this._lastFrame = performance.now();
      this.onStart();
    }

    this._wheelIdle = false;
    this._targetZoom = clamp(
      this._targetZoom + zoomDelta,
      this.transform.minZoom,
      this.transform.maxZoom,
    );

    if (this._endTimer) clearTimeout(this._endTimer);
    this._endTimer = window.setTimeout(() => {
      this._endTimer = 0;
      this._wheelIdle = true;
      // Keep ticking until we settle on the target, then end.
      this._ensureTick();
    }, WHEEL_END_MS);

    this._ensureTick();
  }

  private _ensureTick(): void {
    if (!this._raf) {
      this._raf = requestAnimationFrame(this._tick);
    }
  }

  private _tick(now: number): void {
    this._raf = 0;
    if (!this._zooming) return;

    const dt = Math.min(64, Math.max(0, now - this._lastFrame));
    this._lastFrame = now;

    const current = this.transform.zoom;
    const target = this._targetZoom;
    const k = 1 - Math.exp(-dt / SMOOTH_TAU_MS);
    let next = current + (target - current) * k;
    if (Math.abs(target - next) < EPSILON) next = target;

    if (Math.abs(next - current) > 1e-9) {
      this.transform.zoomAround(next, this._around);
      this.onMove();
    }

    const settled = Math.abs(this.transform.zoom - target) < EPSILON;
    if (!settled || !this._wheelIdle) {
      this._ensureTick();
      return;
    }

    this._zooming = false;
    this.onEnd();
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

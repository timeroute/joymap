import type { Transform } from "../camera/Transform";

const WHEEL_END_MS = 150;

export class ScrollZoomHandler {
  private _zooming = false;
  private _endTimer = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly transform: Transform,
    private readonly onStart: () => void,
    private readonly onMove: () => void,
    private readonly onEnd: () => void,
  ) {
    this._onWheel = this._onWheel.bind(this);
  }

  enable(): void {
    this.el.addEventListener("wheel", this._onWheel, { passive: false });
  }

  disable(): void {
    this.el.removeEventListener("wheel", this._onWheel);
    this.finish();
  }

  /** End an in-flight wheel gesture (e.g. before easeTo). */
  finish(): void {
    if (this._endTimer) {
      clearTimeout(this._endTimer);
      this._endTimer = 0;
    }
    if (!this._zooming) return;
    this._zooming = false;
    this.onEnd();
  }

  private _onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    const around = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // Normalize wheel delta across devices
    let delta = e.deltaY;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 16;
    if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= 100;

    const zoomDelta = -delta / 200;
    if (!this._zooming) {
      this._zooming = true;
      this.onStart();
    }
    this.transform.zoomAround(this.transform.zoom + zoomDelta, around);
    this.onMove();

    if (this._endTimer) clearTimeout(this._endTimer);
    this._endTimer = window.setTimeout(() => {
      this._endTimer = 0;
      this._zooming = false;
      this.onEnd();
    }, WHEEL_END_MS);
  }
}

import type { Transform } from "../camera/Transform";

export class DragPanHandler {
  private _active = false;
  private _moved = false;
  private _pointerId = -1;
  private _lastX = 0;
  private _lastY = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly transform: Transform,
    private readonly onStart: () => void,
    private readonly onMove: () => void,
    private readonly onEnd: () => void,
    /** When true (e.g. two-finger gesture), single-finger pan yields. */
    private readonly shouldYield?: () => boolean,
  ) {
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
  }

  enable(): void {
    this.el.addEventListener("pointerdown", this._onPointerDown);
  }

  disable(): void {
    this.el.removeEventListener("pointerdown", this._onPointerDown);
    this._stop();
  }

  private _onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    // Touch pan is single-finger only; yield to TouchGestureHandler for 2+.
    if (e.pointerType === "touch" && this.shouldYield?.()) return;
    if (e.pointerType === "touch" && this._active) {
      // Second finger arrived while panning — abort pan.
      this._stop();
      return;
    }
    this._active = true;
    this._moved = false;
    this._pointerId = e.pointerId;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    this.el.addEventListener("pointermove", this._onPointerMove);
    this.el.addEventListener("pointerup", this._onPointerUp);
    this.el.addEventListener("pointercancel", this._onPointerUp);
    this.el.style.cursor = "grabbing";
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this._active || e.pointerId !== this._pointerId) return;
    if (this.shouldYield?.()) {
      this._stop();
      return;
    }
    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    if (dx === 0 && dy === 0) return;
    if (!this._moved) {
      this._moved = true;
      this.onStart();
    }
    this.transform.panBy(dx, dy);
    this.onMove();
  }

  private _onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this._pointerId && this._pointerId !== -1) return;
    try {
      if (this.el.hasPointerCapture(e.pointerId)) {
        this.el.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Pointer may already be released during teardown.
    }
    this._stop();
  }

  private _stop(): void {
    const ended = this._moved;
    this._active = false;
    this._moved = false;
    this._pointerId = -1;
    this.el.removeEventListener("pointermove", this._onPointerMove);
    this.el.removeEventListener("pointerup", this._onPointerUp);
    this.el.removeEventListener("pointercancel", this._onPointerUp);
    this.el.style.cursor = "grab";
    if (ended) this.onEnd();
  }
}

import type { Transform } from "../camera/Transform";
import { wrapAngleDelta } from "./angle";

/**
 * Right-button drag rotates the map around the viewport center.
 */
export class DragRotateHandler {
  private _active = false;
  private _moved = false;
  private _lastAngle = 0;
  private _pointerId = -1;

  constructor(
    private readonly el: HTMLElement,
    private readonly transform: Transform,
    private readonly onStart: () => void,
    private readonly onMove: () => void,
    private readonly onEnd: () => void,
  ) {
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
  }

  enable(): void {
    this.el.addEventListener("pointerdown", this._onPointerDown);
    this.el.addEventListener("contextmenu", this._onContextMenu);
  }

  disable(): void {
    this.el.removeEventListener("pointerdown", this._onPointerDown);
    this.el.removeEventListener("contextmenu", this._onContextMenu);
    this._stop();
  }

  private _onContextMenu(e: Event): void {
    e.preventDefault();
  }

  private _onPointerDown(e: PointerEvent): void {
    if (e.button !== 2) return;
    e.preventDefault();
    this._active = true;
    this._moved = false;
    this._pointerId = e.pointerId;
    this._lastAngle = this._angleFromCenter(e);
    this.el.setPointerCapture(e.pointerId);
    this.el.addEventListener("pointermove", this._onPointerMove);
    this.el.addEventListener("pointerup", this._onPointerUp);
    this.el.addEventListener("pointercancel", this._onPointerUp);
    this.el.style.cursor = "move";
  }

  private _onPointerMove(e: PointerEvent): void {
    if (!this._active || e.pointerId !== this._pointerId) return;
    const angle = this._angleFromCenter(e);
    const deltaDeg = (-wrapAngleDelta(angle - this._lastAngle) * 180) / Math.PI;
    this._lastAngle = angle;
    if (deltaDeg === 0) return;
    if (!this._moved) {
      this._moved = true;
      this.onStart();
    }
    this.transform.rotateBy(deltaDeg, {
      x: this.transform.width / 2,
      y: this.transform.height / 2,
    });
    this.onMove();
  }

  private _onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this._pointerId && this._pointerId !== -1) return;
    try {
      if (this.el.hasPointerCapture(e.pointerId)) {
        this.el.releasePointerCapture(e.pointerId);
      }
    } catch {
      // already released
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

  /** Angle from viewport center to pointer; 0 = screen up, clockwise positive. */
  private _angleFromCenter(e: PointerEvent): number {
    const rect = this.el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(e.clientX - cx, cy - e.clientY);
  }
}

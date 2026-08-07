/**
 * Double-click (or double-tap) zooms in by one level around the cursor.
 */
export class DoubleClickZoomHandler {
  private readonly _delta: number;

  constructor(
    private readonly el: HTMLElement,
    private readonly onZoomAround: (
      nextZoom: number,
      around: { x: number; y: number },
    ) => void,
    private readonly getZoom: () => number,
    private readonly onBeforeZoom?: () => void,
    delta = 1,
  ) {
    this._delta = delta;
    this._onDblClick = this._onDblClick.bind(this);
  }

  enable(): void {
    this.el.addEventListener("dblclick", this._onDblClick);
  }

  disable(): void {
    this.el.removeEventListener("dblclick", this._onDblClick);
  }

  private _onDblClick(e: MouseEvent): void {
    e.preventDefault();
    this.onBeforeZoom?.();
    const rect = this.el.getBoundingClientRect();
    const around = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    this.onZoomAround(this.getZoom() + this._delta, around);
  }
}

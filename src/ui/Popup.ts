import type { Map } from "../core/Map";
import { LngLat, type LngLatLike } from "../geo/LngLat";
import { ensureMapCss } from "./css";

export interface PopupOptions {
  closeButton?: boolean;
  offset?: [number, number];
  className?: string;
}

export class Popup {
  private readonly _element: HTMLElement;
  private readonly _content: HTMLElement;
  private readonly _offset: [number, number];
  private _lngLat = new LngLat(0, 0);
  private _map: Map | null = null;

  constructor(options: PopupOptions = {}) {
    ensureMapCss();
    this._offset = options.offset ?? [0, 0];
    this._element = document.createElement("div");
    this._element.className = `joymap-popup${options.className ? ` ${options.className}` : ""}`;
    this._content = document.createElement("div");
    this._content.className = "joymap-popup-content";
    this._element.appendChild(this._content);
    const tip = document.createElement("div");
    tip.className = "joymap-popup-tip";
    this._element.appendChild(tip);
    if (options.closeButton !== false) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "joymap-popup-close";
      btn.setAttribute("aria-label", "Close");
      btn.textContent = "×";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.remove();
      });
      this._element.appendChild(btn);
    }
  }

  getElement(): HTMLElement {
    return this._element;
  }

  setLngLat(lngLat: LngLatLike): this {
    this._lngLat = LngLat.convert(lngLat).clone();
    this._update();
    return this;
  }

  getLngLat(): LngLat {
    return this._lngLat.clone();
  }

  setHTML(html: string): this {
    this._content.innerHTML = html;
    this._update();
    return this;
  }

  setText(text: string): this {
    this._content.textContent = text;
    this._update();
    return this;
  }

  addTo(map: Map): this {
    if (this._map) this.remove();
    this._map = map;
    map._addPopup(this);
    this._update();
    return this;
  }

  remove(): this {
    if (!this._map) return this;
    this._map._removePopup(this);
    this._element.remove();
    this._map = null;
    return this;
  }

  isOpen(): boolean {
    return this._map !== null;
  }

  /**
   * Anchor the tip (bottom-center) on the projected lng/lat.
   * Uses transform so left/top stay at 0 and tip clearance stays stable across zooms.
   */
  _update(): void {
    if (!this._map) return;
    const p = this._map.project(this._lngLat);
    const x = p.x + this._offset[0];
    const y = p.y + this._offset[1];
    // Tip diamond extends ~8px below the box; keep tip vertex on the anchor.
    this._element.style.transform =
      `translate(${x}px, ${y}px) translate(-50%, -100%) translateY(-8px)`;
  }
}

import type { Map } from "../core/Map";
import { LngLat, type LngLatLike } from "../geo/LngLat";
import { ensureMapCss } from "./css";

export interface MarkerOptions {
  element?: HTMLElement;
  color?: string;
  /** Pixel offset from anchor [x, y]. */
  offset?: [number, number];
}

export class Marker {
  private readonly _element: HTMLElement;
  private readonly _offset: [number, number];
  private _lngLat = new LngLat(0, 0);
  private _map: Map | null = null;

  constructor(options: MarkerOptions = {}) {
    ensureMapCss();
    if (options.element) {
      this._element = options.element;
      this._element.classList.add("joymap-marker");
    } else {
      this._element = document.createElement("div");
      this._element.className = "joymap-marker joymap-marker-default";
      this._element.style.background = options.color ?? "#e85d4c";
    }
    this._offset = options.offset ?? [0, 0];
  }

  getElement(): HTMLElement {
    return this._element;
  }

  getLngLat(): LngLat {
    return this._lngLat.clone();
  }

  setLngLat(lngLat: LngLatLike): this {
    this._lngLat = LngLat.convert(lngLat).clone();
    this._update();
    return this;
  }

  addTo(map: Map): this {
    if (this._map) this.remove();
    this._map = map;
    map._addMarker(this);
    this._update();
    return this;
  }

  remove(): this {
    if (!this._map) return this;
    this._map._removeMarker(this);
    this._element.remove();
    this._map = null;
    return this;
  }

  /** Called by Map on move/zoom/resize. */
  _update(): void {
    if (!this._map) return;
    const p = this._map.project(this._lngLat);
    const x = p.x + this._offset[0];
    const y = p.y + this._offset[1];
    const isPin = this._element.classList.contains("joymap-marker-default");
    // Pin rotates about its tip (bottom-center) so the point stays on the lng/lat.
    this._element.style.transformOrigin = isPin ? "50% 100%" : "50% 100%";
    this._element.style.transform = isPin
      ? `translate(${x}px, ${y}px) translate(-50%, -100%) rotate(-45deg)`
      : `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}

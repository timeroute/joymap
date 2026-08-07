import type { Map } from "../core/Map";
import type { ControlPosition, IControl } from "./types";

export class NavigationControl implements IControl {
  private _container: HTMLElement | null = null;
  private _compass: HTMLElement | null = null;
  private _map: Map | null = null;
  private _onRotate: (() => void) | null = null;

  onAdd(map: Map): HTMLElement {
    this._map = map;
    const el = document.createElement("div");
    el.className = "joymap-ctrl joymap-ctrl-group joymap-ctrl-nav";
    el.innerHTML = `
      <button type="button" class="joymap-ctrl-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
      <button type="button" class="joymap-ctrl-zoom-out" title="Zoom out" aria-label="Zoom out">−</button>
      <button type="button" class="joymap-ctrl-compass" title="Reset bearing to north" aria-label="Reset bearing to north">
        <span class="joymap-ctrl-compass-arrow" aria-hidden="true"></span>
      </button>
    `;
    el.querySelector(".joymap-ctrl-zoom-in")!.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      map.easeTo({ zoom: map.getZoom() + 1, duration: 300 });
    });
    el.querySelector(".joymap-ctrl-zoom-out")!.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      map.easeTo({ zoom: map.getZoom() - 1, duration: 300 });
    });
    const compass = el.querySelector(".joymap-ctrl-compass") as HTMLElement;
    this._compass = compass.querySelector(
      ".joymap-ctrl-compass-arrow",
    ) as HTMLElement;
    compass.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      map.easeTo({ bearing: 0, duration: 400 });
    });
    this._onRotate = () => this._updateCompass();
    map.on("rotate", this._onRotate);
    map.on("move", this._onRotate);
    this._updateCompass();
    this._container = el;
    return el;
  }

  onRemove(map: Map): void {
    if (this._onRotate) {
      map.off("rotate", this._onRotate);
      map.off("move", this._onRotate);
    }
    this._container?.remove();
    this._container = null;
    this._compass = null;
    this._map = null;
    this._onRotate = null;
  }

  private _updateCompass(): void {
    if (!this._compass || !this._map) return;
    const bearing = this._map.getBearing();
    this._compass.style.transform = `rotate(${-bearing}deg)`;
  }
}

export class AttributionControl implements IControl {
  private _container: HTMLElement | null = null;
  private readonly _text: string;

  constructor(options?: { customAttribution?: string }) {
    this._text =
      options?.customAttribution ?? "© OpenStreetMap contributors";
  }

  onAdd(_map: Map): HTMLElement {
    const el = document.createElement("div");
    el.className = "joymap-ctrl joymap-ctrl-attrib";
    el.innerHTML = `<details open><summary>©</summary><div class="joymap-ctrl-attrib-inner">${this._text}</div></details>`;
    this._container = el;
    return el;
  }

  onRemove(_map: Map): void {
    this._container?.remove();
    this._container = null;
  }
}

export type { ControlPosition, IControl };

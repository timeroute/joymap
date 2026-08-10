import { CameraAnimator } from "../camera/CameraAnimator";
import type {
  EaseToOptions,
  FlyToOptions,
} from "../camera/CameraAnimator";
import { Transform } from "../camera/Transform";
import type { ControlPosition, IControl } from "../control/types";
import type { Feature, GeoJSON } from "../geo/geojson";
import {
  distToLineString,
  distToPoint,
  pointInPolygon,
  screenDistToLngLat,
} from "../geo/hitTest";
import { LngLat, type LngLatLike } from "../geo/LngLat";
import { LngLatBounds, type LngLatBoundsLike } from "../geo/LngLatBounds";
import { projectToMercator } from "../geo/mercator";
import { DragPanHandler } from "../interaction/DragPanHandler";
import { DragRotateHandler } from "../interaction/DragRotateHandler";
import { DoubleClickZoomHandler } from "../interaction/DoubleClickZoomHandler";
import { ScrollZoomHandler } from "../interaction/ScrollZoomHandler";
import { TouchGestureHandler } from "../interaction/TouchGestureHandler";
import { CircleLayer } from "../layer/CircleLayer";
import { FillLayer } from "../layer/FillLayer";
import { LineLayer } from "../layer/LineLayer";
import { SymbolLayer } from "../layer/SymbolLayer";
import { TileLayer } from "../layer/TileLayer";
import type { CustomLayerInterface } from "../layer/types";
import { Renderer } from "../render/Renderer";
import { VectorRenderer } from "../render/VectorRenderer";
import { GeoJSONSource } from "../source/GeoJSONSource";
import type {
  ColorExpression,
  NumberExpression,
  StringExpression,
} from "../style/expression";
import { ensureMapCss } from "../ui/css";
import type { Marker } from "../ui/Marker";
import type { Popup } from "../ui/Popup";
import { Evented } from "./Evented";
import type {
  LayerSpecification,
  MapEvents,
  MapGeoJSONFeature,
  MapOptions,
  SourceSpecification,
} from "./types";

const DEFAULT_TILES =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export class Map extends Evented<MapEvents> {
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly transform: Transform;

  private readonly _renderer: Renderer;
  private readonly _vectors: VectorRenderer;
  private readonly _basemap: TileLayer;
  private readonly _sources = new globalThis.Map<string, GeoJSONSource>();
  private readonly _layers: CustomLayerInterface[] = [];
  private readonly _markers = new Set<Marker>();
  private readonly _popups = new Set<Popup>();
  private readonly _controls = new globalThis.Map<
    IControl,
    { el: HTMLElement; position: ControlPosition }
  >();
  private readonly _controlCorners: Record<ControlPosition, HTMLElement>;
  private readonly _overlay: HTMLElement;
  private readonly _drag: DragPanHandler;
  private readonly _scroll: ScrollZoomHandler;
  private readonly _dblClick: DoubleClickZoomHandler;
  private readonly _dragRotate: DragRotateHandler;
  private readonly _touch: TouchGestureHandler;
  private readonly _camera: CameraAnimator;
  private readonly _resizeObserver: ResizeObserver;
  private readonly _bg: [number, number, number];
  private readonly _attribution: string;
  private _raf = 0;
  private _destroyed = false;
  private _glLost = false;
  private _pointerDown: { x: number; y: number } | null = null;
  private _pendingClick = 0;
  /** True while a user gesture (drag / wheel / pinch) owns the camera. */
  private _userGesture = false;
  private _userFlags = { zoom: false, bearing: false };

  constructor(options: MapOptions) {
    super();
    ensureMapCss();

    const container =
      typeof options.container === "string"
        ? document.querySelector<HTMLElement>(options.container)
        : options.container;
    if (!container) {
      throw new Error(`Map container not found: ${String(options.container)}`);
    }

    this.container = container;
    this.container.classList.add("joymap-container");
    this.container.style.position =
      this.container.style.position || "relative";
    this.container.style.overflow = "hidden";
    this.container.style.touchAction = "none";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "joymap-canvas";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.canvas.style.cursor = "grab";
    this.container.appendChild(this.canvas);

    this._overlay = document.createElement("div");
    this._overlay.className = "joymap-overlay";
    this.container.appendChild(this._overlay);

    this._controlCorners = {
      "top-left": makeCorner("joymap-ctrl-top-left"),
      "top-right": makeCorner("joymap-ctrl-top-right"),
      "bottom-left": makeCorner("joymap-ctrl-bottom-left"),
      "bottom-right": makeCorner("joymap-ctrl-bottom-right"),
    };
    for (const el of Object.values(this._controlCorners)) {
      this.container.appendChild(el);
    }

    this._onContextLost = this._onContextLost.bind(this);
    this._onContextRestored = this._onContextRestored.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this.canvas.addEventListener("webglcontextlost", this._onContextLost, false);
    this.canvas.addEventListener(
      "webglcontextrestored",
      this._onContextRestored,
      false,
    );
    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    this.canvas.addEventListener("pointerup", this._onPointerUp);

    this.transform = new Transform();
    this.transform.minZoom = options.minZoom ?? 0;
    this.transform.maxZoom = options.maxZoom ?? 22;
    this.transform.setCenter(options.center ?? [0, 20]);
    this.transform.setZoom(options.zoom ?? 2);
    this.transform.setBearing(options.bearing ?? 0);

    this._bg = options.background ?? [0.93, 0.94, 0.96];
    this._renderer = new Renderer(this.canvas);
    this._renderer.setPixelRatio(
      options.pixelRatio ?? (window.devicePixelRatio || 1),
    );
    this._vectors = new VectorRenderer(this._renderer.gl);

    const source = options.style?.sources.basemap;
    const tileUrls =
      source?.tiles?.length ? source.tiles : [DEFAULT_TILES];
    this._attribution =
      source?.attribution ?? "© OpenStreetMap contributors";
    this._basemap = new TileLayer("basemap", {
      urls: tileUrls,
      tileSize: source?.tileSize ?? 256,
      minZoom: source?.minzoom ?? 0,
      maxZoom: source?.maxzoom ?? 19,
      onTileUpdate: () => this.triggerRepaint(),
    });
    this._basemap.attachGL(this._renderer.gl);
    this.transform.tileSize = source?.tileSize ?? 256;

    this._scroll = new ScrollZoomHandler(
      this.canvas,
      this.transform,
      () => this._beginUserGesture({ zoom: true }),
      () => this._onZoom(),
      () => this._endUserGesture(),
    );
    this._touch = new TouchGestureHandler(
      this.canvas,
      this.transform,
      () => {
        this._onMove();
        this.fire("zoom", { type: "zoom" });
        this.fire("rotate", { type: "rotate" });
      },
      () => {
        this._cancelPendingClick();
        this._pointerDown = null;
        this._scroll.finish();
        this._beginUserGesture({ zoom: true, bearing: true });
      },
      () => this._endUserGesture(),
    );
    this._drag = new DragPanHandler(
      this.canvas,
      this.transform,
      () => {
        this._scroll.finish();
        this._beginUserGesture();
      },
      () => this._onMove(),
      () => this._endUserGesture(),
      () => this._touch.isActive || this._touch.isTouching,
    );
    this._dblClick = new DoubleClickZoomHandler(
      this.canvas,
      (nextZoom, around) => {
        this.easeTo({ zoom: nextZoom, around, duration: 400 });
      },
      () => this.getZoom(),
      () => this._cancelPendingClick(),
    );
    this._dragRotate = new DragRotateHandler(
      this.canvas,
      this.transform,
      () => {
        this._scroll.finish();
        this._beginUserGesture({ bearing: true });
      },
      () => this._onRotate(),
      () => this._endUserGesture(),
    );
    this._camera = new CameraAnimator(this.transform, {
      onStart: (flags) => {
        this.fire("movestart", { type: "movestart" });
        if (flags.zoom) this.fire("zoomstart", { type: "zoomstart" });
        if (flags.bearing) this.fire("rotatestart", { type: "rotatestart" });
      },
      onFrame: (flags) => {
        this.fire("move", { type: "move" });
        if (flags.zoom) this.fire("zoom", { type: "zoom" });
        if (flags.bearing) this.fire("rotate", { type: "rotate" });
        this._updateOverlays();
        this.triggerRepaint();
      },
      onEnd: (flags) => {
        // Final camera state already applied + painted in the last onFrame.
        if (flags.zoom) this.fire("zoomend", { type: "zoomend" });
        if (flags.bearing) this.fire("rotateend", { type: "rotateend" });
        this.fire("moveend", { type: "moveend" });
      },
    });
    this._drag.enable();
    this._scroll.enable();
    this._dblClick.enable();
    this._dragRotate.enable();
    this._touch.enable();

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(this.container);

    this.resize();
    queueMicrotask(() => {
      if (this._destroyed) return;
      this.fire("load", { type: "load" });
      this.triggerRepaint();
    });
  }

  getCenter(): LngLat {
    return this.transform.center.clone();
  }

  setCenter(center: LngLatLike): this {
    this._finishUserCamera();
    this.fire("movestart", { type: "movestart" });
    this.transform.setCenter(center);
    this._onMove();
    this.fire("moveend", { type: "moveend" });
    return this;
  }

  getZoom(): number {
    return this.transform.zoom;
  }

  setZoom(zoom: number): this {
    this._finishUserCamera();
    this.fire("movestart", { type: "movestart" });
    this.fire("zoomstart", { type: "zoomstart" });
    this.transform.setZoom(zoom);
    this._onZoom();
    this.fire("zoomend", { type: "zoomend" });
    this.fire("moveend", { type: "moveend" });
    return this;
  }

  getBearing(): number {
    return this.transform.bearing;
  }

  setBearing(bearing: number): this {
    this._finishUserCamera();
    this.fire("movestart", { type: "movestart" });
    this.fire("rotatestart", { type: "rotatestart" });
    this.transform.setBearing(bearing);
    this._onRotate();
    this.fire("rotateend", { type: "rotateend" });
    this.fire("moveend", { type: "moveend" });
    return this;
  }

  /** Instantly set center / zoom / bearing (no animation). */
  jumpTo(options: {
    center?: LngLatLike;
    zoom?: number;
    bearing?: number;
  }): this {
    this._finishUserCamera();
    const zoom = options.zoom !== undefined;
    const bearing = options.bearing !== undefined;
    this.fire("movestart", { type: "movestart" });
    if (zoom) this.fire("zoomstart", { type: "zoomstart" });
    if (bearing) this.fire("rotatestart", { type: "rotatestart" });
    if (options.center) this.transform.setCenter(options.center);
    if (zoom) this.transform.setZoom(options.zoom!);
    if (bearing) this.transform.setBearing(options.bearing!);
    this.fire("move", { type: "move" });
    if (zoom) this.fire("zoom", { type: "zoom" });
    if (bearing) this.fire("rotate", { type: "rotate" });
    this._updateOverlays();
    this.triggerRepaint();
    if (zoom) this.fire("zoomend", { type: "zoomend" });
    if (bearing) this.fire("rotateend", { type: "rotateend" });
    this.fire("moveend", { type: "moveend" });
    return this;
  }

  /**
   * Animate camera to a new center / zoom / bearing.
   * Pass `around` to keep a screen point fixed (double-click zoom).
   */
  easeTo(options: EaseToOptions): this {
    this._finishUserCamera();
    this._camera.easeTo(options);
    return this;
  }

  /**
   * Fly to a destination with a zoom-out-then-in arc.
   * Duration is auto-computed from distance when omitted.
   */
  flyTo(options: FlyToOptions): this {
    this._finishUserCamera();
    this._camera.flyTo(options);
    return this;
  }

  /** Stop any in-flight easeTo / flyTo. */
  stop(): this {
    if (this._camera.isAnimating) this._camera.stop();
    return this;
  }

  isEasing(): boolean {
    return this._camera.isAnimating;
  }

  /** True while easeTo / flyTo is in progress. */
  isAnimating(): boolean {
    return this._camera.isAnimating;
  }

  /**
   * Fit the camera so `bounds` is visible.
   * `padding` is CSS pixels (number or per-side).
   * Animates with flyTo by default; pass `animate: false` for an instant jump.
   */
  fitBounds(
    bounds: LngLatBoundsLike,
    options?: {
      padding?: number | { top: number; right: number; bottom: number; left: number };
      maxZoom?: number;
      animate?: boolean;
      duration?: number;
    },
  ): this {
    const b = LngLatBounds.convert(bounds);
    if (b.isEmpty()) return this;

    const pad =
      typeof options?.padding === "number"
        ? {
            top: options.padding,
            right: options.padding,
            bottom: options.padding,
            left: options.padding,
          }
        : {
            top: options?.padding?.top ?? 40,
            right: options?.padding?.right ?? 40,
            bottom: options?.padding?.bottom ?? 40,
            left: options?.padding?.left ?? 40,
          };

    const sw = projectToMercator(b.getSouthWest());
    const ne = projectToMercator(b.getNorthEast());
    const mercW = Math.max(1e-12, Math.abs(ne.x - sw.x));
    const mercH = Math.max(1e-12, Math.abs(ne.y - sw.y));
    const availW = Math.max(1, this.transform.width - pad.left - pad.right);
    const availH = Math.max(1, this.transform.height - pad.top - pad.bottom);
    const tileSize = this.transform.tileSize;
    const zoomX = Math.log2(availW / (tileSize * mercW));
    const zoomY = Math.log2(availH / (tileSize * mercH));
    const maxZoom = options?.maxZoom ?? this.transform.maxZoom;
    const zoom = Math.min(
      maxZoom,
      Math.max(this.transform.minZoom, Math.min(zoomX, zoomY)),
    );

    const target = { center: b.getCenter(), zoom };
    if (options?.animate === false) {
      return this.jumpTo(target);
    }
    return this.flyTo({
      ...target,
      duration: options?.duration,
    });
  }

  project(lngLat: LngLatLike): { x: number; y: number } {
    return this.transform.project(lngLat);
  }

  unproject(point: { x: number; y: number }): LngLat {
    return this.transform.unproject(point);
  }

  addSource(id: string, source: SourceSpecification | GeoJSONSource): this {
    if (this._sources.has(id)) {
      throw new Error(`Source already exists: ${id}`);
    }
    if (source instanceof GeoJSONSource) {
      this._sources.set(id, source);
    } else if (source.type === "geojson") {
      this._sources.set(id, new GeoJSONSource(source.data));
    } else {
      throw new Error(`Unsupported source type: ${(source as { type: string }).type}`);
    }
    this.triggerRepaint();
    return this;
  }

  getSource(id: string): GeoJSONSource | undefined {
    return this._sources.get(id);
  }

  removeSource(id: string): this {
    const source = this._sources.get(id);
    if (!source) return this;
    for (const layer of this._layers) {
      if (layer.getSource?.() === source) {
        throw new Error(
          `Source "${id}" is in use by layer "${layer.id}"; remove the layer first`,
        );
      }
    }
    this._sources.delete(id);
    this.triggerRepaint();
    return this;
  }

  addLayer(
    layer: LayerSpecification | CustomLayerInterface,
    beforeId?: string,
  ): this {
    if (this._layers.some((l) => l.id === layer.id)) {
      throw new Error(`Layer already exists: ${layer.id}`);
    }
    const instance = isStyleLayerSpec(layer)
      ? this._createStyleLayer(layer)
      : layer;
    if (instance.visible === undefined) instance.visible = true;

    if (beforeId) {
      const idx = this._layers.findIndex((l) => l.id === beforeId);
      if (idx >= 0) this._layers.splice(idx, 0, instance);
      else this._layers.push(instance);
    } else {
      this._layers.push(instance);
    }
    this.triggerRepaint();
    return this;
  }

  getLayer(id: string): CustomLayerInterface | undefined {
    return this._layers.find((l) => l.id === id);
  }

  removeLayer(id: string): this {
    const idx = this._layers.findIndex((l) => l.id === id);
    if (idx < 0) return this;
    const [layer] = this._layers.splice(idx, 1);
    layer?.destroy?.(this._renderer.gl);
    this.triggerRepaint();
    return this;
  }

  /** Move layer before `beforeId`, or to the top if omitted. */
  moveLayer(id: string, beforeId?: string): this {
    const idx = this._layers.findIndex((l) => l.id === id);
    if (idx < 0) throw new Error(`Layer not found: ${id}`);
    const [layer] = this._layers.splice(idx, 1);
    if (!layer) return this;
    if (!beforeId) {
      this._layers.push(layer);
    } else {
      const before = this._layers.findIndex((l) => l.id === beforeId);
      if (before < 0) this._layers.push(layer);
      else this._layers.splice(before, 0, layer);
    }
    this.triggerRepaint();
    return this;
  }

  setLayoutProperty(
    layerId: string,
    name: string,
    value: unknown,
  ): this {
    const layer = this.getLayer(layerId);
    if (!layer) throw new Error(`Layer not found: ${layerId}`);
    if (name === "visibility") {
      layer.visible = value !== "none";
    } else if (layer.setLayoutProperty) {
      layer.setLayoutProperty(name, value);
    } else {
      throw new Error(`Layer does not support layout: ${layerId}`);
    }
    this.triggerRepaint();
    return this;
  }

  /** Update a paint property (supports data-driven expressions). */
  setPaintProperty(
    layerId: string,
    name: string,
    value: ColorExpression | NumberExpression | StringExpression,
  ): this {
    const layer = this.getLayer(layerId);
    if (!layer) throw new Error(`Layer not found: ${layerId}`);
    if (!layer.setPaintProperty) {
      throw new Error(`Layer does not support paint: ${layerId}`);
    }
    layer.setPaintProperty(name, value);
    this.triggerRepaint();
    return this;
  }

  getLayoutProperty(layerId: string, name: "visibility"): "visible" | "none" {
    const layer = this.getLayer(layerId);
    if (!layer) throw new Error(`Layer not found: ${layerId}`);
    if (name === "visibility") {
      return layer.visible === false ? "none" : "visible";
    }
    return "visible";
  }

  /** Replace GeoJSON data on an existing source and repaint. */
  setGeoJSON(sourceId: string, data: GeoJSON): this {
    const source = this._sources.get(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    source.setData(data);
    this.triggerRepaint();
    return this;
  }

  /**
   * Async GeoJSON ingest (chunked on the main thread). Use for large datasets.
   * Concurrent calls: only the latest result is applied.
   */
  async setGeoJSONAsync(
    sourceId: string,
    data: GeoJSON,
    options?: { chunkSize?: number; signal?: AbortSignal },
  ): Promise<this> {
    const source = this._sources.get(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);
    await source.setDataAsync(data, options);
    this.triggerRepaint();
    return this;
  }

  /**
   * Features under a screen point (top layer first).
   * Uses geometry hit-tests; tolerance follows layer paint size.
   */
  queryRenderedFeatures(
    point: { x: number; y: number },
    options?: { layers?: string[] },
  ): MapGeoJSONFeature[] {
    const ll = this.unproject(point);
    const results: MapGeoJSONFeature[] = [];
    const filter = options?.layers ? new Set(options.layers) : null;

    for (let i = this._layers.length - 1; i >= 0; i--) {
      const layer = this._layers[i]!;
      if (layer.visible === false) continue;
      if (filter && !filter.has(layer.id)) continue;
      const source = layer.getSource?.();
      if (!source) continue;
      const sourceId = this._sourceIdOf(source);
      if (!sourceId) continue;

      for (const bucket of source.getBuckets()) {
        const feature = bucket.feature;
        if (!feature.geometry) continue;
        const tolPx = layer.getHitTolerancePx?.(feature) ?? 4;
        const tolDeg = screenDistToLngLat(
          tolPx,
          ll.lat,
          this.transform.zoom,
          this.transform.tileSize,
        );
        if (
          bucket.bbox &&
          (ll.lng < bucket.bbox[0] - tolDeg ||
            ll.lng > bucket.bbox[2] + tolDeg ||
            ll.lat < bucket.bbox[1] - tolDeg ||
            ll.lat > bucket.bbox[3] + tolDeg)
        ) {
          continue;
        }
        if (
          !geometryHits(
            feature.geometry,
            ll.lng,
            ll.lat,
            layer.type,
            tolDeg,
          )
        ) {
          continue;
        }
        results.push({
          ...feature,
          layer: { id: layer.id, type: layer.type },
          source: sourceId,
        });
      }
    }
    return results;
  }

  addControl(control: IControl, position: ControlPosition = "top-right"): this {
    if (this._controls.has(control)) return this;
    const el = control.onAdd(this);
    this._controlCorners[position].appendChild(el);
    this._controls.set(control, { el, position });
    return this;
  }

  removeControl(control: IControl): this {
    const entry = this._controls.get(control);
    if (!entry) return this;
    control.onRemove(this);
    this._controls.delete(control);
    return this;
  }

  getAttribution(): string {
    return this._attribution;
  }

  /** @internal */
  _addMarker(marker: Marker): void {
    this._markers.add(marker);
    this._overlay.appendChild(marker.getElement());
  }

  /** @internal */
  _removeMarker(marker: Marker): void {
    this._markers.delete(marker);
  }

  /** @internal */
  _addPopup(popup: Popup): void {
    this._popups.add(popup);
    this._overlay.appendChild(popup.getElement());
  }

  /** @internal */
  _removePopup(popup: Popup): void {
    this._popups.delete(popup);
  }

  resize(): this {
    if (this._destroyed || this._glLost) return this;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(0, rect.width || this.container.clientWidth);
    const height = Math.max(0, rect.height || this.container.clientHeight);
    if (width === 0 || height === 0) return this;
    this.transform.resize(width, height);
    this._renderer.resize(width, height);
    this.fire("resize", { type: "resize", width, height });
    this._updateOverlays();
    this.triggerRepaint();
    return this;
  }

  triggerRepaint(): void {
    if (this._destroyed || this._glLost || this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._renderFrame();
    });
  }

  remove(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._resizeObserver.disconnect();
    this._drag.disable();
    this._scroll.disable();
    this._dblClick.disable();
    this._dragRotate.disable();
    this._touch.disable();
    this._endUserGesture();
    this.stop();
    this._camera.destroy();
    this._cancelPendingClick();
    this.canvas.removeEventListener("webglcontextlost", this._onContextLost);
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this._onContextRestored,
    );
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);
    for (const marker of [...this._markers]) marker.remove();
    for (const popup of [...this._popups]) popup.remove();
    for (const control of [...this._controls.keys()]) this.removeControl(control);
    for (const layer of this._layers) {
      layer.destroy?.(this._renderer.gl);
    }
    this._layers.length = 0;
    this._sources.clear();
    this._basemap.destroy(this._renderer.gl);
    this._vectors.destroy();
    this._renderer.destroy();
    this.canvas.remove();
    this._overlay.remove();
    for (const el of Object.values(this._controlCorners)) el.remove();
    this.container.classList.remove("joymap-container");
    this.removeAllListeners();
  }

  private _sourceIdOf(source: GeoJSONSource): string | undefined {
    for (const [id, s] of this._sources) {
      if (s === source) return id;
    }
    return undefined;
  }

  private _onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    this._pointerDown = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private _onPointerUp(e: PointerEvent): void {
    if (!this._pointerDown || e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const dx = point.x - this._pointerDown.x;
    const dy = point.y - this._pointerDown.y;
    this._pointerDown = null;
    if (dx * dx + dy * dy > 25) return; // drag, not click
    const lngLat = this.unproject(point);
    const features = this.queryRenderedFeatures(point);
    this._cancelPendingClick();
    // Defer so a following dblclick can cancel and zoom instead of firing click twice.
    this._pendingClick = window.setTimeout(() => {
      this._pendingClick = 0;
      this.fire("click", { type: "click", lngLat, point, features });
    }, 250);
  }

  private _cancelPendingClick(): void {
    if (this._pendingClick) {
      clearTimeout(this._pendingClick);
      this._pendingClick = 0;
    }
  }

  private _onContextLost(e: Event): void {
    e.preventDefault();
    this._glLost = true;
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._basemap.loseContext();
    this.fire("webglcontextlost", { type: "webglcontextlost" });
  }

  private _onContextRestored(): void {
    try {
      this._renderer.reinitialize();
      this._vectors.reinitialize();
      this._basemap.attachGL(this._renderer.gl);
      this._glLost = false;
      this.fire("webglcontextrestored", { type: "webglcontextrestored" });
      this.resize();
      this.triggerRepaint();
    } catch (err) {
      this._glLost = true;
      this.fire("error", {
        type: "error",
        error:
          err instanceof Error
            ? err
            : new Error("Failed to restore WebGL context"),
      });
    }
  }

  private _createStyleLayer(spec: LayerSpecification): CustomLayerInterface {
    const source = this._sources.get(spec.source);
    if (!source) {
      throw new Error(`Source not found: ${spec.source}`);
    }
    if (spec.type === "fill") {
      return new FillLayer({ id: spec.id, source, paint: spec.paint });
    }
    if (spec.type === "line") {
      return new LineLayer({ id: spec.id, source, paint: spec.paint });
    }
    if (spec.type === "circle") {
      return new CircleLayer({ id: spec.id, source, paint: spec.paint });
    }
    if (spec.type === "symbol") {
      return new SymbolLayer({
        id: spec.id,
        source,
        overlay: this._overlay,
        layout: spec.layout,
        paint: spec.paint,
      });
    }
    throw new Error(`Unsupported layer type: ${(spec as { type: string }).type}`);
  }

  private _onMove(): void {
    this.fire("move", { type: "move" });
    this._updateOverlays();
    this.triggerRepaint();
  }

  private _onZoom(): void {
    this.fire("zoom", { type: "zoom" });
    this.fire("move", { type: "move" });
    this._updateOverlays();
    this.triggerRepaint();
  }

  private _onRotate(): void {
    this.fire("rotate", { type: "rotate" });
    this.fire("move", { type: "move" });
    this._updateOverlays();
    this.triggerRepaint();
  }

  /** End wheel debounce + animation before a new camera owner takes over. */
  private _finishUserCamera(): void {
    this._scroll.finish();
    this._endUserGesture();
    this.stop();
  }

  private _beginUserGesture(flags: { zoom?: boolean; bearing?: boolean } = {}): void {
    this.stop();
    if (!this._userGesture) {
      this._userGesture = true;
      this._userFlags = {
        zoom: !!flags.zoom,
        bearing: !!flags.bearing,
      };
      this.fire("movestart", { type: "movestart" });
      if (flags.zoom) this.fire("zoomstart", { type: "zoomstart" });
      if (flags.bearing) this.fire("rotatestart", { type: "rotatestart" });
      return;
    }
    if (flags.zoom && !this._userFlags.zoom) {
      this._userFlags.zoom = true;
      this.fire("zoomstart", { type: "zoomstart" });
    }
    if (flags.bearing && !this._userFlags.bearing) {
      this._userFlags.bearing = true;
      this.fire("rotatestart", { type: "rotatestart" });
    }
  }

  private _endUserGesture(): void {
    if (!this._userGesture) return;
    const { zoom, bearing } = this._userFlags;
    this._userGesture = false;
    this._userFlags = { zoom: false, bearing: false };
    if (zoom) this.fire("zoomend", { type: "zoomend" });
    if (bearing) this.fire("rotateend", { type: "rotateend" });
    this.fire("moveend", { type: "moveend" });
  }

  private _updateOverlays(): void {
    for (const m of this._markers) m._update();
    for (const p of this._popups) p._update();
  }

  private _renderFrame(): void {
    if (this._destroyed || this._glLost) return;
    try {
      const [r, g, b] = this._bg;
      this._renderer.clear(r, g, b, 1);
      const covers = this._basemap.update(this.transform);
      this._basemap.render(this._renderer, this.transform, covers);
      for (const layer of this._layers) {
        if (layer.visible === false) continue;
        layer.render(this._renderer, this._vectors, this.transform);
      }
      // Keep HTML overlays in sync with the painted camera every frame.
      this._updateOverlays();
      this.fire("render", { type: "render" });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.fire("error", { type: "error", error });
    }
  }
}

function makeCorner(className: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  return el;
}

function isStyleLayerSpec(
  layer: LayerSpecification | CustomLayerInterface,
): layer is LayerSpecification {
  return (
    typeof (layer as LayerSpecification).source === "string" &&
    (layer.type === "fill" ||
      layer.type === "line" ||
      layer.type === "circle" ||
      layer.type === "symbol")
  );
}

function geometryHits(
  geometry: NonNullable<Feature["geometry"]>,
  lng: number,
  lat: number,
  layerType: string,
  tolDeg: number,
): boolean {
  switch (geometry.type) {
    case "Point":
      return (
        (layerType === "circle" || layerType === "symbol") &&
        distToPoint(lng, lat, geometry.coordinates) <= tolDeg
      );
    case "MultiPoint":
      return (
        (layerType === "circle" || layerType === "symbol") &&
        geometry.coordinates.some((c) => distToPoint(lng, lat, c) <= tolDeg)
      );
    case "LineString":
      return (
        layerType === "line" &&
        distToLineString(lng, lat, geometry.coordinates) <= tolDeg
      );
    case "MultiLineString":
      return (
        layerType === "line" &&
        geometry.coordinates.some(
          (line) => distToLineString(lng, lat, line) <= tolDeg,
        )
      );
    case "Polygon":
      return layerType === "fill" && pointInPolygon(lng, lat, geometry.coordinates);
    case "MultiPolygon":
      return (
        layerType === "fill" &&
        geometry.coordinates.some((poly) => pointInPolygon(lng, lat, poly))
      );
    case "GeometryCollection":
      return geometry.geometries.some((g) =>
        geometryHits(g, lng, lat, layerType, tolDeg),
      );
    default:
      return false;
  }
}

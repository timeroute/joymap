import { LngLat, type LngLatLike } from "../geo/LngLat";
import { projectToMercator, unprojectFromMercator } from "../geo/mercator";
import { wrapBearing, type Transform } from "./Transform";

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const raf = (cb: (t: number) => void): number => {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(cb);
  }
  return setTimeout(() => cb(now()), 16) as unknown as number;
};

const caf = (id: number): void => {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
};

export type EasingFn = (t: number) => number;

/** Smoothstep-like cubic ease in-out. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Mapbox default fly/ease timing: ease-out quad. */
export function easeOutQuad(t: number): number {
  return t * (2 - t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path bearing interpolation → wrapped degrees. */
export function lerpBearing(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return wrapBearing(a + d * t);
}

/** Shortest-path lng/lat lerp (handles antimeridian). */
export function lerpLngLat(from: LngLat, to: LngLat, t: number): LngLat {
  let dlng = to.lng - from.lng;
  while (dlng > 180) dlng -= 360;
  while (dlng < -180) dlng += 360;
  return new LngLat(from.lng + dlng * t, lerp(from.lat, to.lat, t)).wrap();
}

export interface EaseToOptions {
  center?: LngLatLike;
  zoom?: number;
  bearing?: number;
  /** Keep this screen point fixed while zooming (e.g. double-click). */
  around?: { x: number; y: number };
  /** Duration in ms. Default 500. */
  duration?: number;
  easing?: EasingFn;
}

export interface FlyToOptions extends EaseToOptions {
  /**
   * Zooming “curve” along the flight path (van Wijk ρ).
   * Default `1.42` (Mapbox). Higher = more mid-flight zoom-out.
   */
  curve?: number;
  /**
   * Peak (minimum) zoom along the path. If set, overrides `curve`.
   */
  minZoom?: number;
  /** Screenfuls per second relative to curve. Default `1.2`. */
  speed?: number;
  /** Screenfuls per second (ignores `speed` when set). */
  screenSpeed?: number;
  /** Cap duration; if exceeded, jump instantly (Mapbox behavior). */
  maxDuration?: number;
}

export type CameraAnimationMode = "ease" | "fly";

/**
 * Precomputed Mapbox / van Wijk fly path.
 * See: Smooth and Efficient Zooming and Panning (van Wijk & Nuij, 2003).
 */
interface FlyPath {
  fromZoom: number;
  toZoom: number;
  fromMercX: number;
  fromMercY: number;
  deltaMercX: number;
  deltaMercY: number;
  w0: number;
  u1: number;
  rho: number;
  rho2: number;
  r0: number;
  S: number;
  /** Zoom-only ascent/descent when centers coincide. */
  zoomOnly: boolean;
  zoomOnlyK: number;
}

interface ActiveAnimation {
  mode: CameraAnimationMode;
  startTime: number;
  duration: number;
  easing: EasingFn;
  fromCenter: LngLat;
  fromZoom: number;
  fromBearing: number;
  toCenter: LngLat;
  toZoom: number;
  toBearing: number;
  around: { x: number; y: number } | null;
  aroundLngLat: LngLat | null;
  fly: FlyPath | null;
  changedZoom: boolean;
  changedBearing: boolean;
  changedCenter: boolean;
}

export interface CameraAnimationHandlers {
  onFrame: (flags: {
    zoom: boolean;
    bearing: boolean;
    center: boolean;
  }) => void;
  onStart: (flags: {
    zoom: boolean;
    bearing: boolean;
    center: boolean;
  }) => void;
  onEnd: (flags: {
    zoom: boolean;
    bearing: boolean;
    center: boolean;
  }) => void;
}

/**
 * Owns camera tweening (easeTo / flyTo). One active animation at a time.
 */
export class CameraAnimator {
  private _anim: ActiveAnimation | null = null;
  private _raf = 0;

  constructor(
    private readonly transform: Transform,
    private readonly handlers: CameraAnimationHandlers,
  ) {}

  get isAnimating(): boolean {
    return this._anim !== null;
  }

  easeTo(options: EaseToOptions): void {
    this._start("ease", options);
  }

  flyTo(options: FlyToOptions): void {
    this._start("fly", options);
  }

  /** Cancel in-flight animation without jumping to the end. */
  stop(): void {
    if (!this._anim) return;
    const flags = this._flags(this._anim);
    this._clearRaf();
    this._anim = null;
    this.handlers.onEnd(flags);
  }

  destroy(): void {
    this._clearRaf();
    this._anim = null;
  }

  private _start(
    requestedMode: CameraAnimationMode,
    options: EaseToOptions & FlyToOptions,
  ): void {
    if (this._anim) {
      const prev = this._anim;
      this._clearRaf();
      this._anim = null;
      this.handlers.onEnd(this._flags(prev));
    }

    const fromCenter = this.transform.center.clone();
    const fromZoom = this.transform.zoom;
    const fromBearing = this.transform.bearing;

    const toCenter = options.center
      ? LngLat.convert(options.center)
      : fromCenter.clone();
    const toZoom =
      options.zoom !== undefined
        ? Math.min(
            this.transform.maxZoom,
            Math.max(this.transform.minZoom, options.zoom),
          )
        : fromZoom;
    const toBearing =
      options.bearing !== undefined
        ? wrapBearing(options.bearing)
        : fromBearing;

    const around = options.around ?? null;
    const aroundLngLat = around ? this.transform.unproject(around) : null;

    const changedCenter =
      !around &&
      (Math.abs(toCenter.lng - fromCenter.lng) > 1e-12 ||
        Math.abs(toCenter.lat - fromCenter.lat) > 1e-12);
    const changedZoom = Math.abs(toZoom - fromZoom) > 1e-9;
    let bearingDelta = toBearing - fromBearing;
    while (bearingDelta > 180) bearingDelta -= 360;
    while (bearingDelta < -180) bearingDelta += 360;
    const reallyChangedBearing = Math.abs(bearingDelta) > 1e-9;

    if (
      !changedCenter &&
      !changedZoom &&
      !reallyChangedBearing &&
      !(around && options.zoom !== undefined)
    ) {
      return;
    }

    let mode: CameraAnimationMode = requestedMode;
    let duration = options.duration;
    let fly: FlyPath | null = null;
    let easing = options.easing ?? easeInOutCubic;

    if (mode === "fly" && !around) {
      fly = buildFlyPath(
        fromCenter,
        toCenter,
        fromZoom,
        toZoom,
        this.transform,
        options,
      );
      easing = options.easing ?? easeOutQuad;

      if (!fly) {
        mode = "ease";
        duration = duration ?? 500;
        easing = options.easing ?? easeInOutCubic;
      } else if (duration === undefined) {
        const rho = fly.rho;
        const V =
          options.screenSpeed !== undefined
            ? options.screenSpeed / rho
            : (options.speed ?? 1.2);
        duration = (1000 * fly.S) / Math.max(1e-6, V);
        const maxDuration = options.maxDuration ?? Infinity;
        if (duration > maxDuration) duration = 0;
      }
    } else {
      duration = duration ?? 500;
    }

    duration = Math.max(0, duration ?? 500);

    const anim: ActiveAnimation = {
      mode,
      startTime: now(),
      duration,
      easing,
      fromCenter,
      fromZoom,
      fromBearing,
      toCenter,
      toZoom,
      toBearing,
      around,
      aroundLngLat,
      fly,
      changedZoom: changedZoom || mode === "fly",
      changedBearing: reallyChangedBearing,
      changedCenter: changedCenter || (mode === "fly" && !!fly && !fly.zoomOnly),
    };

    if (duration === 0) {
      this._apply(anim, 1);
      this.handlers.onStart(this._flags(anim));
      this.handlers.onFrame(this._flags(anim));
      this.handlers.onEnd(this._flags(anim));
      return;
    }

    this._anim = anim;
    this.handlers.onStart(this._flags(anim));
    this._raf = raf(this._tick);
  }

  private _tick = (now: number): void => {
    const anim = this._anim;
    if (!anim) return;
    const t = Math.min(1, (now - anim.startTime) / anim.duration);
    const k = anim.easing(t);
    this._apply(anim, k);
    this.handlers.onFrame(this._flags(anim));
    if (t < 1) {
      this._raf = raf(this._tick);
    } else {
      this._anim = null;
      this._raf = 0;
      this.handlers.onEnd(this._flags(anim));
    }
  };

  private _apply(anim: ActiveAnimation, k: number): void {
    const tr = this.transform;

    if (anim.mode === "fly" && anim.fly && !anim.around) {
      applyFlyPath(tr, anim.fly, k, anim.toZoom, anim.toCenter);
      if (anim.changedBearing) {
        tr.setBearing(lerpBearing(anim.fromBearing, anim.toBearing, k));
      }
      return;
    }

    if (anim.around && anim.aroundLngLat) {
      tr.setZoom(lerp(anim.fromZoom, anim.toZoom, k));
      if (anim.changedBearing) {
        tr.setBearing(lerpBearing(anim.fromBearing, anim.toBearing, k));
      }
      const after = tr.project(anim.aroundLngLat);
      tr.panBy(anim.around.x - after.x, anim.around.y - after.y);
      return;
    }

    if (anim.changedZoom) {
      tr.setZoom(lerp(anim.fromZoom, anim.toZoom, k));
    }
    if (anim.changedBearing) {
      tr.setBearing(lerpBearing(anim.fromBearing, anim.toBearing, k));
    }
    if (anim.changedCenter) {
      tr.setCenter(lerpLngLat(anim.fromCenter, anim.toCenter, k));
    }
  }

  private _flags(anim: ActiveAnimation): {
    zoom: boolean;
    bearing: boolean;
    center: boolean;
  } {
    return {
      zoom: anim.changedZoom,
      bearing: anim.changedBearing,
      center: anim.changedCenter,
    };
  }

  private _clearRaf(): void {
    if (this._raf) {
      caf(this._raf);
      this._raf = 0;
    }
  }
}

function buildFlyPath(
  from: LngLat,
  to: LngLat,
  fromZoom: number,
  toZoom: number,
  transform: Transform,
  options: FlyToOptions,
): FlyPath | null {
  const tileSize = transform.tileSize;
  const fromM = projectToMercator(from);
  const toM = projectToMercator(to);
  let dMercX = toM.x - fromM.x;
  while (dMercX > 0.5) dMercX -= 1;
  while (dMercX < -0.5) dMercX += 1;
  const dMercY = toM.y - fromM.y;

  // Ground-plane distance in pixels at the *initial* zoom (Mapbox u₁).
  const ws0 = tileSize * 2 ** fromZoom;
  const u1 = Math.hypot(dMercX * ws0, dMercY * ws0);

  const w0 = Math.max(transform.width, transform.height);
  const scale = 2 ** (toZoom - fromZoom);
  const w1 = w0 / scale;

  let rho = options.curve ?? 1.42;
  if (options.minZoom !== undefined) {
    const peak = Math.min(options.minZoom, fromZoom, toZoom);
    const clamped = Math.max(transform.minZoom, peak);
    const wMax = w0 / 2 ** (clamped - fromZoom);
    rho = u1 > 1e-6 ? Math.sqrt((wMax / u1) * 2) : rho;
  }

  // Same-center or tiny path: zoom-only optimal path.
  if (u1 < 1e-6) {
    if (Math.abs(w0 - w1) < 1e-6) return null;
    const k = w1 < w0 ? -1 : 1;
    const S = Math.abs(Math.log(w1 / w0)) / rho;
    return {
      fromZoom,
      toZoom,
      fromMercX: fromM.x,
      fromMercY: fromM.y,
      deltaMercX: 0,
      deltaMercY: 0,
      w0,
      u1: 0,
      rho,
      rho2: rho * rho,
      r0: 0,
      S,
      zoomOnly: true,
      zoomOnlyK: k,
    };
  }

  const rho2 = rho * rho;
  const r = (i: 0 | 1): number => {
    const b =
      (w1 * w1 - w0 * w0 + (i ? -1 : 1) * rho2 * rho2 * u1 * u1) /
      (2 * (i ? w1 : w0) * rho2 * u1);
    return Math.log(Math.sqrt(b * b + 1) - b);
  };

  const r0 = r(0);
  let S = (r(1) - r0) / rho;
  if (!Number.isFinite(S)) {
    if (Math.abs(w0 - w1) < 1e-6) return null;
    const k = w1 < w0 ? -1 : 1;
    S = Math.abs(Math.log(w1 / w0)) / rho;
    return {
      fromZoom,
      toZoom,
      fromMercX: fromM.x,
      fromMercY: fromM.y,
      deltaMercX: dMercX,
      deltaMercY: dMercY,
      w0,
      u1,
      rho,
      rho2,
      r0: 0,
      S,
      zoomOnly: true,
      zoomOnlyK: k,
    };
  }

  return {
    fromZoom,
    toZoom,
    fromMercX: fromM.x,
    fromMercY: fromM.y,
    deltaMercX: dMercX,
    deltaMercY: dMercY,
    w0,
    u1,
    rho,
    rho2,
    r0,
    S,
    zoomOnly: false,
    zoomOnlyK: 0,
  };
}

function applyFlyPath(
  tr: Transform,
  fly: FlyPath,
  k: number,
  endZoom: number,
  endCenter: LngLat,
): void {
  if (k >= 1) {
    tr.setZoom(endZoom);
    tr.setCenter(endCenter);
    return;
  }

  const s = k * fly.S;

  if (fly.zoomOnly) {
    const w = Math.exp(fly.zoomOnlyK * fly.rho * s);
    const scale = 1 / w;
    let nextZoom = fly.fromZoom + Math.log2(scale);
    nextZoom = Math.min(tr.maxZoom, Math.max(tr.minZoom, nextZoom));
    tr.setZoom(nextZoom);
    return;
  }

  const w = Math.cosh(fly.r0) / Math.cosh(fly.r0 + fly.rho * s);
  // u(s): normalized distance along the ground path [≈0..1].
  const u =
    (fly.w0 *
      ((Math.cosh(fly.r0) * Math.tanh(fly.r0 + fly.rho * s) -
        Math.sinh(fly.r0)) /
        fly.rho2)) /
    fly.u1;

  const scale = 1 / w;
  let nextZoom = fly.fromZoom + Math.log2(scale);
  nextZoom = Math.min(tr.maxZoom, Math.max(tr.minZoom, nextZoom));
  tr.setZoom(nextZoom);

  const mercX = fly.fromMercX + fly.deltaMercX * u;
  const mercY = fly.fromMercY + fly.deltaMercY * u;
  const { lng, lat } = unprojectFromMercator({ x: mercX, y: mercY });
  tr.setCenter(new LngLat(lng, lat));
}

import { describe, expect, test } from "bun:test";
import {
  CameraAnimator,
  easeInOutCubic,
  easeOutQuad,
  lerp,
  lerpBearing,
  lerpLngLat,
} from "../src/camera/CameraAnimator";
import { Transform } from "../src/camera/Transform";
import { LngLat } from "../src/geo/LngLat";

describe("camera easing helpers", () => {
  test("easeInOutCubic endpoints", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });

  test("easeOutQuad is front-loaded", () => {
    expect(easeOutQuad(0)).toBe(0);
    expect(easeOutQuad(1)).toBe(1);
    expect(easeOutQuad(0.5)).toBeGreaterThan(0.5);
  });

  test("lerpBearing takes shortest path", () => {
    expect(lerpBearing(170, -170, 0.5)).toBeCloseTo(180, 5);
    expect(lerpBearing(10, 350, 0.5)).toBeCloseTo(0, 5);
  });

  test("lerpLngLat crosses antimeridian the short way", () => {
    const a = new LngLat(170, 0);
    const b = new LngLat(-170, 0);
    const mid = lerpLngLat(a, b, 0.5);
    expect(Math.abs(mid.lng)).toBeCloseTo(180, 5);
  });

  test("lerp is linear", () => {
    expect(lerp(0, 10, 0.3)).toBeCloseTo(3, 10);
  });
});

describe("flyTo van Wijk path", () => {
  test("flyTo reaches destination and fires moveend", async () => {
    const tr = new Transform();
    tr.resize(800, 600);
    tr.setCenter([116.4, 39.9]);
    tr.setZoom(12);

    let ended = false;
    const cam = new CameraAnimator(tr, {
      onStart: () => {},
      onFrame: () => {},
      onEnd: () => {
        ended = true;
      },
    });

    cam.flyTo({
      center: [105, 35],
      zoom: 3,
      duration: 50,
      curve: 1.42,
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(ended).toBe(true);
    expect(tr.zoom).toBeCloseTo(3, 5);
    expect(tr.center.lng).toBeCloseTo(105, 5);
    expect(tr.center.lat).toBeCloseTo(35, 5);
    cam.destroy();
  });
});

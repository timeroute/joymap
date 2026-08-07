import { describe, expect, test } from "bun:test";

describe("touch gesture math", () => {
  test("midpoint and distance", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 10 };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    expect(mid.x).toBe(5);
    expect(mid.y).toBe(5);
    expect(Math.hypot(3, 4)).toBe(5);
  });

  test("pinch zoom delta via log2 ratio", () => {
    expect(Math.log2(200 / 100)).toBeCloseTo(1, 10);
  });
});

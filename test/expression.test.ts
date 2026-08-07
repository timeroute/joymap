import { describe, expect, test } from "bun:test";
import type { Feature } from "../src/geo/geojson";
import {
  evaluate,
  isExpression,
  resolveColor,
  resolveNumber,
} from "../src/style/expression";

const feature = (props: Record<string, unknown>): Feature => ({
  type: "Feature",
  properties: props,
  geometry: { type: "Point", coordinates: [0, 0] },
});

describe("isExpression", () => {
  test("distinguishes operators from rgba tuples", () => {
    expect(isExpression(["get", "x"])).toBe(true);
    expect(isExpression([0.1, 0.2, 0.3, 1])).toBe(false);
    expect(isExpression("#ff0000")).toBe(false);
  });
});

describe("evaluate", () => {
  test("get / match / case", () => {
    const f = feature({ zone: "core", n: 2 });
    expect(evaluate(["get", "zone"], f)).toBe("core");
    expect(
      evaluate(
        ["match", ["get", "zone"], "core", "#f00", "expand", "#0f0", "#ccc"],
        f,
      ),
    ).toBe("#f00");
    expect(
      evaluate(
        ["case", ["==", ["get", "zone"], "core"], "A", "B"],
        f,
      ),
    ).toBe("A");
  });

  test("step and linear interpolate", () => {
    const f = feature({ level: 2 });
    expect(
      evaluate(["step", ["get", "level"], 1, 1, 4, 2, 8, 3, 16], f),
    ).toBe(8);
    expect(
      evaluate(
        ["interpolate", ["linear"], ["get", "level"], 1, 6, 3, 14],
        f,
      ),
    ).toBe(10);
  });

  test("comparisons and has", () => {
    const f = feature({ n: 5 });
    expect(evaluate([">", ["get", "n"], 3], f)).toBe(true);
    expect(evaluate(["has", "n"], f)).toBe(true);
    expect(evaluate(["has", "missing"], f)).toBe(false);
  });
});

describe("resolve paint", () => {
  test("resolveColor / resolveNumber with expressions", () => {
    const f = feature({ zone: "expand", w: 4 });
    expect(
      resolveColor(
        ["match", ["get", "zone"], "core", "#ff0000", "expand", "#00ff00", "#000"],
        f,
        "#fff",
      ),
    ).toEqual([0, 1, 0, 1]);
    expect(resolveNumber(["get", "w"], f, 1)).toBe(4);
    expect(resolveNumber(8, f, 1)).toBe(8);
  });
});

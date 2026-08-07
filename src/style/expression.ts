import { parseColor, type Feature, type PaintColor } from "../geo/geojson";

/**
 * Lightweight MapLibre-style expression subset for data-driven paint.
 * Literals (string/number/boolean/null) and operator arrays starting with a string.
 */
export type ExpressionValue =
  | string
  | number
  | boolean
  | null
  | Expression;

export type Expression = readonly [string, ...unknown[]];

export type ColorExpression = PaintColor | Expression;
export type NumberExpression = number | Expression;
/** Literal string or expression resolving to a string (e.g. `["get","name"]`). */
export type StringExpression = string | Expression;

export function isExpression(value: unknown): value is Expression {
  return Array.isArray(value) && typeof value[0] === "string";
}

export interface EvalContext {
  properties: Record<string, unknown>;
}

export function evaluate(
  expr: ExpressionValue,
  feature: Feature | null | undefined,
): unknown {
  const ctx: EvalContext = {
    properties: (feature?.properties ?? {}) as Record<string, unknown>,
  };
  return evalExpr(expr, ctx);
}

function evalExpr(expr: ExpressionValue, ctx: EvalContext): unknown {
  if (!isExpression(expr)) return expr;
  const [op, ...args] = expr;
  switch (op) {
    case "literal":
      return args[0];
    case "get": {
      const key = String(args[0]);
      return key in ctx.properties ? ctx.properties[key] : null;
    }
    case "has":
      return String(args[0]) in ctx.properties;
    case "to-number": {
      const v = evalExpr(args[0] as ExpressionValue, ctx);
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    case "to-string": {
      const v = evalExpr(args[0] as ExpressionValue, ctx);
      return v == null ? "" : String(v);
    }
    case "==":
      return (
        evalExpr(args[0] as ExpressionValue, ctx) ===
        evalExpr(args[1] as ExpressionValue, ctx)
      );
    case "!=":
      return (
        evalExpr(args[0] as ExpressionValue, ctx) !==
        evalExpr(args[1] as ExpressionValue, ctx)
      );
    case "<":
    case ">":
    case "<=":
    case ">=": {
      const a = Number(evalExpr(args[0] as ExpressionValue, ctx));
      const b = Number(evalExpr(args[1] as ExpressionValue, ctx));
      if (op === "<") return a < b;
      if (op === ">") return a > b;
      if (op === "<=") return a <= b;
      return a >= b;
    }
    case "!":
      return !truthy(evalExpr(args[0] as ExpressionValue, ctx));
    case "case":
      return evalCase(args, ctx);
    case "match":
      return evalMatch(args, ctx);
    case "step":
      return evalStep(args, ctx);
    case "interpolate":
      return evalInterpolate(args, ctx);
    default:
      throw new Error(`Unsupported expression operator: ${op}`);
  }
}

function truthy(v: unknown): boolean {
  return Boolean(v);
}

function evalCase(args: unknown[], ctx: EvalContext): unknown {
  // case: cond1, out1, cond2, out2, ..., otherwise
  if (args.length < 1) throw new Error("case requires an otherwise value");
  for (let i = 0; i < args.length - 1; i += 2) {
    if (truthy(evalExpr(args[i] as ExpressionValue, ctx))) {
      return evalExpr(args[i + 1] as ExpressionValue, ctx);
    }
  }
  return evalExpr(args[args.length - 1] as ExpressionValue, ctx);
}

function evalMatch(args: unknown[], ctx: EvalContext): unknown {
  // match: input, label1, out1, ..., otherwise
  if (args.length < 2) throw new Error("match requires input and otherwise");
  const input = evalExpr(args[0] as ExpressionValue, ctx);
  for (let i = 1; i < args.length - 1; i += 2) {
    const label = args[i];
    if (Array.isArray(label) && !isExpression(label)) {
      if (label.includes(input)) {
        return evalExpr(args[i + 1] as ExpressionValue, ctx);
      }
    } else if (label === input) {
      return evalExpr(args[i + 1] as ExpressionValue, ctx);
    }
  }
  return evalExpr(args[args.length - 1] as ExpressionValue, ctx);
}

function evalStep(args: unknown[], ctx: EvalContext): unknown {
  // step: input, default, stop1, out1, stop2, out2, ...
  if (args.length < 2) throw new Error("step requires input and default");
  const input = Number(evalExpr(args[0] as ExpressionValue, ctx));
  let result = evalExpr(args[1] as ExpressionValue, ctx);
  for (let i = 2; i < args.length - 1; i += 2) {
    const stop = Number(args[i]);
    if (input >= stop) result = evalExpr(args[i + 1] as ExpressionValue, ctx);
  }
  return result;
}

function evalInterpolate(args: unknown[], ctx: EvalContext): unknown {
  // interpolate: ['linear'], input, stop1, val1, stop2, val2, ...
  if (args.length < 4) throw new Error("interpolate requires stops");
  const kind = args[0];
  if (!Array.isArray(kind) || kind[0] !== "linear") {
    throw new Error("Only linear interpolate is supported");
  }
  const input = Number(evalExpr(args[1] as ExpressionValue, ctx));
  const stops: { stop: number; value: number }[] = [];
  for (let i = 2; i < args.length - 1; i += 2) {
    stops.push({
      stop: Number(args[i]),
      value: Number(evalExpr(args[i + 1] as ExpressionValue, ctx)),
    });
  }
  if (stops.length === 0) return 0;
  if (input <= stops[0]!.stop) return stops[0]!.value;
  const last = stops[stops.length - 1]!;
  if (input >= last.stop) return last.value;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (input >= a.stop && input <= b.stop) {
      const t = (input - a.stop) / (b.stop - a.stop || 1);
      return a.value + (b.value - a.value) * t;
    }
  }
  return last.value;
}

/** Resolve a color paint value (literal or expression) to RGBA 0–1. */
export function resolveColor(
  value: ColorExpression | undefined,
  feature: Feature | null | undefined,
  fallback: PaintColor,
): [number, number, number, number] {
  const raw = value === undefined ? fallback : evaluate(value as ExpressionValue, feature);
  if (typeof raw === "string" || Array.isArray(raw)) {
    return parseColor(raw as PaintColor);
  }
  return parseColor(fallback);
}

/** Resolve a numeric paint value (literal or expression). */
export function resolveNumber(
  value: NumberExpression | undefined,
  feature: Feature | null | undefined,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value === "number") return value;
  const raw = evaluate(value, feature);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Resolve a string layout/paint value (literal or expression). */
export function resolveString(
  value: StringExpression | undefined,
  feature: Feature | null | undefined,
  fallback = "",
): string {
  if (value === undefined) return fallback;
  if (typeof value === "string") return value;
  const raw = evaluate(value, feature);
  return raw == null ? fallback : String(raw);
}

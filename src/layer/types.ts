import type { Transform } from "../camera/Transform";
import type { Feature } from "../geo/geojson";
import type { Renderer } from "../render/Renderer";
import type { VectorRenderer } from "../render/VectorRenderer";
import type { GeoJSONSource } from "../source/GeoJSONSource";
import type {
  ColorExpression,
  NumberExpression,
  StringExpression,
} from "../style/expression";

export interface CustomLayerInterface {
  id: string;
  type: string;
  /** When false, layer is skipped in render and picking. Default true. */
  visible?: boolean;
  /** Return the GeoJSON source this layer reads, if any (for removeSource checks). */
  getSource?(): GeoJSONSource | undefined;
  /** Hit-test tolerance; pass feature for data-driven sizes. */
  getHitTolerancePx?(feature?: Feature): number;
  setPaintProperty?(
    name: string,
    value: ColorExpression | NumberExpression | StringExpression,
  ): void;
  setLayoutProperty?(name: string, value: unknown): void;
  render(
    renderer: Renderer,
    vectors: VectorRenderer,
    transform: Transform,
  ): void;
  destroy?(gl: WebGL2RenderingContext): void;
}

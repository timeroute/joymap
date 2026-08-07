import type { Feature, GeoJSON } from "../geo/geojson";
import type { LngLat, LngLatLike } from "../geo/LngLat";
import type {
  ColorExpression,
  NumberExpression,
  StringExpression,
} from "../style/expression";

export interface MapOptions {
  /** CSS selector or HTMLElement that hosts the map. */
  container: string | HTMLElement;
  /** Initial center `[lng, lat]` or `{lng, lat}`. Default `[0, 20]`. */
  center?: LngLatLike;
  /** Initial zoom. Default `2`. */
  zoom?: number;
  /** Initial bearing in degrees clockwise from north. Default `0`. */
  bearing?: number;
  minZoom?: number;
  maxZoom?: number;
  /** XYZ raster basemap. If omitted, a public OSM template is used. */
  style?: {
    version: 1;
    sources: {
      basemap: {
        type: "raster";
        tiles: string[];
        tileSize?: number;
        attribution?: string;
        /** Style-spec keys (lowercase), same meaning as Map minZoom/maxZoom. */
        minzoom?: number;
        maxzoom?: number;
      };
    };
  };
  /** Device pixel ratio override. Default `devicePixelRatio`. */
  pixelRatio?: number;
  /** Background clear color RGB 0–1. */
  background?: [number, number, number];
}

export interface MapEvents {
  load: { type: "load" };
  render: { type: "render" };
  movestart: { type: "movestart" };
  move: { type: "move" };
  moveend: { type: "moveend" };
  zoomstart: { type: "zoomstart" };
  zoom: { type: "zoom" };
  zoomend: { type: "zoomend" };
  rotatestart: { type: "rotatestart" };
  rotate: { type: "rotate" };
  rotateend: { type: "rotateend" };
  webglcontextlost: { type: "webglcontextlost" };
  webglcontextrestored: { type: "webglcontextrestored" };
  resize: { type: "resize"; width: number; height: number };
  click: {
    type: "click";
    lngLat: LngLat;
    point: { x: number; y: number };
    features: MapGeoJSONFeature[];
  };
  error: { type: "error"; error: Error };
}

/** Feature returned by queryRenderedFeatures / click. */
export type MapGeoJSONFeature = Feature & {
  layer: { id: string; type: string };
  source: string;
};

export interface GeoJSONSourceSpecification {
  type: "geojson";
  data: GeoJSON;
}

export type SourceSpecification = GeoJSONSourceSpecification;

export interface FillLayerSpecification {
  id: string;
  type: "fill";
  source: string;
  paint?: {
    "fill-color"?: ColorExpression;
    "fill-opacity"?: NumberExpression;
  };
}

export interface LineLayerSpecification {
  id: string;
  type: "line";
  source: string;
  paint?: {
    "line-color"?: ColorExpression;
    "line-width"?: NumberExpression;
    "line-opacity"?: NumberExpression;
  };
}

export interface CircleLayerSpecification {
  id: string;
  type: "circle";
  source: string;
  paint?: {
    "circle-color"?: ColorExpression;
    "circle-radius"?: NumberExpression;
    "circle-opacity"?: NumberExpression;
  };
}

export interface SymbolLayerSpecification {
  id: string;
  type: "symbol";
  source: string;
  layout?: {
    "text-field"?: StringExpression;
    "text-size"?: NumberExpression;
    "text-offset"?: [number, number];
    "text-anchor"?:
      | "center"
      | "left"
      | "right"
      | "top"
      | "bottom"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right";
    "text-allow-overlap"?: boolean;
  };
  paint?: {
    "text-color"?: ColorExpression;
    "text-opacity"?: NumberExpression;
    "text-halo-color"?: ColorExpression;
    "text-halo-width"?: NumberExpression;
  };
}

export type LayerSpecification =
  | FillLayerSpecification
  | LineLayerSpecification
  | CircleLayerSpecification
  | SymbolLayerSpecification;

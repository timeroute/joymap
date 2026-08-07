export { Map } from "./core/Map";
export type {
  MapOptions,
  MapEvents,
  MapGeoJSONFeature,
  SourceSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from "./core/types";
export type {
  EaseToOptions,
  FlyToOptions,
  EasingFn,
} from "./camera/CameraAnimator";
export { easeInOutCubic, easeOutQuad } from "./camera/CameraAnimator";
export { LngLat, type LngLatLike } from "./geo/LngLat";
export { LngLatBounds, type LngLatBoundsLike } from "./geo/LngLatBounds";
export type {
  GeoJSON,
  Feature,
  FeatureCollection,
  Geometry,
  PaintColor,
} from "./geo/geojson";
export type {
  Expression,
  ExpressionValue,
  ColorExpression,
  NumberExpression,
  StringExpression,
} from "./style/expression";
export { evaluate, isExpression, resolveString } from "./style/expression";
export { GeoJSONSource } from "./source/GeoJSONSource";
export { Marker, type MarkerOptions } from "./ui/Marker";
export { Popup, type PopupOptions } from "./ui/Popup";
export {
  NavigationControl,
  AttributionControl,
} from "./control/controls";
export type { IControl, ControlPosition } from "./control/types";
export type { TextAnchor } from "./layer/SymbolLayer";
export { version } from "./version";

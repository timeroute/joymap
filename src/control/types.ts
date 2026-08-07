import type { Map } from "../core/Map";

/** MapLibre-style control interface. */
export interface IControl {
  onAdd(map: Map): HTMLElement;
  onRemove(map: Map): void;
}

export type ControlPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

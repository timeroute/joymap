import { LngLat, type LngLatLike } from "./LngLat";

export type LngLatBoundsLike =
  | LngLatBounds
  | [LngLatLike, LngLatLike]
  | [number, number, number, number];

export class LngLatBounds {
  private _sw: LngLat;
  private _ne: LngLat;

  constructor(sw?: LngLatLike, ne?: LngLatLike) {
    this._sw = sw ? LngLat.convert(sw) : new LngLat(Infinity, Infinity);
    this._ne = ne ? LngLat.convert(ne) : new LngLat(-Infinity, -Infinity);
  }

  static convert(input: LngLatBoundsLike): LngLatBounds {
    if (input instanceof LngLatBounds) return input;
    if (Array.isArray(input)) {
      if (input.length === 4 && typeof input[0] === "number") {
        const [w, s, e, n] = input as [number, number, number, number];
        return new LngLatBounds([w, s], [e, n]);
      }
      const pair = input as [LngLatLike, LngLatLike];
      return new LngLatBounds(pair[0], pair[1]);
    }
    throw new Error("Invalid LngLatBounds");
  }

  extend(value: LngLatLike | LngLatBounds): this {
    if (value instanceof LngLatBounds) {
      this.extend(value.getSouthWest());
      this.extend(value.getNorthEast());
      return this;
    }
    const ll = LngLat.convert(value);
    this._sw.lng = Math.min(this._sw.lng, ll.lng);
    this._sw.lat = Math.min(this._sw.lat, ll.lat);
    this._ne.lng = Math.max(this._ne.lng, ll.lng);
    this._ne.lat = Math.max(this._ne.lat, ll.lat);
    return this;
  }

  getSouthWest(): LngLat {
    return this._sw;
  }

  getNorthEast(): LngLat {
    return this._ne;
  }

  getCenter(): LngLat {
    return new LngLat(
      (this._sw.lng + this._ne.lng) / 2,
      (this._sw.lat + this._ne.lat) / 2,
    );
  }

  isEmpty(): boolean {
    return (
      this._sw.lng > this._ne.lng ||
      this._sw.lat > this._ne.lat ||
      !Number.isFinite(this._sw.lng)
    );
  }
}

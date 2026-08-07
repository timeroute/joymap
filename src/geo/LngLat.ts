/** WGS84 longitude / latitude in degrees. */
export class LngLat {
  constructor(
    public lng: number,
    public lat: number,
  ) {
    if (lat < -90 || lat > 90) {
      throw new Error(`Invalid latitude: ${lat}`);
    }
  }

  wrap(): LngLat {
    let lng = ((((this.lng + 180) % 360) + 360) % 360) - 180;
    if (lng === -180) lng = 180;
    return new LngLat(lng, this.lat);
  }

  clone(): LngLat {
    return new LngLat(this.lng, this.lat);
  }

  toArray(): [number, number] {
    return [this.lng, this.lat];
  }

  static convert(input: LngLatLike): LngLat {
    if (input instanceof LngLat) return input;
    if (Array.isArray(input)) return new LngLat(input[0], input[1]);
    return new LngLat(input.lng, input.lat);
  }
}

export type LngLatLike =
  | LngLat
  | { lng: number; lat: number }
  | [number, number];

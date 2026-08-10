# joymap

**A lightweight WebGL 2D map engine for the modern web.**

joymap renders XYZ raster basemaps and GeoJSON vectors with a MapLibre-inspired API — TypeScript-first, small enough to embed, capable enough for real product maps.

[![Version](https://img.shields.io/badge/version-0.6.0-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](./tsconfig.json)
[![Runtime](https://img.shields.io/badge/runtime-Bun-f9f1e1.svg)](https://bun.sh)
[![WebGL](https://img.shields.io/badge/graphics-WebGL2-orange.svg)](#)

---

## Why joymap?

| | |
| --- | --- |
| **Focused** | 2D Web Mercator only — no 3D globe, no style-spec sprawl |
| **Fast path** | WebGL2 tiles + GPU vector transforms with high-zoom precision |
| **Familiar API** | `Map`, sources, layers, expressions, `easeTo` / `flyTo`, Marker / Popup |
| **Production-minded** | Tile cancel & overzoom fallback, async GeoJSON ingest, context-loss recovery |
| **Touch-ready** | Pinch-zoom, two-finger rotate, smooth wheel zoom |

Ideal for dashboards, field ops consoles, and internal GIS tools that need a dependable map without the weight of a full stack.

---

## Features

### Camera & interaction
- Center / zoom / bearing with `jumpTo`, `easeTo`, `flyTo` (van Wijk), `fitBounds`
- Drag pan, eased scroll zoom, double-click zoom, right-drag rotate
- Touch: pinch zoom, rotate, mid-point pan
- Full event lifecycle: `movestart` → `move` → `moveend` (+ zoom / rotate)

### Basemap
- XYZ raster tiles over WebGL2
- Multi-URL load balancing (`tiles[]`)
- Viewport retain / cancel for in-flight requests
- Parent-tile overzoom fallback when ideal tiles are not ready
- Cross-world rendering near the antimeridian

### Vectors & style
- GeoJSON sources with **fill / line / circle / symbol** layers
- Data-driven paint & layout via a MapLibre-style expression subset
- Style batching (same paint → one draw)
- Chunked `setDataAsync` / `setGeoJSONAsync` to keep the main thread responsive
- Symbol labels (HTML overlay, CJK-friendly) with optional collision

### UI & picking
- Marker / Popup overlays that track the camera
- Navigation & attribution controls
- `queryRenderedFeatures` + `click` with bbox prefilter
- WebGL context lost / restored recovery

---

## Quick start

### Requirements

- [Bun](https://bun.sh) ≥ 1.1 (package manager, tests, scripts)
- A modern browser with **WebGL2**

### Install (local)

```bash
git clone https://github.com/timeroute/joymap.git
cd joymap
bun install
```

### Playground

```bash
bun run dev
# → http://localhost:5173
```

### Library build

```bash
bun run build     # dist/joymap.js + UMD + .d.ts
bun test          # unit tests
bun run typecheck
```

---

## Usage

```ts
import {
  Map,
  NavigationControl,
  AttributionControl,
  Marker,
  Popup,
} from "joymap";

const map = new Map({
  container: "#map",
  center: [116.397, 39.908],
  zoom: 11,
  style: {
    version: 1,
    sources: {
      basemap: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap © CARTO",
        maxzoom: 19,
      },
    },
  },
});

map.addControl(new NavigationControl(), "top-right");
map.addControl(
  new AttributionControl({ customAttribution: map.getAttribution() }),
  "bottom-right",
);

map.addSource("sites", {
  type: "geojson",
  data: { type: "FeatureCollection", features: [] },
});

await map.setGeoJSONAsync("sites", featureCollection, { chunkSize: 128 });

map.addLayer({
  id: "sites-circle",
  type: "circle",
  source: "sites",
  paint: {
    "circle-color": [
      "step",
      ["get", "level"],
      "#94a3b8",
      1,
      "#f59e0b",
      2,
      "#e85d4c",
    ],
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["get", "level"],
      1,
      6,
      3,
      14,
    ],
  },
});

map.addLayer({
  id: "sites-label",
  type: "symbol",
  source: "sites",
  layout: {
    "text-field": ["get", "name"],
    "text-size": 13,
    "text-offset": [0, -16],
    "text-anchor": "bottom",
  },
  paint: {
    "text-color": "#0f172a",
    "text-halo-color": "#ffffff",
    "text-halo-width": 2,
  },
});

map.on("click", (e) => {
  const hit = e.features[0];
  if (!hit) return;
  new Popup()
    .setLngLat(
      hit.geometry?.type === "Point"
        ? (hit.geometry.coordinates as [number, number])
        : e.lngLat,
    )
    .setHTML(`<strong>${hit.properties?.name ?? hit.layer.id}</strong>`)
    .addTo(map);
});

new Marker().setLngLat([116.397, 39.908]).addTo(map);

map.flyTo({ center: [121.49, 31.24], zoom: 12 });
```

---

## Concepts

### Projection

Default CRS is **WGS84 / Web Mercator (EPSG:3857)**. Camera math lives in `Transform`; rendering uses eye-space pixels with split-double center uniforms for stable vectors at high zoom.

### Sources & layers

| Type | Role |
| --- | --- |
| Raster basemap | XYZ templates via `style.sources.basemap.tiles` |
| `geojson` | In-memory features + GPU meshes |
| `fill` / `line` / `circle` | WebGL vector layers |
| `symbol` | Point labels (HTML overlay) |

Layers are ordered; `moveLayer`, `setLayoutProperty("visibility")`, and `setPaintProperty` are supported.

### Expressions

Data-driven styling uses a focused operator set evaluated on `feature.properties`:

`literal` · `get` · `has` · `to-number` · `to-string` · comparisons · `!` · `case` · `match` · `step` · linear `interpolate`

> Zoom expressions and the full MapLibre style spec are **not** implemented yet.

### Camera events

Interactive gestures and programmatic camera APIs emit:

`movestart` / `move` / `moveend` · `zoomstart` / `zoom` / `zoomend` · `rotatestart` / `rotate` / `rotateend`

---

## Project layout

```text
src/
  core/          Map, events, public types
  camera/        Transform, easeTo / flyTo animator
  geo/           LngLat, Mercator, tiles, hit-test, wraps
  render/        WebGL2 raster + vector pipelines
  source/        Tile cache / manager, GeoJSONSource
  style/         Expressions, paint batching
  layer/         Tile, Fill, Line, Circle, Symbol
  interaction/   Pan, scroll zoom, rotate, touch, dblclick
  ui/            Marker, Popup, injected CSS
  control/       Navigation, attribution
playground/      Interactive demo app
test/            Bun unit tests
```

---

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Playground (Vite) |
| `bun run build` | ESM + UMD bundles and TypeScript declarations |
| `bun test` | Unit tests |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run preview` | Preview the playground build |

---

## Browser support

Targets evergreen browsers with **WebGL2** (Chrome, Firefox, Safari, Edge — recent versions). Mobile Safari / Chrome are supported via Pointer Events touch gestures.

---

## Roadmap

| Status | Item |
| --- | --- |
| Done | Camera, tiles, GeoJSON vectors, expressions, picking, overlays |
| Done | Symbol labels, smooth wheel zoom, GPU merc→eye path |
| Next | Web Worker mesh build, MVT / vector tiles |
| Later | `icon-image`, SDF glyphs, `zoom` expressions, style JSON parity |

See issues and discussions on GitHub for priorities.

---

## Contributing

Contributions are welcome.

1. Fork and create a branch (`cursor/…` or `feat/…`)
2. Prefer small, focused PRs with tests where they fit
3. Run `bun test && bun run typecheck && bun run build` before opening a PR
4. Keep the public API surface intentional — re-exports live in `src/index.ts`

Bug reports with a minimal reproduction (playground snippet or failing test) are especially helpful.

---

## License

[MIT](./package.json) © joymap contributors

---

## Acknowledgments

API shape and interaction patterns are inspired by [MapLibre GL JS](https://maplibre.org/) / Mapbox GL JS. Raster demos may use third-party tile services (e.g. OpenStreetMap, CARTO) — respect their terms and attribution requirements in your own deployments.

import {
  AttributionControl,
  Map,
  Marker,
  NavigationControl,
  Popup,
} from "joymap";

const meta = document.querySelector("#meta");

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

map.addSource("demo", {
  type: "geojson",
  data: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "核心区", zone: "core" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [116.35, 39.88],
              [116.45, 39.88],
              [116.45, 39.94],
              [116.35, 39.94],
              [116.35, 39.88],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { name: "扩展区", zone: "expand" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [116.32, 39.86],
              [116.38, 39.86],
              [116.38, 39.9],
              [116.32, 39.9],
              [116.32, 39.86],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { name: "主干道", kind: "primary" },
        geometry: {
          type: "LineString",
          coordinates: [
            [116.36, 39.89],
            [116.39, 39.91],
            [116.42, 39.9],
            [116.44, 39.93],
          ],
        },
      },
      {
        type: "Feature",
        properties: { name: "支路", kind: "secondary" },
        geometry: {
          type: "LineString",
          coordinates: [
            [116.37, 39.92],
            [116.4, 39.915],
            [116.43, 39.925],
          ],
        },
      },
      {
        type: "Feature",
        properties: { name: "天安门", level: 3 },
        geometry: { type: "Point", coordinates: [116.397, 39.908] },
      },
      {
        type: "Feature",
        properties: { name: "观测点", level: 1 },
        geometry: { type: "Point", coordinates: [116.42, 39.92] },
      },
      {
        type: "Feature",
        properties: { name: "枢纽", level: 2 },
        geometry: { type: "Point", coordinates: [116.38, 39.9] },
      },
    ],
  },
});

map.addLayer({
  id: "demo-fill",
  type: "fill",
  source: "demo",
  paint: {
    "fill-color": [
      "match",
      ["get", "zone"],
      "core",
      "#3d9cf0",
      "expand",
      "#6bcb77",
      "#94a3b8",
    ],
    "fill-opacity": 0.35,
  },
});

map.addLayer({
  id: "demo-line",
  type: "line",
  source: "demo",
  paint: {
    "line-color": [
      "match",
      ["get", "kind"],
      "primary",
      "#1a5f9e",
      "secondary",
      "#64748b",
      "#94a3b8",
    ],
    "line-width": [
      "match",
      ["get", "kind"],
      "primary",
      5,
      "secondary",
      3,
      2,
    ],
  },
});

map.addLayer({
  id: "demo-circle",
  type: "circle",
  source: "demo",
  paint: {
    "circle-color": [
      "step",
      ["get", "level"],
      "#94a3b8",
      1,
      "#f59e0b",
      2,
      "#e85d4c",
      3,
      "#dc2626",
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
  id: "demo-symbol",
  type: "symbol",
  source: "demo",
  layout: {
    "text-field": ["get", "name"],
    "text-size": [
      "interpolate",
      ["linear"],
      ["get", "level"],
      1,
      12,
      3,
      16,
    ],
    "text-offset": [0, -18],
    "text-anchor": "bottom",
    "text-allow-overlap": false,
  },
  paint: {
    "text-color": "#0f172a",
    "text-halo-color": "#ffffff",
    "text-halo-width": 2,
  },
});

const popup = new Popup({ offset: [0, -8] });
const marker = new Marker().setLngLat([116.397, 39.908]).addTo(map);

const destinations: Array<{
  id: string;
  label: string;
  center: [number, number];
  zoom: number;
  bearing?: number;
}> = [
  { id: "beijing", label: "北京 · 天安门", center: [116.397, 39.908], zoom: 13 },
  { id: "shanghai", label: "上海 · 外滩", center: [121.490, 31.240], zoom: 13 },
  { id: "guangzhou", label: "广州 · 珠江", center: [113.324, 23.109], zoom: 13 },
  { id: "chengdu", label: "成都 · 春熙路", center: [104.081, 30.657], zoom: 14 },
  { id: "world", label: "全球总览", center: [105, 35], zoom: 3, bearing: 0 },
];

const flyBar = document.querySelector("#fly-bar");
let activeFlyId = "beijing";

function setActiveFly(id: string): void {
  activeFlyId = id;
  if (!flyBar) return;
  for (const btn of flyBar.querySelectorAll("button")) {
    btn.classList.toggle("active", btn.dataset.id === id);
  }
}

if (flyBar) {
  for (const dest of destinations) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.id = dest.id;
    btn.textContent = dest.label;
    if (dest.id === activeFlyId) btn.classList.add("active");
    btn.addEventListener("click", () => {
      setActiveFly(dest.id);
      marker.setLngLat(dest.center);
      map.flyTo({
        center: dest.center,
        zoom: dest.zoom,
        bearing: dest.bearing ?? 0,
      });
      popup
        .setLngLat(dest.center)
        .setHTML(`<strong>${dest.label}</strong>`)
        .addTo(map);
    });
    flyBar.appendChild(btn);
  }
}

map.on("click", (e) => {
  const hit = e.features[0];
  if (!hit) {
    popup.remove();
    return;
  }
  const name =
    hit.properties && typeof hit.properties.name === "string"
      ? hit.properties.name
      : hit.layer.type;
  popup
    .setLngLat(e.lngLat)
    .setHTML(
      `<strong>${name}</strong><br/><span style="color:#666">${hit.layer.id}</span>`,
    )
    .addTo(map);
});

map.fitBounds(
  [
    [116.32, 39.86],
    [116.45, 39.94],
  ],
  { padding: 60, maxZoom: 13 },
);

function updateMeta(): void {
  if (!meta) return;
  const c = map.getCenter();
  meta.textContent = `lng ${c.lng.toFixed(4)}  lat ${c.lat.toFixed(4)}  z ${map.getZoom().toFixed(2)}  bearing ${map.getBearing().toFixed(1)}°`;
}

map.on("load", updateMeta);
map.on("move", updateMeta);
map.on("zoom", updateMeta);
map.on("rotate", updateMeta);
map.on("error", (e) => console.error(e.error));

(window as unknown as { map: Map }).map = map;

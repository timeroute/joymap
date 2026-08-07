# joymap

轻量级企业级 WebGL 2D 地图引擎（Web GIS）。

技术栈：**Bun + Vite + TypeScript + WebGL2**，坐标系默认 **WGS84 / Web Mercator (EPSG:3857)**。

## 当前能力（v0.6）

- Map 容器与渲染循环
- Web Mercator 相机（中心 / 缩放 / **bearing** / **fitBounds** / **easeTo·flyTo**）
- WebGL2 XYZ 栅格瓦片（**多 URL 负载均衡**）+ 跨世界渲染
- **视口外瓦片加载取消** + **父级过缩放回退**
- GeoJSON 矢量源 + Fill / Line / Circle / **Symbol（标注）**
- **数据驱动 paint/layout** + **按样式值合并绘制**
- **分块异步** `setDataAsync` / `setGeoJSONAsync`
- **点击拾取** `queryRenderedFeatures` / `click` 事件
- **Marker / Popup**、导航 / 归属控件
- 拖拽 / 滚轮 / 双击缩放 / 右键旋转 / **触摸捏合旋转**
- WebGL context lost 恢复

## 快速开始

```bash
bun install
bun run dev          # playground http://localhost:5173
bun test             # 单元测试
bun run build        # 产出 dist/
```

## 用法

```ts
import { Map } from "joymap";

const map = new Map({
  container: "#map",
  center: [116.397, 39.908],
  zoom: 11,
});

map.addSource("demo", {
  type: "geojson",
  data: { type: "FeatureCollection", features: [] },
});

await map.setGeoJSONAsync("demo", bigFeatureCollection, { chunkSize: 128 });

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
  id: "demo-label",
  type: "symbol",
  source: "demo",
  layout: {
    "text-field": ["get", "name"],
    "text-size": 14,
    "text-offset": [0, -16],
    "text-anchor": "bottom",
  },
  paint: {
    "text-color": "#0f172a",
    "text-halo-color": "#fff",
    "text-halo-width": 2,
  },
});
```

### Symbol 标注

- 仅标注 **Point / MultiPoint**（HTML overlay，系统字体，适合中文）
- layout：`text-field`、`text-size`、`text-offset`、`text-anchor`、`text-allow-overlap`
- paint：`text-color`、`text-opacity`、`text-halo-color`、`text-halo-width`
- 默认开启简易碰撞避让（`text-allow-overlap: false`）

### 表达式子集

支持：`literal`、`get`、`has`、`to-number`、`to-string`、比较、`!`、`case`、`match`、`step`、线性 `interpolate`。

仅按 **feature.properties** 求值（无 `zoom`）。

## 路线图（分阶段）

| 阶段 | 目标 |
|------|------|
| **0.1–0.5** | 相机、瓦片、矢量、表达式、异步 GeoJSON、交互（已完成） |
| **0.6** | Symbol 标注、事件生命周期、GPU 矢量路径、多 URL 底图（已完成） |
| **0.7+** | Web Worker 网格、MVT、icon-image / SDF 字体 |

## 目录

```
src/
  core/         Map、事件、类型
  geo/          LngLat、Mercator、瓦片、GeoJSON、跨世界
  camera/       Transform、CameraAnimator
  render/       WebGL2 栅格 / 矢量渲染
  source/       瓦片缓存、GeoJSONSource
  style/        表达式求值、绘制分组合并
  layer/        Tile / Fill / Line / Circle / Symbol
  interaction/  拖拽 / 滚轮 / 旋转 / 触摸
  ui/           Marker / Popup
  control/      导航 / 归属
playground/     本地演示
```

## 许可

MIT

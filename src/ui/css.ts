const CSS = `
.joymap-container{position:relative;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}
.joymap-canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none}
.joymap-overlay{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.joymap-symbol-layer{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.joymap-label{position:absolute;left:0;top:0;white-space:nowrap;font:600 13px/1.2 "Segoe UI","PingFang SC","Hiragino Sans GB","Noto Sans SC",system-ui,sans-serif;pointer-events:none;user-select:none;z-index:1}
.joymap-marker{position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;z-index:2;will-change:transform}
.joymap-marker-default{width:22px;height:22px;margin-left:0;border-radius:50% 50% 50% 0;background:#e85d4c;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.joymap-popup{position:absolute;left:0;top:0;pointer-events:auto;z-index:3;max-width:240px;background:#fff;color:#1a1a1a;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.25);font:13px/1.4 system-ui,sans-serif;will-change:transform}
.joymap-popup-content{padding:10px 28px 10px 12px}
.joymap-popup-close{position:absolute;top:4px;right:6px;border:0;background:transparent;font-size:16px;cursor:pointer;line-height:1;color:#666}
.joymap-popup-tip{position:absolute;left:50%;bottom:-6px;width:12px;height:12px;background:#fff;transform:translateX(-50%) rotate(45deg);box-shadow:2px 2px 2px rgba(0,0,0,.06)}
.joymap-ctrl-top-left,.joymap-ctrl-top-right,.joymap-ctrl-bottom-left,.joymap-ctrl-bottom-right{position:absolute;z-index:4;pointer-events:none;display:flex;flex-direction:column;gap:8px;margin:10px}
.joymap-ctrl-top-left{top:0;left:0}.joymap-ctrl-top-right{top:0;right:0;align-items:flex-end}
.joymap-ctrl-bottom-left{bottom:0;left:0}.joymap-ctrl-bottom-right{bottom:0;right:0;align-items:flex-end}
.joymap-ctrl{pointer-events:auto}
.joymap-ctrl-group{background:#fff;border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.1),0 2px 4px rgba(0,0,0,.15);overflow:hidden}
.joymap-ctrl-zoom button,.joymap-ctrl-nav button{display:block;width:30px;height:30px;border:0;border-bottom:1px solid #ddd;background:#fff;font-size:18px;line-height:1;cursor:pointer;color:#333;position:relative}
.joymap-ctrl-zoom button:last-child,.joymap-ctrl-nav button:last-child{border-bottom:0}
.joymap-ctrl-zoom button:hover,.joymap-ctrl-nav button:hover{background:#f3f3f3}
.joymap-ctrl-compass-arrow{display:block;width:0;height:0;margin:8px auto 0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #e85d4c;transform-origin:50% 70%}
.joymap-ctrl-compass-arrow::after{content:"";display:block;width:0;height:0;margin-left:-6px;margin-top:2px;border-left:6px solid transparent;border-right:6px solid transparent;border-top:10px solid #64748b}
.joymap-ctrl-attrib{background:rgba(255,255,255,.85);color:#333;font:11px/1.3 system-ui,sans-serif;padding:2px 6px;border-radius:3px;max-width:50vw}
.joymap-ctrl-attrib summary{cursor:pointer;list-style:none}
.joymap-ctrl-attrib-inner{padding-top:2px}
`;

let injected: HTMLStyleElement | null = null;

export function ensureMapCss(): void {
  if (typeof document === "undefined") return;
  if (!injected) {
    injected = document.createElement("style");
    injected.setAttribute("data-joymap", "css");
    document.head.appendChild(injected);
  }
  // Always refresh so HMR / successive injects pick up CSS changes.
  injected.textContent = CSS;
}

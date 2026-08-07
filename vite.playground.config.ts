import { defineConfig } from "vite";
import { resolve } from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  root: resolve(root, "playground"),
  resolve: {
    alias: {
      joymap: resolve(root, "src/index.ts"),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});

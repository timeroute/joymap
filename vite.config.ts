import { defineConfig } from "vite";
import { resolve } from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  build: {
    lib: {
      entry: resolve(root, "src/index.ts"),
      name: "JoyMap",
      formats: ["es", "umd"],
      fileName: (format) => (format === "es" ? "joymap.js" : "joymap.umd.cjs"),
    },
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: {
        exports: "named",
      },
    },
  },
});

# joymap

Lightweight enterprise WebGL 2D map engine. Use **Bun** for package manager, scripts, and tests; **Vite** for library build and playground.

## Commands

- `bun install` — dependencies
- `bun run dev` — playground (Vite)
- `bun run build` — library bundle + `.d.ts`
- `bun test` — unit tests
- `bun run typecheck` — `tsc --noEmit`

## Conventions

- TypeScript strict; prefer small focused modules under `src/`
- Rendering path is WebGL2 first; keep CPU transform math in `camera/` + `geo/`
- Public API is re-exported from `src/index.ts`
- Prefer `bun test` over Jest/Vitest

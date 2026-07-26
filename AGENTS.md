# VoxelLab

A browser-based multiplayer voxel sandbox (Three.js + Node.js WebSocket). Players build, destroy, and explore a shared block-based world.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite frontend dev server only |
| `npm run dev:all` | Game server + Vite (uses `&`, server runs in background) |
| `npm run server` | Game server only (port 3001, config via `PORT` env var) |
| `npm run build` | Production build to `dist/` |
| `node test/test-multiplayer.mjs` | Integration test (headless) |
| `node test/test-multiplayer.mjs --headed` | Integration test (visible browser) |
| `node --check server/server.js` | Quick syntax check |
| `node scripts/lost-temple.js [--seed N] [--name NAME]` | Generate an infected Protoss temple scene (output to `public/scenes/{name}.scene`) |

No lint, format, typecheck, or codegen scripts exist.

## Project Structure

```
client/       Three.js frontend (main.js entry, camera/, net/, player/, world/, ui/)
server/       Node.js WebSocket server (server.js entry)
shared/       Pure JS — no DOM, no Node, no Three.js (importable by both sides)
  constants.js   All numeric constants — never inline physics values
  physics.js     simulateStep(), collision, player-player overlap
  WorldMap.js    Sparse 3D occupancy grid
  VoxelRaycaster.js  CPU Amanatides-Woo DDA
  messages.js    Message type constants + factory functions
test/         Playwright integration test (standalone script, not a spec)
scripts/      World/scene generation scripts (generate-terrain.js, lost-temple.js)
docs/         Requirements, mechanics docs, how-to-run guide
```

## Architecture

- **Client-Side Prediction**: Client runs `simulateStep()` locally every frame. Server runs same function authoritatively at 20 Hz. Server sends `reconcile` (auth state + ack seq); client replays unacked inputs and smooth-corrects via exponential decay.
- **Networking**: JSON over WebSocket. 17 message types in `shared/messages.js`.
- **World lifecycle**: Created on first join, destroyed after 5 min empty. Up to 50 players per world.
- **Rendering**: 16³ chunks, only exposed faces in BufferGeometry. Max 2 dirty chunks rebuilt per frame.
- **Persistence**: `WorldDatabase.js` — SQLite via better-sqlite3 at `data/voxellab.db` (auto-migrate, WAL mode). `better-sqlite3` native build requires `allowScripts` in package.json.
- **Vite proxy**: `/api/worlds` and `/health` proxied to `localhost:3001` (game server).

## Conventions

- **ESM only** — `import`/`export`, never `require()` or `module.exports`
- `const` over `let`, never `var`; PascalCase classes, camelCase functions/methods
- All physics/numeric constants in `shared/constants.js` — never inline
- `shared/` code must be pure JS: no DOM, no Node APIs, no Three.js imports
- Test: `node test/test-multiplayer.mjs` (not `npx playwright test` — the file is a standalone script, not a spec)
- Offline mode: append `?offline` to URL

## What NOT to do

- Do NOT modify `dist/` (build output)
- Do NOT commit `public/scenes/` (user saves)
- Do NOT create nested instruction files in subdirectories
- Do NOT use `require()` — project is ESM
- Do NOT inline physics/numeric constants — use `shared/constants.js`

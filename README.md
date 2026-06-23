# VoxelLab

A browser-based multiplayer voxel sandbox built with **Three.js** and a **Node.js WebSocket server**. Players build, destroy, and explore a shared block-based world with a Lego-style minifigure character. Supports both single-player offline mode and real-time multiplayer with client-side prediction, chat, and character customization.

![Three.js](https://img.shields.io/badge/three.js-0.184-blue) ![Vite](https://img.shields.io/badge/vite-8.0-purple) ![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![ws](https://img.shields.io/badge/ws-8.18-blue)

## Features

- **Multiplayer** — real-time shared worlds over WebSocket with client-side prediction, server reconciliation, and 20Hz state sync
- **Build at scale** — supports up to 100,000 cubes with hidden-face removal and 16³ spatial chunking for smooth 60 fps
- **Three camera modes** — Orbit (free-fly), Follow (third-person), and FPS (first-person with pointer lock)
- **Lego minifigure** — animated character with walk, run, jump, and idle animations; 4 color presets (Classic, Athlete, Punk, Explorer)
- **Color picker** — 30-color palette (15 hues × 2 lightness rows) for placing colored blocks
- **Character presets** — choose your look from the main menu; persists across sessions
- **Chat system** — in-game chat with message bubbles and fade timing
- **Player-on-head mechanics** — jump and stand on other players' heads with push resolution
- **Procedural terrain** — CLI tool to generate random terrain (`node scripts/generate-terrain.js`)
- **Save & load** — persist your builds to `public/scenes/` via the GUI or API
- **CPU voxel raycaster** — Amanatides-Woo DDA algorithm for click-to-place/remove without GPU readback
- **GPU-optimized rendering** — per-chunk `BufferGeometry` with only exposed faces; automatic frustum culling
- **FPS limiter** — optional 60 Hz cap via the GUI for consistent pacing across any display refresh rate

## Getting Started

```bash
npm install
npm run dev:all
```

This starts the Vite dev server on `http://localhost:5173` and the WebSocket game server on port 3001 concurrently.

Open `http://localhost:5173` — you'll see the main menu where you can play offline or join/create a multiplayer world. Append `?offline` to the URL to skip the menu and play offline immediately.

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Dev server only (frontend, no multiplayer) |
| `npm run dev:all` | Dev server + game server (recommended) |
| `npm run server` | Game server only (port 3001) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `node scripts/generate-terrain.js` | Generate procedural terrain |

## Controls

### Building

| Action | Input |
|---|---|
| Place cube | Left click on a block face or the ground |
| Remove cube | Right click (or Ctrl + Left click) |
| Pick color | Open the Settings panel (H), toggle **Color Picker**, click a color |

### Camera

| Mode | Controls |
|---|---|
| **Orbit** (default) | Left-drag to orbit, right-drag to zoom, WASD to dolly, arrows to elevate |
| **Follow** | Third-person follow with mouse look and scroll zoom |
| **FPS** | First-person with pointer lock and WASD movement |

Press **H** to show/hide the Settings panel. Switch modes via the dropdown.

### Character Movement (Follow / FPS modes)

| Key | Action |
|---|---|
| W / A / S / D | Move / strafe |
| Space | Jump |

### General

| Key | Action |
|---|---|
| H | Show/hide Settings panel |
| Enter | Open chat input (multiplayer only) |
| Escape | Cancel chat / exit pointer lock |

## Project Structure

```
client/                 Browser-side application
├── main.js             Entry point — scene setup, game loop, menu flow
├── camera/
│   ├── CameraController.js   Abstract base
│   ├── OrbitController.js    Free-flying orbital camera
│   ├── FollowController.js   Third-person follow camera
│   └── FPSController.js      First-person camera with pointer lock
├── net/
│   ├── NetworkClient.js      WebSocket client
│   ├── StateManager.js       CSP state tracking + reconciliation
│   ├── RemotePlayerManager.js    Remote player lifecycle
│   └── RemotePlayerModel.js      Remote player 3D model + interpolation
├── player/
│   ├── CharacterController.js    Movement, gravity, collision
│   ├── LegoCharacter.js          Lego minifigure model + animations
│   ├── CubeManager.js            Facade over ChunkManager + WorldMap
│   ├── InputManager.js           Keyboard state tracking
│   └── InteractionManager.js     Click handling (place/remove)
├── ui/
│   ├── UIManager.js              Main menu + HUD overlays
│   ├── ControllerGUI.js          lil-gui settings panel
│   ├── ColorPicker.js            30-color palette UI
│   └── ChatManager.js            In-game chat display + input
└── world/
    ├── ChunkManager.js           16³ chunk system + geometry rebuild
    ├── SceneArchive.js           Save/load scenes via REST API
    ├── TerrainGenerator.js       Procedural world generation
    ├── VoxelRaycaster.js         CPU ray traversal (DDA)
    └── WorldMap.js               Sparse 3D occupancy grid

server/                 Node.js WebSocket game server
├── server.js           HTTP + WebSocket entry point
├── WorldManager.js     Connection lifecycle, world routing, 50-player cap
├── GameWorld.js        Authoritative per-world simulation (20 Hz tick)
└── Player.js           Per-connection state + input queue

shared/                 Pure JS — no DOM or Node APIs (importable by both sides)
├── constants.js        All numeric constants (physics, networking, chunk size)
├── physics.js          simulateStep(), collision resolution, player-player overlap
├── WorldMap.js         Sparse 3D occupancy grid (Map<"x,y,z" → bool)
├── VoxelRaycaster.js   CPU voxel traversal (Amanatides-Woo DDA)
└── messages.js         Message type constants + factory functions

scripts/
└── generate-terrain.js CLI procedural terrain generator

docs/                   Documentation
├── functional-requirements.md
├── how-to-run-and-play.md
├── player-on-head-jump-mechanics.md
└── player-on-head-jump-sequence.drawio

test/                   Playwright integration tests
```

## Architecture

### Networking (Client-Side Prediction)

The client runs `simulateStep()` from `shared/physics.js` locally every frame for immediate feedback. The server runs the same function authoritatively at 20 Hz. The server sends `reconcile` messages with authoritative state; the client replays unacknowledged inputs and smooth-corrects via exponential decay.

```
Client                    Server
  │                        │
  │── playerState ──────▶  │  (input, seq, rotation, delta)
  │   (every frame)        │  simulateStep(input) via tick loop
  │                        │
  │◀── reconcile ──────── │  (authoritative state + ack seq)
  │   (every 50ms)         │
  │                        │
  ├── Repredict: replay    │
  │   unacknowledged       │
  │   inputs on            │
  │   authoritative state  │
  │                        │
  └── Smooth correct       │
      via exponential      │
      decay                │
```

### Cube Rendering Pipeline

The world is divided into **16×16×16 chunks**. Each chunk builds a custom `BufferGeometry` containing only the faces of cubes that are exposed (no neighbor on that side). On add/remove, only affected chunks rebuild their geometry (max 2 per frame).

```
VoxelRaycaster           ChunkManager                 Three.js Scene
(CPU ray → hit pos)      (Map<chunkKey, Chunk>)       (GPU rendering)
      │                        │                           │
      │  InteractionManager     │                           │
      │  ──addCube(pos)──────▶  │                           │
      │                     markDirty(chunk)               │
      │                     rebuildDirty(worldMap)         │
      │                        │                           │
      │                   Chunk.rebuildGeometry()          │
      │                   (exposed faces only)             │
      │                        └─────▶  Mesh ────▶  Scene  │
```

### World Lifecycle

Worlds are created on the first player join and destroyed after **5 minutes empty**. The server maintains a separate `GameWorld` instance per world ID, each running its own 20 Hz tick loop. Up to **50 players** per world.

### Hidden Face Removal

For each cube at cell (bx, by, bz), the geometry builder checks all 6 neighboring cells via `WorldMap.isBlockOccupied()`. If a neighbor exists in that direction, the face is skipped. In a solid 8×8×8 block of 512 cubes, only 384 faces are rendered instead of 3,072.

## Tech Stack

- [Three.js](https://threejs.org/) — 3D rendering
- [Vite](https://vitejs.dev/) — dev server with custom scene API middleware
- [ws](https://github.com/websockets/ws) — WebSocket server
- [lil-gui](https://lil-gui.georgealways.com/) — debug UI panel
- [stats.js](https://github.com/mrdoob/stats.js/) — FPS monitor
- [Playwright](https://playwright.dev/) — browser-based integration tests

## Testing

```bash
npx playwright test test/test-multiplayer.mjs
```

Launches the server + Vite as child processes, opens two browser tabs, and simulates a two-player scenario (join, place cubes, walk, head-stand, jump). Add `--headed` to watch in a visible browser.

## License

MIT

# How to Run and Play VoxelLab

VoxelLab is a browser-based multiplayer voxel building game built with Three.js. You control a Lego minifigure character, build with colored cubes, and explore in both single-player and multiplayer modes.

---

## Prerequisites

- **Node.js** (v18 or later recommended)
- **npm** (comes with Node.js)

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Launch the Game

Choose your mode:

#### Option A: Both dev server + game server (recommended for multiplayer)

```bash
npm run dev:all
```

This starts the Vite dev server on `http://localhost:5173` and the WebSocket game server on port `3001` concurrently.

#### Option B: Dev server only (offline single-player)

```bash
npm run dev
```

Open `http://localhost:5173` in your browser. Multiplayer features will be unavailable.

#### Option C: Production Build

```bash
npm run build
npm run server
```

Serve the `dist/` directory and run the game server. Useful for hosting.

#### Option D: Skip the Menu (Quick Start)

Visit `http://localhost:5173/?offline` to jump straight into single-player mode, bypassing the main menu.

---

## Main Menu

When you first open the game (without `?offline`), you'll see:

1. **Play Offline** — Enter single-player mode immediately.
2. **Multiplayer** — Enter a nickname, then:
   - **Create World** — Start a new world as the host.
   - **Join World** — Join an existing world by name (another player must have created it first).

Other players on the same network can connect to your game server at `http://<your-ip>:5173`.

---

## Controls

### Building

| Action | Input |
|---|---|
| Place a cube | **Left click** on a block face or the ground |
| Remove a cube | **Right click** (or **Ctrl + Left click**) |
| Pick a color | Open the lil-gui panel (press **H**), toggle **Color Picker**, and click a color from the 30-color palette (15 hues × 2 lightness rows). With the picker deselected, placed cubes use random colors. |

### Camera Modes

Switch camera modes from the lil-gui dropdown panel (press **H** to show/hide it):

| Mode | Description | Controls |
|---|---|---|
| **Orbit** (default) | Free-flying camera, character stays still | Left-drag to orbit, right-drag to zoom, **WASD** to dolly, arrow keys to elevate |
| **Follow** (third-person) | Camera follows behind the character | Pointer lock — mouse look for yaw/pitch, scroll to zoom, **WASD** moves character |
| **FPS** (first-person) | First-person view at eye height | Pointer lock — mouse look, **WASD** moves character |

### Character Movement (Follow & FPS modes only)

| Key | Action |
|---|---|
| **W** | Move forward |
| **A** | Strafe left |
| **S** | Move backward |
| **D** | Strafe right |
| **Space** | Jump |

- Hold **Shift** to run (not yet implemented per current code).

### General

| Key | Action |
|---|---|
| **H** | Show/hide the lil-gui Settings panel (camera mode, scene manager, color picker) |
| **Enter** | Open chat input (multiplayer only) |
| **Escape** | Cancel chat input / exit pointer lock |

---

## Playing Offline (Single-Player)

1. Launch with `npm run dev` or click **Play Offline** from the menu.
2. Explore the world, build with cubes, and switch camera modes.
3. **Save your scene**: Use the **Scene Manager** section in the lil-gui panel (press **H**):
   - Type a scene name and click **Save** to store it as a JSON file in `public/scenes/`.
   - Click **Load** to restore a previously saved scene.
4. To generate procedural terrain, use the CLI tool:
   ```bash
   node scripts/generate-terrain.js
   ```

---

## Playing Multiplayer

1. Make sure the game server is running (`npm run dev:all` or `npm run server` + `npm run dev`).
2. Open `http://localhost:5173` in your browser.
3. Enter a nickname.
4. Click **Create World** to host, or **Join World** to connect to an existing world.
5. Other players appear as box-based characters with nametags floating above their heads.
6. Cube placements and removals sync in real-time. The server has authority — it validates all block actions.
7. Players can stand on each other's heads and jump.
8. **Chat**: Press **Enter** to open the chat input, type a message, and press **Enter** again to send. Messages appear as floating bubbles above characters.

### Multiplayer Architecture (for hosting)

- The WebSocket server runs on port **3001** by default.
- Players on the same LAN can connect using your machine's IP address.
- The server handles: world state, player physics, block validation, chat relay, and state broadcasting at the tick rate defined in [shared/constants.js](../shared/constants.js).

---

## HUD Overlay

In the top-left corner of the screen:

- **FPS counter** (powered by stats.js)
- Connection status (in multiplayer mode)
- Current camera mode indicator

---

## Project Structure

```
client/         — Browser-side code (rendering, input, UI, networking)
server/         — Node.js WebSocket game server
shared/         — Code shared between client and server (physics, messages, constants)
public/scenes/  — Saved scene JSON files
docs/           — Documentation
scripts/        — CLI utilities (terrain generation)
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Page doesn't load | Make sure you ran `npm install` first |
| Can't connect in multiplayer | Ensure the game server is running (port 3001). Check your firewall allows WebSocket connections |
| Low FPS with many cubes | The engine supports up to ~100,000 cubes at 60fps via hidden-face culling and spatial chunking. If performance degrades, reduce the size of your build |
| Pointer lock stuck | Press **Escape** to release the pointer |
| Chat won't open | Chat only works in multiplayer mode. Make sure you're connected to a world |

---

## Development

- **Tests**: Run `npx playwright test` for end-to-end browser tests.
- **Linting**: No linter is currently configured.
- **Hot Reload**: Vite provides instant HMR for client code changes. The game server must be restarted manually for server-side changes.

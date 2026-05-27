# Three.js Voxel Builder

A browser-based voxel building game built with Three.js. Place and remove colored cubes to construct 3D scenes, with a Lego-style minifigure character that can walk, jump, and explore your builds.

![threejs lab](https://img.shields.io/badge/three.js-0.184-blue) ![vite](https://img.shields.io/badge/vite-8.0-purple)

## Features

- **Build at scale** — supports up to 100,000 cubes with hidden-face removal and spatial chunking for smooth 60fps
- **Three camera modes** — Orbit (free-fly), Follow (third-person), and FPS (first-person with pointer lock)
- **Lego minifigure** — animated character with walk, run, and jump animations
- **GPU-optimized rendering** — per-chunk `BufferGeometry` with only exposed faces rendered; automatic frustum culling
- **Save & load** — persist your builds to `public/scenes/` via the GUI save button
- **CPU voxel raycasting** — Amanatides-Woo algorithm for click-to-place/remove without GPU readback

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Controls

### Building
| Action | Input |
|---|---|
| Place cube | Left click |
| Remove cube | Right click |

### Camera
| Mode | Controls |
|---|---|
| **Orbit** (default) | Left-drag to orbit, right-drag to zoom, WASD to dolly |
| **Follow** | Third-person follow with mouse look and scroll zoom |
| **FPS** | First-person with pointer lock and WASD movement |

Press **H** to show/hide the camera controller GUI. Switch modes via the dropdown panel.

### Character Movement (Follow / FPS modes)
| Key | Action |
|---|---|
| W / A / S / D | Move |
| Space | Jump |

## Project Structure

```
src/
├── main.js                  # Entry point — scene setup, render loop, wiring
├── LegoCharacter.js         # Lego minifigure model + animations
│
├── ChunkManager.js          # Spatial chunk system (16³ chunks)
│   └── Chunk (internal)     # One per chunk — BufferGeometry of exposed faces
├── CubeManager.js           # Facade over ChunkManager + WorldMap
├── WorldMap.js              # Sparse 3D grid for O(1) block occupancy
├── VoxelRaycaster.js        # CPU ray traversal for cube picking
│
├── InteractionManager.js    # Mouse click handling (place/remove)
├── InputManager.js          # Keyboard state tracking (WASD + Space)
│
├── CharacterController.js   # Movement, gravity, per-axis collision
│
├── CameraController.js      # Abstract base for camera controllers
├── OrbitController.js       # Free-flying orbital camera
├── FollowController.js      # Third-person follow camera
├── FPSController.js         # First-person camera with pointer lock
├── ControllerGUI.js         # lil-gui panel for camera switching + save
│
├── SceneArchive.js          # Save/load to JSON via /api/save and /api/load
│
public/
└── scenes/
    └── myworld.scene        # Saved scene data (JSON)
```

## Architecture

### Cube Rendering Pipeline

The world is divided into **16×16×16 chunks**. Each chunk builds a custom `BufferGeometry` containing only the faces of cubes that are exposed (no neighbor on that side). On add/remove, only affected chunks rebuild their geometry.

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

### Frustum Culling

Each chunk's mesh has a fixed bounding sphere. Three.js automatically skips chunks outside the camera frustum — typically 60-90% culled when viewing a portion of a large build.

### Hidden Face Removal

For each cube at cell (bx, by, bz), the geometry builder checks all 6 neighboring cells via `WorldMap.isBlockOccupied()`. If a neighbor exists in that direction, the face is skipped. In a solid 8×8×8 block of 512 cubes, only 384 faces are rendered instead of 3,072.

## Tech Stack

- [Three.js](https://threejs.org/) — 3D rendering
- [Vite](https://vitejs.dev/) — dev server with custom `/api/save` and `/api/load` middleware
- [lil-gui](https://lil-gui.georgealways.com/) — debug UI panel
- [stats.js](https://github.com/mrdoob/stats.js/) — FPS monitor

## License

MIT

# VoxelLab — Complete Functional Requirements

A comprehensive inventory of all functional requirements for the VoxelLab browser-based multiplayer voxel building game, organized by domain with implementation references.

---

## 1. World & Voxel Building

| # | Requirement | Implementation |
|---|-------------|----------------|
| 1 | **Create world** — start a new named world from the main menu | `UIManager.js` "Create New World" button → `WorldManager._handleJoin()` creates a `GameWorld` |
| 2 | **Run offline (single-player)** — play without a server | `main.js:187` `startOfflineMode()`; uses local `SceneArchive` and no network layer |
| 3 | **Run online (multiplayer)** — connect to a server and join a world | `main.js:151` `joinMultiplayerWorld()`; sets up `NetworkClient`, `StateManager`, `RemotePlayerManager` |
| 4 | **Place cube** — left-click to place a colored cube on an existing block face or on the ground | `InteractionManager.js:88-100`; raycaster finds hit block → places at adjacent empty cell |
| 5 | **Remove cube** — right-click (or Ctrl+left-click) to remove an existing cube | `InteractionManager.js:80-85`; raycaster finds hit block → removes it |
| 6 | **Random cube color** — cubes placed without a selected color get a random RGB | `InteractionManager.js:118-125`; uses `Math.random()` per channel |
| 7 | **Select cube color** — choose from a 30-color palette (15 hues × 2 lightness rows) | `ColorPicker.js`; 15×2 grid, click to select, click again to deselect (revert to random) |
| 8 | **Hidden-face removal** — only faces not touching another cube are rendered | `ChunkManager.js` (Chunk class `rebuildGeometry`); checks 6 neighbor directions per block face |
| 9 | **Spatial chunking** — world divided into 16×16×16 chunks; only dirty chunks rebuild geometry | `ChunkManager.js`; `Map<string, Chunk>`, dirty set, rebuild spread across frames (max 2/frame) |
| 10 | **Frustum culling** — chunks outside the camera frustum are automatically skipped by Three.js | `ChunkManager.js` — each chunk mesh has a fixed bounding sphere; `frustumCulled = true` |
| 11 | **Block collision detection** — character AABB collision against placed blocks, per-axis resolution | `shared/physics.js`: `resolveAxisOnWorld()`, `resolveAnyOverlapOnWorld()` |
| 12 | **Prevent placing cube inside character** — blocks that would overlap the local player AABB are rejected | `InteractionManager.js:90` `_isCharacterAt()` check before placement |
| 13 | **Prevent placing cube inside any player (server)** — server validates block placement against all player AABBs | `GameWorld.js:176-179` uses `doesBlockOverlapAnyPlayer()` from `shared/physics.js` |
| 14 | **Prevent placing cube in occupied cell** — server rejects if cell already has a block | `GameWorld.js:171-173` |
| 15 | **CPU voxel raycasting** — Amanatides-Woo DDA algorithm for click-to-place/remove without GPU readback | `shared/VoxelRaycaster.js`; max distance 80 units, max 240 steps |
| 16 | **Ground-plane picking** — when no block is hit, ray-intersect with Y=0 plane to place on the ground | `VoxelRaycaster.js:66-68` `pickGround()` |
| 17 | **Up to 100,000 cubes at 60fps** — performance target via chunking + hidden-face removal | `README.md`; `ChunkManager` design |

## 2. Character & Movement

| # | Requirement | Implementation |
|---|-------------|----------------|
| 18 | **Lego minifigure character** — detailed Lego-style character built from Three.js primitives | `LegoCharacter.js`; torso, head, arms, legs, hands, shoes, hair, eyes, smile |
| 19 | **WASD movement** — W/A/S/D keys move the character relative to facing direction | `shared/physics.js:64-89`; input rotated by character yaw, normalized, scaled by `MOVE_SPEED` (2.5) |
| 20 | **Character jumping** — Space bar makes the character jump | `shared/physics.js:45-50`; `JUMP_SPEED = 10`, `GRAVITY = -18` |
| 21 | **Character gravity** — character falls when not grounded | `shared/physics.js:91-94`; `velocityY += GRAVITY * delta` |
| 22 | **Ground detection (on blocks)** — checks blocks directly below the character's feet | `shared/physics.js:122-155`; scans foot AABB against WorldMap below |
| 23 | **Ground detection (Y=0 plane)** — character cannot fall below y=0 | `shared/physics.js:124-127` |
| 24 | **Per-axis AABB collision** — character movement resolved independently on X, Y, Z axes | `shared/physics.js:96-119`; `resolveAxisOnWorld()` per axis |
| 25 | **Final safety overlap pass** — iterative resolution of any remaining block overlaps | `shared/physics.js:268-319` `resolveAnyOverlapOnWorld()`; max 3 iterations |
| 26 | **Idle animation** — subtle breathing bob when standing still | `LegoCharacter.js:183-190`; `visual.position[y]` sine oscillation |
| 27 | **Walk forward animation** — legs and arms swing with body bob | `LegoCharacter.js:194-209`; 1s cycle using `NumberKeyframeTrack` |
| 28 | **Walk backward animation** — reversed leg/arm swing | `LegoCharacter.js:212-224` |
| 29 | **Walk left animation** — sidestep with leg spread/close on Z axis | `LegoCharacter.js:226-239` |
| 30 | **Walk right animation** — reversed sidestep | `LegoCharacter.js:242-253` |
| 31 | **Jump animation** — squash/stretch with arms up and legs tucked | `LegoCharacter.js:257-273`; 0.6s clip |
| 32 | **Animation crossfade** — smooth 150ms transition between animation states | `LegoCharacter.js:282-294`; `fadeOut`/`fadeIn` |

## 3. Camera Modes

| # | Requirement | Implementation |
|---|-------------|----------------|
| 33 | **Orbit mode** — free-flying camera; left-drag orbit, right-drag zoom, WASD dolly, arrow keys elevate | `OrbitController.js`; spherical coordinates with smooth interpolation |
| 34 | **Follow mode (third-person)** — Minecraft-style 3rd-person; pointer lock, mouse look drives yaw+pitch, scroll zoom | `FollowController.js`; camera behind character, `_yaw` drives character rotation |
| 35 | **FPS mode (first-person)** — pointer lock, mouse look, camera at eye height, crosshair overlay | `FPSController.js`; eye height 1.45, forward offset 0.25, hides face/hair meshes |
| 36 | **Camera mode switching** — dropdown in lil-gui panel to switch between Orbit/Follow/FPS | `ControllerGUI.js:213-217` |
| 37 | **Camera base class** — abstract `enable()`, `disable()`, `update()` interface for all controllers | `CameraController.js` |
| 38 | **No cube placement in Follow mode** — Follow mode has no crosshair, placement disabled | `InteractionManager.js:67` |

## 4. Scene Persistence

| # | Requirement | Implementation |
|---|-------------|----------------|
| 39 | **Save scene** — persist all cubes + player position to a `.scene` JSON file | `SceneArchive.js` → POST `/api/save/:name` in Vite middleware (`vite.config.js`) |
| 40 | **Load scene** — restore all cubes + player position from a `.scene` JSON file | `SceneArchive.js` → GET `/api/load/:name` in Vite middleware |
| 41 | **List scenes** — enumerate all saved `.scene` files | `SceneArchive.list()` → GET `/api/scenes` in Vite middleware |
| 42 | **Create new scene** — creates a default scene with 4 corner cubes and character at center | `SceneArchive.createDefault()` |
| 43 | **Last-scene memory** — remembers the last loaded scene in `localStorage` for auto-load on next offline session | `SceneArchive.setLastScene()` / `getLastScene()`; key: `voxellab-last-scene` |
| 44 | **Scene Manager GUI** — dropdown to load scenes, Save Scene button, Create New button | `ControllerGUI.setupSceneManager()` |
| 45 | **Scene name validation** — names must be alphanumeric/hyphens/underscores; conflict detection | `ControllerGUI.js:128-142` |
| 46 | **Bulk cube loading** — defers chunk rebuilds during scene load for performance | `CubeManager.beginBulkLoad()` / `endBulkLoad()` |
| 47 | **Procedural terrain generation** — multi-octave FBM value noise to generate mountain-range terrain | `TerrainGenerator.js`; seeds from a configurable seed value |
| 48 | **Terrain elevation coloring** — 5 color bands based on height: dark earth → green grass → brown rock → grey rock → white snow | `TerrainGenerator.js:163-210` `getColorForHeight()` |
| 49 | **CLI terrain generator** — standalone script to generate `.scene` files from the command line | `scripts/generate-terrain.js`; args: `--size`, `--height`, `--seed`, `--name`, `--octaves` |

## 5. Multiplayer Networking

| # | Requirement | Implementation |
|---|-------------|----------------|
| 50 | **World discovery** — list active worlds with player count and cube count | `WorldManager._sendWorldList()`; `GET /api/worlds` REST endpoint |
| 51 | **Join world** — connect via WebSocket, send join message with worldId + nickname | `NetworkClient.connect()` → `createJoinMessage()` |
| 52 | **Full world state sync on join** — new joiner receives all existing cubes + all existing players | `GameWorld.addPlayer()` sends `JOINED` + `WORLD_STATE` |
| 53 | **Client-side prediction (CSP)** — client runs physics locally and predicts position before server confirmation | `main.js` game loop sends `playerState` each frame; physics from `shared/physics.js` |
| 54 | **Server reconciliation** — server sends authoritative state; client replays unacknowledged inputs and applies smooth error correction | `StateManager.processReconcile()` + `repredict()`; `CharacterController.reconcile()` with exponential decay correction |
| 55 | **Remote player interpolation** — render remote players 150ms behind server time with linear interpolation between state snapshots | `StateManager.getInterpolatedState()`; ring buffer of 5 snapshots |
| 56 | **Server-authoritative block placement** — all block ops validated server-side and broadcast to all clients | `GameWorld.placeBlock()` / `removeBlock()` |
| 57 | **Optimistic block placement (client)** — client places block immediately, server echoes back; client ignores its own echo via `lastLocalBlockOp` | `InteractionManager.js:129-134` |
| 58 | **Block operation rejection** — server rejects invalid placements (occupied, player overlap) and notifies only the sender | `GameWorld.js:177-178` → `BLOCK_REJECTED` message |
| 59 | **Revert rejected blocks** — client removes optimistically-placed blocks that server rejected | `main.js:477-481` `handleBlockRejected()` |
| 60 | **Player join/leave notifications** — broadcast to all players when someone joins or leaves | `PLAYER_JOINED` / `PLAYER_LEFT` messages |
| 61 | **Remote player models** — box-based character model with nametag for each remote player | `RemotePlayerModel.js`; shared geometries, manual limb animation, CanvasTexture nametag |
| 62 | **Remote player walk animation** — limb swing based on interpolated walk state | `RemotePlayerManager.update()`; walk speed 0→1 transition, limb swing via `Math.sin` |
| 63 | **20Hz server tick** — authoritative simulation runs at 20 ticks/second | `TICK_RATE = 20`, `TICK_INTERVAL_MS = 50`; `GameWorld._startTick()` |
| 64 | **Server-side idle gravity** — for players with no queued input (idle/background tab), server still runs gravity-only steps | `GameWorld._tick()`: if no input queued, runs `simulateStep` with all-false input |
| 65 | **Delta capping** — cap client delta at 0.1s to prevent speed hacks | `MAX_DELTA = 0.1`; enforced in `StateManager.repredict()` and `GameWorld.processPlayerInput()` |
| 66 | **Input queueing** — server accumulates all inputs between ticks so no data is lost | `Player.queueInput()` / `consumeInput()`; each input processed in order |
| 67 | **World capacity limit** — max 50 players per world | `MAX_PLAYERS = 50`; checked in `WorldManager._handleJoin()` |
| 68 | **World auto-destroy** — empty worlds are destroyed after 5 minutes of inactivity | `WORLD_DESTROY_TIMEOUT_MS = 300000`; timer resets when a player joins |
| 69 | **WebSocket reconnection** — exponential backoff (1s → 30s, max 5 attempts) on unexpected disconnect | `NetworkClient._scheduleReconnect()` |
| 70 | **Message queueing during reconnect** — outgoing messages queued when disconnected, flushed on reconnect | `NetworkClient._pendingMessages` |
| 71 | **Nickname persistence** — nickname saved to localStorage | `UIManager._getNickname()`; key: `voxellab_nickname` |

## 6. Player-Player Interaction

| # | Requirement | Implementation |
|---|-------------|----------------|
| 72 | **Player-player collision** — AABB overlap resolution pushing players apart on minimum-overlap axis | `shared/physics.js:362-428` `resolvePlayerOverlaps()`; server-authoritative, max 3 iterations |
| 73 | **Client-side player-player push** — local player pushed out of overlapping remote players for immediate feedback | `main.js:541-552`; `pushLocalPlayerOutOfRemotePlayers()` |
| 74 | **Stand on another player's head** — character can stand on top of another player | `shared/physics.js:433-461` `checkPlayerOnAnyPlayer()`; server and client both detect head-standing |
| 75 | **Walk on player head without stuttering** — when on a head, only Y is snapped; horizontal push is skipped | `shared/physics.js:503-508`; `onHead` check in `pushLocalPlayerOutOfRemotePlayers()` |
| 76 | **Grounded on player head for animation** — standing on head shows idle (not fall/jump) animation | `shared/physics.js:165-189`; foot-on-head detection in `simulateStep()`, `main.js:549-552` |
| 77 | **Reconciliation Y-clearing on head** — when standing on head, Y reconciliation offset is cleared to prevent server fight | `CharacterController.clearYCorrection()`; called in `main.js:550` |
| 78 | **Server re-grounding after player-player push** — player pushed onto another's head is marked grounded; player pushed off a ledge starts falling | `GameWorld._tick()`: re-grounding pass at lines 380-405 |

## 7. Chat System

| # | Requirement | Implementation |
|---|-------------|----------------|
| 79 | **Send chat message** — press Enter to open chat, type message, Enter to send, Escape to cancel | `ChatManager.js`; max 200 chars |
| 80 | **Receive chat messages** — messages appear in bottom-left chat area with nickname | `UIManager.addChatMessage()` |
| 81 | **Auto-fade chat messages** — messages fade out after 8 seconds and are removed after 10 | `UIManager.js:295-304` |
| 82 | **Chat message cap** — max 10 visible messages (oldest removed) | `UIManager.js:307-308` |
| 83 | **Pointer lock management for chat** — pointer lock released when typing, re-acquired after send/cancel | `ChatManager._openChat()` / `_sendMessage()` / `_cancelChat()` |
| 84 | **Chat in multiplayer only** — chat messages sent over WebSocket to all players in the world | `main.js:491-497`; server `WorldManager._routeToWorld()` case 'chat' |

## 8. UI & HUD

| # | Requirement | Implementation |
|---|-------------|----------------|
| 85 | **Main menu** — overlay with nickname input, Create New World, world list, Join buttons, Play Offline | `UIManager._createMenuOverlay()` |
| 86 | **World list table** — shows world name, player count (with capacity), cube count, Join button per world | `UIManager.showWorldList()` |
| 87 | **HUD overlay** — shows world name and player count in top-left corner | `UIManager._createHUD()` → `updateHUD()` |
| 88 | **Disconnect screen** — red overlay "Disconnected. Returning to menu..." on connection loss | `UIManager.showDisconnected()`; auto-returns to menu after 2s |
| 89 | **GUI panel (lil-gui)** — "Game Settings" panel with camera controller dropdown, scene manager, color picker toggle | `ControllerGUI.js` |
| 90 | **GUI hide/show** — press H to toggle GUI visibility | `ControllerGUI.js:45-50` |
| 91 | **FPS counter** — stats.js panel showing FPS | `main.js:138-140` |
| 92 | **URL parameter for offline mode** — `?offline` query param skips menu and goes straight to offline play | `main.js:313` |
| 93 | **Return to menu** — disconnect, clear world, reset character, show main menu | `main.js:253-285` `returnToMenu()` |

## 9. Rendering & Environment

| # | Requirement | Implementation |
|---|-------------|----------------|
| 94 | **Scene lighting** — ambient light (0.5), directional light (1.5), fill light (0.5), spotlight attached to camera | `main.js:62-80` |
| 95 | **Grid floor** — 50×50 grid helper on the Y=0 ground plane | `main.js:58-60` |
| 96 | **Responsive canvas** — resize handler adjusts camera aspect ratio and renderer size | `main.js:36-40` |
| 97 | **Pixel ratio cap** — capped at 2× for performance on high-DPI displays | `main.js:33` |
| 98 | **Per-vertex colored cubes** — BufferGeometry with vertex colors, `vertexColors: true` material | `ChunkManager.js`; color attribute per vertex |

## 10. Input Handling

| # | Requirement | Implementation |
|---|-------------|----------------|
| 99 | **Keyboard input tracking** — tracks held state for W/A/S/D/Space/Enter/Escape | `InputManager.js`; `keydown`/`keyup` event handlers |
| 100 | **One-shot key detection** — `consumeKey()` for Enter/Escape (returns true only once per press) | `InputManager.js:108-114` |
| 101 | **Modifier key reset** — pressing Meta/Ctrl/Alt resets all tracked keys to prevent stuck movement | `InputManager.js:15-18` |
| 102 | **Blur/visibility reset** — window blur or tab hidden resets all keys | `InputManager.js:60-63` |
| 103 | **Context menu prevention** — right-click context menu suppressed on the canvas | `InteractionManager.js:103` |
| 104 | **Click deadzone** — 3px movement deadzone to prevent orbit micro-movements from canceling clicks | `InteractionManager.js:36` |

## 11. Server Infrastructure

| # | Requirement | Implementation |
|---|-------------|----------------|
| 105 | **HTTP + WebSocket server** — single port (default 3001) handling both REST and WebSocket | `server/server.js` |
| 106 | **REST API: world list** — `GET /api/worlds` returns JSON array of world info | `server.js:35-43` |
| 107 | **REST API: health check** — `GET /health` returns server status | `server.js:46-50` |
| 108 | **Vite dev proxy** — proxies `/api/worlds` and `/health` to game server in dev mode | `vite.config.js:9-13` |
| 109 | **Vite scene API middleware** — `GET /api/scenes`, `POST /api/save/:name`, `GET /api/load/:name` | `vite.config.js:17-85` |
| 110 | **Configurable port** — `PORT` env var (default 3001) | `server.js:19` |
| 111 | **Server-authoritative physics** — server runs the same `simulateStep()` as the client using shared physics module | `GameWorld.processPlayerInput()` |

## 12. Edge Cases & Robustness

| # | Requirement | Implementation |
|---|-------------|----------------|
| 112 | **No cube placement in Follow mode** — Follow mode has no visible crosshair, placement disabled | `InteractionManager.js:67` |
| 113 | **Bulk load mode** — defers chunk rebuilds during scene load for performance | `CubeManager.beginBulkLoad()` / `endBulkLoad()` |
| 114 | **Empty chunk cleanup** — chunks with 0 blocks are removed from the scene and disposed | `ChunkManager._removeEmptyChunk()` |
| 115 | **Chunk boundary neighbor marking** — when a block is added/removed on a chunk boundary, adjacent chunks are also marked dirty | `ChunkManager._markDirty()`: checks lx/ly/lz 0 or 15 |
| 116 | **Swap-with-last removal** — O(1) removal from position list using swap-with-last | `ChunkManager.removeCube()` |
| 117 | **Cross-chunk neighbor queries** — `_isNeighborOccupied` checks local chunk first, then WorldMap | `ChunkManager.js` Chunk class |
| 118 | **Clean dispose of geometries/materials** — all disposables cleaned up on clear/destroy | `ChunkManager.dispose()`, `RemotePlayerModel.dispose()` |
| 119 | **Input queue bounded at 60** — prevents unbounded memory growth if server lags | `StateManager.pushPendingInput()` |
| 120 | **Interpolation ring buffer at 5** — 5 snapshots per remote player, oldest discarded | `StateManager.processPlayerStates()` |
| 121 | **Server clock offset estimation** — corrects for clock skew between client and server for accurate interpolation | `StateManager._clockOffset` |
| 122 | **Movement stuck-key prevention** — modifier key detection + blur/visibility reset prevents phantom movement | `InputManager.js` |
| 123 | **No orbit-mode character movement on server** — when in Orbit mode, client sends all-false input to server | `main.js:560-564` |
| 124 | **Extreme divergence safety snap** — if CSP error exceeds 5 units, direct snap instead of smooth correction | `main.js:439-441` |

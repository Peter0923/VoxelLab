# Player-on-Head Jump Mechanics

What happens when Player1 jumps while Player2 is standing on Player1's head. A frame-by-frame trace through the full stack — client-side prediction, server authority, the reconciliation loop, and the **vertical-attached state** system that eliminates client-side visual lag.

## Key Constants

```
CHAR_HEIGHT = 2.0      (character AABB height)
JUMP_SPEED  = 10       (initial upward velocity)
GRAVITY     = -18      (downward acceleration)
TICK_RATE   = 20       (server ticks per second, 50ms interval)
COLLISION_MARGIN = 0.001
INTERP_DELAY_MS = 150  (remote player interpolation delay on client)
ATTACH_TOLERANCE = 0.06 (max head-standing gap for checkPlayerOnAnyPlayer)
```

## Key Concepts

### Vertical-Attached State

When Player2 stands on Player1's head, the server records `Player2.attachedTo = "p-1"`. This field is broadcast in `PLAYER_STATES` and used by **two independent mechanisms**:

1. **Client-side Y-override**: On P1's screen, P2's Y is set directly to `P1.posY + CHAR_HEIGHT` each frame — bypassing both the 150ms interpolation delay and the smooth-lerp. Zero visual lag.

2. **Server-side snap-down**: Before overlap resolution each tick, any player with `attachedTo` set and `isGrounded=true` is snapped down to their carrier's current head Y if a gap has formed (carrier descended). Prevents false detachment during rapid falling.

When P2 jumps or walks off P1's head, `attachedTo` is cleared and both mechanisms stop. P2 falls normally.

---

## Initial State

```
Player1:  posY=0.0,  velocityY=0,   isGrounded=true,  attachedTo=null
Player2:  posY=2.0,  velocityY=0,   isGrounded=true,  attachedTo="p-1" (standing on P1's head)
```

Player2's feet (y=2.0) are flush with Player1's head (0.0 + 2.0 = 2.0). The server has detected this and set `attachedTo`.

---

## Phase 1: Player1 presses Space (Jump initiation)

### Client-side (Player1's client)

**`simulateStep()` in `shared/physics.js:37-203`:**

1. **Jump application** (lines 45-50): `inputKeys.space=true`, `isGrounded=true`, `isJumping=false` → velocityY is set to `JUMP_SPEED` (10), `isGrounded` set to `false`, `isJumping` set to `true`.

2. **Gravity** (lines 92-94): Because `isGrounded` was just set to `false`, gravity applies immediately in the same frame: `velocityY += GRAVITY * delta`. At 60fps (delta≈0.016s): `velocityY = 10 + (-18 × 0.016) = 9.712`.

3. **Y-axis movement** (lines 115-119): `pos.y += velocityY × delta = 0 + 9.712 × 0.016 ≈ 0.155`. No block collision on Y axis (nothing above Player1).

4. **Ground detection** (lines 122-189): Player1 is now at y=0.155 and rising. Not grounded on blocks below. `isGrounded` stays `false`.

**Result after physics:** Player1 at y≈0.155, velocity=9.712, isGrounded=false.

5. **`pushLocalPlayerOutOfRemotePlayers()`** (client main loop, `main.js:543`): Player1 (local) vs Player2 (remote). Two checks now run:

   - **Forward check** (original, lines 498-508): `localPos.y (0.155) > remote.posY (2.0)` → **false**. P1 is not standing on P2's head.
   
   - **Reverse check** (new, line 513): `remote.attachedTo ("p-1") === localPlayerId ("p-1")` → **true**. P2 is attached to P1 → skip horizontal push entirely. P1 is NOT pushed sideways — no incorrect client-side prediction to reconcile.

6. **CSP send** (lines 563-568): Input `{w:false,a:false,s:false,d:false,space:true}`, rotationY, and delta are sent to the server with sequence number.

7. **Y-override in RemotePlayerManager** (line 573): P2's interpolated state has `attachedTo="p-1" === localPlayerId`. P2's rendered Y is set directly to `P1.posY + CHAR_HEIGHT = 0.155 + 2.0 = 2.155` — P2 immediately appears at P1's new head level with **zero interpolation lag**.

### Client-side (Player2's client)

Player2's client has Player1's position from the server interpolation buffer (150ms behind, but roughly correct).

**`simulateStep()` with `players=[Player1_remote]`:**

1. Jump check: space not pressed → skip.

2. Gravity: `isGrounded=true` → skip.

3. Y movement: `velocityY=0` → no vertical movement.

4. **Ground detection** (lines 129-189): `velocityY <= 0` (it is 0), enters ground check.
   - Block ground (lines 138-155): No blocks below Player2's feet.
   - Player head ground (lines 165-189): Player1's head is at `0.155 + 2.0 = 2.155`. Player2's feet at `2.0`. Is `2.0` within `[2.155-0.08, 2.155+0.06]` = `[2.075, 2.215]`? **No** — Player2 is too low (0.075 units below the tolerance band). `isGrounded` becomes **false**.

Player2's client predicts that Player2 is no longer grounded! This is a temporary incorrect prediction (resolved by reconciliation).

5. **`pushLocalPlayerOutOfRemotePlayers()`** (`main.js:543`): Player2 (local at y=2.0) vs Player1 (remote at y≈0.155). The `onHead` check: `localPos.y (2.0) > remote.posY (0.155)` → **true**. `feetOnHead`: `2.0 >= 2.155-0.06=2.095`? **No** (2.0 < 2.095). So `onHead` is **false**. P2 is inside P1's AABB — pushed sideways (minor incorrect prediction).

6. **CSP send**: sends idle input to server.

### Server tick (50ms interval)

The server processes both players' accumulated inputs in `GameWorld._tick()`:

**Step 1 — Process inputs** (`processPlayerInput`, lines 235-299):

- **Player1** (has queued space-press input):
  Runs `simulateStep()` with `delta=0.05` (the tick interval):
  - Jump applied: `velocityY=10`, `isGrounded=false`, `isJumping=true`
  - Gravity: `velocityY = 10 + (-18 × 0.05) = 9.1`
  - Y movement: `posY = 0 + 9.1 × 0.05 = 0.455`
  - isGrounded stays false
  - **Result:** posY=0.455, velocityY=9.1

- **Player2** (no input queued — idle on Player1's head):
  Falls through to the idle gravity step (lines 333-355). Runs `simulateStep()` with all-false input and `isGrounded=true`:
  - Gravity: isGrounded=true → skip
  - Y movement: velocityY=0 → none
  - Ground detection: Not on blocks. Check player head: Player1 headY = 0.455+2.0=2.455. Player2 footY=2.0. 2.0 NOT in [2.375, 2.515]. Not grounded.
  - **Result:** posY=2.0, velocityY=0, isGrounded=**false**

**Step 2 — Snap-down pass** (new, line 358): Keeps attached riders glued to their carrier's head when the carrier moves down. Checks each player with `attachedTo` set AND `isGrounded=true`. P2 is no longer `isGrounded` from the idle step above, so the snap-down guard skips P2. (P2 lost ground because P1 rose *into* P2, creating penetration rather than a gap.)

**Step 3 — Player-player overlap resolution** (`resolvePlayerOverlaps`, line 367):

```
Player1 AABB: yMin=0.455, yMax=2.455
Player2 AABB: yMin=2.000, yMax=4.000

overlapY = min(2.455, 4.000) - max(0.455, 2.000) = 2.455 - 2.000 = 0.455
overlapX ≈ 0.8 (aligned horizontally)
overlapZ ≈ 0.8

Minimum overlap is Y (0.455). axis='Y'.
Push the top player (Player2, since 2.0 >= 0.455):
  Player2.posY += 0.455 + 0.001 = 2.456
```

Player2 is pushed up to y=2.456, riding on Player1's rising head.

**Step 4 — Block overlap fix** (`resolveAnyOverlapOnWorld`, line 373-379):
No blocks involved → no-op.

**Step 5 — Re-grounding pass** (lines 384-432):

Player2 is `isGrounded=false`. Check `checkPlayerOnAnyPlayer()`:
- Player2 footY=2.456, Player1 headY=2.455. Difference = 0.001 ≤ 0.06 ✓
- Horizontal AABBs overlap ✓
- Returns **true**!
- Player2.posY snapped to Player1.headY = 2.455
- Player2.isGrounded = **true**, velocityY = 0
- **Player2.attachedTo = "p-1"** ← records the vertical attachment

**Final authoritative state after tick:**
```
Player1: posY=0.455, velocityY=9.1, isGrounded=false, attachedTo=null
Player2: posY=2.455, velocityY=0,  isGrounded=true,  attachedTo="p-1"
```

**Step 6 — Broadcast:**
- `RECONCILE` sent to each player with their authoritative state.
- `PLAYER_STATES` sent to each player with the OTHER player's state — **now includes `attachedTo` field**.

---

## Phase 2: Player1 continues rising (mid-ascent)

Starting state: Player1 at y=0.455, velocityY=9.1. Player2 at y=2.455, attachedTo="p-1".

### Server tick pattern

Each tick while P1 rises:

**Player1:** Space held. `isGrounded=false` → no re-jump. Gravity → vy decreases, posY rises.

**Player2:** `isGrounded=true`, no input, idle step. P1's head has moved up since last tick — P1 head is now higher than P2's feet, so P2 is inside P1's AABB (penetration). P2 becomes `isGrounded=false` in simulateStep.

**Snap-down pass:** P2 is `isGrounded=false` now, so the guard skips it. (P1 moved *up* into P2 — this is penetration, not a gap. `resolvePlayerOverlaps` handles penetration.)

**resolvePlayerOverlaps:** Detects Y-axis penetration, pushes P2 up by overlap amount.

**Re-grounding:** `checkPlayerOnAnyPlayer(P2, P1)` → true. P2.posY → P1.headY, isGrounded=true, attachedTo="p-1".

**Broadcast:** RECONCILE + PLAYER_STATES with updated attachedTo.

### Client-side during rising

**Player1's view:** Y-override is active (`state.attachedTo === "p-1"`). P2's Y = P1.posY + CHAR_HEIGHT each frame — P2 appears to ride smoothly upward with zero lag. X/Z still use normal interpolation (smooth lerp, ~150ms behind). Horizontal position of P2 on P1's head is slightly delayed but visually acceptable since P2 is mostly stationary relative to P1.

**Player2's view:** P2's own simulateStep handles ground-on-player detection. Reconciliation corrects any incorrect predictions from Phase 1.

---

## Phase 3: Player1 reaches apex and starts falling

At the apex (velocityY crosses zero), Player1's vertical velocity becomes negative. Gravity continues pulling down.

### Server tick at descent

**Before the fix** (old behavior): P2 stayed at the old Y while P1's head dropped. The gap exceeded 0.06 tolerance → `checkPlayerOnAnyPlayer` failed → false detachment → P2 became airborne → P2 fell independently, then bounced back onto P1's head later. This caused visible "jumping higher than P1" artifacts.

**With the snap-down pass** (current behavior):

**Player1:** velocityY is now negative (e.g., -1.0). Gravity: `velocityY = -1.0 + (-18 × 0.05) = -1.9`. Y movement: posY decreases (e.g., from 2.5 to 2.405). headY drops from 4.5 to 4.405.

**Player2:** `isGrounded=true` (from previous tick's re-grounding), no input. Idle simulateStep: gravity skipped (isGrounded=true), Y stays at 4.5 (old position).

Now there's a gap: P2 at y=4.5, P1 head at y=4.405. Gap = 0.095 > 0.06. Without intervention, the re-grounding pass would fail.

**Snap-down pass** (new, between input processing and resolvePlayerOverlaps):

```
For each player:
  P2.attachedTo = "p-1" ∧ P2.isGrounded = true
  → carrier = lookup("p-1") → P1
  → P2.posY (4.5) > carrier.headY (4.405)?
  → YES → snap: P2.posY = 4.405, velocityY = 0
```

P2 is pulled down to P1's head before overlap resolution runs. No gap forms.

**resolvePlayerOverlaps:** P2 at 4.405, P1 head at 4.405 → exact alignment, no overlap → no-op.

**Re-grounding:** P2.isGrounded=true, checkPlayerOnAnyPlayer(P2, P1) → foot at 4.405, head at 4.405, gap=0 ≤ 0.06 → true. P2.attachedTo stays "p-1".

**This repeats every tick while P1 descends.** The snap-down pass prevents any gap from forming, regardless of fall speed. Even at max fall velocity (~9 units/s), the 0.45-unit gap per tick is instantly closed before re-grounding runs.

### Client-side during falling

**Player1's view (Y-override):** P2's interpolated state has `attachedTo="p-1"` → Y is set directly to `P1.posY + CHAR_HEIGHT` each frame. P2 tracks P1's head exactly, with zero lerp lag. Falls smoothly with P1.

**Player1's view (horizontal push):** `pushLocalPlayerOutOfRemotePlayers` checks `remote.attachedTo === localPlayerId` → skip horizontal push. P1 can move freely beneath P2.

### Player1 lands

**Server:** P1 hits ground block or y=0. `resolveAxisOnWorld` pushes P1 up to ground surface, velocityY=0, isGrounded=true.

**Player2:** snap-down pass keeps P2 on P1's head during the last falling tick. When P1 lands, P2 is still at P1.headY. Re-grounding confirms attachment. P1 and P2 are both stationary — P1 on ground, P2 on P1's head.

**Client:** Y-override continues, P2 stays at P1.headY. Visual landing is smooth.

---

## Phase 4: Reconciliation on the clients

### Player2's client reconciliation

Player2's client predicted `isGrounded=false` in Phase 1 (before server confirmation). When the server's `RECONCILE` arrives:

1. `StateManager.processReconcile()` (`StateManager.js:99-107`): Discards inputs the server already processed, returns remaining unacknowledged inputs.

2. `StateManager.repredict()` (`StateManager.js:118-135`): Replays remaining inputs from the authoritative server state. The replay produces a corrected position — Player2 is now on Player1's head in the re-predicted state.

3. `CharacterController.reconcile()` (`CharacterController.js:164-179`): Computes the error offset between the re-predicted state and the current client position. Stores it in `_correctionOffset`:
   ```js
   this._correctionOffset = {
     x: corrected.posX - current.x,
     y: corrected.posY - current.y,
     // ...
   };
   ```

4. **Correction consumption** (lines 74-100): Each subsequent frame, the offset is consumed exponentially at rate 20/second:
   ```
   pos.x += offset.x * (1 - exp(-20 * delta))   // consumed proportion
   offset.x *= exp(-20 * delta)                   // remaining proportion
   ```
   When all offsets drop below 0.0001, `_correctionOffset` is set to null.

This produces a smooth lerp from the incorrect client prediction to the authoritative server position, without a visible snap.

### Player1's client reconciliation

Player1's client had **no** incorrect push during Phase 1 (the reverse `attachedTo` check in `pushLocalPlayerOutOfRemotePlayers` prevented it). If any residual error exists from other sources, it's typically sub-pixel and consumed smoothly.

---

## Phase 5: Detachment — Player2 jumps or walks off

### Player2 jumps off P1's head

1. **P2 presses space.** P2's client sends `{space:true}` to server.

2. **Server tick:** P2's simulateStep: isGrounded=true, space=true → jump triggers. velocityY=10, isGrounded=false, isJumping=true. Gravity applies. P2 rises.

3. **Snap-down pass:** P2.attachedTo="p-1" BUT P2.isGrounded=false → guard skips. P2 is not pulled back.

4. **Re-grounding:** P2 is airborne, far above P1's head → checkPlayerOnAnyPlayer fails → attachedTo=null. P2 is fully detached.

5. **Client Y-override:** Next PLAYER_STATES arrives with `attachedTo=null`. RemotePlayerManager switches from direct-Y-set back to smooth-lerp interpolation. P2 transitions smoothly to independent physics.

### Player2 walks off P1's head

1. **P2 presses horizontal key.** P2's X/Z changes via interpolation on P1's client.

2. **Server tick:** P2's simulateStep moves P2 horizontally. Eventually horizontal AABB overlap with P1's head is lost.

3. **Re-grounding:** checkPlayerOnAnyPlayer(P2, P1) → horizontal overlap? No → false. P2 loses grounded, attachedTo=null. P2 starts falling.

4. **Client Y-override:** attachedTo becomes null → Y-override stops → P2 falls via normal interpolation.

### Player1 moves horizontally while P2 is on head

1. **P1 moves.** P2's X/Z uses server interpolation (not tied to P1 — vertical-only attachment). P2's X/Z stays at old position.

2. **Server re-grounding:** P2's feet no longer overlap P1's head horizontally → checkPlayerOnAnyPlayer fails → attachedTo=null, isGrounded=false.

3. **Client:** P2's Y-override stops. P2 appears at old X/Z but now falls (since isGrounded=false). This is correct: P2 should NOT follow P1 horizontally — they're only vertically attached.

---

## Summary of Key Mechanisms

| Mechanism | File | Role |
|-----------|------|------|
| Jump initiation | `physics.js:45-50` | Sets velocityY=10, clears grounded flag |
| Per-axis world collision | `physics.js:209-263` | Resolves player-vs-block overlap on each axis |
| Ground-on-player detection | `physics.js:165-189` | Detects when feet are on another player's head |
| resolvePlayerOverlaps | `physics.js:362-428` | Pushes overlapping players apart; pushes top player up on Y overlap |
| **Snap-down pass** | `GameWorld.js:358-372` | Snaps attached rider to carrier's head each tick — prevents false detachment during carrier descent |
| Re-grounding pass | `GameWorld.js:384-432` | Restores isGrounded after player-player resolution; sets/clears `attachedTo` |
| pushLocalPlayerOutOfRemotePlayers | `physics.js:466-523` | Client-side push; skips horizontal push in BOTH directions (forward onHead + reverse attachedTo) |
| checkPlayerOnAnyPlayer | `physics.js:433-461` | Proximity check for head-standing (tolerates ≤0.06 gap) |
| **Y-override** | `RemotePlayerManager.js:90-100` | Direct Y set to P1.headY when attached — bypasses 150ms interpolation + smooth-lerp lag |
| **attachedTo broadcast** | `Player.js:133`, `StateManager.js:215,280` | Server broadcasts attachment info; client stores in interpolation buffer |
| Reconciliation | `CharacterController.js:164-179` | Smooth exponential-decay correction toward server authority |
| Re-prediction | `StateManager.js:118-135` | Replays unacknowledged inputs from authoritative base state |

The system works through **four coupled mechanisms**:

1. **Per-tick push** (rising): `resolvePlayerOverlaps()` detects Y-axis penetration and pushes Player2 upward each tick as Player1 rises.

2. **Per-tick snap-down** (falling): The snap-down pass closes gaps before re-grounding, preventing false detachment when the carrier descends. Without this, fast falls create gaps > 0.06 tolerance.

3. **Per-tick re-grounding**: After overlap resolution, `checkPlayerOnAnyPlayer()` restores `isGrounded=true` and sets `attachedTo` so the attachment persists to the next tick.

4. **Client-side Y-override**: On the carrier's client, the rider's Y is driven directly from the carrier's current position — eliminating the 150ms interpolation delay and smooth-lerp lag. Makes head-standing visuals frame-perfect from the carrier's perspective.

The **attachedTo** field is the glue: the server sets it during re-grounding, broadcasts it in PLAYER_STATES, and both the server (snap-down) and client (Y-override) consume it independently to keep the rider visually and physically attached.

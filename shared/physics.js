/**
 * Shared physics and collision detection for client-side prediction (CSP) and
 * server-side authoritative simulation.
 *
 * All functions are pure — they take a state object and a WorldMap, perform
 * deterministic AABB collision detection, and return a new state. No Three.js
 * dependencies. Importable identically by browser and Node.js.
 *
 * Extracted from CharacterController.js and InteractionManager.js.
 */

import {
  CHAR_HALF_X, CHAR_HALF_Z, CHAR_HEIGHT,
  MOVE_SPEED, JUMP_SPEED, GRAVITY,
  COLLISION_MARGIN, CELL_EPSILON,
} from './constants.js';

/**
 * Run a full physics simulation step.
 *
 * @param {{
 *   posX: number, posY: number, posZ: number,
 *   rotationY: number, velocityY: number,
 *   isGrounded: boolean, isJumping: boolean
 * }} state - The player's current state
 * @param {{w:boolean, a:boolean, s:boolean, d:boolean, space:boolean}} inputKeys - Current key states
 * @param {import('./WorldMap.js').WorldMap} worldMap - The world's block occupancy map
 * @param {number} delta - Frame delta time in seconds (capped to prevent speed hacks)
 * @param {{inOrbit: boolean, players?: Array<{posX:number, posY:number, posZ:number}>}} [opts] - Optional flags
 * @returns {{
 *   posX: number, posY: number, posZ: number,
 *   rotationY: number, velocityY: number,
 *   isGrounded: boolean, isJumping: boolean,
 *   desiredAnim: string
 * }} The new state after this step
 */
export function simulateStep(state, inputKeys, worldMap, delta, opts = {}) {
  const { inOrbit = false, players = [] } = opts;

  let { posX, posY, posZ, rotationY, velocityY, isGrounded, isJumping } = state;

  // --- Determine desired animation ---
  let desiredAnim = 'idle';

  if (!inOrbit && inputKeys.space && isGrounded && !isJumping) {
    velocityY = JUMP_SPEED;
    isGrounded = false;
    isJumping = true;
    desiredAnim = 'jump';
  }

  if (!inOrbit) {
    if (!isGrounded) {
      if (isJumping) desiredAnim = 'jump';
    } else {
      if (inputKeys.w) desiredAnim = 'walkForward';
      else if (inputKeys.s) desiredAnim = 'walkBackward';
      else if (inputKeys.a) desiredAnim = 'walkLeft';
      else if (inputKeys.d) desiredAnim = 'walkRight';
    }
  }

  // --- Horizontal movement ---
  let velX = 0, velZ = 0;

  if (!inOrbit) {
    if (inputKeys.w) velZ += 1;
    if (inputKeys.s) velZ -= 1;
    if (inputKeys.a) velX += 1;
    if (inputKeys.d) velX -= 1;
  }

  if (velX !== 0 || velZ !== 0) {
    // Normalize and rotate by character yaw
    const len = Math.sqrt(velX * velX + velZ * velZ);
    velX /= len;
    velZ /= len;

    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    // Match Three.js applyAxisAngle(Y, rotationY) rotation:
    //   x' = x*cos(θ) + z*sin(θ)
    //   z' = -x*sin(θ) + z*cos(θ)
    const rotatedX = velX * cos + velZ * sin;
    const rotatedZ = -velX * sin + velZ * cos;

    velX = rotatedX * MOVE_SPEED;
    velZ = rotatedZ * MOVE_SPEED;
  }

  // --- Gravity ---
  if (!isGrounded) {
    velocityY += GRAVITY * delta;
  }

  // --- Per-axis movement with collision resolution ---
  const pos = { x: posX, y: posY, z: posZ };

  const axes = [
    { axis: 'x', amount: velX * delta },
    { axis: 'z', amount: velZ * delta },
  ];

  for (const { axis, amount } of axes) {
    if (amount === 0) continue;
    pos[axis] += amount;
    const pushed = resolveAxisOnWorld(pos, axis, amount, worldMap);
    if (pushed) {
      if (axis === 'x') velX = 0;
      else velZ = 0;
    }
  }

  // Y axis (gravity / jumping)
  const yAmount = velocityY * delta;
  pos.y += yAmount;
  if (resolveAxisOnWorld(pos, 'y', yAmount, worldMap)) {
    velocityY = 0;
  }

  // --- Ground detection ---
  isGrounded = false;

  if (pos.y <= 0) {
    pos.y = 0;
    velocityY = 0;
    isGrounded = true;
    isJumping = false;
  } else if (velocityY <= 0) {
    const footY = pos.y;
    const hx = CHAR_HALF_X;
    const hz = CHAR_HALF_Z;
    const footMinX = pos.x - hx;
    const footMaxX = pos.x + hx;
    const footMinZ = pos.z - hz;
    const footMaxZ = pos.z + hz;

    // Check block ground
    const blockYBelow = Math.floor(footY - 0.01);
    const bx0 = Math.floor(footMinX);
    const bx1 = Math.floor(footMaxX - CELL_EPSILON);
    const bz0 = Math.floor(footMinZ);
    const bz1 = Math.floor(footMaxZ - CELL_EPSILON);
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let bz = bz0; bz <= bz1; bz++) {
        if (worldMap.isBlockOccupied(bx, blockYBelow, bz)) {
          pos.y = blockYBelow + 1;
          velocityY = 0;
          isGrounded = true;
          isJumping = false;
          break;
        }
      }
      if (isGrounded) break;
    }

    // If not grounded on a block, check if standing on another player's head.
    // This ensures the grounded state is consistent between client and server
    // and prevents the animation system from showing jump/walk animations
    // when standing still on another player.
    // We use a wider downward tolerance (feet can be up to 0.05 units below the
    // head surface) because gravity may push the player slightly into the
    // surface before this check runs. This matches the tolerance used by
    // block ground detection (which checks blockYBelow = Math.floor(footY - 0.01)).
    if (!isGrounded && players.length > 0) {
      for (const other of players) {
        const otherHeadY = other.posY + CHAR_HEIGHT;

        // Feet must be within 0.06 above or 0.08 below the head surface.
        // The asymmetry allows for gravity-based penetration before resolution.
        if (footY > otherHeadY + 0.06) continue;
        if (footY < otherHeadY - 0.08) continue;

        // Check horizontal AABB overlap
        const oMinX = other.posX - CHAR_HALF_X;
        const oMaxX = other.posX + CHAR_HALF_X;
        const oMinZ = other.posZ - CHAR_HALF_Z;
        const oMaxZ = other.posZ + CHAR_HALF_Z;

        if (footMaxX > oMinX && footMinX < oMaxX &&
            footMaxZ > oMinZ && footMinZ < oMaxZ) {
          pos.y = otherHeadY;
          velocityY = 0;
          isGrounded = true;
          isJumping = false;
          break;
        }
      }
    }
  }

  // Final safety pass: resolve any remaining overlap on all axes
  resolveAnyOverlapOnWorld(pos, worldMap);

  return {
    posX: pos.x, posY: pos.y, posZ: pos.z,
    rotationY,
    velocityY,
    isGrounded,
    isJumping,
    desiredAnim,
  };
}

/**
 * Resolves collisions on a single axis after the character has moved along that axis.
 * Returns true if the character was pushed (velocity should be zeroed on this axis).
 */
export function resolveAxisOnWorld(pos, axis, amount, worldMap) {
  const aMinX = pos.x - CHAR_HALF_X;
  const aMaxX = pos.x + CHAR_HALF_X;
  const aMinY = pos.y;
  const aMaxY = pos.y + CHAR_HEIGHT;
  const aMinZ = pos.z - CHAR_HALF_Z;
  const aMaxZ = pos.z + CHAR_HALF_Z;

  const bx0 = Math.floor(aMinX);
  const bx1 = Math.floor(aMaxX - CELL_EPSILON);
  const by0 = Math.floor(aMinY);
  const by1 = Math.floor(aMaxY - CELL_EPSILON);
  const bz0 = Math.floor(aMinZ);
  const bz1 = Math.floor(aMaxZ - CELL_EPSILON);

  let maxOverlap = 0;
  let pushSign = 0;

  for (let bx = bx0; bx <= bx1; bx++) {
    for (let by = by0; by <= by1; by++) {
      for (let bz = bz0; bz <= bz1; bz++) {
        if (!worldMap.isBlockOccupied(bx, by, bz)) continue;

        const overlapX = Math.min(aMaxX, bx + 1) - Math.max(aMinX, bx);
        const overlapY = Math.min(aMaxY, by + 1) - Math.max(aMinY, by);
        const overlapZ = Math.min(aMaxZ, bz + 1) - Math.max(aMinZ, bz);

        if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue;

        let overlap;
        if (axis === 'x') {
          overlap = overlapX;
        } else if (axis === 'y') {
          overlap = overlapY;
        } else {
          overlap = overlapZ;
        }

        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          const charCenter = axis === 'x' ? pos.x : axis === 'y' ? pos.y + CHAR_HEIGHT * 0.5 : pos.z;
          const blockCenter = (axis === 'x' ? bx : axis === 'y' ? by : bz) + 0.5;
          pushSign = charCenter < blockCenter ? -1 : 1;
        }
      }
    }
  }

  if (maxOverlap > 0) {
    pos[axis] += pushSign * (maxOverlap + COLLISION_MARGIN);
    return true;
  }

  return false;
}

/**
 * Final safety pass: resolves any remaining AABB-block overlaps on any axis.
 */
export function resolveAnyOverlapOnWorld(pos, worldMap, maxIter = 3) {
  for (let iter = 0; iter < maxIter; iter++) {
    const aMinX = pos.x - CHAR_HALF_X;
    const aMaxX = pos.x + CHAR_HALF_X;
    const aMinY = pos.y;
    const aMaxY = pos.y + CHAR_HEIGHT;
    const aMinZ = pos.z - CHAR_HALF_Z;
    const aMaxZ = pos.z + CHAR_HALF_Z;

    const bx0 = Math.floor(aMinX);
    const bx1 = Math.floor(aMaxX - CELL_EPSILON);
    const by0 = Math.floor(aMinY);
    const by1 = Math.floor(aMaxY - CELL_EPSILON);
    const bz0 = Math.floor(aMinZ);
    const bz1 = Math.floor(aMaxZ - CELL_EPSILON);

    let bestOverlap = 0;
    let bestAxis = null;
    let bestSign = 0;

    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) {
        for (let bz = bz0; bz <= bz1; bz++) {
          if (!worldMap.isBlockOccupied(bx, by, bz)) continue;

          const overlapX = Math.min(aMaxX, bx + 1) - Math.max(aMinX, bx);
          const overlapY = Math.min(aMaxY, by + 1) - Math.max(aMinY, by);
          const overlapZ = Math.min(aMaxZ, bz + 1) - Math.max(aMinZ, bz);

          if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue;

          if (overlapX > bestOverlap) {
            bestOverlap = overlapX;
            bestAxis = 'x';
            bestSign = pos.x < bx + 0.5 ? -1 : 1;
          }
          if (overlapZ > bestOverlap) {
            bestOverlap = overlapZ;
            bestAxis = 'z';
            bestSign = pos.z < bz + 0.5 ? -1 : 1;
          }
        }
      }
    }

    if (!bestAxis) return false;

    pos[bestAxis] += bestSign * (bestOverlap + COLLISION_MARGIN);
  }

  return true;
}

/**
 * Check if a block at integer world coordinates overlaps the player's AABB.
 */
export function checkPlayerBlockOverlap(pos, bx, by, bz) {
  const charMinX = pos.x - CHAR_HALF_X;
  const charMaxX = pos.x + CHAR_HALF_X;
  const charMinY = pos.y;
  const charMaxY = pos.y + CHAR_HEIGHT;
  const charMinZ = pos.z - CHAR_HALF_Z;
  const charMaxZ = pos.z + CHAR_HALF_Z;

  return (
    bx < charMaxX && bx + 1 > charMinX &&
    by < charMaxY && by + 1 > charMinY &&
    bz < charMaxZ && bz + 1 > charMinZ
  );
}

/**
 * Check if placing a block at the given world position would overlap any player.
 */
export function doesBlockOverlapAnyPlayer(worldX, worldY, worldZ, players) {
  const bx = Math.floor(worldX);
  const by = Math.floor(worldY);
  const bz = Math.floor(worldZ);

  for (const player of players) {
    const pos = { x: player.posX, y: player.posY, z: player.posZ };
    if (checkPlayerBlockOverlap(pos, bx, by, bz)) {
      return true;
    }
  }
  return false;
}

// --- Player-player collision ---

/**
 * Resolve AABB overlaps between all player pairs by pushing both players
 * apart equally on the axis of minimum overlap.
 */
export function resolvePlayerOverlaps(players, maxIter = 3) {
  if (players.length < 2) return false;

  let anyResolved = false;

  for (let iter = 0; iter < maxIter; iter++) {
    let resolvedThisIter = false;

    for (let i = 0; i < players.length; i++) {
      const a = players[i];

      const aMinX = a.posX - CHAR_HALF_X;
      const aMaxX = a.posX + CHAR_HALF_X;
      const aMinY = a.posY;
      const aMaxY = a.posY + CHAR_HEIGHT;
      const aMinZ = a.posZ - CHAR_HALF_Z;
      const aMaxZ = a.posZ + CHAR_HALF_Z;

      for (let j = i + 1; j < players.length; j++) {
        const b = players[j];

        const bMinX = b.posX - CHAR_HALF_X;
        const bMaxX = b.posX + CHAR_HALF_X;
        const bMinY = b.posY;
        const bMaxY = b.posY + CHAR_HEIGHT;
        const bMinZ = b.posZ - CHAR_HALF_Z;
        const bMaxZ = b.posZ + CHAR_HALF_Z;

        const overlapX = Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX);
        const overlapY = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);
        const overlapZ = Math.min(aMaxZ, bMaxZ) - Math.max(aMinZ, bMinZ);

        if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue;

        let axis, amount;
        if (overlapX <= overlapY && overlapX <= overlapZ) {
          axis = 'X';
          amount = overlapX + COLLISION_MARGIN;
        } else if (overlapZ <= overlapY) {
          axis = 'Z';
          amount = overlapZ + COLLISION_MARGIN;
        } else {
          axis = 'Y';
          amount = overlapY + COLLISION_MARGIN;
        }

        if (axis === 'Y') {
          const topPlayer = a.posY >= b.posY ? a : b;
          topPlayer.posY += amount;
        } else {
          const halfPush = amount / 2;
          const aSign = a['pos' + axis] < b['pos' + axis] ? -1 : 1;

          a['pos' + axis] += aSign * halfPush;
          b['pos' + axis] += -aSign * halfPush;
        }

        resolvedThisIter = true;
        anyResolved = true;
      }
    }

    if (!resolvedThisIter) break;
  }

  return anyResolved;
}

/**
 * Check if a player position is standing on top of another player's head.
 */
export function checkPlayerOnAnyPlayer(pos, players, excludeId) {
  if (!players || players.length === 0) return false;

  const footY = pos.y;
  const pMinX = pos.x - CHAR_HALF_X;
  const pMaxX = pos.x + CHAR_HALF_X;
  const pMinZ = pos.z - CHAR_HALF_Z;
  const pMaxZ = pos.z + CHAR_HALF_Z;

  for (const other of players) {
    if (excludeId && other.id === excludeId) continue;

    const otherHeadY = other.posY + CHAR_HEIGHT;

    if (Math.abs(footY - otherHeadY) > 0.06) continue;
    if (footY < otherHeadY - 0.02) continue;

    const oMinX = other.posX - CHAR_HALF_X;
    const oMaxX = other.posX + CHAR_HALF_X;
    const oMinZ = other.posZ - CHAR_HALF_Z;
    const oMaxZ = other.posZ + CHAR_HALF_Z;

    if (pMaxX > oMinX && pMinX < oMaxX &&
        pMaxZ > oMinZ && pMinZ < oMaxZ) {
      return true;
    }
  }
  return false;
}

/**
 * Push the local player out of any overlapping remote players.
 */
export function pushLocalPlayerOutOfRemotePlayers(localPos, remotePositions, localPlayerId) {
  if (!remotePositions || remotePositions.length === 0) {
    return { wasPushed: false, isOnPlayerHead: false };
  }

  let wasPushed = false;
  let isOnPlayerHead = false;

  for (const remote of remotePositions) {
    const aMinX = localPos.x - CHAR_HALF_X;
    const aMaxX = localPos.x + CHAR_HALF_X;
    const aMinY = localPos.y;
    const aMaxY = localPos.y + CHAR_HEIGHT;
    const aMinZ = localPos.z - CHAR_HALF_Z;
    const aMaxZ = localPos.z + CHAR_HALF_Z;

    const bMinX = remote.posX - CHAR_HALF_X;
    const bMaxX = remote.posX + CHAR_HALF_X;
    const bMinY = remote.posY;
    const bMaxY = remote.posY + CHAR_HEIGHT;
    const bMinZ = remote.posZ - CHAR_HALF_Z;
    const bMaxZ = remote.posZ + CHAR_HALF_Z;

    const overlapX = Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX);
    const overlapY = Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY);
    const overlapZ = Math.min(aMaxZ, bMaxZ) - Math.max(aMinZ, bMinZ);

    // Check head-standing first: local player standing on REMOTE player's head.
    // When standing on a head, we ONLY snap Y and skip horizontal push,
    // so the player can walk freely on the head surface without stuttering.
    const remoteHeadY = remote.posY + CHAR_HEIGHT;
    const feetOnHead = localPos.y >= remoteHeadY - 0.06 &&
                       localPos.y <= remoteHeadY + 0.1;
    const onHead = localPos.y > remote.posY && feetOnHead;

    if (onHead) {
      localPos.y = remoteHeadY;
      isOnPlayerHead = true;
      wasPushed = true;
      continue; // Skip horizontal push to avoid fighting walk movement
    }

    // Reverse check: REMOTE player standing on LOCAL player's head.
    // Use the server-authoritative attachedTo field when available (more
    // reliable than geometric checks during rapid Y changes like jumps).
    // Skip horizontal push so the local player can move freely beneath
    // the attached remote player — the remote's Y is handled separately
    // via the Y-override in RemotePlayerManager.
    if (localPlayerId !== undefined && remote.attachedTo === localPlayerId) {
      continue;
    }

    // Resolve horizontal overlap (only when not standing on head, in either direction)
    if (overlapX <= 0 || overlapZ <= 0) continue;
    if (overlapY <= 0) continue;

    if (overlapX <= overlapZ) {
      localPos.x += (localPos.x < remote.posX ? -1 : 1) * (overlapX + COLLISION_MARGIN);
    } else {
      localPos.z += (localPos.z < remote.posZ ? -1 : 1) * (overlapZ + COLLISION_MARGIN);
    }
    wasPushed = true;
  }

  return { wasPushed, isOnPlayerHead };
}

/**
 * Check whether a player has ground (block or y≤0) directly below their feet.
 */
export function checkPlayerGrounded(pos, worldMap) {
  if (pos.y <= 0) return true;

  const footY = pos.y;
  const blockYBelow = Math.floor(footY - 0.01);

  const hx = CHAR_HALF_X;
  const hz = CHAR_HALF_Z;
  const footMinX = pos.x - hx;
  const footMaxX = pos.x + hx;
  const footMinZ = pos.z - hz;
  const footMaxZ = pos.z + hz;

  const bx0 = Math.floor(footMinX);
  const bx1 = Math.floor(footMaxX - CELL_EPSILON);
  const bz0 = Math.floor(footMinZ);
  const bz1 = Math.floor(footMaxZ - CELL_EPSILON);

  for (let bx = bx0; bx <= bx1; bx++) {
    for (let bz = bz0; bz <= bz1; bz++) {
      if (worldMap.isBlockOccupied(bx, blockYBelow, bz)) {
        return true;
      }
    }
  }
  return false;
}
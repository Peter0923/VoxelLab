import * as THREE from 'three';

export class CharacterController {
  static CHAR_HALF_X = 0.6;
  static CHAR_HALF_Z = 0.4;
  static CHAR_HEIGHT = 2.0;
  static MOVE_SPEED = 2.5;
  static JUMP_SPEED = 10;
  static GRAVITY = -18;

  /**
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @param {import('./WorldMap.js').WorldMap} worldMap
   * @param {import('./InputManager.js').InputManager} inputManager
   * @param {import('./ControllerGUI.js').ControllerGUI} controllerGUI
   */
  constructor(legoCharacter, worldMap, inputManager, controllerGUI) {
    this._lego = legoCharacter;
    this._worldMap = worldMap;
    this._input = inputManager;
    this._ctrlGUI = controllerGUI;

    this._velocityY = 0;
    this._isGrounded = true;
    this._isJumping = false;
  }

  get isGrounded() {
    return this._isGrounded;
  }

  update(delta) {
    const input = this._input;
    const lego = this._lego;
    const { CHAR_HALF_X, CHAR_HALF_Z, MOVE_SPEED, JUMP_SPEED, GRAVITY } = CharacterController;
    const inOrbit = this._ctrlGUI && this._ctrlGUI.currentName === 'Orbit';

    // --- Determine desired animation ---
    let desiredAnim = 'idle';

    if (!inOrbit && input.isDown('space') && this._isGrounded && !this._isJumping) {
      this._velocityY = JUMP_SPEED;
      this._isGrounded = false;
      this._isJumping = true;
      desiredAnim = 'jump';
    }

    if (!inOrbit) {
      if (!this._isGrounded) {
        if (this._isJumping) desiredAnim = 'jump';
      } else {
        if (input.isDown('w')) desiredAnim = 'walkForward';
        else if (input.isDown('s')) desiredAnim = 'walkBackward';
        else if (input.isDown('a')) desiredAnim = 'walkLeft';
        else if (input.isDown('d')) desiredAnim = 'walkRight';
      }
    }

    if (lego.currentAction) {
      const currentName = lego.currentAction._clip.name;
      if (currentName !== desiredAnim) lego.play(desiredAnim);
    } else {
      lego.play(desiredAnim);
    }

    // --- Movement with per-axis collision detection and sliding ---
    const pos = lego.group.position;
    const vel = new THREE.Vector3();

    if (!inOrbit) {
      if (input.isDown('w')) vel.z += 1;
      if (input.isDown('s')) vel.z -= 1;
      if (input.isDown('a')) vel.x += 1;
      if (input.isDown('d')) vel.x -= 1;
    }

    if (vel.length() > 0) {
      vel.normalize();
      vel.applyAxisAngle(new THREE.Vector3(0, 1, 0), lego.group.rotation.y);
      vel.multiplyScalar(MOVE_SPEED);
    }

    if (!this._isGrounded) {
      this._velocityY += GRAVITY * delta;
    }

    // Move and resolve each axis independently.
    // This prevents ground-block Z overlap from interfering with X sliding.
    const axes = [
      { axis: 'x', amount: vel.x * delta },
      { axis: 'z', amount: vel.z * delta },
    ];

    for (const { axis, amount } of axes) {
      if (amount === 0) continue;
      pos[axis] += amount;
      const pushed = this._resolveAxis(pos, axis, amount);
      if (pushed) {
        vel[axis] = 0;
      }
    }

    // Y axis (gravity / jumping)
    const yAmount = this._velocityY * delta;
    pos.y += yAmount;
    if (this._resolveAxis(pos, 'y', yAmount)) {
      this._velocityY = 0;
    }

    // --- Ground detection ---
    this._isGrounded = false;

    if (pos.y <= 0) {
      pos.y = 0;
      this._velocityY = 0;
      this._isGrounded = true;
      this._isJumping = false;
    } else if (this._velocityY <= 0) {
      const footY = pos.y;
      const blockYBelow = Math.floor(footY - 0.01);
      const hx = CHAR_HALF_X;
      const hz = CHAR_HALF_Z;
      const footMinX = pos.x - hx;
      const footMaxX = pos.x + hx;
      const footMinZ = pos.z - hz;
      const footMaxZ = pos.z + hz;
      const CELL_EPS = 1e-7;
      const bx0 = Math.floor(footMinX);
      const bx1 = Math.floor(footMaxX - CELL_EPS);
      const bz0 = Math.floor(footMinZ);
      const bz1 = Math.floor(footMaxZ - CELL_EPS);
      for (let bx = bx0; bx <= bx1; bx++) {
        for (let bz = bz0; bz <= bz1; bz++) {
          if (this._worldMap.isBlockOccupied(bx, blockYBelow, bz)) {
            pos.y = blockYBelow + 1;
            this._velocityY = 0;
            this._isGrounded = true;
            this._isJumping = false;
            break;
          }
        }
        if (this._isGrounded) break;
      }
    }

    // Final safety pass: resolve any remaining overlap on all axes
    this._resolveAnyOverlap(pos);

    lego.update(delta);
  }

  // --- Private collision helpers ---

  /**
   * Resolves collisions on a single axis after the character has moved along that axis.
   * Returns true if the character was pushed (velocity should be zeroed on this axis).
   */
  _resolveAxis(pos, axis, amount) {
    const { CHAR_HALF_X, CHAR_HALF_Z, CHAR_HEIGHT } = CharacterController;

    const aMinX = pos.x - CHAR_HALF_X;
    const aMaxX = pos.x + CHAR_HALF_X;
    const aMinY = pos.y;
    const aMaxY = pos.y + CHAR_HEIGHT;
    const aMinZ = pos.z - CHAR_HALF_Z;
    const aMaxZ = pos.z + CHAR_HALF_Z;

    const CELL_EPS = 1e-7;
    const bx0 = Math.floor(aMinX);
    const bx1 = Math.floor(aMaxX - CELL_EPS);
    const by0 = Math.floor(aMinY);
    const by1 = Math.floor(aMaxY - CELL_EPS);
    const bz0 = Math.floor(aMinZ);
    const bz1 = Math.floor(aMaxZ - CELL_EPS);

    let maxOverlap = 0;
    let pushSign = 0;

    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) {
        for (let bz = bz0; bz <= bz1; bz++) {
          if (!this._worldMap.isBlockOccupied(bx, by, bz)) continue;

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
      const MARGIN = 0.001;
      pos[axis] += pushSign * (maxOverlap + MARGIN);
      return true;
    }

    return false;
  }

  /**
   * Final safety pass: resolves any remaining AABB-block overlaps on any axis.
   * Runs after all per-axis passes to catch overlaps that multi-axis movement
   * may have left behind. Iterates up to maxIter times to avoid infinite loops.
   * @param {THREE.Vector3} pos
   * @param {number} [maxIter=3]
   */
  _resolveAnyOverlap(pos, maxIter = 3) {
    const { CHAR_HALF_X, CHAR_HALF_Z, CHAR_HEIGHT } = CharacterController;

    for (let iter = 0; iter < maxIter; iter++) {
      const aMinX = pos.x - CHAR_HALF_X;
      const aMaxX = pos.x + CHAR_HALF_X;
      const aMinY = pos.y;
      const aMaxY = pos.y + CHAR_HEIGHT;
      const aMinZ = pos.z - CHAR_HALF_Z;
      const aMaxZ = pos.z + CHAR_HALF_Z;

      const CELL_EPS = 1e-7;
      const bx0 = Math.floor(aMinX);
      const bx1 = Math.floor(aMaxX - CELL_EPS);
      const by0 = Math.floor(aMinY);
      const by1 = Math.floor(aMaxY - CELL_EPS);
      const bz0 = Math.floor(aMinZ);
      const bz1 = Math.floor(aMaxZ - CELL_EPS);

      let bestOverlap = 0;
      let bestAxis = null;
      let bestSign = 0;

      for (let bx = bx0; bx <= bx1; bx++) {
        for (let by = by0; by <= by1; by++) {
          for (let bz = bz0; bz <= bz1; bz++) {
            if (!this._worldMap.isBlockOccupied(bx, by, bz)) continue;

            const overlapX = Math.min(aMaxX, bx + 1) - Math.max(aMinX, bx);
            const overlapY = Math.min(aMaxY, by + 1) - Math.max(aMinY, by);
            const overlapZ = Math.min(aMaxZ, bz + 1) - Math.max(aMinZ, bz);

            if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) continue;

            // Check each axis and pick the deepest overlap
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

      const MARGIN = 0.001;
      pos[bestAxis] += bestSign * (bestOverlap + MARGIN);
    }

    return true;
  }
}

import { simulateStep } from '../../shared/physics.js';

/**
 * Handles player movement, gravity, and AABB collision detection.
 *
 * In single-player mode: physics runs locally via the shared physics module.
 * In multiplayer mode: physics still runs locally for CSP, but the server
 * also runs the same `simulateStep()` for authoritative validation.
 *
 * CSP methods (getState, reconcile, applyAuthoritativeState) are used by the
 * network layer to implement client-side prediction with server reconciliation.
 */
export class CharacterController {
  /**
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @param {import('../shared/WorldMap.js').WorldMap} worldMap
   * @param {import('./InputManager.js').InputManager} inputManager
   * @param {import('./ControllerGUI.js').ControllerGUI} controllerGUI
   */
  constructor(legoCharacter, worldMap, inputManager, controllerGUI) {
    this._lego = legoCharacter;
    this._worldMap = worldMap;
    this._input = inputManager;
    this._ctrlGUI = controllerGUI;

    // Physics state
    this._velocityY = 0;
    this._isGrounded = true;
    this._isJumping = false;

    // --- CSP reconciliation state ---
    /**
     * Persistent error offset to be consumed gradually each frame.
     * Applied BEFORE physics so prediction builds on the corrected position.
     * null = no pending correction.
     * @type {{x:number, y:number, z:number, rotY:number, velY:number}|null}
     */
    this._correctionOffset = null;
  }

  get isGrounded() {
    return this._isGrounded;
  }

  /**
   * Run one physics+animation frame.
   * Uses the shared `simulateStep()` so client prediction and server authority
   * produce identical results from identical inputs.
   *
   * @param {number} delta - Frame delta time in seconds
   * @param {Array<{posX:number, posY:number, posZ:number}>} [players] - Other player positions for ground detection
   */
  update(delta, players) {
    const input = this._input;
    const lego = this._lego;
    const inOrbit = this._ctrlGUI && this._ctrlGUI.currentName === 'Orbit';

    // --- Build input state for shared physics ---
    const inputKeys = input.getInputState
      ? input.getInputState()
      : {
          w: input.isDown('w'),
          a: input.isDown('a'),
          s: input.isDown('s'),
          d: input.isDown('d'),
          space: input.isDown('space'),
        };

    const pos = lego.group.position;

    // --- Consume reconciliation correction BEFORE physics ---
    // This prevents tug-of-war: physics builds on the corrected position,
    // rather than physics pushing forward while lerp pulls backward.
    if (this._correctionOffset) {
      // Frame-rate-independent exponential decay
      const correctionRate = 20; // per second — higher = faster convergence
      const consume = 1 - Math.exp(-correctionRate * delta);

      pos.x += this._correctionOffset.x * consume;
      pos.y += this._correctionOffset.y * consume;
      pos.z += this._correctionOffset.z * consume;
      lego.group.rotation.y += this._correctionOffset.rotY * consume;
      this._velocityY += this._correctionOffset.velY * consume;

      // Reduce remaining offset
      this._correctionOffset.x *= (1 - consume);
      this._correctionOffset.y *= (1 - consume);
      this._correctionOffset.z *= (1 - consume);
      this._correctionOffset.rotY *= (1 - consume);
      this._correctionOffset.velY *= (1 - consume);

      // Clear when effectively zero
      if (Math.abs(this._correctionOffset.x) < 0.0001 &&
          Math.abs(this._correctionOffset.y) < 0.0001 &&
          Math.abs(this._correctionOffset.z) < 0.0001 &&
          Math.abs(this._correctionOffset.rotY) < 0.0001 &&
          Math.abs(this._correctionOffset.velY) < 0.0001) {
        this._correctionOffset = null;
      }
    }

    // Run the shared physics simulation on the (possibly corrected) position
    const newState = simulateStep(
      {
        posX: pos.x,
        posY: pos.y,
        posZ: pos.z,
        rotationY: lego.group.rotation.y,
        velocityY: this._velocityY,
        isGrounded: this._isGrounded,
        isJumping: this._isJumping,
      },
      inputKeys,
      this._worldMap,
      delta,
      { inOrbit, players: players || [] }
    );

    // --- Apply physics result to the scene ---
    pos.x = newState.posX;
    pos.y = newState.posY;
    pos.z = newState.posZ;
    this._velocityY = newState.velocityY;
    this._isGrounded = newState.isGrounded;
    this._isJumping = newState.isJumping;

    // --- Animation ---
    if (lego.currentAction) {
      const currentName = lego.currentAction._clip.name;
      if (currentName !== newState.desiredAnim) lego.play(newState.desiredAnim);
    } else {
      lego.play(newState.desiredAnim);
    }

    lego.update(delta);
  }

  // --- CSP / Multiplayer API ---

  /**
   * Get the current physics state for network serialization.
   * @returns {{posX:number, posY:number, posZ:number, rotationY:number, velocityY:number, isGrounded:boolean, isJumping:boolean}}
   */
  getState() {
    const pos = this._lego.group.position;
    return {
      posX: pos.x,
      posY: pos.y,
      posZ: pos.z,
      rotationY: this._lego.group.rotation.y,
      velocityY: this._velocityY,
      isGrounded: this._isGrounded,
      isJumping: this._isJumping,
    };
  }

  /**
   * Called when the server sends an authoritative reconciliation.
   * Computes the error offset from the re-predicted position and stores it
   * for gradual consumption BEFORE physics in subsequent frames.
   *
   * @param {{posX:number, posY:number, posZ:number, rotationY:number, velocityY:number, isGrounded:boolean}} correctedState
   */
  reconcile(correctedState) {
    const pos = this._lego.group.position;

    // Compute error offset from corrected (re-predicted) position
    this._correctionOffset = {
      x: correctedState.posX - pos.x,
      y: correctedState.posY - pos.y,
      z: correctedState.posZ - pos.z,
      rotY: correctedState.rotationY - this._lego.group.rotation.y,
      velY: correctedState.velocityY - this._velocityY,
    };

    // Apply non-visual state immediately (affects next physics step)
    this._velocityY = correctedState.velocityY;
    this._isGrounded = correctedState.isGrounded;
  }

  /**
   * Set the grounded state from outside the physics loop (e.g. when the
   * player lands on a remote player's head via pushLocalPlayerOutOfRemotePlayers).
   * Zeroes vertical velocity so gravity doesn't pull them through on the next frame.
   *
   * @param {boolean} grounded
   */
  setGrounded(grounded) {
    this._isGrounded = grounded;
    if (grounded) {
      this._velocityY = 0;
    }
  }

  /**
   * Clear the Y component of the reconciliation correction offset.
   * Called when the player is standing on a remote player's head so
   * the server reconciliation doesn't fight the head-standing position.
   */
  clearYCorrection() {
    if (this._correctionOffset) {
      this._correctionOffset.y = 0;
      this._correctionOffset.velY = 0;
    }
  }

  /**
   * Directly apply an authoritative state with no lerp.
   * Used after reconciliation + re-prediction when we want to snap
   * to the replayed position immediately.
   *
   * @param {{posX:number, posY:number, posZ:number, rotationY:number, velocityY:number, isGrounded:boolean}} state
   */
  applyState(state) {
    const pos = this._lego.group.position;
    pos.x = state.posX;
    pos.y = state.posY;
    pos.z = state.posZ;
    this._lego.group.rotation.y = state.rotationY;
    this._velocityY = state.velocityY;
    this._isGrounded = state.isGrounded;
  }
}
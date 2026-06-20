import { RemotePlayerModel } from './RemotePlayerModel.js';
import { CHAR_HEIGHT, getPresetById } from '../../shared/constants.js';

/**
 * Manages the lifecycle and rendering of remote player models.
 *
 * Creates/destroys RemotePlayerModel instances as players join/leave,
 * and runs entity interpolation + animation each frame.
 */
export class RemotePlayerManager {
  /**
   * @param {import('three').Scene} scene - The Three.js scene to add models to
   * @param {import('./StateManager.js').StateManager} stateManager - For interpolation data
   */
  constructor(scene, stateManager) {
    this._scene = scene;
    this._stateManager = stateManager;

    /** @type {Map<string, RemotePlayerModel>} */
    this._models = new Map();

    /**
     * Cached from the most recent update() call — the local player's
     * current Y position and ID. Used for Y-override when a remote
     * player is vertically attached to the local player.
     */
    this._localPlayerPosY = 0;
    this._localPlayerId = null;
  }

  /**
   * Add a remote player model to the scene.
   * @param {string} playerId
   * @param {string} nickname
   * @param {string} [characterId]
   */
  addPlayer(playerId, nickname, characterId) {
    if (this._models.has(playerId)) return;

    const cid = characterId || this._stateManager.getPlayerCharacterId(playerId) || 'classic';
    const preset = getPresetById(cid);
    const model = new RemotePlayerModel(nickname, preset);
    this._scene.add(model.group);
    this._models.set(playerId, model);

    console.log(`[RemotePlayerManager] Added player "${nickname}" (${playerId}) char=${cid}`);
  }

  /**
   * Remove a remote player model from the scene.
   * @param {string} playerId
   */
  removePlayer(playerId) {
    const model = this._models.get(playerId);
    if (!model) return;

    this._scene.remove(model.group);
    model.dispose();
    this._models.delete(playerId);

    console.log(`[RemotePlayerManager] Removed player ${playerId}`);
  }

  /**
   * Update all remote player models: run interpolation, apply positions,
   * update animations. Call every frame.
   *
   * @param {number} delta - Frame delta time in seconds
   * @param {number} [localPlayerPosY] - Local player's current Y for attachment override
   * @param {string|null} [localPlayerId] - Local player's ID for attachment check
   */
  update(delta, localPlayerPosY, localPlayerId) {
    // Store for use by getAllPositions()
    this._localPlayerPosY = localPlayerPosY !== undefined ? localPlayerPosY : 0;
    this._localPlayerId = localPlayerId || null;

    // Frame-rate-independent smoothing factor
    const smoothRate = 15; // per second
    const t = 1 - Math.exp(-smoothRate * delta);

    for (const [playerId, model] of this._models) {
      const state = this._stateManager.getInterpolatedState(playerId);
      if (!state) continue;

      // Determine target Y:
      // - If this remote player is vertically attached to the local player,
      //   bypass the 150ms interpolation delay on Y by using the local
      //   player's current head position as the target.
      // - X and Z always use normal interpolation so horizontal movement
      //   is still smooth.
      const attached = localPlayerId && state.attachedTo === localPlayerId;
      const targetY = attached
        ? localPlayerPosY + CHAR_HEIGHT
        : state.posY;

      // Smoothly lerp toward target position (hides micro-discontinuities
      // from network jitter).  When vertically attached, the Y target comes
      // from the local player's position (no jitter), so we set it directly
      // to avoid lerp-induced lag during rapid vertical movement (jumping/falling).
      const current = model.group.position;
      model.group.position.set(
        current.x + (state.posX - current.x) * t,
        attached ? targetY : current.y + (targetY - current.y) * t,
        current.z + (state.posZ - current.z) * t,
      );

      // Cache attachedTo on the model for getAllPositions()
      model._attachedTo = state.attachedTo || null;

      // Smooth rotation via shortest path
      let deltaRot = state.rotationY - model.group.rotation.y;
      while (deltaRot > Math.PI) deltaRot -= Math.PI * 2;
      while (deltaRot < -Math.PI) deltaRot += Math.PI * 2;
      model.group.rotation.y += deltaRot * t;

      // Determine walk speed from state
      if (state.isGrounded && state.anim && state.anim.startsWith('walk')) {
        model.setWalkSpeed(1);
      } else if (!state.isGrounded) {
        // In the air — freeze animation (or could do jump pose)
        model.setWalkSpeed(0);
      } else {
        model.setWalkSpeed(0);
      }

      // Update model animations
      model.update(delta);
    }
  }

  /**
   * Remove all remote player models.
   */
  clearAll() {
    for (const playerId of this._models.keys()) {
      this.removePlayer(playerId);
    }
  }

  /**
   * Get the number of remote players.
   * @returns {number}
   */
  get count() {
    return this._models.size;
  }

  /**
   * Get all remote player positions for client-side collision detection.
   * Each entry includes the player's ID and attachedTo state so the caller
   * can skip horizontal push when a remote player is standing on the local
   * player's head.
   *
   * @returns {Array<{id:string, posX:number, posY:number, posZ:number, attachedTo:string|null}>}
   */
  getAllPositions() {
    const positions = [];
    for (const [playerId, model] of this._models) {
      const pos = model.group.position;
      positions.push({
        id: playerId,
        posX: pos.x,
        posY: pos.y,
        posZ: pos.z,
        attachedTo: model._attachedTo || null,
      });
    }
    return positions;
  }
}

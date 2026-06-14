import { RemotePlayerModel } from './RemotePlayerModel.js';

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
  }

  /**
   * Add a remote player model to the scene.
   * @param {string} playerId
   * @param {string} nickname
   * @param {{r:number,g:number,b:number}} [color]
   */
  addPlayer(playerId, nickname, color) {
    if (this._models.has(playerId)) return;

    const modelColor = color || this._stateManager.getPlayerColor(playerId) || { r: 0.8, g: 0.3, b: 0.3 };
    const model = new RemotePlayerModel(nickname, modelColor);
    this._scene.add(model.group);
    this._models.set(playerId, model);

    console.log(`[RemotePlayerManager] Added player "${nickname}" (${playerId})`);
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
   */
  update(delta) {
    // Frame-rate-independent smoothing factor
    const smoothRate = 15; // per second
    const t = 1 - Math.exp(-smoothRate * delta);

    for (const [playerId, model] of this._models) {
      const state = this._stateManager.getInterpolatedState(playerId);
      if (!state) continue;

      // Smoothly lerp toward interpolated position (hides micro-discontinuities)
      const current = model.group.position;
      model.group.position.set(
        current.x + (state.posX - current.x) * t,
        current.y + (state.posY - current.y) * t,
        current.z + (state.posZ - current.z) * t,
      );

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
   * @returns {Array<{posX:number, posY:number, posZ:number}>}
   */
  getAllPositions() {
    const positions = [];
    for (const model of this._models.values()) {
      const pos = model.group.position;
      positions.push({ posX: pos.x, posY: pos.y, posZ: pos.z });
    }
    return positions;
  }
}

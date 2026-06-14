import { simulateStep } from '../../shared/physics.js';
import { INTERP_DELAY_MS, MAX_DELTA } from '../../shared/constants.js';

/**
 * Client-side multiplayer state manager.
 *
 * Responsibilities:
 * - Tracks local player identity (worldId, localPlayerId, nickname)
 * - Maintains the pending input queue for CSP reconciliation
 * - Maintains interpolation state buffers for each remote player
 * - Processes server messages (reconcile, playerStates) to update buffers
 */
export class StateManager {
  constructor() {
    /** @type {string|null} */
    this.worldId = null;

    /** @type {string|null} */
    this.localPlayerId = null;

    /** @type {string} */
    this.nickname = '';

    // --- CSP: Pending input queue ---
    /** @type {Array<{seq:number, inputKeys:object, rotationY:number, delta:number}>} */
    this._pendingInputs = [];

    /** Monotonically increasing input sequence number */
    this._seq = 0;

    // --- Server clock synchronization ---
    /** Estimated offset: serverTime - performance.now() (set on first playerStates) */
    this._clockOffset = null;

    // --- Remote player state ---
    /**
     * Map of playerId → basic info (nickname, color).
     * @type {Map<string, {nickname:string, color:{r:number,g:number,b:number}}>}
     */
    this._playerInfo = new Map();

    /**
     * Interpolation buffers: playerId → Array of state snapshots.
     * Each snapshot: {posX, posY, posZ, rotationY, timestamp}
     * Ring buffer of last 3 entries.
     * @type {Map<string, Array<object>>}
     */
    this._stateBuffers = new Map();
  }

  // --- Identity ---

  /**
   * Set local player identity after joining a world.
   * @param {string} playerId
   * @param {string} worldId
   * @param {string} nickname
   */
  setIdentity(playerId, worldId, nickname) {
    this.localPlayerId = playerId;
    this.worldId = worldId;
    this.nickname = nickname;
  }

  // --- CSP: Input tracking ---

  /**
   * Get the next sequence number and increment.
   * @returns {number}
   */
  nextSeq() {
    return this._seq++;
  }

  /**
   * Record a pending input that was sent to the server.
   * @param {number} seq
   * @param {object} inputKeys
   * @param {number} rotationY
   * @param {number} delta
   */
  pushPendingInput(seq, inputKeys, rotationY, delta) {
    this._pendingInputs.push({ seq, inputKeys, rotationY, delta });

    // Keep the queue bounded (max 60 = ~3 seconds at 20Hz)
    if (this._pendingInputs.length > 60) {
      this._pendingInputs.shift();
    }
  }

  /**
   * Process a reconciliation message from the server.
   * Discards acknowledged inputs and returns the inputs that need to be
   * re-applied for re-prediction.
   *
   * @param {{seq:number, posX:number, posY:number, posZ:number, velocityY:number, isGrounded:boolean, rotationY:number}} serverState
   * @returns {{serverState:object, remainingInputs:Array<object>}}
   */
  processReconcile(serverState) {
    // Discard inputs the server has already processed
    this._pendingInputs = this._pendingInputs.filter(p => p.seq > serverState.seq);

    return {
      serverState,
      remainingInputs: [...this._pendingInputs],
    };
  }

  /**
   * Re-predict position by replaying remaining inputs from the server state.
   * Used after reconciliation to get the new predicted position.
   *
   * @param {object} serverState - The authoritative state from the server
   * @param {Array<object>} remainingInputs - Inputs not yet processed by server
   * @param {import('../shared/WorldMap.js').WorldMap} worldMap
   * @returns {object} The re-predicted state
   */
  repredict(serverState, remainingInputs, worldMap) {
    let state = {
      posX: serverState.posX,
      posY: serverState.posY,
      posZ: serverState.posZ,
      rotationY: serverState.rotationY,
      velocityY: serverState.velocityY,
      isGrounded: serverState.isGrounded,
      isJumping: false,
    };

    for (const pending of remainingInputs) {
      const cappedDelta = Math.min(pending.delta, MAX_DELTA); // Match server behavior
      state = simulateStep(state, pending.inputKeys, worldMap, cappedDelta);
    }

    return state;
  }

  // --- Remote player state ---

  /**
   * Store info for a remote player.
   * @param {string} playerId
   * @param {string} nickname
   * @param {{r:number,g:number,b:number}} color
   */
  addPlayer(playerId, nickname, color) {
    this._playerInfo.set(playerId, { nickname, color: color || { r: 0.8, g: 0.3, b: 0.3 } });
    this._stateBuffers.set(playerId, []);
  }

  /**
   * Remove a player's data.
   * @param {string} playerId
   */
  removePlayer(playerId) {
    this._playerInfo.delete(playerId);
    this._stateBuffers.delete(playerId);
  }

  /**
   * Get nickname for a player.
   * @param {string} playerId
   * @returns {string}
   */
  getPlayerNickname(playerId) {
    const info = this._playerInfo.get(playerId);
    return info ? info.nickname : 'Unknown';
  }

  /**
   * Get color for a player.
   * @param {string} playerId
   * @returns {{r:number,g:number,b:number}}
   */
  getPlayerColor(playerId) {
    const info = this._playerInfo.get(playerId);
    return info ? info.color : { r: 0.8, g: 0.3, b: 0.3 };
  }

  /**
   * Process a playerStates broadcast from the server.
   * Appends each remote player's state to their interpolation buffer.
   *
   * @param {Array<{id:string, posX:number, posY:number, posZ:number, rotationY:number, velocityY:number, isGrounded:boolean, anim:string}>} states
   * @param {number} [serverTime] - Server timestamp (Date.now()) from the broadcast
   */
  processPlayerStates(states, serverTime) {
    // Use server timestamp with fallback to local time
    const timestamp = serverTime || Date.now();

    // Estimate clock offset on first receive for accurate render-time mapping
    if (this._clockOffset === null && serverTime) {
      this._clockOffset = serverTime - performance.now();
    }

    for (const s of states) {
      // Skip local player
      if (s.id === this.localPlayerId) continue;

      let buffer = this._stateBuffers.get(s.id);
      if (!buffer) {
        // Player unknown — they might have joined before our worldState arrived.
        // Store the data anyway; RemotePlayerManager will pick it up when the model is created.
        buffer = [];
        this._stateBuffers.set(s.id, buffer);
      }

      buffer.push({
        posX: s.posX,
        posY: s.posY,
        posZ: s.posZ,
        rotationY: s.rotationY,
        velocityY: s.velocityY,
        isGrounded: s.isGrounded,
        anim: s.anim || 'idle',
        timestamp: timestamp,
      });

      // Ring buffer: keep last 5 (survives up to 2 dropped packets at 20Hz)
      if (buffer.length > 5) {
        buffer.shift();
      }
    }
  }

  /**
   * Get the interpolated state for a remote player at the current render time.
   * Renders INTERP_DELAY_MS behind the server to allow smooth interpolation.
   *
   * @param {string} playerId
   * @returns {{posX:number, posY:number, posZ:number, rotationY:number, anim:string} | null}
   */
  getInterpolatedState(playerId) {
    const buffer = this._stateBuffers.get(playerId);
    if (!buffer || buffer.length < 2) {
      // Not enough data yet — return latest if available
      if (buffer && buffer.length === 1) {
        const s = buffer[0];
        return { posX: s.posX, posY: s.posY, posZ: s.posZ, rotationY: s.rotationY, anim: s.anim };
      }
      return null;
    }

    // Use server-corrected time when available, falling back to local time
    const now = performance.now();
    const effectiveNow = this._clockOffset !== null ? now + this._clockOffset : Date.now();
    const renderTime = effectiveNow - INTERP_DELAY_MS;

    // Find the two states that bracket renderTime
    let from = buffer[0];
    let to = buffer[1];
    for (let i = 1; i < buffer.length; i++) {
      if (buffer[i].timestamp <= renderTime) {
        from = buffer[i];
        to = buffer[i + 1] || buffer[i];
      }
    }

    const range = to.timestamp - from.timestamp;
    const t = range > 0 ? Math.max(0, Math.min(1, (renderTime - from.timestamp) / range)) : 0;

    // Interpolate position linearly
    const posX = from.posX + (to.posX - from.posX) * t;
    const posY = from.posY + (to.posY - from.posY) * t;
    const posZ = from.posZ + (to.posZ - from.posZ) * t;

    // Interpolate rotation via shortest path
    let deltaRot = to.rotationY - from.rotationY;
    while (deltaRot > Math.PI) deltaRot -= Math.PI * 2;
    while (deltaRot < -Math.PI) deltaRot += Math.PI * 2;
    const rotationY = from.rotationY + deltaRot * t;

    return {
      posX,
      posY,
      posZ,
      rotationY,
      anim: to.anim || from.anim || 'idle',
      isGrounded: to.isGrounded,
      velocityY: to.velocityY,
    };
  }

  /**
   * Reset all state (for returning to menu).
   */
  reset() {
    this.worldId = null;
    this.localPlayerId = null;
    this.nickname = '';
    this._pendingInputs.length = 0;
    this._seq = 0;
    this._playerInfo.clear();
    this._stateBuffers.clear();
  }
}

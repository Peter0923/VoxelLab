/**
 * Per-connection player state for the authoritative server.
 *
 * Each connected WebSocket has exactly one Player instance. The server
 * uses this to track position, animation state, and the last-processed
 * input sequence number for CSP reconciliation.
 */

// Simple counter-based ID (not crypto-random, but unique per server session)
let _nextId = 1;

export class Player {
  /**
   * @param {import('ws').WebSocket} ws - The player's WebSocket connection
   * @param {string} nickname - Player's chosen display name
   * @param {string} [characterId='classic'] - Selected character preset ID
   */
  constructor(ws, nickname, characterId = 'classic') {
    /** Unique player ID (session-scoped) */
    this.id = `p-${_nextId++}`;

    /** Display name */
    this.nickname = nickname;

    /** WebSocket connection */
    this.ws = ws;

    // --- Authoritative position state ---
    this.posX = 0;
    this.posY = 0;
    this.posZ = 0;
    this.rotationY = 0;
    this.velocityY = 0;
    this.isGrounded = true;
    this.isJumping = false;

    /**
     * Player ID this player is standing on (if any), or null.
     * Set by the server re-grounding pass each tick. Broadcast to clients
     * so they can apply local Y prediction for head-standing remote players.
     */
    this.attachedTo = null;

    // --- CSP tracking ---
    /** Last input sequence number processed by the server */
    this.lastProcessedSeq = 0;

    // --- Visual ---
    /** Selected character preset ID */
    this.characterId = characterId;

    // --- Input queue (accumulates all inputs between ticks) ---
    this._pendingInputs = []; // Array of { inputKeys, rotationY, delta, seq }
  }

  /**
   * Queue a new input from this player.
   * Inputs accumulate between ticks so no data is discarded.
   *
   * @param {{w:boolean, a:boolean, s:boolean, d:boolean, space:boolean}} inputKeys
   * @param {number} rotationY - Character yaw in radians
   * @param {number} delta - Frame delta time (capped by server)
   * @param {number} seq - Client input sequence number
   */
  queueInput(inputKeys, rotationY, delta, seq) {
    this._pendingInputs.push({ inputKeys, rotationY, delta, seq });
  }

  /**
   * Drain and return all accumulated inputs since the last tick.
   * @returns {Array<{inputKeys:object, rotationY:number, delta:number, seq:number}>|null}
   */
  consumeInput() {
    if (this._pendingInputs.length === 0) return null;
    const inputs = this._pendingInputs;
    this._pendingInputs = [];
    return inputs;
  }

  /**
   * Get a plain-object snapshot of this player's public state
   * (for broadcasting to other players).
   */
  getPublicState(anim) {
    return {
      id: this.id,
      nickname: this.nickname,
      posX: this.posX,
      posY: this.posY,
      posZ: this.posZ,
      rotationY: this.rotationY,
      velocityY: this.velocityY,
      isGrounded: this.isGrounded,
      anim: anim || 'idle',
      characterId: this.characterId,
      attachedTo: this.attachedTo,
    };
  }

  /**
   * Get join-info snapshot (sent to new joiners so they can create remote models).
   */
  getJoinInfo() {
    return {
      id: this.id,
      nickname: this.nickname,
      posX: this.posX,
      posY: this.posY,
      posZ: this.posZ,
      rotationY: this.rotationY,
      characterId: this.characterId,
    };
  }
}

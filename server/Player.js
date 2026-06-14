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
   */
  constructor(ws, nickname) {
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

    // --- CSP tracking ---
    /** Last input sequence number processed by the server */
    this.lastProcessedSeq = 0;

    // --- Visual ---
    /** Color for remote player model (derived from ID) */
    this.color = this._deriveColor();

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
   * Derive a deterministic color from the player ID for visual variety.
   * @returns {{r:number, g:number, b:number}} RGB values 0-1
   */
  _deriveColor() {
    // Simple hash of the player ID
    let hash = 0;
    for (let i = 0; i < this.id.length; i++) {
      hash = ((hash << 5) - hash) + this.id.charCodeAt(i);
      hash |= 0; // Convert to 32-bit int
    }
    const absHash = Math.abs(hash);
    // Generate a hue from the hash, then convert to RGB
    const hue = (absHash % 360) / 360;
    return this._hslToRgb(hue, 0.7, 0.5);
  }

  /**
   * Convert HSL to RGB (all values 0-1).
   */
  _hslToRgb(h, s, l) {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: hue2rgb(p, q, h + 1 / 3),
      g: hue2rgb(p, q, h),
      b: hue2rgb(p, q, h - 1 / 3),
    };
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
      color: this.color,
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
      color: this.color,
    };
  }
}

import { GameWorld } from './GameWorld.js';
import { Player } from './Player.js';
// Message type constants are referenced as string literals below
// for clarity and to avoid import boilerplate.

/**
 * Manages the lifecycle of all active game worlds.
 *
 * Responsibilities:
 * - Creates worlds on first join
 * - Destroys empty worlds (via GameWorld's auto-destroy timer)
 * - Routes incoming messages to the correct GameWorld
 * - Handles the discover/join/leave protocol
 */
export class WorldManager {
  constructor() {
    /** @type {Map<string, GameWorld>} */
    this._worlds = new Map();

    /**
     * Map from WebSocket to {player, worldId} for quick disconnect cleanup.
     * @type {Map<import('ws').WebSocket, {player: Player, worldId: string}>}
     */
    this._connections = new Map();
  }

  /**
   * Handle a new WebSocket connection.
   * Sets up message handler and close handler.
   *
   * @param {import('ws').WebSocket} ws
   */
  onConnection(ws) {
    console.log(`[server] New connection`);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        console.warn('[server] Invalid JSON from client:', raw.toString().slice(0, 100));
        return;
      }
      this._handleMessage(ws, msg);
    });

    ws.on('close', () => {
      this._handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.warn('[server] WebSocket error:', err.message);
    });
  }

  /**
   * Route an incoming message based on its type.
   */
  _handleMessage(ws, msg) {
    switch (msg.type) {
      case 'discover':
        this._sendWorldList(ws);
        break;

      case 'join':
        this._handleJoin(ws, msg.worldId, msg.nickname);
        break;

      case 'leave':
        this._handleDisconnect(ws);
        break;

      default:
        // Route to the player's current world
        this._routeToWorld(ws, msg);
        break;
    }
  }

  /**
   * Send the list of active worlds to a client.
   */
  _sendWorldList(ws) {
    const worlds = [];
    for (const world of this._worlds.values()) {
      worlds.push(world.getInfo());
    }
    this._sendTo(ws, { type: 'worldList', worlds });
  }

  /**
   * Handle a join request: create or join a world.
   */
  _handleJoin(ws, worldId, nickname) {
    // Validate
    if (!worldId || !nickname || typeof worldId !== 'string' || typeof nickname !== 'string') {
      this._sendTo(ws, { type: 'error', message: 'Invalid worldId or nickname' });
      return;
    }

    const cleanName = nickname.trim().slice(0, 20); // Max 20 chars
    const cleanWorldId = worldId.trim().slice(0, 50); // Max 50 chars

    if (!cleanName || !cleanWorldId) {
      this._sendTo(ws, { type: 'error', message: 'Nickname and world ID cannot be empty' });
      return;
    }

    // Get or create world
    let world = this._worlds.get(cleanWorldId);
    if (!world) {
      console.log(`[server] Creating new world: "${cleanWorldId}"`);
      world = new GameWorld(cleanWorldId, cleanWorldId, (id) => {
        this._worlds.delete(id);
      });
      this._worlds.set(cleanWorldId, world);
    }

    // Check capacity
    if (world.players.size >= 50) {
      this._sendTo(ws, { type: 'error', message: 'World is full (max 50 players)' });
      return;
    }

    // Create player and add to world
    const player = new Player(ws, cleanName);
    this._connections.set(ws, { player, worldId: cleanWorldId });
    world.addPlayer(player);
  }

  /**
   * Handle a player disconnect or explicit leave.
   */
  _handleDisconnect(ws) {
    const conn = this._connections.get(ws);
    if (!conn) return;

    const { player, worldId } = conn;
    this._connections.delete(ws);

    const world = this._worlds.get(worldId);
    if (world) {
      world.removePlayer(player);
    }
  }

  /**
   * Route a world-scoped message (block ops, player state, chat) to the
   * correct GameWorld handler.
   */
  _routeToWorld(ws, msg) {
    const conn = this._connections.get(ws);
    if (!conn) return;

    const { player, worldId } = conn;
    const world = this._worlds.get(worldId);
    if (!world) return;

    const type = msg.type;

    if (type === 'playerState') {
      // Queue input for processing during next tick
      player.queueInput(
        msg.inputKeys || { w: false, a: false, s: false, d: false, space: false },
        typeof msg.rotationY === 'number' ? msg.rotationY : 0,
        typeof msg.delta === 'number' ? msg.delta : 0.05,
        typeof msg.seq === 'number' ? msg.seq : 0,
      );

    } else if (type === 'placeBlock') {
      const result = world.placeBlock(
        msg.x, msg.y, msg.z,
        typeof msg.r === 'number' ? msg.r : Math.random(),
        typeof msg.g === 'number' ? msg.g : Math.random(),
        typeof msg.b === 'number' ? msg.b : Math.random(),
      );
      if (!result.ok) {
        this._sendTo(ws, { type: 'blockRejected', x: msg.x, y: msg.y, z: msg.z, reason: result.reason });
      }

    } else if (type === 'removeBlock') {
      const result = world.removeBlock(msg.x, msg.y, msg.z);
      if (!result.ok) {
        this._sendTo(ws, { type: 'blockRejected', x: msg.x, y: msg.y, z: msg.z, reason: result.reason });
      }

    } else if (type === 'chat') {
      if (msg.text && typeof msg.text === 'string' && msg.text.trim()) {
        world.broadcastChat(player, msg.text.trim().slice(0, 200)); // Max 200 chars
      }
    }
  }

  /**
   * Send a JSON message to a WebSocket.
   */
  _sendTo(ws, msg) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }
}

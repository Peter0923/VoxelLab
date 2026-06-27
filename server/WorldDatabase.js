/**
 * SQLite-based world persistence for VoxelLab.
 *
 * Stores world metadata and block data in a single SQLite database file
 * at data/voxellab.db.  Uses better-sqlite3 for synchronous, fast access.
 *
 * Schema is auto-migrated on first use (CREATE TABLE IF NOT EXISTS).
 * WAL journal mode is enabled for crash safety and concurrent read perf.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'voxellab.db');

export class WorldDatabase {
  constructor() {
    // Ensure the data directory exists
    fs.mkdirSync(DATA_DIR, { recursive: true });

    // Open (or create) the database
    this._db = new Database(DB_PATH);

    // WAL mode for better concurrent performance and crash safety
    this._db.pragma('journal_mode = WAL');

    // Run schema migration
    this._migrate();

    // Prepare all statements once for performance
    this._prepareStatements();
  }

  // --- Schema migration ---

  _migrate() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS worlds (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        last_accessed TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS blocks (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        world_id  TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        x         REAL NOT NULL,
        y         REAL NOT NULL,
        z         REAL NOT NULL,
        r         REAL NOT NULL,
        g         REAL NOT NULL,
        b         REAL NOT NULL,
        UNIQUE(world_id, x, y, z)
      );

      CREATE INDEX IF NOT EXISTS idx_blocks_world_id ON blocks(world_id);
    `);
  }

  // --- Prepared statements ---

  _prepareStatements() {
    this._stmtEnsureWorld = this._db.prepare(
      'INSERT OR IGNORE INTO worlds (id, name) VALUES (?, ?)'
    );
    this._stmtUpdateAccess = this._db.prepare(
      "UPDATE worlds SET last_accessed = datetime('now') WHERE id = ?"
    );
    this._stmtSaveBlock = this._db.prepare(
      'INSERT OR REPLACE INTO blocks (world_id, x, y, z, r, g, b) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    this._stmtRemoveBlock = this._db.prepare(
      'DELETE FROM blocks WHERE world_id = ? AND x = ? AND y = ? AND z = ?'
    );
    this._stmtLoadBlocks = this._db.prepare(
      'SELECT x, y, z, r, g, b FROM blocks WHERE world_id = ?'
    );
    this._stmtPersistedWorlds = this._db.prepare(`
      SELECT
        w.id,
        w.name,
        w.last_accessed,
        (SELECT COUNT(*) FROM blocks WHERE world_id = w.id) AS blockCount
      FROM worlds w
      ORDER BY w.last_accessed DESC
    `);
    this._stmtDeleteWorldBlocks = this._db.prepare(
      'DELETE FROM blocks WHERE world_id = ?'
    );
    this._stmtDeleteWorld = this._db.prepare(
      'DELETE FROM worlds WHERE id = ?'
    );
  }

  // --- World metadata ---

  /**
   * Ensure a world row exists in the database.
   * Idempotent — safe to call on every join.
   *
   * @param {string} id
   * @param {string} name
   */
  ensureWorld(id, name) {
    this._stmtEnsureWorld.run(id, name);
    this._stmtUpdateAccess.run(id);
  }

  // --- Block CRUD ---

  /**
   * Persist a placed block to the database.
   *
   * @param {string} worldId
   * @param {number} x - World center X
   * @param {number} y - World center Y
   * @param {number} z - World center Z
   * @param {number} r - Red 0-1
   * @param {number} g - Green 0-1
   * @param {number} b - Blue 0-1
   */
  saveBlock(worldId, x, y, z, r, g, b) {
    this._stmtSaveBlock.run(worldId, x, y, z, r, g, b);
  }

  /**
   * Remove a block from the database.
   *
   * @param {string} worldId
   * @param {number} x - World center X
   * @param {number} y - World center Y
   * @param {number} z - World center Z
   */
  removeBlock(worldId, x, y, z) {
    this._stmtRemoveBlock.run(worldId, x, y, z);
  }

  /**
   * Load all blocks for a world from the database.
   *
   * @param {string} worldId
   * @returns {Array<{x:number, y:number, z:number, r:number, g:number, b:number}>}
   */
  loadWorldBlocks(worldId) {
    return this._stmtLoadBlocks.all(worldId);
  }

  // --- World listing ---

  /**
   * Get all worlds that exist in the database (even if not currently loaded).
   *
   * @returns {Array<{id:string, name:string, last_accessed:string, blockCount:number}>}
   */
  getPersistedWorlds() {
    return this._stmtPersistedWorlds.all();
  }

  /**
   * Permanently delete a world and all its blocks from the database.
   * Runs inside a transaction so it's atomic.
   *
   * @param {string} worldId
   */
  deleteWorld(worldId) {
    const del = this._db.transaction(() => {
      this._stmtDeleteWorldBlocks.run(worldId);
      this._stmtDeleteWorld.run(worldId);
    });
    del();
  }

  // --- Cleanup ---

  /**
   * Close the database connection.
   */
  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}

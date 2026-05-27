/**
 * A sparse 3D spatial grid (world map) that divides space into 1x1x1 blocks.
 *
 * Each block is identified by integer coordinates (bx, by, bz) derived from
 * world positions via Math.floor(x), Math.floor(y), Math.floor(z).
 *
 * Provides O(1) lookup for whether a block is occupied by a cube.
 */
export class WorldMap {
  constructor() {
    /** @type {Map<string, boolean>} */
    this._map = new Map();
  }

  /**
   * Convert world coordinates to block key.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {string}
   */
  _key(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  /**
   * Mark the block at the given world position as occupied.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  place(x, y, z) {
    this._map.set(this._key(x, y, z), true);
  }

  /**
   * Mark the block at the given world position as free.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  remove(x, y, z) {
    this._map.delete(this._key(x, y, z));
  }

  /**
   * Check if a block at integer coordinates is occupied.
   * @param {number} bx
   * @param {number} by
   * @param {number} bz
   * @returns {boolean}
   */
  isBlockOccupied(bx, by, bz) {
    return this._map.has(`${bx},${by},${bz}`);
  }

  /**
   * Remove all entries.
   */
  clear() {
    this._map.clear();
  }
}

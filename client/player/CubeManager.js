export class CubeManager {
  /**
   * @param {import('./ChunkManager.js').ChunkManager} chunkManager
   * @param {import('../shared/WorldMap.js').WorldMap} worldMap
   */
  constructor(chunkManager, worldMap) {
    this._chunks = chunkManager;
    this._worldMap = worldMap;
    this._bulk = false;
  }

  _rebuild() {
    if (!this._bulk) {
      this._chunks.rebuildDirty(this._worldMap);
    }
  }

  addCube(x, y, z) {
    if (!this._chunks.addCube(x, y, z)) return false;
    this._worldMap.place(x, y, z);
    this._rebuild();
    return true;
  }

  /**
   * Add a cube with a specific color (for scene restoration).
   * @param {number} x - World X (block center)
   * @param {number} y - World Y (block center)
   * @param {number} z - World Z (block center)
   * @param {number} r - Red 0-1
   * @param {number} g - Green 0-1
   * @param {number} b - Blue 0-1
   * @returns {boolean} true if the cube was added
   */
  addCubeWithColor(x, y, z, r, g, b) {
    if (!this._chunks.addCubeWithColor(x, y, z, r, g, b)) return false;
    this._worldMap.place(x, y, z);
    this._rebuild();
    return true;
  }

  /**
   * Remove a cube at the given world position.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean} true if the cube was removed
   */
  removeCubeAt(x, y, z) {
    if (!this._chunks.removeCube(x, y, z)) return false;
    this._worldMap.remove(x, y, z);
    this._rebuild();
    return true;
  }

  // --- Server-sourced operations (bypass network send) ---

  /**
   * Add a cube that originated from another player via the server.
   * Same as addCubeWithColor but semantically marks it as server-sourced.
   * Called when processing `blockPlaced` messages from remote players.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {boolean}
   */
  addCubeFromServer(x, y, z, r, g, b) {
    return this.addCubeWithColor(x, y, z, r, g, b);
  }

  /**
   * Remove a cube that originated from another player via the server.
   * Same as removeCubeAt but semantically marks it as server-sourced.
   * Also used to revert optimistic placements that the server rejected.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean}
   */
  removeCubeFromServer(x, y, z) {
    return this.removeCubeAt(x, y, z);
  }

  // --- Bulk operations ---

  /**
   * Get position and color data for a single cube by global index.
   * @param {number} index
   * @returns {{ position: {x:number,y:number,z:number}, color: [number,number,number] } | null}
   */
  getCubeData(index) {
    return this._chunks.getCubeData(index);
  }

  /**
   * Defer rebuilds for bulk operations like scene load.
   */
  beginBulkLoad() {
    this._bulk = true;
  }

  /**
   * Rebuild all dirty chunks after bulk operations.
   */
  endBulkLoad() {
    this._bulk = false;
    this._chunks.rebuildDirty(this._worldMap);
  }

  /**
   * Clear all cubes from the scene.
   */
  clearAll() {
    this._chunks.clearAll();
    this._worldMap.clear();
  }

  get count() {
    return this._chunks.count;
  }
}

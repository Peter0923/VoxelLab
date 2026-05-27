export class CubeManager {
  /**
   * @param {import('./ChunkManager.js').ChunkManager} chunkManager
   * @param {import('./WorldMap.js').WorldMap} worldMap
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
   */
  addCubeWithColor(x, y, z, r, g, b) {
    if (!this._chunks.addCubeWithColor(x, y, z, r, g, b)) return false;
    this._worldMap.place(x, y, z);
    this._rebuild();
    return true;
  }

  /**
   * Remove a cube at the given world position.
   */
  removeCubeAt(x, y, z) {
    if (!this._chunks.removeCube(x, y, z)) return false;
    this._worldMap.remove(x, y, z);
    this._rebuild();
    return true;
  }

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

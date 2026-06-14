import * as THREE from 'three';

const CHUNK_SIZE = 16;

// Face definitions: normal + 4 corner offsets (CCW winding from outside).
// Derived from T1 × T2 = N with vertices P, P+T1, P+T1+T2, P+T2.
const FACES = [
  { nx:  1, ny:  0, nz:  0, corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] }, // +X: T1=(0,1,0), T2=(0,0,1)
  { nx: -1, ny:  0, nz:  0, corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] }, // -X: T1=(0,0,1), T2=(0,1,0)
  { nx:  0, ny:  1, nz:  0, corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] }, // +Y: T1=(0,0,1), T2=(1,0,0)
  { nx:  0, ny: -1, nz:  0, corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] }, // -Y: T1=(1,0,0), T2=(0,0,1)
  { nx:  0, ny:  0, nz:  1, corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] }, // +Z: T1=(1,0,0), T2=(0,1,0)
  { nx:  0, ny:  0, nz: -1, corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }, // -Z: T1=(0,1,0), T2=(1,0,0)
];

/**
 * A 16x16x16 chunk of the voxel world.
 * Owns a Mesh with custom BufferGeometry containing only exposed faces.
 */
class Chunk {
  /**
   * @param {number} cx - chunk X coordinate (in chunk units)
   * @param {number} cy
   * @param {number} cz
   * @param {THREE.MeshStandardMaterial} material - shared material
   */
  constructor(cx, cy, cz, material) {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;

    /** @type {Map<string, {r: number, g: number, b: number}>} local "lx,ly,lz" -> color */
    this._blocks = new Map();

    this.dirty = false;

    // Mesh with empty geometry initially; rebuilt on first add
    this._mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this._mesh.frustumCulled = true;
    this._mesh.computeBoundingSphere = () => {}; // no-op

    // Fixed bounding sphere covering the full chunk
    const centerX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const centerY = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
    const centerZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
    const radius = Math.sqrt(3) * CHUNK_SIZE / 2;
    this._mesh.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(centerX, centerY, centerZ), radius
    );
  }

  get mesh() { return this._mesh; }
  get count() { return this._blocks.size; }

  _localKey(lx, ly, lz) {
    return `${lx},${ly},${lz}`;
  }

  addBlock(lx, ly, lz, r, g, b) {
    this._blocks.set(this._localKey(lx, ly, lz), { r, g, b });
  }

  removeBlock(lx, ly, lz) {
    return this._blocks.delete(this._localKey(lx, ly, lz));
  }

  isOccupied(lx, ly, lz) {
    return this._blocks.has(this._localKey(lx, ly, lz));
  }

  /**
   * Rebuild the BufferGeometry from the current block map.
   * Only exposed faces (no neighbor) are included.
   * @param {import('./WorldMap.js').WorldMap} worldMap
   */
  rebuildGeometry(worldMap) {
    this.dirty = false;

    if (this._blocks.size === 0) {
      this._mesh.geometry.dispose();
      this._mesh.geometry = new THREE.BufferGeometry();
      return;
    }

    // First pass: count exposed faces
    let faceCount = 0;
    for (const [key] of this._blocks) {
      const [lx, ly, lz] = key.split(',').map(Number);
      const bx = this.cx * CHUNK_SIZE + lx;
      const by = this.cy * CHUNK_SIZE + ly;
      const bz = this.cz * CHUNK_SIZE + lz;

      for (const f of FACES) {
        const nbx = bx + f.nx;
        const nby = by + f.ny;
        const nbz = bz + f.nz;

        if (!this._isNeighborOccupied(nbx, nby, nbz, worldMap)) {
          faceCount++;
        }
      }
    }

    // Allocate buffers
    const posArray = new Float32Array(faceCount * 4 * 3);
    const normArray = new Float32Array(faceCount * 4 * 3);
    const colorArray = new Float32Array(faceCount * 4 * 3);
    const idxArray = new (faceCount * 6 <= 65535 ? Uint16Array : Uint32Array)(faceCount * 6);

    // Second pass: fill buffers
    let vi = 0; // vertex index
    let ii = 0; // index index

    for (const [key, color] of this._blocks) {
      const [lx, ly, lz] = key.split(',').map(Number);
      const bx = this.cx * CHUNK_SIZE + lx;
      const by = this.cy * CHUNK_SIZE + ly;
      const bz = this.cz * CHUNK_SIZE + lz;

      for (const f of FACES) {
        const nbx = bx + f.nx;
        const nby = by + f.ny;
        const nbz = bz + f.nz;

        if (this._isNeighborOccupied(nbx, nby, nbz, worldMap)) continue;

        // Emit 4 corners
        for (let c = 0; c < 4; c++) {
          const [ox, oy, oz] = f.corners[c];
          const pi = (vi + c) * 3;
          posArray[pi]     = bx + ox;
          posArray[pi + 1] = by + oy;
          posArray[pi + 2] = bz + oz;

          normArray[pi]     = f.nx;
          normArray[pi + 1] = f.ny;
          normArray[pi + 2] = f.nz;

          colorArray[pi]     = color.r;
          colorArray[pi + 1] = color.g;
          colorArray[pi + 2] = color.b;
        }

        // Emit 2 triangles (CCW)
        const base = vi;
        idxArray[ii++] = base;
        idxArray[ii++] = base + 1;
        idxArray[ii++] = base + 2;
        idxArray[ii++] = base;
        idxArray[ii++] = base + 2;
        idxArray[ii++] = base + 3;

        vi += 4;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geo.setIndex(new THREE.BufferAttribute(idxArray, 1));
    geo.clearGroups();
    geo.addGroup(0, idxArray.length, 0);

    // Dispose old geometry, assign new
    this._mesh.geometry.dispose();
    this._mesh.geometry = geo;
  }

  /**
   * Check if the integer cell (bx, by, bz) is occupied by a block.
   * Checks this chunk's block map first, then falls back to WorldMap for
   * cross-chunk queries.
   */
  _isNeighborOccupied(bx, by, bz, worldMap) {
    const ncx = Math.floor(bx / CHUNK_SIZE);
    const ncy = Math.floor(by / CHUNK_SIZE);
    const ncz = Math.floor(bz / CHUNK_SIZE);

    if (ncx === this.cx && ncy === this.cy && ncz === this.cz) {
      const nlx = bx - ncx * CHUNK_SIZE;
      const nly = by - ncy * CHUNK_SIZE;
      const nlz = bz - ncz * CHUNK_SIZE;
      return this.isOccupied(nlx, nly, nlz);
    }

    return worldMap.isBlockOccupied(bx, by, bz);
  }

  dispose() {
    this._mesh.geometry.dispose();
  }
}

/**
 * Manages colored cubes across spatial chunks with hidden-face removal.
 * Each 16x16x16 chunk gets a Mesh with custom BufferGeometry showing
 * only faces not touching a neighboring cube.
 */
export class ChunkManager {
  constructor() {
    this._material = new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.1,
      vertexColors: true,
    });

    /** @type {Map<string, Chunk>} */
    this._chunks = new Map();

    /** @type {Set<Chunk>} */
    this._dirtyChunks = new Set();

    /** @type {Map<string, number>} position key -> global index in _positionList */
    this._posToGlobal = new Map();

    /** @type {Array<{x: number, y: number, z: number}>} flat position list for indexed access */
    this._positionList = [];

    /** @type {Array<{chunkKey: string, r: number, g: number, b: number}>} parallel to _positionList */
    this._chunkMap = [];

    this._scene = null;
  }

  /**
   * @param {THREE.Scene} scene
   */
  attachToScene(scene) {
    this._scene = scene;
  }

  _chunkKey(wx, wy, wz) {
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    return `${cx},${cy},${cz}`;
  }

  _posKey(x, y, z) {
    return `${x},${y},${z}`;
  }

  _getOrCreateChunk(key) {
    let chunk = this._chunks.get(key);
    if (!chunk) {
      const [cx, cy, cz] = key.split(',').map(Number);
      chunk = new Chunk(cx, cy, cz, this._material);
      this._chunks.set(key, chunk);
      if (this._scene) this._scene.add(chunk.mesh);
    }
    return chunk;
  }

  _removeEmptyChunk(key) {
    const chunk = this._chunks.get(key);
    if (chunk && chunk.count === 0) {
      this._dirtyChunks.delete(chunk);
      if (this._scene) this._scene.remove(chunk.mesh);
      chunk.dispose();
      this._chunks.delete(key);
    }
  }

  _markDirty(chunk, cellX, cellY, cellZ) {
    chunk.dirty = true;
    this._dirtyChunks.add(chunk);

    // Mark neighboring chunks dirty if we're on a boundary
    const lx = cellX - chunk.cx * CHUNK_SIZE;
    const ly = cellY - chunk.cy * CHUNK_SIZE;
    const lz = cellZ - chunk.cz * CHUNK_SIZE;

    if (lx === 0)  this._markAdjacentDirty(chunk.cx - 1, chunk.cy, chunk.cz);
    if (lx === 15) this._markAdjacentDirty(chunk.cx + 1, chunk.cy, chunk.cz);
    if (ly === 0)  this._markAdjacentDirty(chunk.cx, chunk.cy - 1, chunk.cz);
    if (ly === 15) this._markAdjacentDirty(chunk.cx, chunk.cy + 1, chunk.cz);
    if (lz === 0)  this._markAdjacentDirty(chunk.cx, chunk.cy, chunk.cz - 1);
    if (lz === 15) this._markAdjacentDirty(chunk.cx, chunk.cy, chunk.cz + 1);
  }

  _markAdjacentDirty(cx, cy, cz) {
    const key = `${cx},${cy},${cz}`;
    const chunk = this._chunks.get(key);
    if (chunk) {
      chunk.dirty = true;
      this._dirtyChunks.add(chunk);
    }
  }

  /**
   * Rebuild geometry for dirty chunks, spread across frames.
   * Rebuilds at most MAX_REBUILDS_PER_FRAME chunks per call to avoid
   * multi-frame freezes when many chunks need rebuilding at once.
   * @param {import('./WorldMap.js').WorldMap} worldMap
   */
  rebuildDirty(worldMap) {
    if (this._dirtyChunks.size === 0) return;

    let rebuilt = 0;
    const MAX_REBUILDS_PER_FRAME = 2;

    for (const chunk of this._dirtyChunks) {
      if (rebuilt >= MAX_REBUILDS_PER_FRAME) break;
      chunk.rebuildGeometry(worldMap);
      this._dirtyChunks.delete(chunk);
      rebuilt++;
    }
  }

  /**
   * Add a cube with a random color.
   */
  addCube(x, y, z) {
    return this.addCubeWithColor(x, y, z, Math.random(), Math.random(), Math.random());
  }

  /**
   * Add a cube with a specific color.
   * @returns {boolean}
   */
  addCubeWithColor(x, y, z, r, g, b) {
    const ck = this._chunkKey(x, y, z);
    const chunk = this._getOrCreateChunk(ck);

    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const cellZ = Math.floor(z);
    const lx = cellX - chunk.cx * CHUNK_SIZE;
    const ly = cellY - chunk.cy * CHUNK_SIZE;
    const lz = cellZ - chunk.cz * CHUNK_SIZE;

    if (chunk.isOccupied(lx, ly, lz)) return false;

    chunk.addBlock(lx, ly, lz, r, g, b);

    const posKey = this._posKey(x, y, z);
    const globalIdx = this._positionList.length;
    this._positionList.push({ x, y, z });
    this._chunkMap.push({ chunkKey: ck, r, g, b });
    this._posToGlobal.set(posKey, globalIdx);

    this._markDirty(chunk, cellX, cellY, cellZ);
    return true;
  }

  /**
   * Remove the cube at the given world position.
   * @returns {boolean}
   */
  removeCube(x, y, z) {
    const posKey = this._posKey(x, y, z);
    const globalIdx = this._posToGlobal.get(posKey);
    if (globalIdx === undefined) return false;

    const { chunkKey } = this._chunkMap[globalIdx];
    const chunk = this._chunks.get(chunkKey);
    if (!chunk) return false;

    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const cellZ = Math.floor(z);
    const lx = cellX - chunk.cx * CHUNK_SIZE;
    const ly = cellY - chunk.cy * CHUNK_SIZE;
    const lz = cellZ - chunk.cz * CHUNK_SIZE;

    if (!chunk.removeBlock(lx, ly, lz)) return false;

    this._markDirty(chunk, cellX, cellY, cellZ);

    // Swap-with-last in _positionList and _chunkMap
    const lastIdx = this._positionList.length - 1;
    if (globalIdx !== lastIdx) {
      const lastPos = this._positionList[lastIdx];
      const lastKey = this._posKey(lastPos.x, lastPos.y, lastPos.z);
      this._positionList[globalIdx] = lastPos;
      this._chunkMap[globalIdx] = this._chunkMap[lastIdx];
      this._posToGlobal.set(lastKey, globalIdx);
    }
    this._positionList.pop();
    this._chunkMap.pop();

    this._posToGlobal.delete(posKey);
    this._removeEmptyChunk(chunkKey);
    return true;
  }

  /**
   * Get position and color for a cube by global index.
   */
  getCubeData(index) {
    if (index < 0 || index >= this._positionList.length) return null;

    const pos = this._positionList[index];
    const { r, g, b } = this._chunkMap[index];

    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      color: [
        Math.round(r * 100) / 100,
        Math.round(g * 100) / 100,
        Math.round(b * 100) / 100,
      ],
    };
  }

  getAllCubeData() {
    const result = [];
    for (let i = 0; i < this._positionList.length; i++) {
      const data = this.getCubeData(i);
      if (data) result.push(data);
    }
    return result;
  }

  clearAll() {
    for (const chunk of this._chunks.values()) {
      if (this._scene) this._scene.remove(chunk.mesh);
      chunk.dispose();
    }
    this._chunks.clear();
    this._dirtyChunks.clear();
    this._posToGlobal.clear();
    this._positionList = [];
    this._chunkMap = [];
  }

  get count() {
    return this._positionList.length;
  }

  dispose() {
    this.clearAll();
    this._material.dispose();
  }
}

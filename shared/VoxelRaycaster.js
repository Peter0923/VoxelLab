/**
 * CPU-side voxel traversal using the Amanatides-Woo algorithm.
 *
 * Steps a ray through 3D grid cells, checking WorldMap occupancy at each step.
 * Pure JavaScript — no Three.js dependencies. Importable by both browser and
 * Node.js server (server uses it to validate block reachability).
 *
 * The Three.js-dependent methods (screenToRay, centerRay) remain in
 * src/VoxelRaycaster.js which re-exports from this module.
 */

import { MAX_RAY_STEPS } from './constants.js';

export class VoxelRaycaster {
  /**
   * Traverse a ray through the voxel grid using the Amanatides-Woo DDA algorithm.
   *
   * @param {{x:number, y:number, z:number}} origin - Ray origin in world space
   * @param {{x:number, y:number, z:number}} direction - Normalized ray direction
   * @param {import('./WorldMap.js').WorldMap} worldMap
   * @param {number} [maxDistance=20]
   * @returns {{ cubeX: number, cubeY: number, cubeZ: number, placeX: number, placeY: number, placeZ: number } | null}
   *   cubeX/Y/Z are the world-space centers of the hit block.
   *   placeX/Y/Z are the world-space centers of the adjacent empty cell (for block placement).
   */
  static raycast(origin, direction, worldMap, maxDistance = 20) {
    let cx = Math.floor(origin.x);
    let cy = Math.floor(origin.y);
    let cz = Math.floor(origin.z);

    const stepX = direction.x > 0 ? 1 : -1;
    const stepY = direction.y > 0 ? 1 : -1;
    const stepZ = direction.z > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1 / (direction.x || 1e-10));
    const tDeltaY = Math.abs(1 / (direction.y || 1e-10));
    const tDeltaZ = Math.abs(1 / (direction.z || 1e-10));

    let tMaxX = direction.x !== 0
      ? ((stepX > 0 ? cx + 1 : cx) - origin.x) / direction.x
      : Infinity;
    let tMaxY = direction.y !== 0
      ? ((stepY > 0 ? cy + 1 : cy) - origin.y) / direction.y
      : Infinity;
    let tMaxZ = direction.z !== 0
      ? ((stepZ > 0 ? cz + 1 : cz) - origin.z) / direction.z
      : Infinity;

    let normalX = 0, normalY = 0, normalZ = 0;

    const maxSteps = Math.ceil(maxDistance * 3);

    for (let i = 0; i < maxSteps; i++) {
      // Skip the starting cell (i === 0) to avoid self-hits when the camera is inside a block
      if (i > 0 && worldMap.isBlockOccupied(cx, cy, cz)) {
        return {
          cubeX: cx + 0.5,
          cubeY: cy + 0.5,
          cubeZ: cz + 0.5,
          placeX: cx + normalX + 0.5,
          placeY: cy + normalY + 0.5,
          placeZ: cz + normalZ + 0.5,
        };
      }

      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        if (tMaxX > maxDistance) break;
        cx += stepX;
        tMaxX += tDeltaX;
        normalX = -stepX;
        normalY = 0;
        normalZ = 0;
      } else if (tMaxY < tMaxZ) {
        if (tMaxY > maxDistance) break;
        cy += stepY;
        tMaxY += tDeltaY;
        normalX = 0;
        normalY = -stepY;
        normalZ = 0;
      } else {
        if (tMaxZ > maxDistance) break;
        cz += stepZ;
        tMaxZ += tDeltaZ;
        normalX = 0;
        normalY = 0;
        normalZ = -stepZ;
      }
    }

    return null;
  }

  /**
   * Ray-plane intersection with the Y=0 ground plane.
   * Returns the world-space center of the intersected grid cell.
   *
   * @param {{x:number, y:number, z:number}} origin - Ray origin
   * @param {{x:number, y:number, z:number}} direction - Ray direction
   * @param {number} groundSize - Size of the ground grid (e.g. 50)
   * @param {number} [maxDistance=50] - Max ray distance
   * @returns {{x: number, z: number} | null} - World-space center of ground cell
   */
  static pickGround(origin, direction, groundSize, maxDistance = 50) {
    if (direction.y >= 0) return null; // looking up or level — won't hit the ground

    const t = -origin.y / direction.y;
    if (t <= 0 || t > maxDistance) return null;

    const hitX = origin.x + t * direction.x;
    const hitZ = origin.z + t * direction.z;
    const halfSize = groundSize / 2;

    if (Math.abs(hitX) > halfSize || Math.abs(hitZ) > halfSize) return null;

    const col = Math.floor(hitX + halfSize);
    const row = Math.floor(hitZ + halfSize);

    return {
      x: col - halfSize + 0.5,
      z: row - halfSize + 0.5,
    };
  }
}

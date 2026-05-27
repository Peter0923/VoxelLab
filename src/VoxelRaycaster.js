import * as THREE from 'three';

/**
 * CPU-side voxel traversal using the Amanatides-Woo algorithm.
 * Steps a ray through 3D grid cells, checking WorldMap occupancy at each step.
 * Replaces the GPU-based CubePicker — O(ray steps) instead of O(n) GPU render.
 */
export class VoxelRaycaster {
  /**
   * @param {THREE.Vector3} origin - Ray origin in world space
   * @param {THREE.Vector3} direction - Normalized ray direction
   * @param {import('./WorldMap.js').WorldMap} worldMap
   * @param {number} [maxDistance=20]
   * @returns {{ cubeX: number, cubeY: number, cubeZ: number, placeX: number, placeY: number, placeZ: number } | null}
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
   * Build a ray from screen coordinates.
   * @param {number} clientX
   * @param {number} clientY
   * @param {THREE.Camera} camera
   * @param {HTMLCanvasElement} canvas
   * @returns {{ origin: THREE.Vector3, direction: THREE.Vector3 }}
   */
  static screenToRay(clientX, clientY, camera, canvas) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    return { origin: raycaster.ray.origin, direction: raycaster.ray.direction };
  }

  /**
   * Build a ray from the center of the screen (for pointer-lock / FPS modes).
   * @param {THREE.Camera} camera
   * @returns {{ origin: THREE.Vector3, direction: THREE.Vector3 }}
   */
  static centerRay(camera) {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    return { origin: camera.position.clone(), direction };
  }

  /**
   * Ray-plane intersection with the Y=0 ground plane.
   * Returns the world-space center of the intersected grid cell.
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} direction
   * @param {number} groundSize
   * @param {number} [maxDistance=50]
   * @returns {{ x: number, z: number } | null}
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

import * as THREE from 'three';
// Re-export the pure-math core from the shared module
export { VoxelRaycaster as VoxelRaycasterCore } from '../../shared/VoxelRaycaster.js';

/**
 * Wrapper that combines the shared (pure-JS) VoxelRaycaster core with
 * Three.js-dependent helper methods (screenToRay, centerRay).
 *
 * Existing consumers (InteractionManager.js) continue to import from
 * './VoxelRaycaster.js' with no API changes.
 */
import { VoxelRaycaster as Shared } from '../../shared/VoxelRaycaster.js';

export class VoxelRaycaster {
  /**
   * CPU-side voxel traversal (delegates to shared module).
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} direction
   * @param {import('../../shared/WorldMap.js').WorldMap} worldMap
   * @param {number} [maxDistance=20]
   * @returns {{ cubeX: number, cubeY: number, cubeZ: number, placeX: number, placeY: number, placeZ: number } | null}
   */
  static raycast(origin, direction, worldMap, maxDistance = 20) {
    // THREE.Vector3 has .x, .y, .z — compatible with the plain object interface
    return Shared.raycast(origin, direction, worldMap, maxDistance);
  }

  /**
   * Build a ray from screen coordinates (Three.js dependent).
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
   * Ray-plane intersection with the Y=0 ground plane (delegates to shared module).
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} direction
   * @param {number} groundSize
   * @param {number} [maxDistance=50]
   * @returns {{ x: number, z: number } | null}
   */
  static pickGround(origin, direction, groundSize, maxDistance = 50) {
    return Shared.pickGround(origin, direction, groundSize, maxDistance);
  }
}

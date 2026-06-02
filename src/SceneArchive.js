/**
 * SceneArchive — handles saving and loading scenes to/from the server.
 *
 * Save format (JSON):
 * {
 *   version: 1,
 *   savedAt: "ISO date string",
 *   numCubes: number,
 *   player: { posX, posY, posZ, rotationX, rotationY, rotationZ },
 *   cubes: [ [posX, posY, posZ, r, g, b], ... ]
 * }
 *
 * Each scene is stored as {name}.scene in the public/scenes/ directory.
 * The last loaded scene name is persisted in localStorage.
 */

const LAST_SCENE_KEY = 'voxellab-last-scene';

export class SceneArchive {
  /**
   * List all available scene names (without .scene suffix).
   * @returns {Promise<string[]>}
   */
  static async list() {
    try {
      const res = await fetch('/api/scenes');
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      console.error('SceneArchive.list failed:', e);
      return [];
    }
  }

  /**
   * Round a number to at most 2 decimal places.
   * @param {number} v
   * @returns {number}
   */
  static _round2(v) {
    return Math.round(v * 100) / 100;
  }

  /**
   * Serialize the current scene state into a plain object.
   * @param {import('./CubeManager.js').CubeManager} cubeManager
   * @param {import('./CharacterController.js').CharacterController} characterController
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @returns {object}
   */
  static serialize(cubeManager, characterController, legoCharacter) {
    const pos = legoCharacter.group.position;
    const rot = legoCharacter.group.rotation;

    // Date in China timezone (UTC+8), second precision
    const now = new Date();
    const chinaOffset = 8 * 60; // minutes ahead of UTC
    const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);
    const savedAt = chinaTime.toISOString().replace(/\.\d{3}Z/, '+08:00');

    const cubes = [];
    for (let i = 0; i < cubeManager.count; i++) {
      const data = cubeManager.getCubeData(i);
      if (data) {
        cubes.push([
          SceneArchive._round2(data.position.x),
          SceneArchive._round2(data.position.y),
          SceneArchive._round2(data.position.z),
          SceneArchive._round2(data.color[0]),
          SceneArchive._round2(data.color[1]),
          SceneArchive._round2(data.color[2]),
        ]);
      }
    }

    return {
      version: 1,
      savedAt,
      numCubes: cubes.length,
      player: {
        posX: SceneArchive._round2(pos.x),
        posY: SceneArchive._round2(pos.y),
        posZ: SceneArchive._round2(pos.z),
        rotationX: SceneArchive._round2(rot.x),
        rotationY: SceneArchive._round2(rot.y),
        rotationZ: SceneArchive._round2(rot.z),
      },
      cubes,
    };
  }

  /**
   * Save the current scene to a named scene file.
   * @param {string} sceneName
   * @param {import('./CubeManager.js').CubeManager} cubeManager
   * @param {import('./CharacterController.js').CharacterController} characterController
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @returns {Promise<boolean>} true if save succeeded
   */
  static async save(sceneName, cubeManager, characterController, legoCharacter) {
    try {
      const data = SceneArchive.serialize(cubeManager, characterController, legoCharacter);
      const res = await fetch(`/api/save/${encodeURIComponent(sceneName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.ok;
    } catch (e) {
      console.error('SceneArchive.save failed:', e);
      return false;
    }
  }

  /**
   * Load a named scene from the server and restore it into the scene.
   * Clears all existing cubes before loading.
   * @param {string} sceneName
   * @param {import('./CubeManager.js').CubeManager} cubeManager
   * @param {import('./CharacterController.js').CharacterController} characterController
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @returns {Promise<boolean>} true if the scene was loaded
   */
  static async load(sceneName, cubeManager, characterController, legoCharacter) {
    try {
      const res = await fetch(`/api/load/${encodeURIComponent(sceneName)}`);
      if (!res.ok) return false;

      const data = await res.json();

      // Clear existing scene
      cubeManager.clearAll();

      // Restore character
      if (data.player) {
        legoCharacter.group.position.set(
          data.player.posX,
          data.player.posY,
          data.player.posZ
        );
        legoCharacter.group.rotation.set(
          data.player.rotationX || 0,
          data.player.rotationY,
          data.player.rotationZ || 0
        );
      }

      // Restore cubes
      if (data.cubes && Array.isArray(data.cubes)) {
        cubeManager.beginBulkLoad();
        for (const cube of data.cubes) {
          cubeManager.addCubeWithColor(
            cube[0], cube[1], cube[2],
            cube[3], cube[4], cube[5]
          );
        }
        cubeManager.endBulkLoad();
      }

      // Remember this as the last scene
      SceneArchive.setLastScene(sceneName);

      return true;
    } catch (e) {
      console.error('SceneArchive.load failed:', e);
      return false;
    }
  }

  // --- Last scene (localStorage) ---

  /**
   * Get the name of the last loaded scene.
   * @returns {string|null}
   */
  static getLastScene() {
    try {
      return localStorage.getItem(LAST_SCENE_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Create and save a new default scene with 4 corner cubes and the character at center.
   * Clears any existing cubes first.
   * @param {string} sceneName
   * @param {import('./CubeManager.js').CubeManager} cubeManager
   * @param {import('./CharacterController.js').CharacterController} characterController
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @param {number} groundSize - the size of the ground grid (used for corner positions)
   * @returns {Promise<boolean>} true if the scene was created and saved successfully
   */
  static async createDefault(sceneName, cubeManager, characterController, legoCharacter, groundSize) {
    // Clear current scene
    cubeManager.clearAll();

    // Place 4 cubes at the corners
    const half = groundSize / 2 - 0.5;
    cubeManager.addCube( half, 0.5,  half);
    cubeManager.addCube( half, 0.5, -half);
    cubeManager.addCube(-half, 0.5, -half);
    cubeManager.addCube(-half, 0.5,  half);

    // Reset character to center
    legoCharacter.group.position.set(0, 0, 0);
    legoCharacter.group.rotation.y = 0;

    // Save and track
    const ok = await SceneArchive.save(sceneName, cubeManager, characterController, legoCharacter);
    if (ok) {
      SceneArchive.setLastScene(sceneName);
    }
    return ok;
  }

  /**
   * Persist the name of the last loaded scene.
   * @param {string} sceneName
   */
  static setLastScene(sceneName) {
    try {
      localStorage.setItem(LAST_SCENE_KEY, sceneName);
    } catch {
      // localStorage may be unavailable
    }
  }
}

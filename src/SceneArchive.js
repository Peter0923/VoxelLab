/**
 * SceneArchive — handles saving and loading scenes to/from the server.
 *
 * Save format (JSON):
 * {
 *   version: 1,
 *   savedAt: "ISO date string",
 *   player: { position: { x, y, z }, rotationY: number },
 *   cubes: [ { position: { x, y, z }, color: [r, g, b] }, ... ]
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
   * Serialize the current scene state into a plain object.
   * @param {import('./CubeManager.js').CubeManager} cubeManager
   * @param {import('./CharacterController.js').CharacterController} characterController
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @returns {object}
   */
  static serialize(cubeManager, characterController, legoCharacter) {
    const pos = legoCharacter.group.position;
    const rotY = legoCharacter.group.rotation.y;

    const cubes = [];
    for (let i = 0; i < cubeManager.count; i++) {
      const data = cubeManager.getCubeData(i);
      if (data) cubes.push(data);
    }

    return {
      version: 1,
      savedAt: new Date().toISOString(),
      player: {
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotationY: rotY,
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
          data.player.position.x,
          data.player.position.y,
          data.player.position.z
        );
        legoCharacter.group.rotation.y = data.player.rotationY;
      }

      // Restore cubes
      if (data.cubes && Array.isArray(data.cubes)) {
        cubeManager.beginBulkLoad();
        for (const cube of data.cubes) {
          cubeManager.addCubeWithColor(
            cube.position.x,
            cube.position.y,
            cube.position.z,
            cube.color[0],
            cube.color[1],
            cube.color[2]
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

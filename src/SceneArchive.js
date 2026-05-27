/**
 * SceneArchive — handles saving and loading the scene to/from the server.
 *
 * Save format (JSON):
 * {
 *   version: 1,
 *   savedAt: "ISO date string",
 *   player: { position: { x, y, z }, rotationY: number },
 *   cubes: [ { position: { x, y, z }, color: [r, g, b] }, ... ]
 * }
 */
export class SceneArchive {
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
   * Save the current scene to the server.
   * @param {import('./CubeManager.js').CubeManager} cubeManager
   * @param {import('./CharacterController.js').CharacterController} characterController
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @returns {Promise<boolean>} true if save succeeded
   */
  static async save(cubeManager, characterController, legoCharacter) {
    try {
      const data = SceneArchive.serialize(cubeManager, characterController, legoCharacter);
      const res = await fetch('/api/save', {
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
   * Load a saved scene from the server and restore it.
   * @param {import('./CubeManager.js').CubeManager} cubeManager
   * @param {import('./CharacterController.js').CharacterController} characterController
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @returns {Promise<boolean>} true if a scene was loaded
   */
  static async load(cubeManager, characterController, legoCharacter) {
    try {
      const res = await fetch('/api/load');
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

      return true;
    } catch (e) {
      console.error('SceneArchive.load failed:', e);
      return false;
    }
  }
}
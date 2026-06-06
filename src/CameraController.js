/**
 * Base class for camera controllers.
 * Subclasses must implement enable(), disable(), and update().
 */
export class CameraController {
  /**
   * Called when this controller becomes active.
   * @param {import('three').Camera} camera
   * @param {HTMLElement} domElement
   * @param {object} [character] - optional character to initialize camera relative to
   */
  enable(camera, domElement, character) {
    this.camera = camera;
    this.domElement = domElement;
    this.character = character;
  }

  /**
   * Called when this controller is deactivated.
   */
  disable() {}

  /**
   * Called every frame while this controller is active.
   * @param {number} delta - frame delta time in seconds
   * @param {object} character - the LegoCharacter instance (or null)
   */
  update(delta, character) {}
}

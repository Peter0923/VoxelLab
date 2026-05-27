import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitController } from './OrbitController.js';
import { FollowController } from './FollowController.js';
import { FPSController } from './FPSController.js';

/**
 * Manages camera controllers and provides a lil-gui panel to switch between them.
 * Press H to hide/show the GUI.
 */
export class ControllerGUI {
  /**
   * @param {import('three').Camera} camera
   * @param {HTMLElement} domElement
   * @param {import('./LegoCharacter.js').LegoCharacter} [character]
   * @param {import('three').Scene} [scene]
   */
  constructor(camera, domElement, character, scene) {
    this.camera = camera;
    this.domElement = domElement;

    /** @type {Object<string, import('./CameraController.js').CameraController>} */
    this.controllers = {};

    /** @type {string} */
    this.currentName = null;

    // Build the lil-gui panel
    this.gui = new GUI({ title: 'Camera Controller' });
    this.gui.domElement.style.position = 'absolute';
    this.gui.domElement.style.top = '10px';
    this.gui.domElement.style.right = '10px';

    // Register controllers
    this.register('Orbit', new OrbitController());
    this.register('Follow', new FollowController());
    this.register('FPS', new FPSController());

    // GUI state
    const state = { controller: 'Orbit' };

    this.gui.add(state, 'controller', Object.keys(this.controllers))
      .name('Controller')
      .onChange((name) => this._switchTo(name));

    // Bounding box toggle
    this.boxHelper = null;
    if (character && scene) {
      this._setupBoundingBoxToggle(character, scene);
    }

    // Keyboard shortcut to hide/show GUI
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey) {
        this.gui.domElement.style.display =
          this.gui.domElement.style.display === 'none' ? '' : 'none';
      }
    });

    // Start with Orbit
    this._switchTo('Orbit');
  }

  /**
   * Add a "Save Scene" button to the GUI.
   * @param {() => void} onSave - callback invoked when the button is clicked
   */
  setupSaveButton(onSave) {
    const state = { save: onSave };
    this.gui.add(state, 'save').name('Save Scene');
  }

  /**
   * Create the bounding box wireframe and add a toggle to the GUI.
   * BoxHelper is added to the scene (not character.group) to avoid
   * double-transforming world-space coordinates produced by BoxHelper.update().
   * @param {import('./LegoCharacter.js').LegoCharacter} character
   * @param {import('three').Scene} scene
   */
  _setupBoundingBoxToggle(character, scene) {
    this.boxHelper = new THREE.BoxHelper(character.visualGroup, 0x00ff00);
    this.boxHelper.visible = false;
    scene.add(this.boxHelper);

    const bboxState = { show: false };

    this.gui.add(bboxState, 'show')
      .name('BBox')
      .onChange((val) => {
        this.boxHelper.visible = val;
      });
  }

  /**
   * Register a new controller.
   * @param {string} name
   * @param {import('./CameraController.js').CameraController} controller
   */
  register(name, controller) {
    this.controllers[name] = controller;
  }

  /**
   * Switch to a different controller.
   * @param {string} name
   */
  _switchTo(name) {
    // Disable current
    if (this.currentName && this.controllers[this.currentName]) {
      this.controllers[this.currentName].disable();
    }

    this.currentName = name;

    // Enable new
    if (this.controllers[name]) {
      this.controllers[name].enable(this.camera, this.domElement);
    }
  }

  /**
   * Call every frame to update the active controller.
   * @param {number} delta
   * @param {object} character
   */
  update(delta, character) {
    if (this.currentName && this.controllers[this.currentName]) {
      this.controllers[this.currentName].update(delta, character);
    }

    // Update bounding box to follow animated limbs
    if (this.boxHelper && this.boxHelper.visible) {
      this.boxHelper.update();
    }
  }
}
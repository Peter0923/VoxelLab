import GUI from 'lil-gui';
import * as THREE from 'three';
import { OrbitController } from '../camera/OrbitController.js';
import { FollowController } from '../camera/FollowController.js';
import { FPSController } from '../camera/FPSController.js';
import { SceneArchive } from '../world/SceneArchive.js';

/**
 * Manages camera controllers and provides a lil-gui "Game Settings" panel.
 * Press H to hide/show the GUI (only when in-world).
 * Press E to toggle the Tool Box (only in online mode, placeholder).
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
    this.character = character;

    /** @type {Object<string, import('./CameraController.js').CameraController>} */
    this.controllers = {};

    /** @type {string} */
    this.currentName = null;

    // Build the lil-gui panel (hidden by default — shown only when in-world)
    this.gui = new GUI({ title: 'Game Settings' });
    this.gui.domElement.style.position = 'absolute';
    this.gui.domElement.style.top = '10px';
    this.gui.domElement.style.right = '10px';
    this.gui.domElement.style.display = 'none';

    this._hotkeyEnabled = false;

    // Register controllers
    this.register('Orbit', new OrbitController());
    this.register('Follow', new FollowController());
    this.register('FPS', new FPSController());

    // Bounding box reference (initialized later in setupCameraController)
    this.boxHelper = null;

    // FPS limit setting (default to 60Hz to keep frame rate consistent)
    /** @type {'Max'|'60Hz'} */
    this.fpsLimit = '60Hz';
    const fpsObj = { fps: this.fpsLimit };
    this.gui.add(fpsObj, 'fps', ['Max', '60Hz'])
      .name('FPS Limit')
      .onChange((val) => { this.fpsLimit = val; });

    // Start with Orbit
    this._switchTo('Orbit');

    // Disconnect button state (set by setupMultiplayerInfo)
    this._disconnectCallback = null;
  }

  /**
   * Register keyboard shortcuts for H (toggle Game Settings) and E (toggle Tool Box).
   * Only active when _hotkeyEnabled is true and chat is not focused.
   */
  _registerHotkeys() {
    this._hotkeyHandler = (e) => {
      if (!this._hotkeyEnabled) return;
      // Ignore when chat input is focused
      const chatInput = document.getElementById('chat-input');
      if (chatInput && document.activeElement === chatInput) return;

      if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey) {
        this.gui.domElement.style.display =
          this.gui.domElement.style.display === 'none' ? '' : 'none';
        e.preventDefault();
      }

      if (e.code === 'KeyE' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (this._toolBoxControl && this._toolBoxDom) {
          this._toolBoxState.enabled = !this._toolBoxState.enabled;
          this._toolBoxControl.updateDisplay();
        }
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', this._hotkeyHandler);
  }

  _unregisterHotkeys() {
    if (this._hotkeyHandler) {
      document.removeEventListener('keydown', this._hotkeyHandler);
      this._hotkeyHandler = null;
    }
  }

  /**
   * Show the GUI panel and enable hotkeys. Called when entering a world.
   */
  enterGame() {
    this.gui.domElement.style.display = '';
    this._hotkeyEnabled = true;
    this._registerHotkeys();
  }

  /**
   * Hide the GUI panel and disable hotkeys. Called when leaving a world.
   */
  leaveGame() {
    this.gui.domElement.style.display = 'none';
    this._hotkeyEnabled = false;
    this._unregisterHotkeys();
  }

  /**
   * Add a "Scene Manager" section to the GUI.
   * @param {import('./CubeManager.js').CubeManager} cubeManager
   * @param {import('./CharacterController.js').CharacterController} characterController
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   * @param {number} groundSize - the size of the ground grid
   */
  setupSceneManager(cubeManager, characterController, legoCharacter, groundSize) {
    this._legoCharacter = legoCharacter;
    const folder = this.gui.addFolder('Scene Manager');
    this._sceneFolder = folder; // stash reference for show/hide

    // --- State (stored on instance so syncCurrentScene can access it) ---
    this._sceneState = {
      scene: '',
      scenes: [],
      loading: false,
    };
    const state = this._sceneState;

    // --- Scene dropdown ---
    const sceneControl = folder.add(state, 'scene', state.scenes)
      .name('Load Scene')
      .onChange(async (name) => {
        if (!name || state.loading) return;
        state.loading = true;
        const ok = await SceneArchive.load(name, cubeManager, characterController, legoCharacter);
        if (ok && this.currentName === 'Orbit') {
          this.controllers['Orbit'].rebaseOnCharacter(legoCharacter);
        }
        state.loading = false;
        if (!ok) {
          console.warn(`Failed to load scene "${name}"`);
        }
      });
    this._sceneControl = sceneControl;

    // --- Populate scene list ---
    const refreshList = async () => {
      state.scenes = await SceneArchive.list();
      // If the current scene is no longer in the list, reset selection
      if (state.scene && !state.scenes.includes(state.scene)) {
        state.scene = '';
      }
      // If no scene selected and there are scenes, pick the first
      if (!state.scene && state.scenes.length > 0) {
        state.scene = state.scenes[0];
      }
      // Rebuild the dropdown options
      if (state.scenes.length > 0) {
        sceneControl.options(state.scenes);
      }
    };

    // --- Create New button ---
    const createObj = {
      create: async () => {
        // Refresh list first to have latest scene names
        state.scenes = await SceneArchive.list();

        let trimmed = '';

        while (true) {
          const name = window.prompt('Enter a name for the new scene:');
          // User cancelled
          if (!name) return;
          trimmed = name.trim();
          if (!trimmed) continue;

          // Validate name format (alphanumeric, hyphens, underscores)
          if (!/^[\w-]+$/.test(trimmed)) {
            alert('Scene name may only contain letters, numbers, hyphens, and underscores.');
            continue;
          }

          // Check for conflict
          if (state.scenes.includes(trimmed)) {
            alert(`A scene named "${trimmed}" already exists. Please choose a different name.`);
            continue;
          }

          // Name is valid and unique — exit loop
          break;
        }

        // Create default scene with 4 corner cubes and character at center
        const ok = await SceneArchive.createDefault(trimmed, cubeManager, characterController, legoCharacter, groundSize);
        if (!ok) {
          alert('Failed to create the new scene.');
          return;
        }

        // Update UI: add to scene list, rebuild dropdown, select it
        state.scenes.push(trimmed);
        sceneControl.options(state.scenes);
        // Force lil-gui to update the display to show the newly selected scene
        state.scene = trimmed;
        sceneControl.updateDisplay();
      }
    };
    folder.add(createObj, 'create').name('Create New');

    // --- Save Scene button ---
    const saveObj = {
      save: async () => {
        if (!state.scene) {
          alert('Please select a scene first.');
          return;
        }
        const ok = await SceneArchive.save(state.scene, cubeManager, characterController, legoCharacter);
        if (ok) {
          SceneArchive.setLastScene(state.scene);
        } else {
          alert('Failed to save the scene.');
        }
      }
    };
    folder.add(saveObj, 'save').name('Save Scene');

    // --- Initialize ---
    refreshList();

    // Expose refresh for use after initial scene load
    this._refreshSceneList = refreshList;
  }

  /**
   * After an external scene load (e.g. from main.js startup),
   * refresh the dropdown list and select the given scene if it exists.
   * @param {string} sceneName
   */
  async syncCurrentScene(sceneName) {
    if (!this._refreshSceneList || !this._sceneState) return;
    await this._refreshSceneList();
    // If the loaded scene is now in the list, select it and force visual update
    if (this._sceneState.scenes.includes(sceneName)) {
      this._sceneState.scene = sceneName;
      this._sceneControl.updateDisplay();
    }
  }

  /**
   * Set up the camera controller dropdown directly in the root of the GUI panel.
   * Called after the constructor's FPS Limit controller so it appears next in order.
   * @param {import('./LegoCharacter.js').LegoCharacter} character
   * @param {import('three').Scene} scene
   */
  setupCameraController(character, scene) {
    const state = { controller: 'Orbit' };
    this.gui.add(state, 'controller', Object.keys(this.controllers))
      .name('Camera')
      .onChange((name) => this._switchTo(name));
  }

  /**
   * Set up the "Asset Manager" folder in the GUI panel.
   * Contains Color Picker (offline mode) and Tool Box (online mode, placeholder).
   * Both controls are hidden by default — call setOfflineMode() or setOnlineMode()
   * to show the appropriate one.
   * Should be called after setupCameraController so it appears after it in order.
   * @param {object} opts
   * @param {import('./ColorPicker.js').ColorPicker} [opts.colorPicker]
   */
  setupAssetManager(opts) {
    const folder = this.gui.addFolder('Asset Manager');

    // Color Picker toggle (offline mode)
    if (opts.colorPicker) {
      const pickerState = { enabled: false };
      this._pickerControl = folder.add(pickerState, 'enabled')
        .name('Color Picker')
        .onChange((val) => {
          if (val) opts.colorPicker.show();
          else opts.colorPicker.hide();
        });
      this._pickerState = pickerState;
      this._pickerDom = this._pickerControl.domElement;
      this._pickerDom.style.display = 'none';
    }

    // Tool Box toggle (online mode, placeholder)
    this._toolBoxState = { enabled: false };
    this._toolBoxControl = folder.add(this._toolBoxState, 'enabled')
      .name('Tool Box')
      .onChange((val) => {
        // Placeholder — no visual output yet
      });
    this._toolBoxDom = this._toolBoxControl.domElement;
    this._toolBoxDom.style.display = 'none';
  }

  /**
   * Switch Asset Manager to offline mode: show Color Picker, hide Tool Box.
   * Also called when entering a world in offline mode.
   */
  setOfflineMode() {
    if (this._pickerDom) {
      this._pickerDom.style.display = '';
    }
    if (this._toolBoxDom) {
      this._toolBoxDom.style.display = 'none';
    }
  }

  /**
   * Switch Asset Manager to online mode: show Tool Box, hide Color Picker.
   * Also called when entering a world in multiplayer mode.
   */
  setOnlineMode() {
    if (this._pickerDom) {
      this._pickerDom.style.display = 'none';
      // Auto-hide the color picker palette when switching to online
      if (this._pickerState && this._pickerState.enabled) {
        this._pickerState.enabled = false;
        this._pickerControl.updateDisplay();
      }
    }
    if (this._toolBoxDom) {
      this._toolBoxDom.style.display = '';
    }
  }

  /**
   * Create the bounding box wireframe and add a toggle to the given parent
   * (either the root GUI or a subfolder).
   * BoxHelper is added to the scene (not character.group) to avoid
   * double-transforming world-space coordinates produced by BoxHelper.update().
   * @param {import('./LegoCharacter.js').LegoCharacter} character
   * @param {import('three').Scene} scene
   * @param {GUI|import('lil-gui').Folder} parent - the GUI or folder to add the control to
   */
  _setupBoundingBoxToggle(character, scene, parent) {
    this.boxHelper = new THREE.BoxHelper(character.visualGroup, 0x00ff00);
    this.boxHelper.visible = false;
    scene.add(this.boxHelper);

    const bboxState = { show: false };

    parent.add(bboxState, 'show')
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
      this.controllers[name].enable(this.camera, this.domElement, this.character);
    }
  }

  /**
   * Add a "Multiplayer" section to the GUI. Called by main.js when in multiplayer mode.
   * @param {object} opts
   * @param {string} opts.worldName
   * @param {number} opts.playerCount
   * @param {function():void} opts.onDisconnect
   */
  setupMultiplayerInfo(opts) {
    const folder = this.gui.addFolder('Multiplayer');
    this._multiplayerFolder = folder;

    const info = { world: opts.worldName || '—', players: `${opts.playerCount || 0}` };
    folder.add(info, 'world').name('World').disable();
    folder.add(info, 'players').name('Players').disable();

    this._disconnectCallback = opts.onDisconnect || null;

    const dcObj = {
      disconnect: () => {
        if (this._disconnectCallback) {
          this._disconnectCallback();
        }
      }
    };
    folder.add(dcObj, 'disconnect').name('Disconnect');
  }

  /**
   * Show or hide the Scene Manager folder.
   * In online mode scenes are managed by the server, so the folder is hidden.
   * @param {boolean} visible
   */
  showSceneManager(visible) {
    if (this._sceneFolder) {
      this._sceneFolder.show(visible);
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
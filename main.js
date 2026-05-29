import * as THREE from 'three';
import Stats from 'stats.js';
import { LegoCharacter } from './LegoCharacter.js';
import { ControllerGUI } from './src/ControllerGUI.js';
import { ChunkManager } from './src/ChunkManager.js';
import { WorldMap } from './src/WorldMap.js';
import { CubeManager } from './src/CubeManager.js';
import { InputManager } from './src/InputManager.js';
import { CharacterController } from './src/CharacterController.js';
import { InteractionManager } from './src/InteractionManager.js';
import { SceneArchive } from './src/SceneArchive.js';

// --- Scene, Camera, Renderer ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 3, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// --- Lego Character (created early so ControllerGUI can use it) ---
const lego = new LegoCharacter();
lego.group.position.set(0, 0, 0);
scene.add(lego.group);
lego.play('idle');

// --- Camera Controller ---
const controllerGUI = new ControllerGUI(camera, renderer.domElement, lego, scene);

// --- Grid ---
const GROUND_SIZE = 50;
const gridHelper = new THREE.GridHelper(GROUND_SIZE, GROUND_SIZE, 0x88aaff, 0x335588);
scene.add(gridHelper);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = false;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0x88aaff, 0.5);
fillLight.position.set(-5, 0, 5);
scene.add(fillLight);

const spotLight = new THREE.SpotLight(0xffffff, 2);
spotLight.angle = 0.6;
spotLight.penumbra = 0.3;
spotLight.decay = 1;
spotLight.distance = 30;
spotLight.target.position.set(0, 0, -1);
camera.add(spotLight);
scene.add(camera);

// --- Cube System ---
const chunkManager = new ChunkManager();
chunkManager.attachToScene(scene);

const worldMap = new WorldMap();
const cubeManager = new CubeManager(chunkManager, worldMap);

// --- Input ---
const inputManager = new InputManager();

// --- Character Physics & Animation ---
const characterController = new CharacterController(lego, worldMap, inputManager, controllerGUI);

// --- Wire up Scene Manager in GUI ---
controllerGUI.setupSceneManager(cubeManager, characterController, lego, GROUND_SIZE);

// --- Auto-load last scene, fallback to myworld, or prompt to create ---
(async () => {
  // Check for last loaded scene
  let lastScene = SceneArchive.getLastScene();

  let loadedSceneName = null;

  if (lastScene) {
    const loaded = await SceneArchive.load(lastScene, cubeManager, characterController, lego);
    if (loaded) {
      loadedSceneName = lastScene;
    }
  }

  if (!loadedSceneName) {
    // Try loading the default myworld.scene
    const myworldLoaded = await SceneArchive.load('myworld', cubeManager, characterController, lego);
    if (myworldLoaded) {
      loadedSceneName = 'myworld';
    }
  }

  if (!loadedSceneName) {
    // No scenes exist — set character at center and prompt user
    lego.group.position.set(0, 0, 0);
    lego.group.rotation.y = 0;

    // Check if there are any scenes available before prompting
    const scenes = await SceneArchive.list();
    if (scenes.length === 0) {
      const name = window.prompt('No scenes found. Please enter a name for your first scene:');
      if (name && name.trim() && /^[\w-]+$/.test(name.trim())) {
        const trimmed = name.trim();
        // Create default scene with corner cubes and character at center
        const ok = await SceneArchive.createDefault(trimmed, cubeManager, characterController, lego, GROUND_SIZE);
        if (ok) {
          loadedSceneName = trimmed;
        }
      }
    }
  }

  // Sync the GUI scene dropdown with whatever was loaded
  if (loadedSceneName) {
    await controllerGUI.syncCurrentScene(loadedSceneName);
  } else {
    // No scene was loaded or created — refresh the dropdown so user can see available scenes
    await controllerGUI.syncCurrentScene('');
  }
})();

// --- Pointer Interaction (place / remove cubes) ---
new InteractionManager(
  renderer.domElement, camera, cubeManager,
  worldMap, controllerGUI, lego
);

// --- Stats ---
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

let prevTime = performance.now();

// --- Render Loop ---
function animate() {
  const now = performance.now();
  const delta = Math.min((now - prevTime) / 1000, 0.1);
  prevTime = now;

  stats.begin();

  characterController.update(delta);
  controllerGUI.update(delta, lego);

  renderer.render(scene, camera);

  stats.end();
}

renderer.setAnimationLoop(animate);
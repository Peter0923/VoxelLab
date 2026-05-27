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

// --- Wire up Save button in GUI ---
controllerGUI.setupSaveButton(() => {
  SceneArchive.save(cubeManager, characterController, lego);
});

// --- Auto-load saved scene or create initial cubes ---
SceneArchive.load(cubeManager, characterController, lego).then((loaded) => {
  if (!loaded) {
    // No saved scene — place the default 4 cubes at the corners
    const half = GROUND_SIZE / 2 - 0.5;
    cubeManager.addCube( half, 0.5,  half);
    cubeManager.addCube( half, 0.5, -half);
    cubeManager.addCube(-half, 0.5, -half);
    cubeManager.addCube(-half, 0.5,  half);
  }
});

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

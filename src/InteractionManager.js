import { VoxelRaycaster } from './VoxelRaycaster.js';

const GROUND_SIZE = 50;

export class InteractionManager {
  /**
   * @param {HTMLElement} domElement
   * @param {THREE.Camera} camera
   * @param {import('./CubeManager.js').CubeManager} cubeManager
   * @param {import('./WorldMap.js').WorldMap} worldMap
   * @param {import('./ControllerGUI.js').ControllerGUI} controllerGUI
   * @param {import('../LegoCharacter.js').LegoCharacter} legoCharacter
   */
  constructor(domElement, camera, cubeManager, worldMap, controllerGUI, legoCharacter) {
    this._dom = domElement;
    this._camera = camera;
    this._cubeMgr = cubeManager;
    this._worldMap = worldMap;
    this._ctrlGUI = controllerGUI;
    this._lego = legoCharacter;
    this._pointerMoved = false;

    this._onPointerDown = (e) => {
      if (e.button === 0 || e.button === 2) {
        this._pointerMoved = false;
      }
    };

    this._onPointerMove = () => { this._pointerMoved = true; };

    this._onPointerUp = (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      if (this._pointerMoved) return;

      // In pointer-lock modes (FPS, Follow), skip if pointer isn't locked yet (the click is locking it)
      if (this._isPointerLock() && document.pointerLockElement !== this._dom) return;

      const pointerLock = this._isPointerLock();

      const { origin, direction } = pointerLock
        ? VoxelRaycaster.centerRay(this._camera)
        : VoxelRaycaster.screenToRay(e.clientX, e.clientY, this._camera, this._dom);

      const hit = VoxelRaycaster.raycast(origin, direction, this._worldMap, 30);

      if (e.button === 2) {
        if (hit) {
          this._cubeMgr.removeCubeAt(hit.cubeX, hit.cubeY, hit.cubeZ);
        }
        return;
      }

      // Left button — place cube
      if (hit) {
        if (!this._isCharacterAt(hit.placeX, hit.placeY, hit.placeZ)) {
          this._cubeMgr.addCube(hit.placeX, hit.placeY, hit.placeZ);
        }
        return;
      }

      // No cube hit — try ground
      const cell = VoxelRaycaster.pickGround(origin, direction, GROUND_SIZE, 50);
      if (cell && !this._isCharacterAt(cell.x, 0.5, cell.z)) {
        this._cubeMgr.addCube(cell.x, 0.5, cell.z);
      }
    };

    this._onContextMenu = (e) => e.preventDefault();

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('contextmenu', this._onContextMenu);
  }

  _isPointerLock() {
    return this._ctrlGUI.currentName === 'FPS' || this._ctrlGUI.currentName === 'Follow';
  }

  _isCharacterAt(worldX, worldY, worldZ) {
    const pos = this._lego.group.position;
    const CHAR_HALF_X = 0.3;
    const CHAR_HALF_Z = 0.3;
    const CHAR_HEIGHT = 1.9;

    const cx = Math.floor(worldX);
    const cz = Math.floor(worldZ);
    const cy = Math.floor(worldY);

    const charMinX = pos.x - CHAR_HALF_X, charMaxX = pos.x + CHAR_HALF_X;
    const charMinY = pos.y, charMaxY = pos.y + CHAR_HEIGHT;
    const charMinZ = pos.z - CHAR_HALF_Z, charMaxZ = pos.z + CHAR_HALF_Z;

    return (
      cx < charMaxX && cx + 1 > charMinX &&
      cy < charMaxY && cy + 1 > charMinY &&
      cz < charMaxZ && cz + 1 > charMinZ
    );
  }

  dispose() {
    this._dom.removeEventListener('pointerdown', this._onPointerDown);
    this._dom.removeEventListener('pointermove', this._onPointerMove);
    this._dom.removeEventListener('pointerup', this._onPointerUp);
    this._dom.removeEventListener('contextmenu', this._onContextMenu);
  }
}

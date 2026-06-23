import * as THREE from 'three';
import { CameraController } from './CameraController.js';

/**
 * Scene navigation viewer.
 * Left-drag to orbit, right-drag to zoom, WASD to dolly, arrows to elevate.
 * Not character-following — the camera moves independently through the scene.
 */
export class OrbitController extends CameraController {
  constructor() {
    super();

    this.moveSpeed = 5;
    this.orbitSensitivity = 0.005;
    this.zoomSensitivity = 0.02;
    this.smoothSpeed = 8;

    this._center = new THREE.Vector3(0, 0, 0);
    this._spherical = new THREE.Spherical();
    this._targetSpherical = new THREE.Spherical();

    this._prevPointer = { x: 0, y: 0 };
    this._activeButton = null;

    this._keys = {};

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
  }

  enable(camera, domElement, character) {
    super.enable(camera, domElement, character);

    if (character) {
      this.rebaseOnCharacter(character);
    } else {
      // No character — use default position immediately
      camera.position.set(0, 5, 30);
      this._center.set(0, 0, 0);
      camera.lookAt(this._center);

      const offset = camera.position.clone().sub(this._center);
      this._spherical.setFromVector3(offset);
      this._targetSpherical.copy(this._spherical);
    }

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('contextmenu', this._onContextMenu);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  disable() {
    if (this.domElement) {
      this.domElement.removeEventListener('pointerdown', this._onPointerDown);
      this.domElement.removeEventListener('pointermove', this._onPointerMove);
      this.domElement.removeEventListener('pointerup', this._onPointerUp);
      this.domElement.removeEventListener('contextmenu', this._onContextMenu);
      this.domElement.removeEventListener('wheel', this._onWheel);
    }
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);

    this._keys = {};
    super.disable();
  }

  _onPointerDown(e) {
    this._activeButton = e.button;
    this._prevPointer.x = e.clientX;
    this._prevPointer.y = e.clientY;
  }

  _onPointerMove(e) {
    const dx = e.clientX - this._prevPointer.x;
    const dy = e.clientY - this._prevPointer.y;

    if (this._activeButton === 0) {
      this._targetSpherical.theta -= dx * this.orbitSensitivity;
      this._targetSpherical.phi = Math.max(
        0.1,
        Math.min(Math.PI - 0.1, this._targetSpherical.phi - dy * this.orbitSensitivity)
      );
    } else if (this._activeButton === 2) {
      this._targetSpherical.radius = Math.max(
        1,
        Math.min(50, this._targetSpherical.radius + dy * this.zoomSensitivity)
      );
    }

    this._prevPointer.x = e.clientX;
    this._prevPointer.y = e.clientY;
  }

  _onPointerUp(_e) {
    this._activeButton = null;
  }

  _onWheel(e) {
    e.preventDefault();
    this._targetSpherical.radius = Math.max(
      1,
      Math.min(50, this._targetSpherical.radius + e.deltaY * 0.01)
    );
  }

  _onKeyDown(e) {
    switch (e.code) {
      case 'KeyW': this._keys.w = true; break;
      case 'KeyA': this._keys.a = true; break;
      case 'KeyS': this._keys.s = true; break;
      case 'KeyD': this._keys.d = true; break;
      case 'ArrowUp':   this._keys.arrowUp = true;   e.preventDefault(); break;
      case 'ArrowDown': this._keys.arrowDown = true; e.preventDefault(); break;
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': this._keys.w = false; break;
      case 'KeyA': this._keys.a = false; break;
      case 'KeyS': this._keys.s = false; break;
      case 'KeyD': this._keys.d = false; break;
      case 'ArrowUp':   this._keys.arrowUp = false;   break;
      case 'ArrowDown': this._keys.arrowDown = false; break;
    }
  }

  _onBlur() {
    this._keys = {};
  }

  _onContextMenu(e) {
    e.preventDefault();
  }

  /**
   * Reposition the camera to center on the given character.
   * The camera is placed in front of the character (horizontal distance 50, vertical distance 10)
   * and looks at the character. Spherical coordinates are reset to match.
   * @param {object} character - the LegoCharacter instance
   */
  rebaseOnCharacter(character) {
    if (!this.camera || !character) return;

    this._center.copy(character.group.position);

    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(character.group.quaternion);
    forward.y = 0;
    forward.normalize();

    const camPos = this._center.clone().addScaledVector(forward, 50);
    camPos.y += 10;
    this.camera.position.copy(camPos);
    this.camera.lookAt(this._center);

    const offset = this.camera.position.clone().sub(this._center);
    this._spherical.setFromVector3(offset);
    this._targetSpherical.copy(this._spherical);
  }

  update(delta, _character) {
    if (!this.camera) return;

    const moveDelta = this.moveSpeed * delta;

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();

    const right = new THREE.Vector3(-forward.z, 0, forward.x);

    if (this._keys.w) this._center.addScaledVector(forward,  moveDelta);
    if (this._keys.s) this._center.addScaledVector(forward, -moveDelta);
    if (this._keys.d) this._center.addScaledVector(right,    moveDelta);
    if (this._keys.a) this._center.addScaledVector(right,   -moveDelta);

    if (this._keys.arrowUp)   this._center.y += moveDelta;
    if (this._keys.arrowDown) this._center.y -= moveDelta;

    const t = Math.min(1, this.smoothSpeed * delta);
    this._spherical.theta  += (this._targetSpherical.theta  - this._spherical.theta)  * t;
    this._spherical.phi    += (this._targetSpherical.phi    - this._spherical.phi)    * t;
    this._spherical.radius += (this._targetSpherical.radius - this._spherical.radius) * t;

    const offset = new THREE.Vector3().setFromSpherical(this._spherical);
    this.camera.position.copy(this._center).add(offset);
    this.camera.lookAt(this._center);
  }
}
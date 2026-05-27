import * as THREE from 'three';
import { CameraController } from './CameraController.js';

/**
 * Third-person follow camera (Minecraft-style).
 *
 * - Pointer lock on click, escape to unlock.
 * - Mouse left/right → rotates the character's Y rotation (yaw).
 *   The camera stays behind the character along the back direction.
 * - Mouse up/down → rotates the camera pitch (character unchanged).
 * - Camera always looks at the base point (center of the character's head).
 * - WASD movement is relative to the character's facing direction.
 * - Scroll wheel zooms in/out.
 */
export class FollowController extends CameraController {
  constructor() {
    super();

    // Configurable parameters
    this.distance = 5;          // default spherical radius from base point
    this.heightOffset = 1.6;    // head center Y offset from character position
    this.smoothSpeed = 5;       // lerp speed for camera smoothing
    this.mouseSensitivity = 0.002;

    // Spherical coordinates with smooth interpolation
    this._spherical = new THREE.Spherical(this.distance, Math.PI / 2, 0);
    this._targetSpherical = this._spherical.clone();

    // Camera orientation (yaw drives the character, pitch is camera-only)
    this._yaw = 0;
    this._pitch = 0;

    // Bound handlers
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onPointerLockError = this._onPointerLockError.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onWheel = this._onWheel.bind(this);
  }

  enable(camera, domElement) {
    super.enable(camera, domElement);

    // On first update() we'll read the character's current rotation
    this._needsYawInit = true;
    this._pitch = 0;
    this._spherical.set(this.distance, Math.PI / 2, 0);
    this._targetSpherical.copy(this._spherical);

    // Attach event listeners
    domElement.addEventListener('click', this._onClick);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('pointerlockerror', this._onPointerLockError);
  }

  disable() {
    // Exit pointer lock if active
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }

    if (this.domElement) {
      this.domElement.removeEventListener('click', this._onClick);
      this.domElement.removeEventListener('wheel', this._onWheel);
    }
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('pointerlockerror', this._onPointerLockError);

    super.disable();
  }

  _onWheel(e) {
    e.preventDefault();
    // Zoom in/out with scroll wheel
    this._targetSpherical.radius = Math.max(
      1,
      Math.min(20, this._targetSpherical.radius + e.deltaY * 0.01)
    );
  }

  _onClick() {
    if (this.domElement && document.pointerLockElement !== this.domElement) {
      this.domElement.requestPointerLock();
    }
  }

  _onMouseMove(e) {
    if (document.pointerLockElement !== this.domElement) return;

    const dx = e.movementX || 0;
    const dy = e.movementY || 0;

    // Horizontal mouse movement → yaw (rotate character and camera around Y)
    this._yaw -= dx * this.mouseSensitivity;

    // Vertical mouse movement → pitch (rotate camera up/down only)
    this._pitch -= dy * this.mouseSensitivity * 0.3;
    // Clamp pitch to avoid flipping
    // this._pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this._pitch));
    this._pitch = Math.max(-Math.PI / 2.1, Math.min(0, this._pitch));
  }

  _onPointerLockChange() {}

  _onPointerLockError() {}

  update(delta, character) {
    if (!this.camera || !character) return;

    // On first update, initialize yaw from the character's current facing direction
    if (this._needsYawInit) {
      this._yaw = character.group.rotation.y;
      this._needsYawInit = false;
    }

    // Rotate the character to face the yaw direction
    character.group.rotation.y = this._yaw;

    // Compute target spherical coordinates from yaw and pitch.
    // Camera is behind the character: theta = yaw + PI (opposite to facing direction).
    // Spherical phi = PI/2 + pitch (so pitch=0 → phi=PI/2 → horizontal).
    // Mouse up (+pitch) → phi toward PI → camera below head → look up.
    // Mouse down (-pitch) → phi toward 0 → camera above head → look down.
    this._targetSpherical.theta = this._yaw + Math.PI;
    this._targetSpherical.phi = Math.PI / 2 + this._pitch;

    // Smoothly interpolate spherical coordinates
    this._spherical.theta += (this._targetSpherical.theta - this._spherical.theta) * this.smoothSpeed * delta;
    this._spherical.phi += (this._targetSpherical.phi - this._spherical.phi) * this.smoothSpeed * delta;
    this._spherical.radius += (this._targetSpherical.radius - this._spherical.radius) * this.smoothSpeed * delta;

    // Base point = character position + head center (eye height)
    const center = new THREE.Vector3(
      character.group.position.x,
      character.group.position.y + this.heightOffset,
      character.group.position.z
    );

    // Compute camera position from spherical coordinates
    const offset = new THREE.Vector3();
    offset.setFromSpherical(this._spherical);
    const targetPos = center.clone().add(offset);

    this.camera.position.copy(targetPos);
    this.camera.lookAt(center);
  }
}
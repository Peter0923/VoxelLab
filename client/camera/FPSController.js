import * as THREE from 'three';
import { CameraController } from './CameraController.js';

/**
 * First-person camera controller (Minecraft-style).
 *
 * - Mouse left/right → rotates the character's Y rotation (yaw).
 *   The camera yaw follows the character so they stay in sync.
 * - Mouse up/down → rotates the camera pitch only (character unchanged).
 * - Camera sits at the character's eye position (center X/Z, no forward offset)
 *   so it stays within the character's collision bounding box and never clips
 *   into blocks even when pressed against a wall.
 * - WASD movement is relative to the character's facing direction.
 */
export class FPSController extends CameraController {
  constructor() {
    super();

    // Configurable
    this.eyeHeight = 1.45; // eye Y position (from LegoCharacter geometry)
    this.mouseSensitivity = 0.002;

    // Camera orientation
    this._yaw = 0;    // rotation around Y (horizontal look)
    this._pitch = 0;  // rotation around X (vertical look)

    // Track the active character so we can hide/show face meshes
    this._activeCharacter = null;

    // Crosshair element
    this._crosshair = null;

    // Bound handlers
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onPointerLockError = this._onPointerLockError.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onWheel = this._onWheel.bind(this);
  }

  enable(camera, domElement) {
    super.enable(camera, domElement);

    // Don't reset yaw here — we don't have the character yet.
    // Instead, on the first update() we'll read the character's current rotation.
    this._needsYawInit = true;
    this._pitch = 0;

    // Create crosshair overlay
    this._createCrosshair();

    // Attach pointer lock event listeners
    domElement.addEventListener('click', this._onClick);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('pointerlockerror', this._onPointerLockError);
  }

  disable() {
    // Restore face meshes visibility before leaving
    this._setFaceVisibility(this._activeCharacter, true);
    this._activeCharacter = null;

    // Remove crosshair
    this._removeCrosshair();

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
    this._pitch -= dy * this.mouseSensitivity;
    // Clamp pitch to avoid flipping
    this._pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this._pitch));
  }

  _onPointerLockChange() {
    if (!this._crosshair) return;
    const locked = document.pointerLockElement === this.domElement;
    this._crosshair.style.display = locked ? '' : 'none';
  }

  _onPointerLockError() {}

  _createCrosshair() {
    if (this._crosshair) return;

    const el = document.createElement('div');
    el.id = 'fps-crosshair';
    el.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
      z-index: 1000;
    `;
    el.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20">
        <line x1="10" y1="2" x2="10" y2="8" stroke="rgba(255,215,0,0.8)" stroke-width="2"/>
        <line x1="10" y1="12" x2="10" y2="18" stroke="rgba(255,215,0,0.8)" stroke-width="2"/>
        <line x1="2" y1="10" x2="8" y2="10" stroke="rgba(255,215,0,0.8)" stroke-width="2"/>
        <line x1="12" y1="10" x2="18" y2="10" stroke="rgba(255,215,0,0.8)" stroke-width="2"/>
        <circle cx="10" cy="10" r="1.5" fill="rgba(255,215,0,0.9)"/>
      </svg>
    `;

    // Hidden until pointer is locked
    el.style.display = 'none';

    document.body.appendChild(el);
    this._crosshair = el;
  }

  _removeCrosshair() {
    if (this._crosshair) {
      this._crosshair.remove();
      this._crosshair = null;
    }
  }

  _setFaceVisibility(character, visible) {
    if (!character) return;
    if (character.faceMeshes) {
      for (const mesh of character.faceMeshes) {
        mesh.visible = visible;
      }
    }
    if (character.hairMeshes) {
      for (const mesh of character.hairMeshes) {
        mesh.visible = visible;
      }
    }
  }

  update(delta, character) {
    if (!this.camera || !character) return;

    // On first update, initialize yaw from the character's current facing direction
    if (this._needsYawInit) {
      this._yaw = character.group.rotation.y;
      this._needsYawInit = false;
    }

    // Hide face meshes (eyes, smile) when FPS is active so they don't obstruct the view
    if (this._activeCharacter !== character) {
      this._setFaceVisibility(this._activeCharacter, true);
      this._activeCharacter = character;
      this._setFaceVisibility(this._activeCharacter, false);
    }

    // 1. Rotate the character to face the yaw direction
    character.group.rotation.y = this._yaw;

    // 2. Position camera at character's eye level with a small forward offset.
    //    The offset lets the player see the character's feet when looking down.
    //    It is kept small (0.25) to stay well within the collision AABB
    //    (CHAR_HALF_Z=0.4, CHAR_HALF_X=0.6) so the camera never clips into
    //    blocks when pressed against a wall.
    const charPos = character.group.position;
    const forward = new THREE.Vector3(0, 0, 1)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), this._yaw);
    const forwardOffset = 0.25;
    this.camera.position.set(
      charPos.x + forward.x * forwardOffset,
      charPos.y + this.eyeHeight,
      charPos.z + forward.z * forwardOffset
    );

    // 4. Apply camera rotation: yaw first (YXZ order), then pitch.
    //    Three.js default camera looks down -Z, but the character faces +Z.
    //    So we offset the yaw by Math.PI so yaw=0 means looking in +Z direction.
    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this._pitch, this._yaw + Math.PI, 0, 'YXZ')
    );
  }
}

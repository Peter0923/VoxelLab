import * as THREE from 'three';

// --- Shared geometries (singletons to reduce GPU memory) ---
const GEO_TORSO = new THREE.BoxGeometry(0.7, 0.6, 0.4);
const GEO_HEAD = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const GEO_ARM = new THREE.BoxGeometry(0.2, 0.5, 0.2);
const GEO_LEG = new THREE.BoxGeometry(0.24, 0.45, 0.24);

/** Shared geometries that should NOT be disposed per-model. */
const _sharedGeos = new Set([GEO_TORSO, GEO_HEAD, GEO_ARM, GEO_LEG]);

/**
 * A simple box-based player model for remote players.
 *
 * Composed of basic Three.js primitives (BoxGeometry, SphereGeometry)
 * with direct pivot rotation for walk/idle animation.
 * No AnimationMixer dependency — all animation is manual math.
 *
 * Geometries are shared across all instances to reduce GPU memory.
 *
 * Features:
 * - Torso (colored box), head (skin-toned box), arms, legs with pivot joints
 * - Floating nametag sprite above head
 * - Walk animation: swinging arms/legs with body bob
 * - Idle animation: subtle breathing bob
 */
export class RemotePlayerModel {
  /**
   * @param {string} name - Player's display name
   * @param {{r:number,g:number,b:number}} color - Body color
   */
  constructor(name, color) {
    /** Root group — position this to move the model */
    this.group = new THREE.Group();

    /** Player name for nametag */
    this._name = name;

    // Animation state
    this._walkTimer = 0;
    this._walkSpeed = 0;  // 0 = idle, 1 = walking
    this._targetWalkSpeed = 0;

    // --- Colors ---
    const skinColor = 0xfdd9b5;
    const bodyColor = new THREE.Color(color.r, color.g, color.b);
    const pantsColor = new THREE.Color(color.r * 0.5, color.g * 0.5, color.b * 0.7);

    // Ground offset (same as LegoCharacter)
    const groundOffset = -0.25;

    // --- Torso ---
    const torsoMat = new THREE.MeshStandardMaterial({ color: bodyColor });
    const torso = new THREE.Mesh(GEO_TORSO, torsoMat);
    torso.position.y = 1.1 + groundOffset;
    torso.castShadow = true;
    this.group.add(torso);

    // --- Head ---
    const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
    this._head = new THREE.Mesh(GEO_HEAD, headMat);
    this._head.position.y = 1.6 + groundOffset;
    this._head.castShadow = true;
    this.group.add(this._head);

    // --- Nametag ---
    this._nametag = this._createNametag(name);
    this.group.add(this._nametag);

    // --- Arms ---
    const armMat = new THREE.MeshStandardMaterial({ color: skinColor });

    this._leftArmPivot = new THREE.Group();
    this._leftArmPivot.position.set(-0.5, 1.25 + groundOffset, 0);
    this.group.add(this._leftArmPivot);
    const leftArm = new THREE.Mesh(GEO_ARM, armMat);
    leftArm.position.y = -0.25;
    leftArm.castShadow = true;
    this._leftArmPivot.add(leftArm);

    this._rightArmPivot = new THREE.Group();
    this._rightArmPivot.position.set(0.5, 1.25 + groundOffset, 0);
    this.group.add(this._rightArmPivot);
    const rightArm = new THREE.Mesh(GEO_ARM, armMat);
    rightArm.position.y = -0.25;
    rightArm.castShadow = true;
    this._rightArmPivot.add(rightArm);

    // --- Legs ---
    const legMat = new THREE.MeshStandardMaterial({ color: pantsColor });

    this._leftLegPivot = new THREE.Group();
    this._leftLegPivot.position.set(-0.2, 0.8 + groundOffset, 0);
    this.group.add(this._leftLegPivot);
    const leftLeg = new THREE.Mesh(GEO_LEG, legMat);
    leftLeg.position.y = -0.225;
    leftLeg.castShadow = true;
    this._leftLegPivot.add(leftLeg);

    this._rightLegPivot = new THREE.Group();
    this._rightLegPivot.position.set(0.2, 0.8 + groundOffset, 0);
    this.group.add(this._rightLegPivot);
    const rightLeg = new THREE.Mesh(GEO_LEG, legMat);
    rightLeg.position.y = -0.225;
    rightLeg.castShadow = true;
    this._rightLegPivot.add(rightLeg);

    // --- Visual group for body bob ---
    this._visualGroup = new THREE.Group();
    // Move torso, head, arms, nametag into visual group for bobbing
    this.group.remove(torso);
    this.group.remove(this._head);
    this.group.remove(this._nametag);
    this.group.remove(this._leftArmPivot);
    this.group.remove(this._rightArmPivot);
    this._visualGroup.add(torso);
    this._visualGroup.add(this._head);
    this._visualGroup.add(this._nametag);
    this._visualGroup.add(this._leftArmPivot);
    this._visualGroup.add(this._rightArmPivot);
    this.group.add(this._visualGroup);
  }

  /**
   * Create a floating nametag sprite.
   * @param {string} name
   * @returns {THREE.Sprite}
   */
  _createNametag(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.roundRect(20, 8, 216, 48, 12);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(0, 2.3, 0);
    sprite.scale.set(1.5, 0.375, 1);

    return sprite;
  }

  /**
   * Update the nametag text.
   * @param {string} name
   */
  setNametag(name) {
    this._name = name;
    // Rebuild texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.roundRect(20, 8, 216, 48, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this._nametag.material.map.dispose();
    this._nametag.material.map = texture;
    this._nametag.material.needsUpdate = true;
  }

  /**
   * Set the walk speed target (0 = idle, 1 = full walk).
   * Smoothly interpolated in update().
   * @param {number} speed - 0 to 1
   */
  setWalkSpeed(speed) {
    this._targetWalkSpeed = Math.max(0, Math.min(1, speed));
  }

  /**
   * Update animations. Call every frame.
   * @param {number} delta - Frame delta time in seconds
   */
  update(delta) {
    // Smooth walk speed transition
    const lerpSpeed = 8;
    this._walkSpeed += (this._targetWalkSpeed - this._walkSpeed) * Math.min(lerpSpeed * delta, 1);

    this._walkTimer += delta;

    const walkFreq = 1; // Hz of walk cycle (matches LegoCharacter 1s clip duration)
    const walkPhase = this._walkTimer * walkFreq * Math.PI * 2;

    if (this._walkSpeed > 0.01) {
      // Walk animation
      const swing = Math.sin(walkPhase) * 0.8 * this._walkSpeed;
      this._leftLegPivot.rotation.x = swing;
      this._rightLegPivot.rotation.x = -swing;
      this._leftArmPivot.rotation.x = -swing * 0.75;
      this._rightArmPivot.rotation.x = swing * 0.75;

      // Body bob
      const bob = Math.abs(Math.cos(walkPhase)) * 0.04 * this._walkSpeed;
      this._visualGroup.position.y = bob;
    } else {
      // Idle: return limbs to rest
      const returnSpeed = 6 * delta;
      this._leftLegPivot.rotation.x += (0 - this._leftLegPivot.rotation.x) * returnSpeed;
      this._rightLegPivot.rotation.x += (0 - this._rightLegPivot.rotation.x) * returnSpeed;
      this._leftArmPivot.rotation.x += (0 - this._leftArmPivot.rotation.x) * returnSpeed;
      this._rightArmPivot.rotation.x += (0 - this._rightArmPivot.rotation.x) * returnSpeed;

      // Subtle breathing bob
      const breathe = Math.sin(this._walkTimer * 1.5) * 0.005;
      this._visualGroup.position.y = breathe;
    }
  }

  /**
   * Clean up resources. Shared geometries are preserved for other instances.
   */
  dispose() {
    this.group.traverse((child) => {
      if (child.geometry && !_sharedGeos.has(child.geometry)) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }
}

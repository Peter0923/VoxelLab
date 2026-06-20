import * as THREE from 'three';

// --- Shared geometries (singletons to reduce GPU memory) ---
const GEO_TORSO = new THREE.BoxGeometry(0.7, 0.6, 0.4);
const GEO_HEAD = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const GEO_ARM = new THREE.BoxGeometry(0.2, 0.5, 0.2);
const GEO_LEG = new THREE.BoxGeometry(0.24, 0.45, 0.24);
const GEO_SHOE = new THREE.BoxGeometry(0.26, 0.12, 0.36);
const GEO_HAND = new THREE.SphereGeometry(0.1, 8, 8);

/** Shared geometries that should NOT be disposed per-model. */
const _sharedGeos = new Set([GEO_TORSO, GEO_HEAD, GEO_ARM, GEO_LEG, GEO_SHOE, GEO_HAND]);

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
   * @param {object} [colors] - Preset colors {shirt, pants, shoes, skin, hair}
   */
  constructor(name, colors) {
    /** Root group — position this to move the model */
    this.group = new THREE.Group();

    /** Player name for nametag */
    this._name = name;

    // Animation state
    this._walkTimer = 0;
    this._walkSpeed = 0;  // 0 = idle, 1 = walking
    this._targetWalkSpeed = 0;

    // --- Resolve colors (default to classic preset if none provided) ---
    const c = colors || {
      shirt: { r: 0.800, g: 0.133, b: 0.133 },
      pants: { r: 0.133, g: 0.267, b: 0.667 },
      shoes: { r: 0.133, g: 0.133, b: 0.133 },
      skin:  { r: 0.992, g: 0.851, b: 0.710 },
      hair:  { r: 0.333, g: 0.200, b: 0.067 },
    };
    const bodyColor = new THREE.Color(c.shirt.r, c.shirt.g, c.shirt.b);
    const skinColor = new THREE.Color(c.skin.r, c.skin.g, c.skin.b);
    const pantsColor = new THREE.Color(c.pants.r, c.pants.g, c.pants.b);
    const shoeColor = new THREE.Color(c.shoes.r, c.shoes.g, c.shoes.b);
    const hairColor = new THREE.Color(c.hair.r, c.hair.g, c.hair.b);

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

    // --- Hair ---
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });

    const topHair = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 16), hairMat);
    topHair.position.set(0, 1.95 + groundOffset, -0.04);
    this.group.add(topHair);

    const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.12), hairMat);
    backHair.position.set(0, 1.6 + groundOffset, -0.38);
    this.group.add(backHair);

    const sideHairL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.4), hairMat);
    sideHairL.position.set(-0.36, 1.6 + groundOffset, -0.08);
    this.group.add(sideHairL);

    const sideHairR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.4), hairMat);
    sideHairR.position.set(0.36, 1.6 + groundOffset, -0.08);
    this.group.add(sideHairR);

    // Store hair meshes so they can be referenced
    this._hairMeshes = [topHair, backHair, sideHairL, sideHairR];

    // --- Eyes ---
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const eyeGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.16, 1.7 + groundOffset, 0.31);
    this.group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.16, 1.7 + groundOffset, 0.31);
    this.group.add(eyeR);

    // --- Smile ---
    const smileMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const smileGeo = new THREE.TorusGeometry(0.08, 0.016, 6, 12, Math.PI);
    const smile = new THREE.Mesh(smileGeo, smileMat);
    smile.position.set(0, 1.55 + groundOffset, 0.31);
    smile.rotation.x = Math.PI;
    this.group.add(smile);

    this._faceMeshes = [eyeL, eyeR, smile];

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

    // Left hand (sphere at end of arm)
    const handMat = new THREE.MeshStandardMaterial({ color: skinColor });
    const leftHand = new THREE.Mesh(GEO_HAND, handMat);
    leftHand.position.set(0, -0.5, 0);
    this._leftArmPivot.add(leftHand);

    this._rightArmPivot = new THREE.Group();
    this._rightArmPivot.position.set(0.5, 1.25 + groundOffset, 0);
    this.group.add(this._rightArmPivot);
    const rightArm = new THREE.Mesh(GEO_ARM, armMat);
    rightArm.position.y = -0.25;
    rightArm.castShadow = true;
    this._rightArmPivot.add(rightArm);

    // Right hand (sphere at end of arm)
    const rightHand = new THREE.Mesh(GEO_HAND, handMat);
    rightHand.position.set(0, -0.5, 0);
    this._rightArmPivot.add(rightHand);

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

    // --- Shoes ---
    const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor });

    const leftShoe = new THREE.Mesh(GEO_SHOE, shoeMat);
    leftShoe.position.set(0, -0.49, 0.05);
    this._leftLegPivot.add(leftShoe);

    const rightShoe = new THREE.Mesh(GEO_SHOE, shoeMat);
    rightShoe.position.set(0, -0.49, 0.05);
    this._rightLegPivot.add(rightShoe);

    // Store shoes for disposal tracking
    this._shoes = [leftShoe, rightShoe];

    // --- Visual group for body bob ---
    this._visualGroup = new THREE.Group();
    // Move torso, head, hair, face, nametag, arms into visual group for bobbing
    this.group.remove(torso);
    this.group.remove(this._head);
    this.group.remove(this._nametag);
    this.group.remove(this._leftArmPivot);
    this.group.remove(this._rightArmPivot);
    for (const mesh of this._hairMeshes) this.group.remove(mesh);
    for (const mesh of this._faceMeshes) this.group.remove(mesh);
    this._visualGroup.add(torso);
    this._visualGroup.add(this._head);
    this._visualGroup.add(this._nametag);
    this._visualGroup.add(this._leftArmPivot);
    this._visualGroup.add(this._rightArmPivot);
    for (const mesh of this._hairMeshes) this._visualGroup.add(mesh);
    for (const mesh of this._faceMeshes) this._visualGroup.add(mesh);
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

import * as THREE from 'three';

/**
 * Creates a lego minifigure with built-in animations:
 * - idle, walkForward, walkBackward, walkLeft, walkRight, jump
 */
/**
 * Convert {r,g,b} float (0-1) to hex number for Three.js color.
 * @param {{r:number,g:number,b:number}} c
 * @returns {number} 0xRRGGBB
 */
function rgbToHex(c) {
  if (c === undefined || c === null) return 0xfdd9b5;
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return (r << 16) | (g << 8) | b;
}

export class LegoCharacter {
  /**
   * @param {object} [colors] - Optional preset colors {shirt, pants, shoes, skin, hair}
   */
  constructor(colors) {
    this.group = new THREE.Group();
    this.mixer = null;
    this.animations = {};
    this.currentAction = null;
    this._colors = colors || null;
    this._build();
    this._createAnimations();
  }

  _build() {
    this.visualGroup = new THREE.Group();
    this.visualGroup.name = 'visual';
    this.group.add(this.visualGroup);
    const group = this.visualGroup;

    // --- Colors (from preset or defaults) ---
    const skinColor = this._colors ? rgbToHex(this._colors.skin) : 0xfdd9b5;
    const pantsColor = this._colors ? rgbToHex(this._colors.pants) : 0x2244aa;
    const shirtColor = this._colors ? rgbToHex(this._colors.shirt) : 0xcc2222;
    const shoeColor = this._colors ? rgbToHex(this._colors.shoes) : 0x222222;
    const hairHex = this._colors ? rgbToHex(this._colors.hair) : 0x553311;

    // Offset so feet touch y=0 ground plane.
    // Feet bottom is at y=0.25 relative to group, so shift everything down by 0.25.
    const groundOffset = -0.25;

    // --- Head ---
    const headGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.6 + groundOffset;
    head.castShadow = true;
    group.add(head);

    // Hair on top and back of head
    const hairMat = new THREE.MeshStandardMaterial({ color: hairHex });

    // Top hair — cylinder piece like a lego hair accessory
    const topHair = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.15, 16), hairMat);
    topHair.position.set(0, 2.08 + groundOffset, -0.05);
    group.add(topHair);

    // Back hair (covers the back of the head)
    const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.15), hairMat);
    backHair.position.set(0, 1.7 + groundOffset, -0.48);
    group.add(backHair);

    // Side hair left
    const sideHairL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.5), hairMat);
    sideHairL.position.set(-0.46, 1.7 + groundOffset, -0.1);
    group.add(sideHairL);

    // Side hair right
    const sideHairR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.5), hairMat);
    sideHairR.position.set(0.46, 1.7 + groundOffset, -0.1);
    group.add(sideHairR);

    // Store hair meshes so they can be hidden in FPS mode
    this.hairMeshes = [topHair, backHair, sideHairL, sideHairR];

    // Eyes (two small spheres) — front only, character always faces forward
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.2, 1.7 + groundOffset, 0.41);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.2, 1.7 + groundOffset, 0.41);
    group.add(eyeR);

    // Smile (a small torus arc) — lies in the XY plane (the face plane).
    // The default torus arc opens downward (like a frown ∩), so we rotate
    // it by PI around X to flip it upward into a smile ∪.
    const smileMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const smileGeo = new THREE.TorusGeometry(0.1, 0.02, 6, 12, Math.PI);
    const smile = new THREE.Mesh(smileGeo, smileMat);
    smile.position.set(0, 1.55 + groundOffset, 0.41);
    smile.rotation.x = Math.PI;
    group.add(smile);

    // --- Body ---
    const bodyGeo = new THREE.BoxGeometry(0.7, 0.6, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: shirtColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.1 + groundOffset;
    body.castShadow = true;
    group.add(body);

    // --- Arms ---
    const armGeo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const armMat = new THREE.MeshStandardMaterial({ color: skinColor });

    // Left arm pivot
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.name = 'leftArmPivot';
    this.leftArmPivot.position.set(-0.5, 1.25 + groundOffset, 0);
    group.add(this.leftArmPivot);

    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.y = -0.25;
    leftArm.castShadow = true;
    this.leftArmPivot.add(leftArm);

    // Right arm pivot
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.name = 'rightArmPivot';
    this.rightArmPivot.position.set(0.5, 1.25 + groundOffset, 0);
    group.add(this.rightArmPivot);

    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.y = -0.25;
    rightArm.castShadow = true;
    this.rightArmPivot.add(rightArm);

    // --- Hands (attached to arm pivots so they move with the arms) ---
    const handGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const handMat = new THREE.MeshStandardMaterial({ color: skinColor });

    const leftHand = new THREE.Mesh(handGeo, handMat);
    leftHand.position.set(0, -0.5, 0);
    this.leftArmPivot.add(leftHand);

    const rightHand = new THREE.Mesh(handGeo, handMat);
    rightHand.position.set(0, -0.5, 0);
    this.rightArmPivot.add(rightHand);

    // --- Legs ---
    const legGeo = new THREE.BoxGeometry(0.24, 0.45, 0.24);
    const legMat = new THREE.MeshStandardMaterial({ color: pantsColor });

    // Left leg pivot
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.name = 'leftLegPivot';
    this.leftLegPivot.position.set(-0.2, 0.8 + groundOffset, 0);
    group.add(this.leftLegPivot);

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.y = -0.225;
    leftLeg.castShadow = true;
    this.leftLegPivot.add(leftLeg);

    // Left shoe
    const shoeGeo = new THREE.BoxGeometry(0.26, 0.12, 0.36);
    const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor });
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.49, 0.05);
    this.leftLegPivot.add(leftShoe);

    // Right leg pivot
    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.name = 'rightLegPivot';
    this.rightLegPivot.position.set(0.2, 0.8 + groundOffset, 0);
    group.add(this.rightLegPivot);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.y = -0.225;
    rightLeg.castShadow = true;
    this.rightLegPivot.add(rightLeg);

    // Right shoe
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.49, 0.05);
    this.rightLegPivot.add(rightShoe);

    this.faceMeshes = [eyeL, eyeR, smile];
  }

  _createAnimations() {
    this.mixer = new THREE.AnimationMixer(this.group);

    // Helper: create a number keyframe track
    const track = (name, times, values) => {
      return new THREE.NumberKeyframeTrack(name, times, values);
    };

    // --- IDLE (subtle breathing) ---
    {
      const times = [0, 0.5, 1];
      const tracks = [
        track('visual.position[y]', times, [0, 0.005, 0]),
      ];
      const clip = new THREE.AnimationClip('idle', 1, tracks);
      this.animations.idle = clip;
    }

    // --- WALK FORWARD ---
    // Big, clear leg and arm swing
    {
      const times = [0, 0.25, 0.5, 0.75, 1];
      const tracks = [
        // Left leg: push back (+rot) → swing forward (-rot)
        track('leftLegPivot.rotation[x]', times, [0.8, -0.8, 0.8, -0.8, 0.8]),
        // Right leg: swing forward (-rot) → push back (+rot)
        track('rightLegPivot.rotation[x]', times, [-0.8, 0.8, -0.8, 0.8, -0.8]),
        // Arms swing opposite to legs
        track('leftArmPivot.rotation[x]', times, [-0.6, 0.6, -0.6, 0.6, -0.6]),
        track('rightArmPivot.rotation[x]', times, [0.6, -0.6, 0.6, -0.6, 0.6]),
        // Body bob
        track('visual.position[y]', times, [0, 0.06, 0, 0.06, 0]),
      ];
      const clip = new THREE.AnimationClip('walkForward', 1.0, tracks);
      this.animations.walkForward = clip;
    }

    // --- WALK BACKWARD ---
    {
      const times = [0, 0.25, 0.5, 0.75, 1];
      const tracks = [
        track('leftLegPivot.rotation[x]', times, [-0.8, 0.8, -0.8, 0.8, -0.8]),
        track('rightLegPivot.rotation[x]', times, [0.8, -0.8, 0.8, -0.8, 0.8]),
        track('leftArmPivot.rotation[x]', times, [0.6, -0.6, 0.6, -0.6, 0.6]),
        track('rightArmPivot.rotation[x]', times, [-0.6, 0.6, -0.6, 0.6, -0.6]),
        track('visual.position[y]', times, [0, 0.06, 0, 0.06, 0]),
      ];
      const clip = new THREE.AnimationClip('walkBackward', 1.0, tracks);
      this.animations.walkBackward = clip;
    }

    // --- WALK LEFT (sidestep) ---
    {
      const times = [0, 0.25, 0.5, 0.75, 1];
      const tracks = [
        // Legs spread and close (rotation around Z)
        track('leftLegPivot.rotation[z]', times, [0, 0.3, 0, 0.3, 0]),
        track('rightLegPivot.rotation[z]', times, [0, -0.3, 0, -0.3, 0]),
        // Arms spread for balance
        track('leftArmPivot.rotation[z]', times, [0, -0.2, 0, -0.2, 0]),
        track('rightArmPivot.rotation[z]', times, [0, 0.2, 0, 0.2, 0]),
        track('visual.position[y]', times, [0, 0.03, 0, 0.03, 0]),
      ];
      const clip = new THREE.AnimationClip('walkLeft', 1.0, tracks);
      this.animations.walkLeft = clip;
    }

    // --- WALK RIGHT (sidestep) ---
    {
      const times = [0, 0.25, 0.5, 0.75, 1];
      const tracks = [
        track('leftLegPivot.rotation[z]', times, [0, -0.3, 0, -0.3, 0]),
        track('rightLegPivot.rotation[z]', times, [0, 0.3, 0, 0.3, 0]),
        track('leftArmPivot.rotation[z]', times, [0, 0.2, 0, 0.2, 0]),
        track('rightArmPivot.rotation[z]', times, [0, -0.2, 0, -0.2, 0]),
        track('visual.position[y]', times, [0, 0.03, 0, 0.03, 0]),
      ];
      const clip = new THREE.AnimationClip('walkRight', 1.0, tracks);
      this.animations.walkRight = clip;
    }

    // --- JUMP ---
    // Note: vertical movement is handled by physics (gravity).
    // This animation only does visual squash/stretch and limb poses.
    {
      const times = [0, 0.15, 0.4, 0.7, 1];
      const tracks = [
        // Squash at start (anticipation) and end (landing)
        track('visual.scale[y]', times, [1, 0.85, 1, 0.85, 1]),
        track('visual.scale[x]', times, [1, 1.08, 1, 1.08, 1]),
        track('visual.scale[z]', times, [1, 1.08, 1, 1.08, 1]),
        // Arms go up during jump
        track('leftArmPivot.rotation[x]', times, [0, -1.2, -1.2, -1.2, 0]),
        track('rightArmPivot.rotation[x]', times, [0, -1.2, -1.2, -1.2, 0]),
        // Legs tuck slightly
        track('leftLegPivot.rotation[x]', times, [0, 0.3, 0.3, 0.3, 0]),
        track('rightLegPivot.rotation[x]', times, [0, -0.3, -0.3, -0.3, 0]),
      ];
      const clip = new THREE.AnimationClip('jump', 0.6, tracks);
      this.animations.jump = clip;
    }
  }

  /**
   * Play an animation by name.
   * @param {string} name - 'idle', 'walkForward', 'walkBackward', 'walkLeft', 'walkRight', 'jump'
   * @param {number} [fadeTime=0.15] - crossfade duration in seconds
   */
  play(name, fadeTime = 0.15) {
    const clip = this.animations[name];
    if (!clip) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(fadeTime);
    }

    const action = this.mixer.clipAction(clip);
    action.reset();
    action.fadeIn(fadeTime);
    action.play();
    this.currentAction = action;
  }

  update(delta) {
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }

  /**
   * Swap to a different color preset and rebuild the character mesh.
   * Called during character selection preview or on game start.
   * @param {object} colors - Preset colors {shirt, pants, shoes, skin, hair}
   */
  setColors(colors) {
    // Remove old visual group and dispose its resources
    if (this.visualGroup) {
      this.visualGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      this.group.remove(this.visualGroup);
      this.visualGroup = null;
    }

    // Set new colors and rebuild
    this._colors = colors;
    this._build();

    // Rebuild animations (replaces old mixer)
    this._createAnimations();
    this.currentAction = null;
    this.play('idle');
  }
}

export class InputManager {
  constructor() {
    this._keys = {
      w: false, a: false, s: false, d: false, space: false,
      enter: false, escape: false,
    };

    // One-shot key tracking: consumeKey() reads and clears these
    this._justPressed = { enter: false, escape: false };

    this._onKeyDown = (e) => {
      // When a modifier key is pressed, reset all tracked keys.
      // Browsers stop sending keyup for held keys when a modifier is
      // pressed, which would leave movement keys stuck "on".
      if (e.code === 'MetaLeft' || e.code === 'MetaRight' ||
          e.code === 'ControlLeft' || e.code === 'ControlRight' ||
          e.code === 'AltLeft' || e.code === 'AltRight') {
        this._resetKeys();
        return;
      }

      // Prevent default for game keys to avoid browser shortcuts
      switch (e.code) {
        case 'KeyW': this._keys.w = true; break;
        case 'KeyA': this._keys.a = true; break;
        case 'KeyS': this._keys.s = true; break;
        case 'KeyD': this._keys.d = true; break;
        case 'Space':
          this._keys.space = true;
          e.preventDefault();
          break;
        case 'Enter':
          if (!this._keys.enter) {
            this._justPressed.enter = true;
          }
          this._keys.enter = true;
          e.preventDefault();
          break;
        case 'Escape':
          if (!this._keys.escape) {
            this._justPressed.escape = true;
          }
          this._keys.escape = true;
          break;
      }
    };

    this._onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': this._keys.w = false; break;
        case 'KeyA': this._keys.a = false; break;
        case 'KeyS': this._keys.s = false; break;
        case 'KeyD': this._keys.d = false; break;
        case 'Space': this._keys.space = false; break;
        case 'Enter': this._keys.enter = false; break;
        case 'Escape': this._keys.escape = false; break;
      }
    };

    this._onBlur = () => this._resetKeys();
    this._onVisibilityChange = () => {
      if (document.hidden) this._resetKeys();
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  _resetKeys() {
    for (const key of Object.keys(this._keys)) {
      this._keys[key] = false;
    }
  }

  /**
   * Check if a key is currently held down.
   * @param {string} key - 'w', 'a', 's', 'd', 'space', 'enter', 'escape'
   * @returns {boolean}
   */
  isDown(key) {
    return this._keys[key] === true;
  }

  /**
   * Get the movement-relevant input state for network serialization.
   * Used to send to the server for CSP.
   * @returns {{w:boolean, a:boolean, s:boolean, d:boolean, space:boolean}}
   */
  getInputState() {
    return {
      w: this._keys.w,
      a: this._keys.a,
      s: this._keys.s,
      d: this._keys.d,
      space: this._keys.space,
    };
  }

  /**
   * Check if a key was just pressed this frame and consume the event.
   * One-shot: returns true only once per press.
   * Supports: 'enter', 'escape'
   * @param {string} key
   * @returns {boolean}
   */
  consumeKey(key) {
    if (this._justPressed[key]) {
      this._justPressed[key] = false;
      return true;
    }
    return false;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }
}

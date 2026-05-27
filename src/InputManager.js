export class InputManager {
  constructor() {
    this._keys = { w: false, a: false, s: false, d: false, space: false };

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

      switch (e.code) {
        case 'KeyW': this._keys.w = true; break;
        case 'KeyA': this._keys.a = true; break;
        case 'KeyS': this._keys.s = true; break;
        case 'KeyD': this._keys.d = true; break;
        case 'Space': this._keys.space = true; e.preventDefault(); break;
      }
    };

    this._onKeyUp = (e) => {
      switch (e.code) {
        case 'KeyW': this._keys.w = false; break;
        case 'KeyA': this._keys.a = false; break;
        case 'KeyS': this._keys.s = false; break;
        case 'KeyD': this._keys.d = false; break;
        case 'Space': this._keys.space = false; break;
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
    this._keys.w = false;
    this._keys.a = false;
    this._keys.s = false;
    this._keys.d = false;
    this._keys.space = false;
  }

  isDown(key) {
    return this._keys[key] === true;
  }

  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }
}

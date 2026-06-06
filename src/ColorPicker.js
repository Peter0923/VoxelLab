/**
 * A fixed-position color palette overlay (15×2 grid of 30 colors).
 * Shows/hides via GUI toggle. The user can click a cell to select a color
 * (highlighted with a border) or click it again to deselect (reverting to random).
 */
export class ColorPicker {
  /**
   * @param {HTMLElement} canvas - the renderer canvas (for positioning reference)
   */
  constructor(canvas) {
    this._selected = null; // { r, g, b } or null
    this._visible = false;

    // Build the palette DOM
    this._el = document.createElement('div');
    this._el.id = 'color-palette';

    // Generate 30 colors (15 cols × 2 rows)
    const colors = this._generateColors();

    this._cells = [];
    for (let i = 0; i < colors.length; i++) {
      const { r, g, b, hex } = colors[i];
      const cell = document.createElement('div');
      cell.className = 'color-cell';
      cell.style.backgroundColor = hex;
      cell.dataset.r = r;
      cell.dataset.g = g;
      cell.dataset.b = b;

      cell.addEventListener('click', () => {
        const cr = parseFloat(cell.dataset.r);
        const cg = parseFloat(cell.dataset.g);
        const cb = parseFloat(cell.dataset.b);

        if (this._selected &&
            this._selected.r === cr &&
            this._selected.g === cg &&
            this._selected.b === cb) {
          // Clicking the same cell again → deselect
          this._selected = null;
        } else {
          this._selected = { r: cr, g: cg, b: cb };
        }
        this._updateHighlight();
      });

      this._el.appendChild(cell);
      this._cells.push(cell);
    }

    // Style the container
    const style = document.createElement('style');
    style.textContent = `
      #color-palette {
        position: fixed;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        display: grid;
        grid-template-columns: repeat(15, 30px);
        grid-template-rows: repeat(2, 30px);
        gap: 2px;
        padding: 6px;
        background: rgba(0, 0, 0, 0.55);
        border-radius: 8px;
        z-index: 1000;
        pointer-events: auto;
        display: none;
      }
      #color-palette.visible {
        display: grid !important;
      }
      .color-cell {
        width: 30px;
        height: 30px;
        border-radius: 3px;
        cursor: pointer;
        border: 2px solid transparent;
        box-sizing: border-box;
        transition: border-color 0.15s, transform 0.15s;
      }
      .color-cell:hover {
        transform: scale(1.15);
        z-index: 1;
      }
      .color-cell.selected {
        border-color: #fff;
        box-shadow: 0 0 6px rgba(255,255,255,0.7);
        transform: scale(1.1);
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(this._el);
  }

  /**
   * Generate 30 colors in a 15×2 layout.
   * Row 0: vivid  (saturation=1.0, lightness=0.5)
   * Row 1: dark   (saturation=1.0, lightness=0.25)
   * @returns {Array<{r:number,g:number,b:number,hex:string}>}
   */
  _generateColors() {
    const results = [];
    const cols = 15;

    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < cols; col++) {
        const hue = (col / cols) * 360;
        let sat, light;
        if (row === 0) {
          sat = 1.0;
          light = 0.5;
        } else {
          sat = 1.0;
          light = 0.25;
        }

        const { r, g, b } = this._hslToRgb(hue, sat, light);
        const hex = this._rgbToHex(r, g, b);
        results.push({ r, g, b, hex });
      }
    }
    return results;
  }

  /** Convert HSL (hue in degrees, sat/light 0-1) to RGB floats 0-1 */
  _hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r1, g1, b1;
    if (h < 60)      { r1 = c; g1 = x; b1 = 0; }
    else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
    else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
    else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
    else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
    else               { r1 = c; g1 = 0; b1 = x; }

    return {
      r: r1 + m,
      g: g1 + m,
      b: b1 + m,
    };
  }

  /** Convert RGB floats (0-1) to hex string like "#ff8800" */
  _rgbToHex(r, g, b) {
    const toHex = (v) => {
      const s = Math.round(v * 255).toString(16);
      return s.length === 1 ? '0' + s : s;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  /** Update the 'selected' CSS class on cells */
  _updateHighlight() {
    for (const cell of this._cells) {
      if (this._selected) {
        const cr = parseFloat(cell.dataset.r);
        const cg = parseFloat(cell.dataset.g);
        const cb = parseFloat(cell.dataset.b);
        cell.classList.toggle('selected',
          cr === this._selected.r &&
          cg === this._selected.g &&
          cb === this._selected.b
        );
      } else {
        cell.classList.remove('selected');
      }
    }
  }

  /** Show the palette */
  show() {
    this._visible = true;
    this._el.classList.add('visible');
  }

  /** Hide the palette */
  hide() {
    this._visible = false;
    this._el.classList.remove('visible');
  }

  /** Toggle visibility */
  toggle() {
    if (this._visible) this.hide();
    else this.show();
  }

  /**
   * @returns {{r:number, g:number, b:number} | null}
   *   The currently selected color in floats 0-1, or null if none selected.
   */
  getSelectedColor() {
    return this._selected;
  }

  /** Dispose and clean up DOM */
  dispose() {
    if (this._el.parentNode) this._el.parentNode.removeChild(this._el);
  }
}
/**
 * TerrainGenerator — generates mountain-range voxel terrain using
 * multi-octave value noise (FBM) with elevation-based vertex coloring.
 *
 * Pure functions only — no Three.js dependency, no side effects.
 * Can be imported and tested from Node.js or the browser independently.
 */

// --- Permutation table for value noise ---

/**
 * Create a shuffled permutation table (size 512, repeats twice for
 * seamless wrapping). Uses a simple LCG seeded from `seed` so the
 * same seed produces the same terrain every time.
 * @param {number} seed
 * @returns {Uint8Array}
 */
function _makePermTable(seed) {
  // Build array 0..255
  const arr = new Uint8Array(256);
  for (let i = 0; i < 256; i++) arr[i] = i;

  // Fisher-Yates shuffle seeded by a simple LCG
  let s = seed | 0;
  const next = () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) >>> 24; // high byte
  };

  for (let i = 255; i > 0; i--) {
    const j = next() % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  // Double up to 512 for simpler wrapping
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = arr[i & 255];
  return perm;
}

/**
 * 2D value noise at (x, z) using the permutation table.
 * Returns a value in [0, 1].
 * @param {number} x
 * @param {number} z
 * @param {Uint8Array} perm
 * @returns {number}
 */
function _noise2D(x, z, perm) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  // Smoothstep interpolation
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);

  const ixi = ix & 255;
  const izi = iz & 255;

  const v00 = perm[perm[ixi] + izi] / 255;
  const v10 = perm[perm[ixi + 1] + izi] / 255;
  const v01 = perm[perm[ixi] + izi + 1] / 255;
  const v11 = perm[perm[ixi + 1] + izi + 1] / 255;

  const lerpX0 = v00 + (v10 - v00) * sx;
  const lerpX1 = v01 + (v11 - v01) * sx;
  return lerpX0 + (lerpX1 - lerpX0) * sz;
}

// --- Public API ---

/**
 * Generate a 2D heightmap using fractal Brownian motion (FBM)
 * over multi-octave value noise.
 *
 * @param {object} options
 * @param {number} options.size - The terrain spans from -size/2 to +size/2 on both X and Z (default 100)
 * @param {number} options.heightScale - Maximum possible height in blocks (default 20)
 * @param {number} options.seed - RNG seed for reproducibility (default 42)
 * @param {number} options.octaves - Number of noise octaves (default 6)
 * @param {number} options.persistence - Amplitude multiplier per octave (default 0.5)
 * @param {number} options.lacunarity - Frequency multiplier per octave (default 2.0)
 * @param {number} options.frequency - Base frequency (default 0.03)
 * @returns {{ heights: Float32Array, size: number, maxHeight: number }}
 *   heights is a 1D array indexed by [z * size + x] (row-major),
 *   where each value is the terrain height in blocks (>= 0).
 *   size is the total grid dimension.
 *   maxHeight is the maximum height value found.
 */
export function generateHeightmap(options = {}) {
  const {
    size = 100,
    heightScale = 20,
    seed = 42,
    octaves = 6,
    persistence = 0.5,
    lacunarity = 2.0,
    frequency = 0.03,
  } = options;

  const perm = _makePermTable(seed);
  const heights = new Float32Array(size * size);
  const half = size / 2;
  let maxHeight = 0;

  for (let z = 0; z < size; z++) {
    const wz = z - half;
    for (let x = 0; x < size; x++) {
      const wx = x - half;
      let amplitude = 1;
      let freq = frequency;
      let value = 0;
      let maxAmplitude = 0;

      for (let o = 0; o < octaves; o++) {
        const n = _noise2D(wx * freq, wz * freq, perm);
        value += n * amplitude;
        maxAmplitude += amplitude;
        amplitude *= persistence;
        freq *= lacunarity;
      }

      // Normalise to [0, 1] then scale
      const normalised = value / maxAmplitude;
      const h = Math.round(normalised * heightScale);
      heights[z * size + x] = h;
      if (h > maxHeight) maxHeight = h;
    }
  }

  return { heights, size, maxHeight };
}

/**
 * Get the terrain height (in blocks) at a given world coordinate.
 * Useful for placing the character on the surface.
 *
 * @param {number} wx - world X coordinate
 * @param {number} wz - world Z coordinate
 * @param {Float32Array} heights - heightmap array
 * @param {number} size - grid dimension
 * @returns {number} terrain height (integer number of blocks)
 */
export function getHeightAt(wx, wz, heights, size) {
  const half = size / 2;
  const x = Math.round(wx + half);
  const z = Math.round(wz + half);
  if (x < 0 || x >= size || z < 0 || z >= size) return 0;
  return heights[z * size + x];
}

/**
 * Determine a vertex colour based on elevation.
 *
 * @param {number} h - block Y coordinate (0 = base)
 * @param {number} maxHeight - maximum height in the terrain
 * @returns {[number, number, number]} [r, g, b] in [0, 1] range
 */
export function getColorForHeight(h, maxHeight) {
  if (maxHeight <= 0) return [0.3, 0.6, 0.2]; // fallback green

  const ratio = h / maxHeight;

  // Colour bands with smooth interpolation
  if (ratio < 0.2) {
    // Deep base: dark earth
    const t = ratio / 0.2;
    return [
      0.25 + t * 0.25,  // 0.25 → 0.50
      0.15 + t * 0.25,  // 0.15 → 0.40
      0.10 + t * 0.05,  // 0.10 → 0.15
    ];
  } else if (ratio < 0.55) {
    // Lower slopes: green grass
    const t = (ratio - 0.2) / 0.35;
    return [
      0.50 - t * 0.20,  // 0.50 → 0.30
      0.40 + t * 0.25,  // 0.40 → 0.65
      0.15 - t * 0.10,  // 0.15 → 0.05
    ];
  } else if (ratio < 0.75) {
    // Mid slopes: brown rock / earth
    const t = (ratio - 0.55) / 0.20;
    return [
      0.30 + t * 0.30,  // 0.30 → 0.60
      0.65 - t * 0.35,  // 0.65 → 0.30
      0.05 + t * 0.05,  // 0.05 → 0.10
    ];
  } else if (ratio < 0.9) {
    // High slopes: grey rock
    const t = (ratio - 0.75) / 0.15;
    return [
      0.60 + t * 0.20,  // 0.60 → 0.80
      0.30 + t * 0.20,  // 0.30 → 0.50
      0.10 + t * 0.15,  // 0.10 → 0.25
    ];
  } else {
    // Peaks: white snow cap
    const t = (ratio - 0.9) / 0.1;
    return [
      0.80 + t * 0.20,  // 0.80 → 1.00
      0.50 + t * 0.50,  // 0.50 → 1.00
      0.25 + t * 0.75,  // 0.25 → 1.00
    ];
  }
}

/**
 * Generate an array of cube data entries suitable for saving to a scene file.
 * Each entry is [x, y, z, r, g, b].
 *
 * The terrain is built from y=0 up to floor(height) at each (x, z) position.
 * Optionally, a base layer at y=0 fills every column so there are no gaps.
 *
 * @param {object} options  (same as generateHeightmap options)
 * @returns {{ cubes: Array<[number,number,number,number,number,number]>, heightmap: { heights: Float32Array, size: number, maxHeight: number } }}
 */
export function generateTerrainCubes(options = {}) {
  const heightmap = generateHeightmap(options);
  const { heights, size, maxHeight } = heightmap;
  const cubes = [];

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const h = heights[z * size + x];
      const wx = x - size / 2;
      const wz = z - size / 2;

      for (let y = 0; y <= h; y++) {
        // h is already rounded (an integer), so y goes from 0 to h inclusive
        const color = getColorForHeight(y, maxHeight);
        // Use n+0.5 positions so cube centers fall on integer cell centers,
        // matching the raycaster output for cube removal.
        cubes.push([
          wx + 0.5, y + 0.5, wz + 0.5,
          Math.round(color[0] * 100) / 100,
          Math.round(color[1] * 100) / 100,
          Math.round(color[2] * 100) / 100,
        ]);
      }
    }
  }

  return { cubes, heightmap };
}

/**
 * Format cube data into a scene file JSON blob (same format as SceneArchive).
 *
 * @param {string} name - scene name
 * @param {Array<[number,number,number,number,number,number]>} cubes
 * @param {number} centerHeight - terrain height at the center (for character placement)
 * @returns {string} JSON string ready to write to a .scene file
 */
export function formatSceneJSON(name, cubes, centerHeight) {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);
  const savedAt = chinaTime.toISOString().replace(/\.\d{3}Z/, '+08:00');

  return JSON.stringify({
    version: 1,
    savedAt,
    numCubes: cubes.length,
    player: {
      posX: 0,
      posY: centerHeight,
      posZ: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    },
    cubes,
  }, null, 2);
}
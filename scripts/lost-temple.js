#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Seeded PRNG ──────────────────────────────────────

function createRNG(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

// ─── Color Palette ────────────────────────────────────

const C = {
  GOLD:        [0.82, 0.62, 0.12],
  GOLD_DARK:   [0.58, 0.42, 0.08],
  GOLD_TRIM:   [0.90, 0.72, 0.20],
  GOLD_PALE:   [0.70, 0.52, 0.10],
  METAL_DARK:  [0.22, 0.18, 0.30],
  METAL:       [0.28, 0.22, 0.38],
  METAL_LIGHT: [0.38, 0.32, 0.50],
  METAL_PALE:  [0.48, 0.42, 0.58],
  ENE_BLUE:    [0.12, 0.28, 0.78],
  ENE_BLUE_LT: [0.25, 0.55, 1.00],
  CRY_BLUE:    [0.12, 0.30, 0.80],
  CRY_BLUE_LT: [0.30, 0.55, 1.00],
  CRY_PURPLE:  [0.50, 0.12, 0.65],
  CRY_PURPLE_LT:[0.65, 0.30, 0.85],
  CR_DARK:     [0.28, 0.06, 0.18],
  CREEP:       [0.35, 0.10, 0.25],
  CR_LIGHT:    [0.42, 0.15, 0.30],
  ORG_BROWN:   [0.42, 0.22, 0.12],
  ORG_TAN:     [0.52, 0.32, 0.18],
  TEND_RED:    [0.68, 0.08, 0.08],
  TEND_PINK:   [0.72, 0.18, 0.32],
  TUMOR:       [0.22, 0.42, 0.10],
  TUMOR_DRK:   [0.18, 0.35, 0.08],
  STONE:       [0.38, 0.34, 0.30],
  STONE_DARK:  [0.28, 0.25, 0.22],
  STONE_DEEPER:[0.20, 0.18, 0.16],
  STONE_LIGHT: [0.48, 0.44, 0.40],
  RUBBLE:      [0.35, 0.30, 0.26],
  VOID:        [0.04, 0.04, 0.08],
};

// ─── Helpers ─────────────────────────────────────────

const cubes = [];
const cubeSet = new Set();

function r2(v) {
  return Math.round(v * 100) / 100;
}

function k(x, y, z) {
  return `${x},${y},${z}`;
}

function place(x, y, z, color) {
  const key = k(x, y, z);
  if (cubeSet.has(key)) return;
  cubeSet.add(key);
  cubes.push([
    x + 0.5, y + 0.5, z + 0.5,
    r2(color[0]), r2(color[1]), r2(color[2]),
  ]);
}

function box(x1, x2, y1, y2, z1, z2, color) {
  for (let x = x1; x <= x2; x++)
    for (let y = y1; y <= y2; y++)
      for (let z = z1; z <= z2; z++)
        place(x, y, z, color);
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function randInt(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ─── Ground ───────────────────────────────────────────

function buildGround() {
  const G = 44, D = 52;
  const hG = G >> 1, hD = D >> 1;

  box(-hG, hG, -1, -1, -hD, hD, C.STONE_DEEPER);
  box(-hG, hG, 0, 0, -hD, hD, C.STONE_DARK);
  box(-hG, hG, 1, 1, -hD, hD, C.STONE);

  // Gold trim border
  box(-hG, hG, 1, 1, -hD, -hD, C.GOLD_DARK);
  box(-hG, hG, 1, 1, hD, hD, C.GOLD_DARK);
  box(-hG, -hG, 1, 1, -hD, hD, C.GOLD_DARK);
  box(hG, hG, 1, 1, -hD, hD, C.GOLD_DARK);
}

// ─── Entrance Steps ───────────────────────────────────

function buildEntranceSteps(rng) {
  // 6 rows of steps in front of the archway
  for (let s = 0; s < 6; s++) {
    const z = 19 + s;
    const width = 12 - Math.floor(s * 0.5);
    const hw = Math.floor(width / 2);
    const yLevel = s < 3 ? 1 : 0;
    for (let x = -hw; x <= hw; x++) {
      for (let yy = 0; yy <= yLevel; yy++) {
        place(x, yy, z, yy === yLevel ? C.STONE_LIGHT : C.STONE);
      }
    }
    // Gold edges on steps
    place(-hw - 1, yLevel, z, C.GOLD_DARK);
    place(hw + 1, yLevel, z, C.GOLD_DARK);
  }
}

// ─── Walls ────────────────────────────────────────────

function buildWalls() {
  const x1 = -16, x2 = 16;
  const z1 = -18, z2 = 18;
  const y1 = 1, y2 = 8;
  const t = 2;
  const archHalf = 6; // half-width of arch opening

  // Left wall
  box(x1, x1 + t - 1, y1, y2, z1, z2, C.METAL_DARK);
  // Right wall
  box(x2 - t + 1, x2, y1, y2, z1, z2, C.METAL_DARK);
  // Back wall
  box(x1 + t, x2 - t, y1, y2, z1, z1 + t - 1, C.METAL_DARK);

  // Front wall with trapezoidal arch opening
  for (let x = x1 + t; x <= x2 - t; x++) {
    for (let z = z2 - t + 1; z <= z2; z++) {
      for (let y = y1; y <= y2; y++) {
        const dist = Math.abs(x);
        let openUpToY;
        if (dist <= archHalf) {
          openUpToY = 6 - Math.floor(dist);
        } else {
          openUpToY = y1 - 1;
        }
        if (y <= openUpToY) continue;
        place(x, y, z, C.METAL_DARK);
      }
    }
  }

  // Gold trim on top of walls
  box(x1, x1 + t - 1, y2, y2, z1, z2, C.GOLD);
  box(x2 - t + 1, x2, y2, y2, z1, z2, C.GOLD);
  box(x1 + t, x2 - t, y2, y2, z1, z1 + t - 1, C.GOLD);

  // Gold trim on front wall (above arch and solid sections)
  for (let x = x1 + t; x <= x2 - t; x++) {
    const dist = Math.abs(x);
    let openUpToY;
    if (dist <= archHalf) {
      openUpToY = 6 - Math.floor(dist);
    } else {
      openUpToY = y1 - 1;
    }
    if (openUpToY < y2) {
      place(x, y2, z2 - t + 1, C.GOLD);
      place(x, y2, z2, C.GOLD);
    }
  }

  // Gold arch outline (front face at z=18)
  for (let x = -archHalf; x <= archHalf; x++) {
    const dist = Math.abs(x);
    const openUpToY = 6 - Math.floor(dist);
    if (openUpToY >= y1) {
      place(x, openUpToY + 1, z2 - t + 1, C.GOLD_TRIM);
      place(x, openUpToY + 1, z2, C.GOLD_TRIM);
    }
    if (dist === archHalf && openUpToY >= y1) {
      for (let y = y1; y <= openUpToY; y++) {
        place(x, y, z2 - t + 1, C.GOLD_TRIM);
        place(x, y, z2, C.GOLD_TRIM);
      }
    }
  }

  // Energy slit windows on side walls
  for (const z of [-12, -4, 4, 12]) {
    for (let y = 3; y <= 6; y++) {
      place(-16, y, z, C.ENE_BLUE);
      place(16, y, z, C.ENE_BLUE);
      if (y === 3 || y === 6) {
        place(-16, y, z, C.GOLD_TRIM);
        place(16, y, z, C.GOLD_TRIM);
      }
    }
  }
}

// ─── Pylons ───────────────────────────────────────────

function buildPylon(cx, cz, y1, y2, rng) {
  for (let y = y1; y <= y2; y++) {
    let half;
    if (y <= y1 + 2) half = 2;
    else if (y <= y1 + 4) half = 1;
    else half = 0;

    const color = (y <= y1 + 1) ? C.METAL : C.METAL_LIGHT;
    for (let dx = -half; dx <= half; dx++)
      for (let dz = -half; dz <= half; dz++)
        place(cx + dx, y, cz + dz, color);
  }

  // Gold base
  box(cx - 2, cx + 2, y1, y1, cz - 2, cz + 2, C.GOLD);

  // Gold cap at first transition
  box(cx - 1, cx + 1, y1 + 3, y1 + 3, cz - 1, cz + 1, C.GOLD);

  // Blue energy grooves on base faces
  for (let y = y1 + 1; y <= y1 + 2; y++) {
    for (const sign of [-1, 1]) {
      place(cx + sign * 2, y, cz, C.ENE_BLUE);
      place(cx, y, cz + sign * 2, C.ENE_BLUE);
    }
  }

  // Blue center energy line up the pylon
  for (let y = y1 + 1; y <= y1 + 4; y++) {
    place(cx, y, cz, C.ENE_BLUE_LT);
  }
  // Continue energy line on spire
  for (let y = y1 + 5; y <= y2; y++) {
    if (rng() > 0.4) place(cx, y, cz, C.ENE_BLUE_LT);
  }

  // Top glow
  place(cx, y2, cz, C.ENE_BLUE_LT);
}

function buildPylons(rng) {
  buildPylon(-10, 20, 1, 14, rng);
  buildPylon(10, 20, 1, 14, rng);
}

// ─── Roof ─────────────────────────────────────────────

function buildRoof() {
  const yBase = 9;
  const tiers = [
    { x1: -12, x2: 12, z1: -12, z2: 12, yT: yBase + 1 },
    { x1: -9,  x2: 9,  z1: -9,  z2: 9,  yT: yBase + 2 },
    { x1: -6,  x2: 6,  z1: -6,  z2: 6,  yT: yBase + 3 },
    { x1: -3,  x2: 3,  z1: -3,  z2: 3,  yT: yBase + 4 },
  ];

  for (const t of tiers) {
    box(t.x1, t.x2, t.yT, t.yT, t.z1, t.z2, C.METAL);
    // Gold edge
    for (let x = t.x1; x <= t.x2; x++) {
      place(x, t.yT, t.z1, C.GOLD);
      place(x, t.yT, t.z2, C.GOLD);
    }
    for (let z = t.z1; z <= t.z2; z++) {
      place(t.x1, t.yT, z, C.GOLD);
      place(t.x2, t.yT, z, C.GOLD);
    }
  }

  // Center spire
  for (let y = yBase + 5; y <= yBase + 8; y++) {
    place(0, y, 0, C.METAL_LIGHT);
    for (const s of [-1, 1]) {
      place(s, y, 0, C.METAL);
      place(0, y, s, C.METAL);
    }
  }
  for (let y = yBase + 9; y <= yBase + 10; y++) {
    place(0, y, 0, C.GOLD_TRIM);
  }
  place(0, yBase + 10, 0, C.ENE_BLUE_LT);
}

// ─── Interior ─────────────────────────────────────────

function buildInterior(rng) {
  // Dividing wall between main hall and inner sanctum
  const iwZ = -6;
  for (let x = -14; x <= 14; x++) {
    if (x >= -3 && x <= 3) continue;
    for (let y = 1; y <= 6; y++) {
      place(x, y, iwZ, C.METAL_DARK);
    }
    place(x, 6, iwZ, C.GOLD);
  }
  // Arch frame on dividing wall opening
  for (let x = -4; x <= 4; x++) {
    if (x === -4 || x === 4) {
      for (let y = 1; y <= 6; y++) place(x, y, iwZ, C.GOLD_TRIM);
    }
    place(x, 6, iwZ, C.GOLD_TRIM);
  }

  // Raised sanctuary floor at back
  box(-10, 10, 2, 2, -16, -8, C.STONE_LIGHT);
  box(-10, 10, 2, 2, -16, -16, C.GOLD_DARK);
  box(-10, 10, 2, 2, -8, -8, C.GOLD_DARK);
  box(-10, -10, 2, 2, -16, -8, C.GOLD_DARK);
  box(10, 10, 2, 2, -16, -8, C.GOLD_DARK);

  // Steps up to sanctuary
  for (let x = -3; x <= 3; x++) place(x, 1, -8, C.STONE_LIGHT);
  box(-3, 3, 1, 1, -9, -9, C.STONE_LIGHT);

  // Altar
  box(-2, 2, 3, 4, -14, -13, C.METAL_LIGHT);
  box(-1, 1, 5, 5, -14, -13, C.GOLD_TRIM);
  place(0, 5, -13, C.ENE_BLUE_LT);

  // Interior columns
  const colPositions = [[-10, 6], [10, 6], [-10, -2], [10, -2]];
  for (const [cx, cz] of colPositions) {
    for (let y = 1; y <= 6; y++) {
      const half = y <= 2 ? 1 : 0;
      for (let dx = -half; dx <= half; dx++)
        for (let dz = -half; dz <= half; dz++)
          place(cx + dx, y, cz + dz, C.METAL_LIGHT);
    }
    place(cx, 7, cz, C.GOLD);
  }
}

// ─── Crystals ─────────────────────────────────────────

function buildCrystals(rng) {
  const blues = [C.CRY_BLUE, C.CRY_BLUE_LT];
  const purples = [C.CRY_PURPLE, C.CRY_PURPLE_LT];

  function cluster(bx, bz, by, height, colors, rng) {
    for (let h = 0; h < height; h++) {
      const spread = Math.max(1, 2 - Math.floor(h * 0.4));
      const half = Math.floor(spread / 2);
      for (let dx = -half; dx <= half; dx++) {
        for (let dz = -half; dz <= half; dz++) {
          if (dx === 0 && dz === 0) {
            place(bx, by + h, bz, pick(colors, rng));
          } else if (h < height - 1 && rng() > 0.5) {
            place(bx + dx, by + h, bz + dz, pick(colors, rng));
          }
        }
      }
    }
  }

  // Blue crystals flanking entrance path
  cluster(-9, 15, 1, 5, blues, rng);
  cluster(-6, 13, 1, 4, blues, rng);
  cluster(6, 13, 1, 4, blues, rng);
  cluster(9, 15, 1, 5, blues, rng);

  // Blue crystals near archway
  cluster(-13, 18, 1, 3, blues, rng);
  cluster(13, 18, 1, 3, blues, rng);

  // Purple corrupted crystals around altar
  cluster(-5, -12, 2, 5, purples, rng);
  cluster(5, -12, 2, 5, purples, rng);
  cluster(-3, -15, 2, 4, purples, rng);
  cluster(3, -15, 2, 4, purples, rng);

  // Corrupted crystals along side walls
  cluster(-14, 10, 2, 3, purples, rng);
  cluster(14, -5, 2, 3, purples, rng);
  cluster(-14, -10, 2, 3, purples, rng);
}

// ─── Infestation ──────────────────────────────────────

function buildInfestation(rng) {
  const creepColors = [C.CREEP, C.CR_DARK, C.CR_LIGHT, C.ORG_BROWN];

  // Creep blobs on the ground
  const creepPoints = [
    [-22, -24], [22, -24], [-22, 24], [22, 24],
    [0, -24],   [0, 24],   [-22, 0],  [22, 0],
    [-18, -18], [18, -18], [-18, 18], [18, 18],
  ];

  for (const [cx, cz] of creepPoints) {
    const radius = randInt(3, 6, rng);
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= radius && rng() < 0.55) {
          const c = dist > radius * 0.6 ? C.CREEP : pick(creepColors, rng);
          place(cx + dx, 0, cz + dz, c);
          if (rng() > 0.85 && dist < radius * 0.4) {
            place(cx + dx, 1, cz + dz, pick(creepColors, rng));
          }
        }
      }
    }
  }

  // Tendrils on walls
  const tendrilColors = [C.TEND_RED, C.TEND_PINK, C.ORG_BROWN, C.ORG_TAN];
  const tendrilSpots = [
    [-16, -14], [-16, -4], [-16, 6],  [-16, 12],
    [16, -16],  [16, -6],  [16, 8],   [16, 14],
    [-10, -18], [-2, -18], [6, -18],  [12, -18],
    [-12, 18],  [-8, 18],  [8, 18],   [12, 18],
  ];

  const numTendrils = randInt(6, 12, rng);
  const shuffled = [...tendrilSpots].sort(() => rng() - 0.5);
  for (let i = 0; i < numTendrils; i++) {
    const [tx, tz] = shuffled[i];
    const height = randInt(3, 7, rng);
    for (let y = 1; y <= height; y++) {
      place(tx, y, tz, pick(tendrilColors, rng));
      if (rng() > 0.6 && y < height) {
        const [dx, dz] = pick([[0,0],[1,0],[-1,0],[0,1],[0,-1]], rng);
        place(tx + dx, y + 1, tz + dz, pick(tendrilColors, rng));
      }
    }
  }

  // Creep tumors at base
  const tumorSpots = [[-18, -20], [18, -20], [-18, 16], [18, 16]];
  for (const [tx, tz] of tumorSpots) {
    const size = randInt(1, 2, rng);
    for (let dx = -size; dx <= size; dx++)
      for (let dz = -size; dz <= size; dz++)
        for (let dy = 0; dy < size + 1; dy++) {
          const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
          if (dist <= size && rng() > 0.2) {
            const c = dist > size * 0.6 ? C.TUMOR : C.TUMOR_DRK;
            place(tx + dx, dy, tz + dz, c);
          }
        }
  }

  // Wall creep — infestation climbing walls
  const wallCreepSpots = [
    [-14, -17], [14, -17], [-15, 10], [15, -10],
    [-15, -8],  [15, 8],   [-8, -17], [8, -17],
  ];
  for (const [wx, wz] of wallCreepSpots) {
    if (rng() > 0.5) continue;
    const height = randInt(1, 3, rng);
    for (let y = 0; y <= height; y++) {
      if (rng() > 0.3) place(wx, y, wz, pick(creepColors, rng));
    }
  }
}

// ─── Debris / Damaged Structures ──────────────────────

function buildDebris(rng) {
  // Fallen pylon (left side)
  const fX = -19, fZ = -8;
  for (let y = 0; y < 2; y++) {
    for (let z = -14; z <= -2; z++) {
      if (z >= -6 && z <= -4) continue;
      place(fX, y, z, z % 4 === 0 ? C.GOLD : C.METAL);
    }
  }
  // Scattered rubble from fallen pylon
  for (const [rx, ry, rz] of [[-20,0,-2],[-19,0,-1],[-19,1,-2],[-20,0,-14],[-19,1,-15]]) {
    place(rx, ry, rz, C.METAL);
  }

  // Partially-standing broken pylon (right side)
  const bX = 20, bZ = -10;
  for (let y = 1; y <= 6; y++) {
    const half = y <= 3 ? 2 : 1;
    for (let dx = -half; dx <= half; dx++)
      for (let dz = -half; dz <= half; dz++)
        place(bX + dx, y, bZ + dz, C.METAL);
  }
  // Jagged break
  place(bX + 1, 7, bZ, C.METAL);
  place(bX - 1, 7, bZ, C.METAL);
  place(bX, 7, bZ + 1, C.METAL);
  place(bX, 7, bZ - 1, C.GOLD);
  // Rubble around it
  for (const [dx, dy, dz] of [[18,0,-12],[19,0,-11],[21,0,-10],[22,0,-9],[20,0,-8],[20,1,-8],[19,0,-9],[21,0,-11]]) {
    if (rng() > 0.3) place(dx, dy, dz, pick([C.METAL, C.RUBBLE, C.GOLD_DARK], rng));
  }

  // Scattered rubble around temple
  const rubbleSpots = [[-24,15],[24,15],[-24,-22],[24,-22],[-24,-10],[24,10],[-15,24],[15,24]];
  for (const [rx, rz] of rubbleSpots) {
    const count = randInt(2, 5, rng);
    for (let i = 0; i < count; i++) {
      const ox = Math.floor(rng() * 4 - 2);
      const oz = Math.floor(rng() * 4 - 2);
      place(rx + ox, 0, rz + oz, pick([C.RUBBLE, C.STONE_DARK, C.STONE], rng));
      if (rng() > 0.6) place(rx + ox, 1, rz + oz, pick([C.RUBBLE, C.STONE_DARK], rng));
    }
  }

  // Wall damage (void blocks replacing wall sections)
  const damageZones = [
    { x1: -14, x2: -12, z1: -18, z2: -17, y1: 5, y2: 8 },
    { x1: 15, x2: 16, z1: -4, z2: -2, y1: 3, y2: 6 },
    { x1: -5, x2: -3, z1: -18, z2: -17, y1: 4, y2: 7 },
    { x1: 14, x2: 15, z1: 10, z2: 12, y1: 2, y2: 5 },
    { x1: -4, x2: -2, z1: 17, z2: 18, y1: 2, y2: 4 },
  ];
  for (const zone of damageZones) {
    if (rng() > 0.55) continue;
    for (let x = zone.x1; x <= zone.x2; x++)
      for (let z = zone.z1; z <= zone.z2; z++)
        for (let y = zone.y1; y <= zone.y2; y++)
          if (rng() > 0.3) place(x, y, z, C.VOID);
  }
}

// ─── Scene Writer ─────────────────────────────────────

function writeScene(name, playerYaw) {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);
  const savedAt = chinaTime.toISOString().replace(/\.\d{3}Z/, '+08:00');

  const data = {
    version: 1,
    savedAt,
    numCubes: cubes.length,
    player: {
      posX: 0,
      posY: 1.5,
      posZ: 25,
      rotationX: 0,
      rotationY: playerYaw,
      rotationZ: 0,
    },
    cubes,
  };

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outputDir = path.resolve(__dirname, '..', 'public', 'scenes');
  const outputPath = path.join(outputDir, `${name}.scene`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  return outputPath;
}

// ─── Main ─────────────────────────────────────────────

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = process.argv[i + 1];
      if (val !== undefined && !val.startsWith('--')) {
        args[key] = val;
        i++;
      } else {
        args[key] = true;
      }
    }
  }

  const seed = parseInt(args.seed, 10) || 42;
  const name = args.name || 'lost-temple';

  console.log(`=== Infected Protoss Temple Generator ===`);
  console.log(`Seed: ${seed}`);
  console.log(`Scene name: ${name}`);
  console.log('');

  const rng = createRNG(seed);
  const start = performance.now();

  buildGround();
  buildEntranceSteps(rng);
  buildWalls();
  buildPylons(rng);
  buildRoof();
  buildInterior(rng);
  buildCrystals(rng);
  buildInfestation(rng);
  buildDebris(rng);

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  console.log(`Generated ${cubes.length.toLocaleString()} cubes in ${elapsed}s`);
  console.log('');

  const outputPath = writeScene(name, Math.PI);
  const stats = fs.statSync(outputPath);
  const fileSizeKB = (stats.size / 1024).toFixed(1);
  console.log(`Written to: ${outputPath}`);
  console.log(`File size: ${fileSizeKB} KB`);
  console.log('Done!');
}

main();

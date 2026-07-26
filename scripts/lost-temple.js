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
  GOLD_TARN:   [0.42, 0.32, 0.12],
  METAL_DARK:  [0.22, 0.18, 0.30],
  METAL:       [0.28, 0.22, 0.38],
  METAL_LIGHT: [0.38, 0.32, 0.50],
  METAL_PALE:  [0.48, 0.42, 0.58],
  ENE_BLUE:    [0.12, 0.28, 0.78],
  ENE_BLUE_LT: [0.25, 0.55, 1.00],
  ENE_CORRUPT: [0.50, 0.10, 0.60],
  CRY_BLUE:    [0.12, 0.30, 0.80],
  CRY_BLUE_LT: [0.30, 0.55, 1.00],
  CRY_PURPLE:  [0.50, 0.12, 0.65],
  CRY_PURPLE_LT:[0.65, 0.30, 0.85],
  CR_DARK:     [0.28, 0.06, 0.18],
  CREEP:       [0.35, 0.10, 0.25],
  CR_LIGHT:    [0.42, 0.15, 0.30],
  CR_VEIN:     [0.22, 0.04, 0.14],
  ORG_BROWN:   [0.42, 0.22, 0.12],
  ORG_TAN:     [0.52, 0.32, 0.18],
  TEND_RED:    [0.68, 0.08, 0.08],
  TEND_PINK:   [0.72, 0.18, 0.32],
  TUMOR:       [0.22, 0.42, 0.10],
  TUMOR_DRK:   [0.18, 0.35, 0.08],
  BIO_GREEN:   [0.08, 0.50, 0.18],
  BIO_PURPLE:  [0.55, 0.12, 0.65],
  MUCUS:       [0.38, 0.52, 0.32],
  CYST_RED:    [0.52, 0.06, 0.10],
  SPORE_YLW:   [0.68, 0.62, 0.08],
  STONE:       [0.38, 0.34, 0.30],
  STONE_DARK:  [0.28, 0.25, 0.22],
  STONE_DEEPER:[0.20, 0.18, 0.16],
  STONE_LIGHT: [0.48, 0.44, 0.40],
  RUBBLE:      [0.35, 0.30, 0.26],
  VOID:        [0.04, 0.04, 0.08],
  DEEP_VOID:   [0.01, 0.01, 0.04],
};

// ─── Helpers ─────────────────────────────────────────

const cubes = [];
const cubeIdx = new Map();

function r2(v) {
  return Math.round(v * 100) / 100;
}

function k(x, y, z) {
  return `${x},${y},${z}`;
}

// Place a block — skips if position already exists
function place(x, y, z, color) {
  const key = k(x, y, z);
  if (cubeIdx.has(key)) return;
  cubeIdx.set(key, cubes.length);
  cubes.push([
    x + 0.5, y + 0.5, z + 0.5,
    r2(color[0]), r2(color[1]), r2(color[2]),
  ]);
}

// Replace a block at the given position (or add if new)
function rpl(x, y, z, color) {
  const key = k(x, y, z);
  const idx = cubeIdx.get(key);
  if (idx !== undefined) {
    cubes[idx][3] = r2(color[0]);
    cubes[idx][4] = r2(color[1]);
    cubes[idx][5] = r2(color[2]);
    return;
  }
  cubeIdx.set(key, cubes.length);
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

function maybe(prob, rng) {
  return rng() < prob;
}

// ─── Ground ───────────────────────────────────────────

function buildGround() {
  const G = 44, D = 52;
  const hG = G >> 1, hD = D >> 1;

  box(-hG, hG, -1, -1, -hD, hD, C.STONE_DEEPER);
  box(-hG, hG, 0, 0, -hD, hD, C.STONE_DARK);
  box(-hG, hG, 1, 1, -hD, hD, C.STONE);
}

// ─── Tarnished Gold ───────────────────────────────────

function tarnishGoldAt(x, y, z, rng) {
  if (cubeIdx.has(k(x, y, z)) && rng() > 0.65) {
    rpl(x, y, z, rng() > 0.5 ? C.GOLD_TARN : C.GOLD_DARK);
  }
}

function buildTarnishedMetal(rng) {
  // Tarnish gold trim on ground border
  for (let x = -22; x <= 22; x++) {
    for (const z of [-26, 26]) {
      if (maybe(0.4, rng)) tarnishGoldAt(x, 1, z, rng);
    }
  }
  for (let z = -26; z <= 26; z++) {
    for (const x of [-22, 22]) {
      if (maybe(0.4, rng)) tarnishGoldAt(x, 1, z, rng);
    }
  }

  // Tarnish wall gold
  for (let x = -16; x <= 16; x++) {
    for (let z = -18; z <= 18; z++) {
      for (let y = 1; y <= 8; y++) {
        if (cubeIdx.has(k(x, y, z)) && maybe(0.08, rng)) {
          tarnishGoldAt(x, y, z, rng);
        }
      }
    }
  }

  // Tarnish roof gold
  for (let y = 10; y <= 13; y++) {
    for (let x = -12; x <= 12; x++) {
      for (let z = -12; z <= 12; z++) {
        if (cubeIdx.has(k(x, y, z)) && maybe(0.15, rng)) {
          tarnishGoldAt(x, y, z, rng);
        }
      }
    }
  }
}

// ─── Walls ────────────────────────────────────────────

function buildWalls() {
  const x1 = -16, x2 = 16;
  const z1 = -18, z2 = 18;
  const y1 = 1, y2 = 8;
  const t = 2;
  const archHalf = 6;

  box(x1, x1 + t - 1, y1, y2, z1, z2, C.METAL_DARK);
  box(x2 - t + 1, x2, y1, y2, z1, z2, C.METAL_DARK);
  box(x1 + t, x2 - t, y1, y2, z1, z1 + t - 1, C.METAL_DARK);

  for (let x = x1 + t; x <= x2 - t; x++) {
    for (let z = z2 - t + 1; z <= z2; z++) {
      for (let y = y1; y <= y2; y++) {
        const dist = Math.abs(x);
        const openUpToY = dist <= archHalf ? 6 - Math.floor(dist) : y1 - 1;
        if (y <= openUpToY) continue;
        place(x, y, z, C.METAL_DARK);
      }
    }
  }

  box(x1, x1 + t - 1, y2, y2, z1, z2, C.GOLD);
  box(x2 - t + 1, x2, y2, y2, z1, z2, C.GOLD);
  box(x1 + t, x2 - t, y2, y2, z1, z1 + t - 1, C.GOLD);

  for (let x = x1 + t; x <= x2 - t; x++) {
    const dist = Math.abs(x);
    const openUpToY = dist <= archHalf ? 6 - Math.floor(dist) : y1 - 1;
    if (openUpToY < y2) {
      place(x, y2, z2 - t + 1, C.GOLD);
      place(x, y2, z2, C.GOLD);
    }
  }

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

  // Energy slit windows
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

  box(cx - 2, cx + 2, y1, y1, cz - 2, cz + 2, C.GOLD);
  box(cx - 1, cx + 1, y1 + 3, y1 + 3, cz - 1, cz + 1, C.GOLD);

  // Mixed blue + corrupted energy
  const energyColors = [C.ENE_BLUE, C.ENE_BLUE_LT, C.ENE_CORRUPT];
  for (let y = y1 + 1; y <= y1 + 2; y++) {
    for (const sign of [-1, 1]) {
      place(cx + sign * 2, y, cz, pick(energyColors, rng));
      place(cx, y, cz + sign * 2, pick(energyColors, rng));
    }
  }

  for (let y = y1 + 1; y <= y1 + 4; y++) {
    place(cx, y, cz, maybe(0.4, rng) ? C.ENE_CORRUPT : C.ENE_BLUE_LT);
  }
  for (let y = y1 + 5; y <= y2; y++) {
    if (rng() > 0.4) place(cx, y, cz, pick(energyColors, rng));
  }

  place(cx, y2, cz, pick(energyColors, rng));
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
    for (let x = t.x1; x <= t.x2; x++) {
      place(x, t.yT, t.z1, C.GOLD);
      place(x, t.yT, t.z2, C.GOLD);
    }
    for (let z = t.z1; z <= t.z2; z++) {
      place(t.x1, t.yT, z, C.GOLD);
      place(t.x2, t.yT, z, C.GOLD);
    }
  }

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
  const iwZ = -6;
  for (let x = -14; x <= 14; x++) {
    if (x >= -3 && x <= 3) continue;
    for (let y = 1; y <= 6; y++) {
      place(x, y, iwZ, C.METAL_DARK);
    }
    place(x, 6, iwZ, C.GOLD);
  }
  for (let x = -4; x <= 4; x++) {
    if (x === -4 || x === 4) {
      for (let y = 1; y <= 6; y++) place(x, y, iwZ, C.GOLD_TRIM);
    }
    place(x, 6, iwZ, C.GOLD_TRIM);
  }

  box(-10, 10, 2, 2, -16, -8, C.STONE_LIGHT);
  box(-10, 10, 2, 2, -16, -16, C.GOLD_DARK);
  box(-10, 10, 2, 2, -8, -8, C.GOLD_DARK);
  box(-10, -10, 2, 2, -16, -8, C.GOLD_DARK);
  box(10, 10, 2, 2, -16, -8, C.GOLD_DARK);

  for (let x = -3; x <= 3; x++) place(x, 1, -8, C.STONE_LIGHT);
  box(-3, 3, 1, 1, -9, -9, C.STONE_LIGHT);

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

// ─── Infestation Heart (replaces altar) ──────────────

function buildInfestationHeart(rng) {
  // Large organic nucleus in the sanctuary, replacing the old altar
  const hx = 0, hy = 2, hz = -13;

  // Central mass
  for (let dx = -3; dx <= 3; dx++)
    for (let dz = -3; dz <= 3; dz++)
      for (let dy = 0; dy <= 3; dy++) {
        const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
        if (dist <= 3 && (dist > 0.5 || maybe(0.3, rng))) {
          const c = dist > 2.2 ? C.CREEP :
                    dist > 1.5 ? C.CR_LIGHT :
                    maybe(0.3, rng) ? C.BIO_PURPLE : C.BIO_GREEN;
          rpl(hx + dx, hy + dy, hz + dz, c);
        }
      }

  for (let dy = 1; dy <= 2; dy++) {
    rpl(hx, hy + dy, hz, pick([C.BIO_GREEN, C.BIO_PURPLE, C.SPORE_YLW], rng));
  }

  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  for (const [ddx, ddz] of dirs) {
    if (maybe(0.4, rng)) continue;
    for (let len = 1; len <= 4; len++) {
      const tx = hx + ddx * len;
      const tz = hz + ddz * len;
      if (maybe(0.5, rng)) rpl(tx, hy + 1, tz, pick([C.TEND_PINK, C.TEND_RED, C.CREEP], rng));
      if (len > 2 && maybe(0.3, rng)) rpl(tx, hy + 2, tz, C.CREEP);
    }
  }

  for (let i = 0; i < 6; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = 2 + rng() * 2;
    const cx = hx + Math.round(Math.cos(angle) * dist);
    const cz = hz + Math.round(Math.sin(angle) * dist);
    for (let dy = 0; dy <= 1; dy++) {
      if (maybe(0.3, rng)) continue;
      rpl(cx, hy + dy, cz, dy === 1 ? pick([C.CYST_RED, C.SPORE_YLW], rng) : C.CR_DARK);
    }
  }

  for (let dx = -5; dx <= 5; dx++)
    for (let dz = -5; dz <= 5; dz++) {
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= 5 && maybe(0.5 - dist * 0.06, rng)) {
        rpl(hx + dx, 1, hz + dz, dist > 3 ? C.CREEP : pick([C.CR_DARK, C.CR_VEIN], rng));
      }
    }
}

// ─── Crystals ─────────────────────────────────────────

function buildCrystals(rng) {
  const blues = [C.CRY_BLUE, C.CRY_BLUE_LT];
  const purples = [C.CRY_PURPLE, C.CRY_PURPLE_LT];
  const corrupted = [C.CRY_PURPLE, C.CRY_PURPLE_LT, C.ENE_CORRUPT];

  function cluster(bx, bz, by, height, colors, rng) {
    for (let h = 0; h < height; h++) {
      const spread = Math.max(1, 2 - Math.floor(h * 0.4));
      const half = Math.floor(spread / 2);
      for (let dx = -half; dx <= half; dx++)
        for (let dz = -half; dz <= half; dz++) {
          if (dx === 0 && dz === 0) {
            rpl(bx, by + h, bz, pick(colors, rng));
          } else if (h < height - 1 && rng() > 0.5) {
            rpl(bx + dx, by + h, bz + dz, pick(colors, rng));
          }
        }
    }
  }

  // Blue crystals at entrance
  cluster(-9, 15, 1, 5, blues, rng);
  cluster(-6, 13, 1, 4, blues, rng);
  cluster(6, 13, 1, 4, blues, rng);
  cluster(9, 15, 1, 5, blues, rng);
  cluster(-13, 18, 1, 3, blues, rng);
  cluster(13, 18, 1, 3, blues, rng);

  // Purple corrupted around altar (replaced by infestation heart)
  // Still a few corrupted crystals around the heart
  cluster(-6, -11, 2, 4, purples, rng);
  cluster(6, -11, 2, 4, purples, rng);
  cluster(-4, -16, 2, 3, purples, rng);
  cluster(4, -16, 2, 3, purples, rng);

  // Corrupted crystals spreading through the temple
  cluster(-11, 10, 1, 4, corrupted, rng);
  cluster(11, 8, 1, 3, corrupted, rng);
  cluster(-11, -4, 1, 3, corrupted, rng);
  cluster(11, -6, 1, 3, corrupted, rng);

  // Some blue crystals inside, half-corrupted
  cluster(-8, -2, 1, 3, [...blues, ...purples], rng);
  cluster(8, -3, 1, 3, [...blues, ...purples], rng);
}

// ─── Pervasive Creep ──────────────────────────────────

function buildPervasiveCreep(rng) {
  const cColors = [C.CREEP, C.CR_DARK, C.CR_LIGHT, C.CR_VEIN, C.ORG_BROWN];

  const bigBlobs = [
    [-18, -22, 7], [18, -22, 7], [-18, 22, 6], [18, 22, 6],
    [0, -24, 6], [-20, 0, 5], [20, 0, 5], [0, 24, 5],
    [-12, 20, 5], [12, 20, 5], [-22, -14, 4], [22, -14, 4],
  ];

  for (const [cx, cz, radius] of bigBlobs) {
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= radius && maybe(0.65 - dist * 0.03, rng)) {
          const c = dist > radius * 0.7 ? C.CREEP : pick(cColors, rng);
          rpl(cx + dx, 0, cz + dz, c);
          if (dist < radius * 0.4 && maybe(0.4, rng)) {
            rpl(cx + dx, 1, cz + dz, pick(cColors, rng));
          }
        }
      }
  }

  for (let i = 0; i < 18; i++) {
    const angle = rng() * Math.PI * 2;
    const startDist = 12 + rng() * 10;
    const vx = Math.round(Math.cos(angle) * startDist);
    const vz = Math.round(Math.sin(angle) * startDist);
    const length = randInt(5, 14, rng);

    for (let l = 0; l < length; l++) {
      const px = vx + Math.round(Math.cos(angle + rng() * 0.3) * l);
      const pz = vz + Math.round(Math.sin(angle + rng() * 0.3) * l);
      if (Math.abs(px) > 22 || Math.abs(pz) > 26) break;
      rpl(px, 0, pz, pick([C.CR_VEIN, C.CR_DARK, C.CREEP], rng));
      if (maybe(0.25, rng)) rpl(px, 1, pz, C.CR_VEIN);
    }
  }
}

// ─── Creep on Walls ───────────────────────────────────

function buildCreepWalls(rng) {
  const cColors = [C.CREEP, C.CR_DARK, C.CR_LIGHT, C.ORG_BROWN];

  for (let x = -16; x <= -15; x++) {
    for (let z = -18; z <= 18; z++) {
      if (maybe(0.5, rng)) {
        const height = randInt(1, 4, rng);
        for (let y = 1; y <= 1 + height; y++) {
          if (maybe(0.6 - y * 0.08, rng))
            rpl(x, y, z, pick(cColors, rng));
        }
      }
    }
  }

  for (let x = 15; x <= 16; x++) {
    for (let z = -18; z <= 18; z++) {
      if (maybe(0.5, rng)) {
        const height = randInt(1, 4, rng);
        for (let y = 1; y <= 1 + height; y++) {
          if (maybe(0.6 - y * 0.08, rng))
            rpl(x, y, z, pick(cColors, rng));
        }
      }
    }
  }

  for (let x = -14; x <= 14; x++) {
    for (let z = -18; z <= -17; z++) {
      if (maybe(0.4, rng)) {
        const height = randInt(1, 3, rng);
        for (let y = 1; y <= 1 + height; y++) {
          if (maybe(0.5 - y * 0.08, rng))
            rpl(x, y, z, pick(cColors, rng));
        }
      }
    }
  }

  for (let z = 17; z <= 18; z++) {
    for (let x = -16; x <= -7; x++) {
      if (maybe(0.3, rng)) {
        const height = randInt(1, 3, rng);
        for (let y = 1; y <= 1 + height; y++) {
          if (maybe(0.4 - y * 0.06, rng))
            rpl(x, y, z, pick(cColors, rng));
        }
      }
    }
    for (let x = 7; x <= 16; x++) {
      if (maybe(0.3, rng)) {
        const height = randInt(1, 3, rng);
        for (let y = 1; y <= 1 + height; y++) {
          if (maybe(0.4 - y * 0.06, rng))
            rpl(x, y, z, pick(cColors, rng));
        }
      }
    }
  }
}

// ─── Hanging Tendrils ────────────────────────────────

function buildHangingTendrils(rng) {
  const tendColors = [C.TEND_RED, C.TEND_PINK, C.CR_LIGHT, C.ORG_BROWN, C.BIO_GREEN];
  const tDir = [[0,0],[1,0],[-1,0],[0,1],[0,-1]];

  // From the archway ceiling (y=6, z=17..18, x=-5..5)
  for (let x = -5; x <= 5; x++) {
    if (maybe(0.4, rng)) {
      const length = randInt(1, 4, rng);
      const startY = 6;
      for (let y = startY; y >= startY - length; y--) {
        if (maybe(0.7, rng)) {
          place(x, y, 17, pick(tendColors, rng));
          place(x, y, 18, pick(tendColors, rng));
        }
      }
    }
  }

  // From the roof edges
  const roofEdgePoints = [];
  for (let x = -12; x <= 12; x++) {
    roofEdgePoints.push([x, 10, -12], [x, 10, 12]);
  }
  for (let z = -12; z <= 12; z++) {
    roofEdgePoints.push([-12, 10, z], [12, 10, z]);
  }
  // From pyramid steps
  for (let x = -6; x <= 6; x++) {
    roofEdgePoints.push([x, 12, -6], [x, 12, 6]);
  }
  for (let z = -6; z <= 6; z++) {
    roofEdgePoints.push([-6, 12, z], [6, 12, z]);
  }

  const shuffled = [...roofEdgePoints].sort(() => rng() - 0.5);
  const numHanging = randInt(8, 16, rng);
  for (let i = 0; i < numHanging && i < shuffled.length; i++) {
    const [hx, hy, hz] = shuffled[i];
    const length = randInt(2, 5, rng);
    for (let d = 1; d <= length; d++) {
      if (maybe(0.5, rng)) {
        if (d % 2 === 0 && maybe(0.3, rng)) {
          const [dx, dz] = pick(tDir, rng);
          place(hx + dx, hy - d, hz + dz, pick(tendColors, rng));
        }
        place(hx, hy - d, hz, pick(tendColors, rng));
      }
    }
  }
}

// ─── Webbing ──────────────────────────────────────────

function buildWebbing(rng) {
  const webColors = [C.MUCUS, C.ORG_TAN, C.CR_LIGHT];
  const wDir = [[1,0],[-1,0],[0,1],[0,-1]];
  const wDirDiag = [[1,1],[-1,1],[1,-1],[-1,-1]];

  // Webbing between the two pylons
  for (let y = 3; y <= 10; y += 2) {
    if (maybe(0.5, rng)) {
      for (let x = -9; x <= 9; x++) {
        const c = pick(webColors, rng);
        place(x, y, 20, c);
      }
    }
  }

  // Strands from pylons to temple walls
  const strandPoints = [
    { from: [-10, 20], to: [-16, 18], y: [2, 4, 6] },
    { from: [10, 20], to: [16, 18], y: [2, 4, 6] },
  ];

  for (const sp of strandPoints) {
    for (const sy of sp.y) {
      if (maybe(0.4, rng)) {
        const [fx, fz] = sp.from;
        const [tx, tz] = sp.to;
        const steps = Math.abs(fx - tx) + Math.abs(fz - tz);
        for (let s = 0; s <= steps; s++) {
          const t = s / Math.max(steps, 1);
          const wx = Math.round(fx + (tx - fx) * t);
          const wz = Math.round(fz + (tz - fz) * t);
          place(wx, sy, wz, pick(webColors, rng));
          if (maybe(0.3, rng)) {
            const [ddx, ddz] = pick(wDir, rng);
            place(wx + ddx, sy, wz + ddz, pick(webColors, rng));
          }
        }
      }
    }
  }

  // Webs inside the archway opening (sparse strands)
  for (let y = 3; y <= 5; y++) {
    if (maybe(0.3, rng)) {
      for (let x = -4; x <= 4; x += 2) {
        place(x, y, 18, pick(webColors, rng));
        place(x, y, 17, pick(webColors, rng));
      }
    }
  }

  // Random webbing on walls
  for (let i = 0; i < 10; i++) {
    const wx = randInt(-15, 15, rng);
    const wz = randInt(-17, 17, rng);
    const wy = randInt(2, 6, rng);
    if (maybe(0.5, rng)) {
      const size = randInt(2, 4, rng);
      for (let s = 0; s < size; s++) {
        const [ddx, ddz] = pick([...wDir, ...wDirDiag], rng);
        place(wx + ddx * s, wy, wz + ddz * s, pick(webColors, rng));
      }
    }
  }
}

// ─── Spore Towers ────────────────────────────────────

function buildSporeTowers(rng) {
  const sporeColors = [C.SPORE_YLW, C.BIO_GREEN, C.TUMOR, C.MUCUS];
  const sporePositions = [
    [-20, -22], [20, -22], [-20, 22], [20, 22],
    [-22, -15], [22, -15], [-22, 15], [22, 15],
  ];

  const numTowers = randInt(3, 6, rng);
  const shuffled = [...sporePositions].sort(() => rng() - 0.5);
  for (let i = 0; i < numTowers && i < shuffled.length; i++) {
    const [sx, sz] = shuffled[i];
    const height = randInt(4, 8, rng);

    for (let y = 0; y < height; y++) {
      rpl(sx, y, sz, pick([C.ORG_BROWN, C.ORG_TAN, C.CREEP], rng));
      if (y > 1 && maybe(0.3, rng)) {
        const bDir = pick([[1,0],[-1,0],[0,1],[0,-1]], rng);
        place(sx + bDir[0], y, sz + bDir[1], pick(sporeColors, rng));
      }
    }

    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) {
          place(sx, height, sz, pick([C.SPORE_YLW, C.BIO_GREEN], rng));
        } else if (maybe(0.4, rng)) {
          place(sx + dx, height - 1, sz + dz, pick(sporeColors, rng));
        }
      }

    if (maybe(0.5, rng)) {
      place(sx, height + 1, sz, pick([C.BIO_GREEN, C.BIO_PURPLE, C.SPORE_YLW], rng));
    }
  }
}

// ─── Shadow Pools ────────────────────────────────────

function buildShadowPools(rng) {
  const poolPositions = [
    [-24, -20], [24, -20], [-24, 20], [24, 20],
    [-5, -24], [5, -24], [-24, -5], [24, 5],
    [-18, -24], [18, -24], [-18, 24], [18, 24],
  ];

  for (const [px, pz] of poolPositions) {
    if (maybe(0.5, rng)) {
      const size = randInt(2, 4, rng);
      for (let dx = -size; dx <= size; dx++)
        for (let dz = -size; dz <= size; dz++) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist <= size && maybe(0.6 - dist * 0.08, rng)) {
            rpl(px + dx, 0, pz + dz, dist > size * 0.6 ? C.VOID : C.DEEP_VOID);
            if (dist <= size * 0.3 && maybe(0.4, rng)) {
              rpl(px + dx, 1, pz + dz, pick([C.VOID, C.DEEP_VOID, C.BIO_PURPLE], rng));
            }
          }
        }
    }
  }
}

// ─── Tendrils (enhanced) ──────────────────────────────

function buildTendrils(rng) {
  const tendColors = [C.TEND_RED, C.TEND_PINK, C.ORG_BROWN, C.ORG_TAN, C.BIO_GREEN];
  const tendrilSpots = [
    [-16, -14], [-16, -4], [-16, 6],  [-16, 12],
    [16, -16],  [16, -6],  [16, 8],   [16, 14],
    [-10, -18], [-2, -18], [6, -18],  [12, -18],
    [-12, 18],  [-8, 18],  [8, 18],   [12, 18],
    [-14, -14], [14, -14], [-14, 12], [14, 12],
    [-8, -10],  [8, -10],  [-6, 4],   [6, 4],
  ];

  const numTendrils = randInt(10, 18, rng);
  const shuffled = [...tendrilSpots].sort(() => rng() - 0.5);
  const wDir = [[0,0],[1,0],[-1,0],[0,1],[0,-1]];

  for (let i = 0; i < numTendrils && i < shuffled.length; i++) {
    const [tx, tz] = shuffled[i];
    const height = randInt(3, 7, rng);
    for (let y = 1; y <= height; y++) {
      rpl(tx, y, tz, pick(tendColors, rng));
      if (maybe(0.5, rng) && y < height) {
        const [dx, dz] = pick(wDir, rng);
        rpl(tx + dx, y + 1, tz + dz, pick(tendColors, rng));
      }
    }
    if (maybe(0.3, rng)) {
      place(tx, height + 1, tz, pick([C.BIO_GREEN, C.BIO_PURPLE, C.TEND_PINK], rng));
    }
  }
}

// ─── Creep Tumors ─────────────────────────────────────

function buildCreepTumors(rng) {
  const tumorPositions = [
    [-18, -20], [18, -20], [-18, 16], [18, 16],
    [-20, -18], [20, -18], [-20, 18], [20, 18],
    [-14, -10], [14, -10], [-14, 10], [14, 10],
  ];

  for (const [tx, tz] of tumorPositions) {
    if (maybe(0.4, rng)) {
      const size = randInt(1, 2, rng);
      for (let dx = -size; dx <= size; dx++)
        for (let dz = -size; dz <= size; dz++)
          for (let dy = 0; dy < size + 1; dy++) {
            const dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
            if (dist <= size && maybe(0.7, rng)) {
              const c = dist > size * 0.6 ?
                pick([C.TUMOR, C.MUCUS], rng) :
                pick([C.TUMOR_DRK, C.TUMOR, C.CYST_RED], rng);
              rpl(tx + dx, dy, tz + dz, c);
            }
          }
    }
  }
}

// ─── Wall Damage ──────────────────────────────────────

function buildWallDamage(rng) {
  const damageZones = [
    { x1: -14, x2: -12, z1: -18, z2: -17, y1: 4, y2: 8 },
    { x1: 15, x2: 16, z1: -4, z2: -2, y1: 2, y2: 6 },
    { x1: -5, x2: -3, z1: -18, z2: -17, y1: 4, y2: 7 },
    { x1: 14, x2: 15, z1: 10, z2: 12, y1: 2, y2: 5 },
    { x1: -4, x2: -2, z1: 17, z2: 18, y1: 2, y2: 4 },
    { x1: -16, x2: -15, z1: 4, z2: 6, y1: 5, y2: 8 },
    { x1: 15, x2: 16, z1: -14, z2: -12, y1: 4, y2: 7 },
    { x1: -10, x2: -8, z1: -18, z2: -17, y1: 3, y2: 5 },
  ];

  for (const zone of damageZones) {
    if (maybe(0.45, rng)) {
      for (let x = zone.x1; x <= zone.x2; x++)
        for (let z = zone.z1; z <= zone.z2; z++)
          for (let y = zone.y1; y <= zone.y2; y++)
            if (maybe(0.4, rng)) rpl(x, y, z, C.VOID);
    }
  }
}

// ─── Debris / Broken Structures ──────────────────────

function buildDebris(rng) {
  const fX = -19, fZ = -8;
  for (let y = 0; y < 2; y++) {
    for (let z = -14; z <= -2; z++) {
      if (z >= -6 && z <= -4) continue;
      rpl(fX, y, z, z % 4 === 0 ? pick([C.GOLD, C.GOLD_TARN], rng) : C.METAL);
    }
  }
  for (const [rx, ry, rz] of [[-20,0,-2],[-19,0,-1],[-19,1,-2],[-20,0,-14],[-19,1,-15],[-19,0,-13],[-19,1,-3]]) {
    if (maybe(0.6, rng)) rpl(rx, ry, rz, pick([C.METAL, C.GOLD_TARN], rng));
  }

  const bX = 20, bZ = -10;
  for (let y = 1; y <= 6; y++) {
    const half = y <= 3 ? 2 : 1;
    for (let dx = -half; dx <= half; dx++)
      for (let dz = -half; dz <= half; dz++)
        rpl(bX + dx, y, bZ + dz, C.METAL);
  }
  rpl(bX + 1, 7, bZ, C.METAL);
  rpl(bX - 1, 7, bZ, C.METAL);
  rpl(bX, 7, bZ + 1, C.METAL);
  rpl(bX, 7, bZ - 1, C.GOLD);

  for (const [dx, dy, dz] of [[18,0,-12],[19,0,-11],[21,0,-10],[22,0,-9],[20,0,-8],[20,1,-8],[19,0,-9],[21,0,-11],[22,0,-11],[18,1,-10]]) {
    if (maybe(0.5, rng)) rpl(dx, dy, dz, pick([C.METAL, C.RUBBLE, C.GOLD_DARK, C.GOLD_TARN], rng));
  }

  const collapseSpots = [
    { x: -10, z: -16, dir: 'z' },
    { x: 10, z: -16, dir: 'z' },
    { x: -15, z: 10, dir: 'x' },
  ];
  for (const cs of collapseSpots) {
    if (maybe(0.4, rng)) {
      const len = randInt(3, 6, rng);
      for (let i = 0; i < len; i++) {
        const ox = cs.dir === 'z' ? randInt(-1, 1, rng) : i;
        const oz = cs.dir === 'x' ? randInt(-1, 1, rng) : i;
        rpl(cs.x + ox, 0, cs.z + oz, pick([C.RUBBLE, C.STONE_DARK, C.METAL_DARK, C.GOLD_DARK], rng));
        if (maybe(0.3, rng)) rpl(cs.x + ox, 1, cs.z + oz, pick([C.RUBBLE, C.METAL_DARK], rng));
      }
    }
  }

  const rubbleSpots = [[-24,15],[24,15],[-24,-22],[24,-22],[-24,-10],[24,10],[-15,24],[15,24],[-24,0],[24,0],[0,-24]];
  for (const [rx, rz] of rubbleSpots) {
    const count = randInt(3, 7, rng);
    for (let i = 0; i < count; i++) {
      const ox = Math.floor(rng() * 5 - 2);
      const oz = Math.floor(rng() * 5 - 2);
      rpl(rx + ox, 0, rz + oz, pick([C.RUBBLE, C.STONE_DARK, C.STONE, C.GOLD_DARK], rng));
      if (maybe(0.4, rng)) rpl(rx + ox, 1, rz + oz, pick([C.RUBBLE, C.STONE_DARK], rng));
    }
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

  // Core structure
  buildGround();
  buildWalls();
  buildPylons(rng);
  buildRoof();
  buildInterior(rng);

  // Corruption & decay
  buildTarnishedMetal(rng);
  buildPervasiveCreep(rng);
  buildCreepWalls(rng);
  buildTendrils(rng);
  buildCreepTumors(rng);
  buildHangingTendrils(rng);
  buildWebbing(rng);
  buildSporeTowers(rng);
  buildShadowPools(rng);
  buildInfestationHeart(rng);
  buildCrystals(rng);
  buildDebris(rng);
  buildWallDamage(rng);

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

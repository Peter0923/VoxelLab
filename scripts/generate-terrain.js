/**
 * Standalone terrain generator — runs in Node.js to produce a .scene file
 * that can be loaded into the VoxelLab renderer.
 *
 * Usage:
 *   node scripts/generate-terrain.js [--size 100] [--height 20] [--seed 42] [--name terrain]
 *
 * The output file is written to public/scenes/{name}.scene
 */

import { generateTerrainCubes, getHeightAt, formatSceneJSON } from '../src/TerrainGenerator.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Parse CLI args ---
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

const size     = parseInt(args.size, 10)     || 100;
const heightScale = parseInt(args.height, 10) || 20;
const seed     = parseInt(args.seed, 10)     || 42;
const name     = args.name                   || 'terrain';
const octaves  = parseInt(args.octaves, 10)  || 6;

console.log(`=== Terrain Generator ===`);
console.log(`Size: ${size}×${size}`);
console.log(`Height scale: ${heightScale}`);
console.log(`Seed: ${seed}`);
console.log(`Octaves: ${octaves}`);
console.log(`Scene name: ${name}`);
console.log('');

// --- Generate terrain ---
const start = performance.now();

const { cubes, heightmap } = generateTerrainCubes({
  size,
  heightScale,
  seed,
  octaves,
});

const elapsed = ((performance.now() - start) / 1000).toFixed(2);

console.log(`Generated ${cubes.length.toLocaleString()} cubes in ${elapsed}s`);
console.log(`Max height: ${heightmap.maxHeight} blocks`);

// --- Get center height for character placement ---
const centerHeight = getHeightAt(0, 0, heightmap.heights, heightmap.size);
const charY = centerHeight + 1; // stand on top, not inside
console.log(`Center terrain height: ${centerHeight} blocks`);
console.log(`Character placed at: y=${charY}`);
console.log('');

// --- Format & write scene file ---
const json = formatSceneJSON(name, cubes, charY);

// __dirname equivalent for ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, '..', 'public', 'scenes');
const outputPath = path.join(outputDir, `${name}.scene`);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, json, 'utf-8');

const fileSizeMB = (Buffer.byteLength(json, 'utf-8') / (1024 * 1024)).toFixed(2);
console.log(`Written to: ${outputPath}`);
console.log(`File size: ${fileSizeMB} MB`);
console.log('Done!');
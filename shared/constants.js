/**
 * Shared constants used by both client and server.
 * Extracted from CharacterController.js, InteractionManager.js, and main.js.
 */

// --- Character dimensions (AABB) ---
export const CHAR_HALF_X = 0.4;
export const CHAR_HALF_Z = 0.4;
export const CHAR_HEIGHT = 2.0;

// --- Movement physics ---
export const MOVE_SPEED = 2.5;
export const JUMP_SPEED = 10;
export const GRAVITY = -18;

// --- World ---
export const CHUNK_SIZE = 16;
export const GROUND_SIZE = 50;

// --- Networking ---
export const TICK_RATE = 20;                    // Server tick rate (Hz)
export const TICK_INTERVAL_MS = 1000 / TICK_RATE; // 50ms
export const MAX_PLAYERS = 50;                  // Max players per world

// --- World lifecycle ---
export const WORLD_DESTROY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// --- Raycasting ---
export const MAX_RAY_DISTANCE = 80;
export const MAX_RAY_STEPS = 240;               // maxSteps = ceil(MAX_RAY_DISTANCE * 3)

// --- Collision margin (prevents floating-point sticking) ---
export const COLLISION_MARGIN = 0.001;
export const CELL_EPSILON = 1e-7;               // Floor epsilon for AABB→cell conversion

// --- Entity interpolation ---
export const INTERP_DELAY_MS = 150;             // Render remote players this far behind server time (3x TICK_INTERVAL)

// --- CSP reconciliation ---
export const MAX_DELTA = 0.1;                   // Cap delta to prevent speed hacks

// --- Chat ---
export const CHAT_MAX_MESSAGES = 5;             // Max visible messages in chat area
export const CHAT_FADE_TIME_MS = 10000;         // Messages auto-fade after this many ms

// --- Character presets ---
export const CHARACTER_PRESETS = [
  {
    id: 'classic',
    name: 'Classic',
    shirt:  { r: 0.800, g: 0.133, b: 0.133 },
    pants:  { r: 0.133, g: 0.267, b: 0.667 },
    shoes:  { r: 0.133, g: 0.133, b: 0.133 },
    skin:   { r: 0.992, g: 0.851, b: 0.710 },
    hair:   { r: 0.333, g: 0.200, b: 0.067 },
  },
  {
    id: 'athlete',
    name: 'Athlete',
    shirt:  { r: 0.133, g: 0.667, b: 0.267 },
    pants:  { r: 0.200, g: 0.200, b: 0.200 },
    shoes:  { r: 0.933, g: 0.933, b: 0.933 },
    skin:   { r: 0.859, g: 0.682, b: 0.510 },
    hair:   { r: 0.867, g: 0.667, b: 0.200 },
  },
  {
    id: 'punk',
    name: 'Punk',
    shirt:  { r: 0.600, g: 0.133, b: 0.800 },
    pants:  { r: 0.067, g: 0.067, b: 0.067 },
    shoes:  { r: 0.867, g: 0.133, b: 0.133 },
    skin:   { r: 0.910, g: 0.835, b: 0.718 },
    hair:   { r: 0.067, g: 0.067, b: 0.067 },
  },
  {
    id: 'explorer',
    name: 'Explorer',
    shirt:  { r: 0.867, g: 0.533, b: 0.133 },
    pants:  { r: 0.545, g: 0.431, b: 0.306 },
    shoes:  { r: 0.333, g: 0.200, b: 0.067 },
    skin:   { r: 0.545, g: 0.416, b: 0.306 },
    hair:   { r: 0.533, g: 0.533, b: 0.533 },
  },
];

/**
 * Get a character preset by ID.
 * @param {string} id
 * @returns {object} The full preset object
 */
export function getPresetById(id) {
  return CHARACTER_PRESETS.find(p => p.id === id) || CHARACTER_PRESETS[0];
}

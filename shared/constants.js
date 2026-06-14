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

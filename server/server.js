#!/usr/bin/env node
/**
 * VoxelLab Multiplayer Server
 *
 * Entry point for the authoritative game server. Starts an HTTP server
 * on port 3001 (configurable via PORT env var) with WebSocket upgrade
 * support via the `ws` library.
 *
 * Usage:
 *   node server/server.js
 *   PORT=4000 node server/server.js
 */

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { WorldManager } from './WorldManager.js';
import { DISCOVER, WORLD_LIST } from '../shared/messages.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

// --- Create HTTP server ---
const httpServer = createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // REST endpoint: get world list (also available via WebSocket DISCOVER)
  if (req.method === 'GET' && req.url === '/api/worlds') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: WORLD_LIST, worlds: worldManager.getWorldList() }));
    return;
  }

  // REST endpoint: delete a world
  if (req.method === 'DELETE' && req.url.startsWith('/api/worlds/')) {
    const worldId = decodeURIComponent(req.url.slice('/api/worlds/'.length));
    if (!worldId) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'World ID is required' }));
      return;
    }
    console.log(`[server] Deleting world "${worldId}" via REST API`);
    worldManager.deleteWorld(worldId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', worlds: worldManager._worlds.size }));
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not Found');
});

// --- Create WebSocket server ---
const wss = new WebSocketServer({ server: httpServer });

// --- Create world manager ---
const worldManager = new WorldManager();

// --- Handle WebSocket connections ---
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[server] WebSocket connected from ${clientIp}`);
  worldManager.onConnection(ws);
});

// --- Start listening ---
httpServer.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       VoxelLab Multiplayer Server        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  HTTP + WS listening on port ${PORT}        ║`);
  console.log(`║  WebSocket:   ws://localhost:${PORT}         ║`);
  console.log(`║  REST API:    http://localhost:${PORT}/api/worlds ║`);
  console.log(`║  Health:      http://localhost:${PORT}/health   ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

// --- Graceful shutdown ---

function gracefulShutdown(signal) {
  console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);

  // Close WebSocket server first to stop accepting new connections
  wss.close(() => {
    console.log('[server] WebSocket server closed.');

    // Destroy all worlds and close the database
    worldManager.close();

    // Close HTTP server
    httpServer.close(() => {
      console.log('[server] HTTP server closed. Goodbye.');
      process.exit(0);
    });
  });

  // Force exit after 5 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('[server] Forced shutdown after timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

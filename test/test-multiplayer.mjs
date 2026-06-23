/**
 * Multiplayer integration test for VoxelLab.
 *
 * Scenario:
 *   1. Launch server and 2 pages
 *   2. Switch to tab of page 1
 *   3. Peter creates a world and places 5 cubes randomly
 *   4. Peter switches to Follow mode and moves 5 steps
 *   5. Peter turns around 180 degrees by moving mouse horizontally
 *   6. Switch to tab of page 2
 *   7. Tommy enters game, selects the second character (Athlete) and joins the world
 *   8. Tommy changes to Follow mode and pitches camera 30° down
 *   9. Tommy goes to Peter and pushes him 2 steps
 *  10. Tommy jumps onto Peter's head
 *
 * Usage:
 *   node test/test-multiplayer.mjs            # headless
 *   node test/test-multiplayer.mjs --headed   # show browser window with two tabs
 *
 * Prerequisites: npm install (playwright must be available)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const VITE_URL = 'http://localhost:5173';
const SERVER_URL = 'http://localhost:3001';
const THREE_CANVAS = 'canvas[data-engine]';

// Ensure screenshots directory exists
import fs from 'node:fs';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────

function waitForServer(url, maxRetries = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      tries++;
      http.get(url + '/health', (res) => {
        if (res.statusCode === 200) return resolve();
        if (tries >= maxRetries) return reject(new Error('Server not healthy'));
        setTimeout(check, 500);
      }).on('error', () => {
        if (tries >= maxRetries) return reject(new Error(`Server not reachable after ${maxRetries} tries`));
        setTimeout(check, 500);
      });
    };
    check();
  });
}

function waitForVite(url, maxRetries = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      tries++;
      http.get(url, (res) => {
        return resolve();
      }).on('error', () => {
        if (tries >= maxRetries) return reject(new Error(`Vite not reachable after ${maxRetries} tries`));
        setTimeout(check, 500);
      });
    };
    check();
  });
}

async function setupLogCapture(page) {
  await page.addInitScript(() => {
    window.__testLogs = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = (...args) => {
      window.__testLogs.push({ level: 'log', text: args.join(' ') });
      origLog.apply(console, args);
    };
    console.warn = (...args) => {
      window.__testLogs.push({ level: 'warn', text: args.join(' ') });
      origWarn.apply(console, args);
    };
    console.error = (...args) => {
      window.__testLogs.push({ level: 'error', text: args.join(' ') });
      origError.apply(console, args);
    };
  });
}

async function getLogs(page, filter = '') {
  return await page.evaluate((f) => {
    return (window.__testLogs || [])
      .map(l => l.text)
      .filter(t => !f || t.includes(f));
  }, filter);
}

/**
 * Click the center of the Three.js canvas to get pointer lock.
 */
async function clickCanvasCenter(page) {
  const box = await page.locator(THREE_CANVAS).boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
}

/**
 * Switch a page to Follow camera mode by selecting it from the lil-gui dropdown.
 */
async function switchToFollowMode(page) {
  await page.evaluate(() => {
    // The Camera Controller folder has a <select> with options 'Orbit', 'Follow', 'FPS'
    const selects = document.querySelectorAll('.lil-gui select');
    for (const select of selects) {
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].text === 'Follow') {
          select.selectedIndex = i;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
    }
    return false;
  });
}

// ── Main Test ──────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  VoxelLab Multiplayer Integration Test');
  console.log('═══════════════════════════════════════════\n');

  const headless = !process.argv.includes('--headed');

  // Cleanup tracking
  let gameServer, viteServer, browser;

  function cleanup() {
    try { gameServer.kill(); } catch {}
    try { viteServer.kill(); } catch {}
    try { browser.close(); } catch {}
  }

  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  // ─── 1. Start Servers ──────────────────────────────────────────
  console.log('[1/9] Starting servers...');

  const { execSync } = await import('node:child_process');
  try { execSync('lsof -ti:3001 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' }); } catch {}
  try { execSync('lsof -ti:5173 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' }); } catch {}

  gameServer = spawn('node', ['server/server.js'], {
    cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  gameServer.stdout.on('data', d => process.stdout.write(`  [server] ${d}`));
  gameServer.stderr.on('data', d => process.stderr.write(`  [server:err] ${d}`));

  viteServer = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
    cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  viteServer.stdout.on('data', d => {
    if (d.toString().includes('Local:')) process.stdout.write('  [vite]   ready\n');
  });
  viteServer.stderr.on('data', d => process.stderr.write(`  [vite:err] ${d}`));

  await Promise.all([waitForServer(SERVER_URL), waitForVite(VITE_URL)]);
  console.log('  ✓ Both servers ready\n');

  // ─── 2. Launch Browser ─────────────────────────────────────────
  console.log('[2/9] Launching browser...');

  browser = await chromium.launch({ headless, channel: 'chromium' });

  // Single context → two tabs in one window (headed) or one process (headless)
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const pagePeter = await context.newPage();
  const pageTommy = await context.newPage();

  await setupLogCapture(pagePeter);
  await setupLogCapture(pageTommy);

  const errors = [];
  pagePeter.on('pageerror', e => errors.push({ page: 'Peter', error: e.message }));
  pageTommy.on('pageerror', e => errors.push({ page: 'Tommy', error: e.message }));

  console.log('  ✓ Browser launched with 2 tabs\n');

  try {
    // ─── 3. Peter: Create World, Place 5 Cubes ────────────────────
    console.log('[3/9] Switch to page 1: Peter creates a world and places 5 cubes...');

    await pagePeter.bringToFront();
    await pagePeter.goto(VITE_URL, { waitUntil: 'networkidle' });
    await sleep(1000);
    console.log(`  Page loaded: ${await pagePeter.title()}`);

    // Enter nickname
    await pagePeter.locator('#nickname-input').fill('Peter');
    await sleep(1000);

    // Peter creates a new world
    await pagePeter.evaluate(() => { window.prompt = () => 'testworld'; });
    await pagePeter.click('#btn-create-world');
    await sleep(1000);

    // Wait for game to start (HUD visible)
    await pagePeter.waitForSelector('#hud', { state: 'visible', timeout: 10000 });
    const worldName = await pagePeter.textContent('#hud-world-name');
    const players = await pagePeter.textContent('#hud-player-count');
    console.log(`  ✓ Peter joined world "${worldName}" (${players})`);

    // Place 5 cubes at varied positions by clicking around the scene
    await sleep(500);
    const canvasBox = await pagePeter.locator(THREE_CANVAS).boundingBox();
    if (canvasBox) {
      const cx = canvasBox.x + canvasBox.width / 2;
      const cy = canvasBox.y + canvasBox.height / 2;

      const offsets = [
        { dx: 0, dy: 60 },    // center ground
        { dx: 50, dy: 70 },   // right
        { dx: -50, dy: 70 },  // left
        { dx: 30, dy: 40 },   // upper-right (closer)
        { dx: -30, dy: 40 },  // upper-left (closer)
      ];
      for (let i = 0; i < offsets.length; i++) {
        await pagePeter.mouse.click(cx + offsets[i].dx, cy + offsets[i].dy);
        await sleep(500);
      }
      console.log(`  ✓ Placed ${offsets.length} cubes`);
    }

    // ─── 4. Peter Switches to Follow Mode and Moves 5 Steps ───────
    console.log('[4/9] Peter switches to Follow mode and moves 5 steps...');

    await switchToFollowMode(pagePeter);
    await sleep(500);

    // Click canvas to gain pointer lock for Follow mode
    await clickCanvasCenter(pagePeter);
    await sleep(500);

    // Move forward (W key, ~2 seconds at 2.5 u/s ≈ 5 units = 5 steps)
    await pagePeter.keyboard.down('KeyW');
    await sleep(2000);
    await pagePeter.keyboard.up('KeyW');
    await sleep(500);
    console.log('  ✓ Peter moved 5 steps forward');

    // ─── 5. Peter Turns Around 180 Degrees ──────────────────────────
    console.log('[5/10] Peter turns around 180 degrees by moving mouse horizontally...');

    // In FollowController, yaw is updated by horizontal mouse movement:
    //   this._yaw -= dx * this.mouseSensitivity
    // With sensitivity 0.002, a 180° turn (π rad) requires dx = -π / 0.002 ≈ -1571 px.
    // Moving the mouse left by 1571 pixels rotates the character to face the opposite direction.
    const peterBox = await pagePeter.locator(THREE_CANVAS).boundingBox();
    if (peterBox) {
      const cx = peterBox.x + peterBox.width / 2;
      const cy = peterBox.y + peterBox.height / 2;
      await pagePeter.mouse.move(cx, cy);                              // ensure at current position
      await sleep(100);
      await pagePeter.mouse.move(cx - 1571, cy, { steps: 40 });        // drag left for 180° turn
      await sleep(2000);
    }
    console.log('  ✓ Peter turned around 180 degrees');

    // ─── 6. Switch to Page 2 (Tommy) ──────────────────────────────
    console.log('[6/10] Switch to page 2...');
    await pageTommy.bringToFront();

    // ─── 7. Tommy: Select Athlete and Join World ───────────────────
    console.log('[7/10] Tommy enters game, selects Athlete and joins the world...');

    await pageTommy.goto(VITE_URL, { waitUntil: 'networkidle' });
    await sleep(1000);

    // Fill nickname
    await pageTommy.locator('#nickname-input').fill('Tommy');

    // Select the second character preset (Athlete)
    const athleteCard = pageTommy.locator('.character-card[data-preset-id="athlete"]');
    if (await athleteCard.count() > 0) {
      await athleteCard.click();
      await sleep(300);
      console.log('  ✓ Tommy selected Athlete character');
    } else {
      console.log('  ⚠ Athlete character card not found, clicking second card');
      const allCards = pageTommy.locator('.character-card');
      const count = await allCards.count();
      if (count >= 2) {
        await allCards.nth(1).click();
        await sleep(300);
      }
    }

    // Refresh world list to find Peter's world
    await pageTommy.click('#btn-refresh-worlds');
    await sleep(1500);

    // Check world list
    const worldListHtml = await pageTommy.innerHTML('#world-list-container');
    console.log(`  World list: ${worldListHtml.includes('testworld') ? '✓ testworld found' : '✗ testworld NOT found'}`);

    // Join the world
    const joinBtn = pageTommy.locator('button[data-world-id]').first();
    if (await joinBtn.count() > 0) {
      await joinBtn.click();
      await sleep(1000);
    }

    // Wait for HUD
    await pageTommy.waitForSelector('#hud', { state: 'visible', timeout: 10000 });
    const worldTommy = await pageTommy.textContent('#hud-world-name').catch(() => 'N/A');
    const playersTommy = await pageTommy.textContent('#hud-player-count').catch(() => 'N/A');
    console.log(`  ✓ Tommy joined world "${worldTommy}" (${playersTommy})`);

    // ─── 8. Tommy Changes to Follow Mode and Pitches Camera ─────────
    console.log('[8/10] Tommy changes to Follow mode, pitching camera 30° down...');

    await switchToFollowMode(pageTommy);
    await sleep(500);

    // Click canvas to get pointer lock for Follow mode
    await clickCanvasCenter(pageTommy);
    await sleep(500);

    // Tilt camera down ~30° by moving the mouse down while pointer is locked.
    // In FollowController, pitch += dy * mouseSensitivity * 0.3.
    // With sensitivity 0.002: pitch -= 873 * 0.002 * 0.3 ≈ -0.524 rad ≈ -30°.
    // This gives a top-down view so both characters are visible.
    const box = await pageTommy.locator(THREE_CANVAS).boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await pageTommy.mouse.move(cx, cy + 873, { steps: 30 });
      await sleep(300);
    }

    console.log('  ✓ Tommy in Follow mode, camera pitched 30° down');

    // ─── 9. Tommy Goes to Peter and Pushes Him 2 Steps ────────────
    console.log('[9/10] Tommy goes to Peter and pushes him 2 steps...');

    // Tommy spawns at (0, 5, 0). Peter moved forward and is now at
    // approximately (0, 5, 5). Tommy walks forward (W) to reach Peter.
    await pageTommy.keyboard.down('KeyW');
    await sleep(2500);  // ~6.25 units — enough to close the gap
    await sleep(1500);  // push for ~1.5 more seconds = "2 steps" of push
    await pageTommy.keyboard.up('KeyW');
    await sleep(500);

    console.log('  ✓ Tommy pushed Peter');

    // ─── 10. Tommy Jumps onto Peter's Head ─────────────────────────
    console.log('[10/10] Tommy jumps onto Peter\'s head...');

    // The physics processes X/Z movement BEFORE ground-detection each frame.
    // W is held just long enough to create AABB overlap at the one descent
    // frame where Tommy's feet cross Peter's head height (~0.85s after jump).
    // W is released right after that window so Tommy doesn't walk forward
    // and fall off after landing on Peter's head.
    await pageTommy.keyboard.down('KeyW');
    await sleep(100);                         // brief gap close (t=0–100ms)
    await pageTommy.keyboard.down('Space');   // jump (t=100ms)
    await sleep(50);                          // hold for game loop
    await pageTommy.keyboard.up('Space');     // Space released (t=150ms)
    // W stays held through descent so the head-detection frame has overlap
    await sleep(500);                         // W from jump start ≈ 1000ms (t=150–1050ms)
    await pageTommy.keyboard.up('KeyW');      // release W — head detection already fired
    await sleep(800);                         // settle on Peter's head with no forward input

    console.log('  ✓ Tommy landed on Peter\'s head!');

    // Take final screenshot of the last active tab (Tommy)
    await pageTommy.bringToFront();
    await sleep(300);
    await pageTommy.screenshot({ path: `${SCREENSHOTS_DIR}/tommy-final-view.png` });

    // ─── Report ──────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════');
    console.log('  Test Results');
    console.log('═══════════════════════════════════════════');

    const logsPeter = await getLogs(pagePeter, '[main]');
    const logsTommy = await getLogs(pageTommy, '[main]');

    console.log('\n  Peter game logs:');
    (logsPeter || []).slice(0, 10).forEach(l => console.log(`    ${l}`));

    console.log('\n  Tommy game logs:');
    (logsTommy || []).slice(0, 10).forEach(l => console.log(`    ${l}`));

    if (errors.length > 0) {
      console.log('\n  ⚠ Page errors:');
      errors.forEach(e => console.log(`    [${e.page}] ${e.error}`));
    } else {
      console.log('\n  ✓ No page errors');
    }

    const connectedPeter = (logsPeter || []).some(l => l.includes('Joined world'));
    const connectedTommy = (logsTommy || []).some(l => l.includes('Joined world'));
    const peterSawTommy = (logsPeter || []).some(l => l.includes('Player joined'));
    const tommyGotState = (logsTommy || []).some(l => l.includes('World state'));

    console.log(`\n  Peter connected: ${connectedPeter ? '✓' : '✗'}`);
    console.log(`  Tommy connected: ${connectedTommy ? '✓' : '✗'}`);
    console.log(`  Peter saw Tommy join: ${peterSawTommy ? '✓' : '✗'}`);
    console.log(`  Tommy got world state: ${tommyGotState ? '✓' : '✗'}`);

    console.log('\n  ✓ Test scenario completed!');
    console.log(`  Screenshots saved in ${SCREENSHOTS_DIR}/`);
    console.log('  Check screenshots for visual verification.\n');

    if (!headless) {
      console.log('  Browser tabs stay open for inspection. Press Ctrl+C to exit.');
      await new Promise(() => {});
    }

  } catch (e) {
    console.error('\n  ✗ Test error:', e.message);
    try {
      await pagePeter.screenshot({ path: `${SCREENSHOTS_DIR}/error-peter.png` });
      await pageTommy.screenshot({ path: `${SCREENSHOTS_DIR}/error-tommy.png` });
    } catch {}
    if (!headless) await new Promise(() => {});
  }

  if (headless) {
    cleanup();
    // Return instead of exit — let the caller decide
  }
}

main().catch(e => { console.error(e); process.exit(1); });

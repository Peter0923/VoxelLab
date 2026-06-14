/**
 * Manages DOM overlays: main menu, HUD, disconnect message.
 *
 * Controls visibility transitions between menu and game canvas.
 * Pointer lock is managed externally (by FPSController/FollowController).
 */
export class UIManager {
  constructor() {
    this._menuOverlay = null;
    this._hud = null;
    this._worldListTable = null;
    this._nicknameInput = null;
    this._playerCountEl = null;
    this._worldNameEl = null;
    this._onJoinCallback = null;
    this._onRefreshCallback = null;
    this._onOfflineCallback = null;

    this._createMenuOverlay();
    this._createHUD();
  }

  // ============================================================
  // Main Menu
  // ============================================================

  _createMenuOverlay() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'menu-overlay';
    overlay.innerHTML = `
      <div class="menu-container">
        <h1 class="menu-title">VOXEL LAB</h1>
        <p class="menu-subtitle">Multiplayer Creative Building</p>

        <div class="menu-section">
          <label class="menu-label" for="nickname-input">Nickname</label>
          <input type="text" id="nickname-input" class="menu-input" maxlength="20"
                 placeholder="Enter your nickname..." autocomplete="off" />
        </div>

        <div class="menu-section">
          <button id="btn-create-world" class="menu-btn menu-btn-primary">Create New World</button>
        </div>

        <div class="menu-section">
          <div class="menu-divider"><span>Discover Worlds</span></div>
          <div id="world-list-container" class="world-list-container">
            <p class="menu-hint">Click Refresh to load available worlds</p>
          </div>
          <button id="btn-refresh-worlds" class="menu-btn menu-btn-secondary">Refresh List</button>
        </div>

        <div class="menu-section">
          <div class="menu-divider"><span>or</span></div>
          <button id="btn-offline" class="menu-btn menu-btn-secondary">Play Offline</button>
        </div>

        <p class="menu-hint" style="margin-top: 1rem; font-size: 0.75rem;">
          Start server first: <code>npm run server</code>
        </p>
      </div>
    `;
    document.body.appendChild(overlay);
    this._menuOverlay = overlay;

    // Cache elements
    this._nicknameInput = overlay.querySelector('#nickname-input');
    this._worldListTable = overlay.querySelector('#world-list-container');

    // Restore nickname from localStorage
    const savedNick = localStorage.getItem('voxellab_nickname');
    if (savedNick) {
      this._nicknameInput.value = savedNick;
    }

    // Button handlers
    overlay.querySelector('#btn-create-world').addEventListener('click', () => {
      const nickname = this._getNickname();
      if (!nickname) return;
      const worldName = prompt('Enter a name for your new world:', 'myworld');
      if (!worldName || !worldName.trim()) return;
      const cleanName = worldName.trim().slice(0, 50);
      if (this._onJoinCallback) {
        this._onJoinCallback(cleanName, nickname);
      }
    });

    overlay.querySelector('#btn-refresh-worlds').addEventListener('click', () => {
      if (this._onRefreshCallback) {
        this._onRefreshCallback();
      }
    });

    // Offline mode button
    overlay.querySelector('#btn-offline').addEventListener('click', () => {
      if (this._onOfflineCallback) {
        this._onOfflineCallback();
      }
    });
  }

  /**
   * Get the current nickname from the input field.
   * Saves to localStorage if valid.
   * @returns {string|null}
   */
  _getNickname() {
    const name = (this._nicknameInput.value || '').trim();
    if (!name) {
      alert('Please enter a nickname.');
      return null;
    }
    if (name.length > 20) {
      alert('Nickname must be 20 characters or fewer.');
      return null;
    }
    localStorage.setItem('voxellab_nickname', name);
    return name;
  }

  /**
   * Show the main menu overlay.
   */
  showMainMenu() {
    if (this._menuOverlay) {
      this._menuOverlay.style.display = 'flex';
    }
  }

  /**
   * Hide the main menu overlay.
   */
  hideMainMenu() {
    if (this._menuOverlay) {
      this._menuOverlay.style.display = 'none';
    }
  }

  /**
   * Update the world list display.
   * @param {Array<{id:string, name:string, playerCount:number, cubeCount:number}>} worlds
   */
  showWorldList(worlds) {
    if (!this._worldListTable) return;

    if (worlds.length === 0) {
      this._worldListTable.innerHTML = '<p class="menu-hint">No worlds available. Create one!</p>';
      return;
    }

    let html = '<table class="world-table"><thead><tr><th>World</th><th>Players</th><th>Cubes</th><th></th></tr></thead><tbody>';
    for (const w of worlds) {
      html += `<tr>
        <td>${this._escapeHtml(w.name)}</td>
        <td>${w.playerCount}/50</td>
        <td>${w.cubeCount}</td>
        <td><button class="menu-btn menu-btn-small" data-world-id="${this._escapeHtml(w.id)}">Join</button></td>
      </tr>`;
    }
    html += '</tbody></table>';
    this._worldListTable.innerHTML = html;

    // Wire up Join buttons
    const buttons = this._worldListTable.querySelectorAll('button[data-world-id]');
    for (const btn of buttons) {
      btn.addEventListener('click', () => {
        const nickname = this._getNickname();
        if (!nickname) return;
        const worldId = btn.getAttribute('data-world-id');
        if (this._onJoinCallback && worldId) {
          this._onJoinCallback(worldId, nickname);
        }
      });
    }
  }

  // ============================================================
  // HUD
  // ============================================================

  _createHUD() {
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.innerHTML = `
      <div class="hud-top-left">
        <span id="hud-world-name" class="hud-world-name">—</span>
        <span id="hud-player-count" class="hud-player-count">0 players</span>
      </div>
      <div id="chat-area" class="chat-area"></div>
      <input type="text" id="chat-input" class="chat-input" placeholder="Press Enter to chat..."
             maxlength="200" autocomplete="off" />
    `;
    document.body.appendChild(hud);
    this._hud = hud;
    this._worldNameEl = hud.querySelector('#hud-world-name');
    this._playerCountEl = hud.querySelector('#hud-player-count');
    this._chatArea = hud.querySelector('#chat-area');
    this._chatInput = hud.querySelector('#chat-input');
  }

  /**
   * Show the HUD overlay.
   */
  showHUD() {
    if (this._hud) {
      this._hud.style.display = 'block';
    }
  }

  /**
   * Hide the HUD overlay.
   */
  hideHUD() {
    if (this._hud) {
      this._hud.style.display = 'none';
    }
  }

  /**
   * Update HUD info.
   * @param {string} worldName
   * @param {number} playerCount
   */
  updateHUD(worldName, playerCount) {
    if (this._worldNameEl) {
      this._worldNameEl.textContent = worldName || '—';
    }
    if (this._playerCountEl) {
      this._playerCountEl.textContent = `${playerCount} player${playerCount !== 1 ? 's' : ''}`;
    }
  }

  // ============================================================
  // Chat
  // ============================================================

  /**
   * Show the chat input (for typing).
   */
  showChatInput() {
    if (this._chatInput) {
      this._chatInput.style.display = 'block';
      this._chatInput.focus();
    }
  }

  /**
   * Hide the chat input.
   * @returns {string} The current input text (empty if hidden without sending)
   */
  hideChatInput() {
    if (this._chatInput) {
      const text = this._chatInput.value;
      this._chatInput.value = '';
      this._chatInput.style.display = 'none';
      this._chatInput.blur();
      return text;
    }
    return '';
  }

  /**
   * Get chat input value without clearing.
   * @returns {string}
   */
  getChatInput() {
    return this._chatInput ? this._chatInput.value : '';
  }

  /**
   * Check if chat input is currently focused.
   * @returns {boolean}
   */
  isChatFocused() {
    return this._chatInput && document.activeElement === this._chatInput;
  }

  /**
   * Add a chat message to the display area.
   * @param {string} nickname
   * @param {string} text
   */
  addChatMessage(nickname, text) {
    if (!this._chatArea) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.innerHTML = `<span class="chat-nickname">${this._escapeHtml(nickname)}:</span> ${this._escapeHtml(text)}`;
    this._chatArea.appendChild(msgEl);

    // Auto-scroll
    this._chatArea.scrollTop = this._chatArea.scrollHeight;

    // Fade and remove after timeout
    setTimeout(() => {
      msgEl.style.opacity = '0';
      msgEl.style.transition = 'opacity 2s';
      setTimeout(() => {
        if (msgEl.parentNode) {
          msgEl.parentNode.removeChild(msgEl);
        }
      }, 2000);
    }, 8000);

    // Limit visible messages
    while (this._chatArea.children.length > 10) {
      this._chatArea.removeChild(this._chatArea.firstChild);
    }
  }

  // ============================================================
  // Callbacks
  // ============================================================

  /**
   * Set the callback for when the user wants to join a world.
   * @param {function(string, string):void} callback - (worldId, nickname)
   */
  onJoin(callback) {
    this._onJoinCallback = callback;
  }

  /**
   * Set the callback for when the user clicks "Refresh List".
   * When called without arguments, triggers the currently set callback.
   * @param {function():void} [callback]
   */
  onRefreshWorlds(callback) {
    if (callback) {
      this._onRefreshCallback = callback;
    } else if (this._onRefreshCallback) {
      this._onRefreshCallback();
    }
  }

  /**
   * Set the callback for when the user clicks "Play Offline".
   * @param {function():void} callback
   */
  onOffline(callback) {
    this._onOfflineCallback = callback;
  }

  // ============================================================
  // Disconnect overlay
  // ============================================================

  /**
   * Show a temporary disconnect message.
   */
  showDisconnected() {
    const el = document.createElement('div');
    el.className = 'disconnect-overlay';
    el.textContent = 'Disconnected. Returning to menu...';
    document.body.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3000);
  }

  // ============================================================
  // Utility
  // ============================================================

  _escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

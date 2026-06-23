/**
 * WebSocket wrapper for multiplayer communication.
 *
 * Handles connection lifecycle, JSON serialization/deserialization,
 * automatic reconnection with exponential backoff, and message queuing
 * during reconnect periods.
 */
export class NetworkClient {
  constructor() {
    /** @type {WebSocket|null} */
    this._ws = null;

    /** @type {string} */
    this._url = '';

    /** @type {Array<object>} Pending outbound messages during reconnect */
    this._pendingMessages = [];

    /** @type {Function|null} */
    this._onMessage = null;

    /** @type {Function|null} */
    this._onClose = null;

    /** @type {Function|null} */
    this._onOpen = null;

    /** @type {Function|null} */
    this._onError = null;

    // Reconnection state
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._reconnectDelay = 1000;  // starts at 1s
    this._reconnectTimer = null;
    this._shouldReconnect = true;
    this._intentionalClose = false;
  }

  /**
   * Connect to the game server.
   * @param {string} url - WebSocket URL (e.g. "ws://localhost:3001")
   */
  connect(url) {
    this._url = url;
    this._intentionalClose = false;
    this._shouldReconnect = true;
    this._reconnectAttempts = 0;
    this._doConnect();
  }

  /**
   * Internal connect logic.
   */
  _doConnect() {
    if (this._ws) {
      this._ws.onopen = null;
      this._ws.onmessage = null;
      this._ws.onclose = null;
      this._ws.onerror = null;
      this._ws.close();
      this._ws = null;
    }

    console.log(`[NetworkClient] Connecting to ${this._url}...`);
    this._ws = new WebSocket(this._url);

    this._ws.onopen = () => {
      console.log('[NetworkClient] Connected.');
      this._reconnectAttempts = 0;
      this._reconnectDelay = 1000;

      // Flush pending messages
      for (const msg of this._pendingMessages) {
        this._sendRaw(msg);
      }
      this._pendingMessages.length = 0;

      if (this._onOpen) this._onOpen();
    };

    this._ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.warn('[NetworkClient] Invalid JSON from server:', event.data.slice(0, 100));
        return;
      }
      if (this._onMessage) this._onMessage(msg);
    };

    this._ws.onclose = (event) => {
      console.log(`[NetworkClient] Disconnected (code: ${event.code})`);
      if (this._onClose) this._onClose(event);

      if (!this._intentionalClose && this._shouldReconnect && this._reconnectAttempts < this._maxReconnectAttempts) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = (err) => {
      console.warn('[NetworkClient] WebSocket error');
      if (this._onError) this._onError(err);
    };
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  _scheduleReconnect() {
    this._reconnectAttempts++;
    const delay = Math.min(this._reconnectDelay * Math.pow(2, this._reconnectAttempts - 1), 30000);
    console.log(`[NetworkClient] Reconnecting in ${delay / 1000}s (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})...`);

    this._reconnectTimer = setTimeout(() => {
      this._doConnect();
    }, delay);
  }

  /**
   * Send a message object (will be JSON-stringified).
   * If disconnected, the message is queued for reconnection.
   * @param {object} msg
   */
  send(msg) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._sendRaw(msg);
    } else {
      // Queue for later
      this._pendingMessages.push(msg);
    }
  }

  /**
   * Send raw JSON without checking connection state.
   */
  _sendRaw(msg) {
    try {
      this._ws.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('[NetworkClient] Failed to send message:', e);
    }
  }

  /**
   * Register a callback for incoming messages.
   * @param {function(object):void} callback
   */
  onMessage(callback) {
    this._onMessage = callback;
  }

  /**
   * Register a callback for connection close.
   * @param {function(CloseEvent):void} callback
   */
  onClose(callback) {
    this._onClose = callback;
  }

  /**
   * Register a callback for connection open.
   * @param {function():void} callback
   */
  onOpen(callback) {
    this._onOpen = callback;
  }

  /**
   * Register a callback for connection errors.
   * @param {function(Event):void} callback
   */
  onError(callback) {
    this._onError = callback;
  }

  /**
   * Cleanly close the connection (no reconnect).
   */
  close() {
    this._intentionalClose = true;
    this._shouldReconnect = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._pendingMessages.length = 0;
  }

  /**
   * Check if the socket is currently connected.
   * @returns {boolean}
   */
  get connected() {
    return this._ws !== null && this._ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get the WebSocket readyState.
   * @returns {number}
   */
  get readyState() {
    return this._ws ? this._ws.readyState : WebSocket.CLOSED;
  }
}

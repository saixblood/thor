"use strict";

/**
 * SessionKeeper — Human Behaviour Simulator & Session Guardian
 *
 * Keeps the Facebook session alive as long as possible by:
 *   1. Periodically hitting real Facebook endpoints (Feed, Reels, Stories, Search, Notifications…)
 *   2. Sending typing indicators in active threads (then stopping — no message sent)
 *   3. Maintaining MQTT presence (online status)
 *   4. Refreshing & saving the appstate cookie jar on a regular schedule
 *   5. Randomising all intervals with human-like jitter so the pattern never looks robotic
 */

const logger      = require("../utils/logger");
const { saveAppState } = require("./login");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sleep for a random duration between [minMs, maxMs].
 * @param {number} minMs
 * @param {number} maxMs
 * @returns {Promise<void>}
 */
function randomSleep(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pick a random element from an array.
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Facebook endpoints to visit (simulates human browsing) ──────────────────

const FB_BASE = "https://www.facebook.com";

const BROWSE_TARGETS = [
  // Main feed
  `${FB_BASE}/`,
  `${FB_BASE}/?sk=h_chr`,
  // Reels
  `${FB_BASE}/reels/`,
  `${FB_BASE}/reel/videos/`,
  // Watch / Videos
  `${FB_BASE}/watch/`,
  // Stories
  `${FB_BASE}/stories/`,
  // Notifications
  `${FB_BASE}/notifications/`,
  // Marketplace glance
  `${FB_BASE}/marketplace/`,
  // Groups list
  `${FB_BASE}/groups/`,
  // Friends suggestions
  `${FB_BASE}/friends/`,
  // Memories
  `${FB_BASE}/memories/`,
  // Search (empty — just loads the page)
  `${FB_BASE}/search/top/`,
];

// ─── Typing simulation ────────────────────────────────────────────────────────

/**
 * Send a typing indicator in a thread, hold it for a human-length duration,
 * then stop. Never sends an actual message.
 *
 * @param {object}   api
 * @param {string}   threadID
 */
async function simulateTyping(api, threadID) {
  if (typeof api.sendTypingIndicator !== "function") return;

  // Signature: api.sendTypingIndicator(sendTyping: boolean, threadID, callback)
  const typingDuration = Math.floor(Math.random() * 8000) + 3000; // 3–11 seconds

  try {
    // Start typing
    await api.sendTypingIndicator(true, threadID);
    logger.debug(`[session] Typing in thread ${threadID} for ${Math.round(typingDuration / 1000)}s…`);

    await randomSleep(typingDuration, typingDuration + 500);

    // Stop typing
    await api.sendTypingIndicator(false, threadID);
  } catch (err) {
    logger.debug(`[session] Typing simulation failed: ${err.message}`);
  }
}

// ─── Page browsing simulation ─────────────────────────────────────────────────

/**
 * Perform a simulated page visit using nkxfca's internal httpGet.
 * Falls back silently if the API doesn't expose httpGet.
 *
 * @param {object} api
 * @param {string} url
 */
async function browsePage(api, url) {
  if (typeof api.httpGet !== "function") return;

  try {
    logger.debug(`[session] Browsing → ${url}`);
    await api.httpGet(url);
    // Human scrolls/reads for a bit after loading
    await randomSleep(4000, 18000);
  } catch (err) {
    logger.debug(`[session] Browse failed (${url}): ${err.message}`);
  }
}

/**
 * Run one complete human-like browsing session:
 *   - Visit 2–5 random pages
 *   - Pause between each like a real person
 *
 * @param {object} api
 */
async function runBrowseSession(api) {
  const pageCount = Math.floor(Math.random() * 4) + 2; // 2–5 pages
  logger.debug(`[session] Starting browse session — ${pageCount} pages`);

  for (let i = 0; i < pageCount; i++) {
    const url = pick(BROWSE_TARGETS);
    await browsePage(api, url);

    // Pause between pages like a human (5–30 seconds)
    if (i < pageCount - 1) await randomSleep(5000, 30000);
  }

  logger.debug(`[session] Browse session complete.`);
}

// ─── Presence (online status) ─────────────────────────────────────────────────

/**
 * Ping the MQTT presence to keep the online dot active.
 *
 * @param {object} api
 */
function pingPresence(api) {
  try {
    if (typeof api.setOptions === "function") {
      api.setOptions({ online: true });
      logger.debug("[session] Presence pinged (online).");
    }
  } catch (err) {
    logger.debug(`[session] Presence ping failed: ${err.message}`);
  }
}

// ─── SessionKeeper class ─────────────────────────────────────────────────────

class SessionKeeper {
  /**
   * @param {object} api           - nkxfca API instance
   * @param {string[]} threadIDs   - Known thread IDs for typing simulation (grows dynamically)
   */
  constructor(api, threadIDs = []) {
    this._api        = api;
    this._threadIDs  = new Set(threadIDs);
    this._timers     = [];
    this._running    = false;
  }

  /**
   * Register a thread ID so it can be used for typing simulation.
   * Called by the message handler whenever a new thread is seen.
   *
   * @param {string} threadID
   */
  addThread(threadID) {
    this._threadIDs.add(String(threadID));
  }

  /**
   * Start all background activity loops.
   */
  start() {
    if (this._running) return;
    this._running = true;
    logger.info("[session] SessionKeeper started — human behaviour simulation active.");

    // 1. Appstate refresh — every 20–40 minutes
    this._scheduleLoop("Appstate refresh",  20 * 60 * 1000, 40 * 60 * 1000, () => this._refreshAppState());

    // 2. Presence ping — every 4–8 minutes
    this._scheduleLoop("Presence ping",      4 * 60 * 1000,  8 * 60 * 1000, () => pingPresence(this._api));

    // 3. Browse session — every 15–45 minutes
    this._scheduleLoop("Browse session",    15 * 60 * 1000, 45 * 60 * 1000, () => runBrowseSession(this._api));

    // 4. Typing simulation — every 8–20 minutes (only if threads are known)
    this._scheduleLoop("Typing simulation",  8 * 60 * 1000, 20 * 60 * 1000, () => this._doTypingSimulation());
  }

  /**
   * Stop all loops (called on graceful shutdown or reconnect).
   */
  stop() {
    for (const t of this._timers) clearTimeout(t);
    this._timers   = [];
    this._running  = false;
    logger.info("[session] SessionKeeper stopped.");
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Register a self-rescheduling timeout loop with random intervals.
   *
   * @param {string}   label
   * @param {number}   minMs
   * @param {number}   maxMs
   * @param {Function} fn
   */
  _scheduleLoop(label, minMs, maxMs, fn) {
    const next = () => {
      const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      const t = setTimeout(async () => {
        if (!this._running) return;
        try {
          await fn();
        } catch (err) {
          logger.debug(`[session] Loop "${label}" error: ${err.message}`);
        }
        if (this._running) next(); // reschedule
      }, delay);
      this._timers.push(t);
      logger.debug(`[session] "${label}" scheduled in ${Math.round(delay / 1000)}s`);
    };
    next();
  }

  /**
   * Save the latest appstate to disk.
   */
  async _refreshAppState() {
    try {
      if (typeof this._api.getAppState === "function") {
        const state = this._api.getAppState();
        if (Array.isArray(state) && state.length > 0) {
          saveAppState(state);
          logger.debug("[session] Appstate refreshed & saved.");
        }
      }
    } catch (err) {
      logger.debug(`[session] Appstate refresh failed: ${err.message}`);
    }
  }

  /**
   * Pick a random known thread and simulate typing in it.
   */
  async _doTypingSimulation() {
    const threads = [...this._threadIDs];
    if (threads.length === 0) {
      logger.debug("[session] No known threads yet — skipping typing simulation.");
      return;
    }
    const threadID = pick(threads);
    await simulateTyping(this._api, threadID);
  }
}

module.exports = SessionKeeper;

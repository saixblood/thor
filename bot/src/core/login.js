"use strict";

const fs     = require("fs");
const path   = require("path");
const login  = require("nfxfca");
const config = require("../../config.json");
const logger = require("../utils/logger");

const APPSTATE_PATH = path.resolve(__dirname, "../../", config.credentials.appStatePath);
const SESSION_DIR   = path.dirname(APPSTATE_PATH);

/**
 * Ensure the session directory exists.
 */
function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    logger.info(`[login] Created session directory: ${SESSION_DIR}`);
  }
}

/**
 * Load a saved appstate from disk, if it exists.
 *
 * @returns {object[] | null} Parsed appstate array, or null if unavailable.
 */
function loadAppState() {
  ensureSessionDir();

  if (!fs.existsSync(APPSTATE_PATH)) {
    return null;
  }

  try {
    const raw   = fs.readFileSync(APPSTATE_PATH, "utf8");
    const state = JSON.parse(raw);
    if (!Array.isArray(state) || state.length === 0) {
      logger.warn("[login] Appstate file is empty or malformed, ignoring.");
      return null;
    }
    logger.info("[login] Loaded appstate from disk.");
    return state;
  } catch (err) {
    logger.warn(`[login] Failed to parse appstate: ${err.message}`);
    return null;
  }
}

/**
 * Persist an updated appstate to disk.
 *
 * @param {object[]} appState
 */
function saveAppState(appState) {
  ensureSessionDir();
  try {
    fs.writeFileSync(APPSTATE_PATH, JSON.stringify(appState, null, 2), "utf8");
    logger.info("[login] Appstate saved to disk.");
  } catch (err) {
    logger.error(`[login] Failed to save appstate: ${err.message}`);
  }
}

/**
 * Delete the persisted appstate file (called when it appears invalid/expired).
 */
function clearAppState() {
  if (fs.existsSync(APPSTATE_PATH)) {
    try {
      fs.unlinkSync(APPSTATE_PATH);
      logger.warn("[login] Cleared expired/invalid appstate.");
    } catch (err) {
      logger.error(`[login] Failed to clear appstate: ${err.message}`);
    }
  }
}

/**
 * Build the nfxfca API options object from config.
 *
 * @returns {object}
 */
function buildApiOptions() {
  return {
    listenEvents:     config.api.listenEvents,
    selfListen:       config.api.selfListen,
    logLevel:         config.api.logLevel,
    updatePresence:   config.api.updatePresence,
    forceLogin:       config.api.forceLogin,
    userAgent:        config.api.userAgent,
    autoMarkDelivery: config.api.autoMarkDelivery,
    autoMarkRead:     config.api.autoMarkRead,
  };
}

/**
 * Attempt to authenticate with nfxfca.
 *
 * Priority:
 *   1. Saved appstate  → faster, no password needed
 *   2. Email + password credentials from config
 *
 * @returns {Promise<{ api: object, credentials: object }>}
 */
function authenticate() {
  return new Promise((resolve, reject) => {
    const appState = loadAppState();

    const credentials = appState
      ? { appState }
      : {
          email:    config.credentials.email,
          password: config.credentials.password,
        };

    if (appState) {
      logger.info("[login] Authenticating with saved appstate…");
    } else {
      logger.info("[login] Authenticating with email + password…");
      if (!config.credentials.email || !config.credentials.password) {
        return reject(
          new Error(
            "No appstate found and credentials are empty. " +
            'Please set "email" and "password" in config.json or place a valid appstate.json in the session folder.'
          )
        );
      }
    }

    const options = buildApiOptions();

    login(credentials, options, (err, api) => {
      if (err) {
        if (appState) {
          // Saved appstate is probably expired – clear it so next run uses credentials
          clearAppState();
          logger.warn("[login] Appstate login failed. Cleared stale appstate. Restart to re-authenticate with credentials.");
        }
        return reject(new Error(`Authentication failed: ${err.error || err.message || String(err)}`));
      }

      // Persist the latest appstate so future startups skip the password flow
      if (api.getAppState) {
        saveAppState(api.getAppState());
      }

      logger.bot(`[login] ✅ Logged in as ${config.bot.name}`);
      resolve({ api, credentials });
    });
  });
}

module.exports = { authenticate, saveAppState, clearAppState };

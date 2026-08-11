"use strict";

/**
 * Rank / permission system for Hades Bot.
 *
 * Ranks:
 *   Developer  – UIDs hardcoded in config.json > ranks.developers
 *   Bot Admin  – UIDs stored in data/admins.json (hot-reloaded, no restart needed)
 *   Member     – everyone else (bot ignores them completely)
 */

const fs     = require("fs");
const path   = require("path");
const config = require("../../config.json");
const logger = require("./logger");

const ADMINS_FILE = path.resolve(__dirname, "../../data/admins.json");
const DATA_DIR    = path.dirname(ADMINS_FILE);

// In-memory admin UID set (strings)
let botAdmins = new Set();

// ─── Persistence ─────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load the bot-admin list from disk into memory.
 * Called once at startup; also callable at any time for a manual reload.
 */
function loadAdmins() {
  ensureDataDir();
  try {
    if (!fs.existsSync(ADMINS_FILE)) {
      fs.writeFileSync(ADMINS_FILE, "[]", "utf8");
    }
    const raw  = fs.readFileSync(ADMINS_FILE, "utf8");
    const list = JSON.parse(raw);
    botAdmins  = new Set(list.map(String));
    logger.info(`[permissions] Loaded ${botAdmins.size} bot admin(s) from disk.`);
  } catch (err) {
    logger.error(`[permissions] Failed to load admins file: ${err.message}`);
    botAdmins = new Set();
  }
}

/**
 * Persist the current in-memory admin set to disk.
 * @private
 */
function _saveAdmins() {
  ensureDataDir();
  try {
    fs.writeFileSync(ADMINS_FILE, JSON.stringify([...botAdmins], null, 2), "utf8");
  } catch (err) {
    logger.error(`[permissions] Failed to save admins file: ${err.message}`);
    throw err; // let the caller surface the error
  }
}

// ─── Rank Checks ─────────────────────────────────────────────────────────────

/**
 * @param {string|number} uid
 * @returns {boolean}
 */
function isDeveloper(uid) {
  return (config.ranks.developers || []).includes(String(uid));
}

/**
 * @param {string|number} uid
 * @returns {boolean}
 */
function isBotAdmin(uid) {
  return botAdmins.has(String(uid));
}

/**
 * Returns true if the UID may use bot commands.
 * Only Developer and Bot Admin are allowed.
 *
 * @param {string|number} uid
 * @returns {boolean}
 */
function hasPermission(uid) {
  return isDeveloper(uid) || isBotAdmin(uid);
}

/**
 * Human-readable rank label for a UID.
 *
 * @param {string|number} uid
 * @returns {"Developer"|"Bot Admin"|"Member"}
 */
function getRank(uid) {
  if (isDeveloper(uid)) return "Developer";
  if (isBotAdmin(uid))  return "Bot Admin";
  return "Member";
}

// ─── Mutation ────────────────────────────────────────────────────────────────

/**
 * Add a UID to the bot-admin list.
 * Updates both the in-memory set and the on-disk file immediately.
 * No bot restart is needed.
 *
 * @param {string|number} uid
 * @returns {{ added: boolean, alreadyAdmin: boolean, isDev: boolean }}
 */
function addBotAdmin(uid) {
  const id = String(uid);

  if (isDeveloper(id)) return { added: false, alreadyAdmin: false, isDev: true };
  if (botAdmins.has(id)) return { added: false, alreadyAdmin: true, isDev: false };

  botAdmins.add(id);
  _saveAdmins();
  logger.info(`[permissions] Added bot admin: ${id}`);
  return { added: true, alreadyAdmin: false, isDev: false };
}

/**
 * Remove a UID from the bot-admin list.
 *
 * @param {string|number} uid
 * @returns {{ removed: boolean }}
 */
function removeBotAdmin(uid) {
  const id = String(uid);
  if (!botAdmins.has(id)) return { removed: false };
  botAdmins.delete(id);
  _saveAdmins();
  logger.info(`[permissions] Removed bot admin: ${id}`);
  return { removed: true };
}

/**
 * @returns {string[]} Sorted list of current bot-admin UIDs
 */
function listBotAdmins() {
  return [...botAdmins].sort();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

loadAdmins();

module.exports = {
  loadAdmins,
  isDeveloper,
  isBotAdmin,
  hasPermission,
  getRank,
  addBotAdmin,
  removeBotAdmin,
  listBotAdmins,
};

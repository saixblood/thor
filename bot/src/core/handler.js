"use strict";

const config           = require("../../config.json");
const logger           = require("../utils/logger");
const { parseCommand } = require("../utils/helpers");
const commands         = require("../commands/index");
const { hasPermission, getRank } = require("../utils/permissions");

/** Simple per-user cooldown tracker: uid → last command timestamp (ms) */
const cooldowns = new Map();

/**
 * Check and enforce per-user command cooldown.
 *
 * @param {string} senderID
 * @returns {boolean} true if the user is still in cooldown
 */
function isOnCooldown(senderID) {
  const now  = Date.now();
  const last = cooldowns.get(senderID) || 0;

  if (now - last < config.behavior.commandCooldown) return true;

  cooldowns.set(senderID, now);
  return false;
}

/**
 * Handle an incoming message event from the nkxfca listener.
 * Only Developer and Bot Admin ranks can trigger commands.
 * Regular members are completely ignored — no reply, no log noise.
 *
 * @param {object} api   - nkxfca API instance
 * @param {object} event - Messenger event
 */
async function handleMessage(api, event) {
  // Only process plain text messages
  if (event.type !== "message") return;
  if (!event.body || typeof event.body !== "string") return;

  // ── Permission gate ───────────────────────────────────────────────────────
  // Silently ignore everyone who is not Developer or Bot Admin.
  if (!hasPermission(event.senderID)) return;

  // ── Command parsing ───────────────────────────────────────────────────────
  const parsed = parseCommand(event.body);
  if (!parsed) return; // not a prefixed command

  const { command: name, args } = parsed;
  const cmd = commands.get(name);

  if (!cmd) {
    // Unknown command — silently ignore
    logger.debug(`[handler] Unknown command "${name}" from ${event.senderID} (${getRank(event.senderID)})`);
    return;
  }

  if (isOnCooldown(event.senderID)) {
    logger.debug(`[handler] Cooldown for ${event.senderID}, skipping "${name}"`);
    return;
  }

  logger.info(`[handler] "${name}" by ${event.senderID} (${getRank(event.senderID)}) in thread ${event.threadID}`);

  try {
    await cmd.execute(api, event, args);
  } catch (err) {
    logger.error(`[handler] Error executing "${name}": ${err.message}`);
  }
}

/**
 * Attach the MQTT listener to the API instance.
 *
 * @param {object}   api    - nkxfca API instance
 * @param {Function} onStop - Called when the listener stops unrecoverably
 */
function attachListener(api, onStop) {
  logger.info("[handler] Attaching message listener…");

  const stopListening = api.listenMqtt((err, event) => {
    if (err) {
      logger.error(`[handler] Listener error: ${err.error || err.message || String(err)}`);
      if (typeof onStop === "function") onStop(err);
      return;
    }
    handleMessage(api, event).catch((handlerErr) => {
      logger.error(`[handler] Unhandled error in handleMessage: ${handlerErr.message}`);
    });
  });

  logger.bot("[handler] ✅ Listening for messages.");
  return stopListening;
}

module.exports = { attachListener, handleMessage };

"use strict";

const config          = require("../../config.json");
const logger          = require("../utils/logger");
const { parseCommand } = require("../utils/helpers");
const commands        = require("../commands/index");

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
  const diff = now - last;

  if (diff < config.behavior.commandCooldown) {
    return true;
  }
  cooldowns.set(senderID, now);
  return false;
}

/**
 * Handle an incoming message event from the nfxfca listener.
 *
 * @param {object} api   - nfxfca API instance
 * @param {object} event - Messenger event
 */
async function handleMessage(api, event) {
  // Only process text messages from other users
  if (event.type !== "message") return;
  if (!event.body || typeof event.body !== "string") return;

  const parsed = parseCommand(event.body);
  if (!parsed) return; // Not a bot command

  const { command: name, args } = parsed;
  const cmd = commands.get(name);

  if (!cmd) {
    // Unknown command — silently ignore to avoid spam
    logger.debug(`[handler] Unknown command "${name}" from ${event.senderID}`);
    return;
  }

  if (isOnCooldown(event.senderID)) {
    logger.debug(`[handler] Cooldown active for ${event.senderID}, skipping "${name}"`);
    return;
  }

  logger.info(`[handler] Command "${name}" by ${event.senderID} in thread ${event.threadID}`);

  try {
    await cmd.execute(api, event, args);
  } catch (err) {
    logger.error(`[handler] Error executing "${name}": ${err.message}`);
  }
}

/**
 * Attach the MQTT listener to the API instance.
 * Re-attaches itself on errors to keep the bot alive.
 *
 * @param {object} api         - nfxfca API instance
 * @param {Function} onStop    - Called when the listener stops unrecoverably
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

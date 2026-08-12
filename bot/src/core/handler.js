"use strict";

const logger           = require("../utils/logger");
const { parseCommand } = require("../utils/helpers");
const commands         = require("../commands/index");
const { getRank } = require("../utils/permissions");
const {
  isValidEvent,
  isSafeCommandInput,
  checkRateLimit,
  checkCooldown,
  acquireCommand,
  releaseCommand,
  commandTimeout,
  hasPermission,
  isDeveloper,
} = require("./security");

/**
 * Handle an incoming message event from the nkxfca listener.
 * Only Developer and Bot Admin ranks can trigger commands.
 * Regular members are completely ignored — no reply, no log noise.
 *
 * @param {object} api           - nkxfca API instance
 * @param {object} event         - Messenger event
 * @param {object} [sessionKeeper] - SessionKeeper instance (to register new threads)
 */
async function handleMessage(api, event, sessionKeeper) {
  if (!isValidEvent(event)) return;

  // ── Permission gate ───────────────────────────────────────────────────────
  // Ignore regular members completely: no command parsing, no session tracking,
  // no replies, and no side effects of any kind.
  if (!hasPermission(event.senderID)) return;

  // Register every seen thread with the SessionKeeper for typing simulation
  if (sessionKeeper && event.threadID) {
    sessionKeeper.addThread(event.threadID);
  }

  // ── Command parsing ───────────────────────────────────────────────────────
  const parsed = parseCommand(event.body);
  if (!parsed) return; // not a prefixed command

  const { command: name, args } = parsed;
  const cmd = commands.get(name);

  if (!cmd) {
    logger.debug(`[handler] Unknown command "${name}" from ${event.senderID} (${getRank(event.senderID)})`);
    return;
  }

  if (cmd.devOnly && !isDeveloper(event.senderID)) {
    logger.warn(`[handler] Blocked developer command "${name}" for ${event.senderID}`);
    return;
  }

  if (!isSafeCommandInput(args, name)) {
    logger.warn(`[handler] Rejected unsafe input for "${name}" from ${event.senderID}`);
    return;
  }

  if (!checkRateLimit(event.senderID, event.threadID)) {
    logger.warn(`[handler] Rate limit reached for ${event.senderID} in ${event.threadID}`);
    return;
  }

  if (!checkCooldown(event.senderID)) {
    logger.debug(`[handler] Cooldown for ${event.senderID}, skipping "${name}"`);
    return;
  }

  if (!acquireCommand(event.senderID)) {
    logger.debug(`[handler] Concurrent command limit for ${event.senderID}`);
    return;
  }

  logger.info(`[handler] "${name}" by ${event.senderID} (${getRank(event.senderID)}) in thread ${event.threadID}`);

  try {
    await Promise.race([
      Promise.resolve(cmd.execute(api, event, args)),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Command execution timed out")), commandTimeout()).unref?.();
      }),
    ]);
  } catch (err) {
    logger.error(`[handler] Error executing "${name}": ${err.message}`);
  } finally {
    releaseCommand(event.senderID);
  }
}

/**
 * Attach the MQTT listener to the API instance.
 *
 * @param {object}   api           - nkxfca API instance
 * @param {object}   sessionKeeper - SessionKeeper instance
 * @param {Function} onStop        - Called when the listener stops unrecoverably
 */
function attachListener(api, sessionKeeper, onStop) {
  logger.info("[handler] Attaching message listener…");

  const stopListening = api.listenMqtt((err, event) => {
    if (err) {
      logger.error(`[handler] Listener error: ${err.error || err.message || String(err)}`);
      if (typeof onStop === "function") onStop(err);
      return;
    }
    handleMessage(api, event, sessionKeeper).catch((handlerErr) => {
      logger.error(`[handler] Unhandled error in handleMessage: ${handlerErr.message}`);
    });
  });

  logger.bot("[handler] ✅ Listening for messages.");
  return stopListening;
}

module.exports = { attachListener, handleMessage };

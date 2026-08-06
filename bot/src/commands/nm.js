"use strict";

/**
 * /nm <name>   — Lock the group name. Auto-restores it every 9 s if anyone changes it.
 * /nm stop     — Stop the name lock for this thread.
 * /nm status   — Show the currently locked name for this thread.
 */

const config    = require("../../config.json");
const { reply } = require("../utils/helpers");
const logger    = require("../utils/logger");

const CHECK_INTERVAL_MS = 9000; // 9 seconds

/**
 * Active name locks.
 * Map<threadID, { lockedName: string, intervalHandle: NodeJS.Timeout, setBy: string }>
 */
const activeLocks = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Set the group name via nkxfca.
 *
 * @param {object} api
 * @param {string} name
 * @param {string} threadID
 * @returns {Promise<void>}
 */
function setGroupName(api, name, threadID) {
  return new Promise((resolve) => {
    api.gcname(name, threadID, (err) => {
      if (err) {
        logger.debug(`[nm] gcname error in ${threadID}: ${err.message || err}`);
      }
      resolve();
    });
  });
}

/**
 * Fetch the current thread name.
 *
 * @param {object} api
 * @param {string} threadID
 * @returns {Promise<string|null>}
 */
function getCurrentName(api, threadID) {
  return new Promise((resolve) => {
    api.getThreadInfo(threadID, (err, info) => {
      if (err || !info) {
        logger.debug(`[nm] getThreadInfo error in ${threadID}: ${err?.message || err}`);
        return resolve(null);
      }
      resolve(info.threadName || info.name || null);
    });
  });
}

// ─── Command ─────────────────────────────────────────────────────────────────

/** @type {import("./index").Command} */
const nm = {
  name: "nm",
  description: "Lock the group name — auto-restores it every 9 s if changed",
  usage: [
    `${config.bot.prefix}nm <name>   — Lock this group's name`,
    `${config.bot.prefix}nm stop     — Remove the name lock`,
    `${config.bot.prefix}nm status   — Show the currently locked name`,
  ].join("\n"),

  /**
   * @param {object}   api
   * @param {object}   event
   * @param {string[]} args
   */
  async execute(api, event, args) {
    const threadID = event.threadID;
    const sub      = (args[0] || "").toLowerCase();

    // ── /nm stop ──────────────────────────────────────────────────────────────
    if (sub === "stop") {
      if (!activeLocks.has(threadID)) {
        return reply(api, "⚠️ No active name lock in this group.", threadID);
      }
      clearInterval(activeLocks.get(threadID).intervalHandle);
      const { lockedName } = activeLocks.get(threadID);
      activeLocks.delete(threadID);
      logger.info(`[nm] Lock removed for thread ${threadID} ("${lockedName}")`);
      return reply(api, `🔓 Name lock removed.\nThe group name "${lockedName}" is no longer protected.`, threadID);
    }

    // ── /nm status ────────────────────────────────────────────────────────────
    if (sub === "status") {
      if (!activeLocks.has(threadID)) {
        return reply(api, "📭 No active name lock in this group.", threadID);
      }
      const { lockedName, setBy } = activeLocks.get(threadID);
      return reply(
        api,
        [
          `🔒 Name lock active.`,
          `📛 Locked name : ${lockedName}`,
          `👤 Set by      : ${setBy}`,
          `⏱ Check every : 9 seconds`,
        ].join("\n"),
        threadID
      );
    }

    // ── /nm <name> ────────────────────────────────────────────────────────────
    // Everything after the command prefix is the name (preserves spaces)
    const rawBody    = event.body || "";
    const afterCmd   = rawBody.slice((config.bot.prefix + "nm").length).trim();
    const lockedName = afterCmd.trim();

    if (!lockedName) {
      return reply(
        api,
        [
          `❌ No name provided.`,
          `Usage: ${config.bot.prefix}nm <name>`,
          `Example: ${config.bot.prefix}nm Best Group Ever`,
        ].join("\n"),
        threadID
      );
    }

    // Stop any existing lock for this thread
    if (activeLocks.has(threadID)) {
      clearInterval(activeLocks.get(threadID).intervalHandle);
    }

    // Apply the name immediately
    await setGroupName(api, lockedName, threadID);

    // Start the 9-second monitor
    const intervalHandle = setInterval(async () => {
      const current = await getCurrentName(api, threadID);

      // If we couldn't fetch the name, skip this tick
      if (current === null) return;

      if (current !== lockedName) {
        logger.info(`[nm] Name changed in ${threadID}: "${current}" → restoring "${lockedName}"`);
        await setGroupName(api, lockedName, threadID);
      }
    }, CHECK_INTERVAL_MS);

    activeLocks.set(threadID, {
      lockedName,
      intervalHandle,
      setBy: event.senderID,
    });

    logger.info(`[nm] Lock started in thread ${threadID} — "${lockedName}"`);

    return reply(
      api,
      [
        `🔒 Group name locked.`,
        `📛 Name     : ${lockedName}`,
        `⏱ Checking : every 9 seconds`,
        ``,
        `Use \`${config.bot.prefix}nm stop\` to unlock.`,
      ].join("\n"),
      threadID
    );
  },

  /**
   * Clear all active locks on shutdown.
   */
  stopAll() {
    for (const [threadID, { intervalHandle, lockedName }] of activeLocks) {
      clearInterval(intervalHandle);
      logger.info(`[nm] Cleared lock for thread ${threadID} ("${lockedName}") on shutdown.`);
    }
    activeLocks.clear();
  },
};

module.exports = nm;

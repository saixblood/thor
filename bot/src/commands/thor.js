"use strict";

/**
 * /thor <seconds> <message with spaces>
 *   – Starts sending a periodic message in the current thread.
 *
 * /thor stop
 *   – Stops the periodic sender in the current thread.
 *
 * /thor status
 *   – Shows active periodic senders.
 */

const config    = require("../../config.json");
const { reply } = require("../utils/helpers");
const logger    = require("../utils/logger");

// Map of active intervals: threadID → { intervalHandle, message, seconds, startedBy }
const activeSenders = new Map();

const MIN_SECONDS = 5;
const MAX_SECONDS = 86400; // 24 hours

/** @type {import("./index").Command} */
const thor = {
  name: "thor",
  description: "Send periodic messages in the group on a set interval",
  usage: [
    `${config.bot.prefix}thor <seconds> <message>   — Start periodic sender`,
    `${config.bot.prefix}thor stop                   — Stop periodic sender in this group`,
    `${config.bot.prefix}thor status                 — Show active senders`,
  ].join("\n"),

  /**
   * @param {object}   api
   * @param {object}   event
   * @param {string[]} args
   */
  async execute(api, event, args) {
    const threadID = event.threadID;
    const sub      = (args[0] || "").toLowerCase();

    // ── /thor stop ──────────────────────────────────────────────────────────
    if (sub === "stop") {
      if (!activeSenders.has(threadID)) {
        return reply(api, "⚠️ No active periodic sender in this group.", threadID);
      }
      const { intervalHandle } = activeSenders.get(threadID);
      clearInterval(intervalHandle);
      activeSenders.delete(threadID);
      logger.info(`[thor] Stopped sender in thread ${threadID} by ${event.senderID}`);
      return reply(api, "🛑 Periodic sender stopped.", threadID);
    }

    // ── /thor status ─────────────────────────────────────────────────────────
    if (sub === "status") {
      if (activeSenders.size === 0) {
        return reply(api, "📭 No active periodic senders.", threadID);
      }
      const lines = [...activeSenders.entries()].map(([tid, info]) =>
        `• Thread ${tid} — every ${info.seconds}s — "${info.message.slice(0, 40)}${info.message.length > 40 ? "…" : ""}"`
      );
      return reply(api, `📬 Active senders (${activeSenders.size}):\n${lines.join("\n")}`, threadID);
    }

    // ── /thor <seconds> <message> ────────────────────────────────────────────
    const seconds = parseInt(sub, 10);

    if (isNaN(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
      return reply(
        api,
        [
          `❌ Invalid interval.`,
          `Please specify seconds between ${MIN_SECONDS} and ${MAX_SECONDS}.`,
          ``,
          `Usage:`,
          `  ${config.bot.prefix}thor 30 Hello everyone!`,
          `  ${config.bot.prefix}thor stop`,
        ].join("\n"),
        threadID
      );
    }

    // Everything after the number is the message (preserves spaces)
    const rawBody  = event.body || "";
    const prefix   = config.bot.prefix;
    // Strip prefix + command name + the seconds token → rest is the message
    const afterCmd = rawBody.slice(prefix.length + "thor".length).trim();
    const message  = afterCmd.slice(String(seconds).length).trim();

    if (!message) {
      return reply(
        api,
        `❌ No message provided.\nUsage: ${prefix}thor ${seconds} <your message here>`,
        threadID
      );
    }

    // Stop any existing sender in this thread
    if (activeSenders.has(threadID)) {
      clearInterval(activeSenders.get(threadID).intervalHandle);
      activeSenders.delete(threadID);
    }

    // Confirmation
    await reply(
      api,
      [
        `✅ Periodic sender started.`,
        `⏱ Interval : every ${seconds} second${seconds !== 1 ? "s" : ""}`,
        `💬 Message  : ${message}`,
        ``,
        `Use \`${prefix}thor stop\` to stop.`,
      ].join("\n"),
      threadID
    ).catch((e) => logger.error(`[thor] Failed to send confirmation: ${e.message}`));

    // Start interval
    const intervalHandle = setInterval(() => {
      api.sendMessage(message, threadID, (err) => {
        if (err) {
          logger.error(`[thor] Failed to send periodic message to ${threadID}: ${err.error || err.message}`);
          // Auto-stop if the thread becomes unreachable
          if (err.error === 1545012 || err.error === "1545012") {
            clearInterval(intervalHandle);
            activeSenders.delete(threadID);
            logger.warn(`[thor] Auto-stopped sender for thread ${threadID} (not in group).`);
          }
        }
      });
    }, seconds * 1000);

    activeSenders.set(threadID, {
      intervalHandle,
      message,
      seconds,
      startedBy: event.senderID,
    });

    logger.info(`[thor] Started sender in thread ${threadID} — every ${seconds}s — "${message}"`);
  },

  /**
   * Clean up all active senders on shutdown.
   */
  stopAll() {
    for (const [threadID, { intervalHandle }] of activeSenders) {
      clearInterval(intervalHandle);
      logger.info(`[thor] Cleared sender for thread ${threadID} on shutdown.`);
    }
    activeSenders.clear();
  },
};

module.exports = thor;

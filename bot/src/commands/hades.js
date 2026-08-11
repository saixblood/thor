"use strict";

/**
 * /hades <seconds> <message with spaces>
 * /hades stop
 * /hades status
 */

const config = require("../../config.json");
const { reply } = require("../utils/helpers");
const logger = require("../utils/logger");

const activeSenders = new Map();
const security = config.security || {};
const MIN_SECONDS = 5;
const MAX_SECONDS = 86400;
const MAX_SCHEDULED_MESSAGE_LENGTH = Number.isFinite(security.maxScheduledMessageLength)
  ? security.maxScheduledMessageLength
  : 1000;
const MAX_ACTIVE_SCHEDULERS = Number.isFinite(security.maxActiveSchedulers)
  ? security.maxActiveSchedulers
  : 20;

function clearSender(threadID) {
  const sender = activeSenders.get(threadID);
  if (!sender) return false;
  clearInterval(sender.intervalHandle);
  activeSenders.delete(threadID);
  return true;
}

function safeMessage(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

const hades = {
  name: "hades",
  description: "Send a protected periodic message in the group",
  usage: [
    `${config.bot.prefix}hades <seconds> <message> — Start periodic sender`,
    `${config.bot.prefix}hades stop — Stop periodic sender in this group`,
    `${config.bot.prefix}hades status — Show active senders`,
  ].join("\n"),

  async execute(api, event, args) {
    const threadID = event.threadID;
    const sub = (args[0] || "").toLowerCase();

    if (sub === "stop") {
      if (!clearSender(threadID)) {
        return reply(api, "⚠️ No active periodic sender in this group.", threadID);
      }
      logger.info(`[hades] Stopped sender in thread ${threadID} by ${event.senderID}`);
      return reply(api, "🛑 Periodic sender stopped.", threadID);
    }

    if (sub === "status") {
      if (activeSenders.size === 0) {
        return reply(api, "📭 No active periodic senders.", threadID);
      }
      const lines = [...activeSenders.entries()].map(([tid, info]) =>
        `• Thread ${tid} — every ${info.seconds}s — "${info.message.slice(0, 40)}${info.message.length > 40 ? "…" : ""}"`
      );
      return reply(api, `📬 Active senders (${activeSenders.size}):\n${lines.join("\n")}`, threadID);
    }

    const seconds = Number.parseInt(sub, 10);
    if (!/^\d+$/.test(sub) || !Number.isInteger(seconds) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
      return reply(
        api,
        [
          "❌ Invalid interval.",
          `Please specify seconds between ${MIN_SECONDS} and ${MAX_SECONDS}.`,
          "",
          `Usage: ${config.bot.prefix}hades 30 Hello everyone!`,
          `       ${config.bot.prefix}hades stop`,
        ].join("\n"),
        threadID
      );
    }

    const rawBody = event.body || "";
    const commandText = `${config.bot.prefix}hades`;
    const afterCommand = rawBody.slice(commandText.length).trim();
    const message = safeMessage(afterCommand.slice(String(seconds).length));

    if (!message) {
      return reply(api, `❌ No message provided.\nUsage: ${config.bot.prefix}hades ${seconds} <your message here>`, threadID);
    }
    if (message.length > MAX_SCHEDULED_MESSAGE_LENGTH) {
      return reply(api, `❌ Message is too long. Maximum: ${MAX_SCHEDULED_MESSAGE_LENGTH} characters.`, threadID);
    }
    if (!activeSenders.has(threadID) && activeSenders.size >= MAX_ACTIVE_SCHEDULERS) {
      return reply(api, "🛡️ Scheduler limit reached. Stop an existing sender first.", threadID);
    }

    clearSender(threadID);
    await reply(
      api,
      [
        "✅ Hades periodic sender started.",
        `⏱ Interval : every ${seconds} second${seconds !== 1 ? "s" : ""}`,
        `💬 Message  : ${message}`,
        "",
        `Use \`${config.bot.prefix}hades stop\` to stop.`,
      ].join("\n"),
      threadID
    );

    const intervalHandle = setInterval(() => {
      try {
        api.sendMessage(message, threadID, (err) => {
          if (!err) return;
          logger.error(`[hades] Failed to send periodic message to ${threadID}: ${err.error || err.message}`);
          if (err.error === 1545012 || err.error === "1545012") {
            clearSender(threadID);
            logger.warn(`[hades] Auto-stopped sender for thread ${threadID}.`);
          }
        });
      } catch (err) {
        logger.error(`[hades] Periodic send failed: ${err.message}`);
        clearSender(threadID);
      }
    }, seconds * 1000);

    activeSenders.set(threadID, { intervalHandle, message, seconds, startedBy: event.senderID });
    logger.info(`[hades] Started sender in thread ${threadID} — every ${seconds}s`);
  },

  stopAll() {
    for (const threadID of activeSenders.keys()) clearSender(threadID);
    logger.info("[hades] Cleared all periodic senders on shutdown.");
  },
};

module.exports = hades;
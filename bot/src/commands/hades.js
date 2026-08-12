"use strict";

/**
 * /hades <seconds> <message with spaces>
 * /hades random <min> <max> <seconds|minutes> <message with spaces>
 * /hades r<number>s|m <message with spaces>
 * /hades stop
 * /hades status
 */

const config = require("../../config.json");
const { reply } = require("../utils/helpers");
const logger = require("../utils/logger");

const activeSenders = new Map();
const security = config.security || {};
const MIN_INTERVAL_SECONDS = 5;
const MAX_INTERVAL_SECONDS = 86400;
const MAX_ACTIVE_SCHEDULERS = Number.isFinite(security.maxActiveSchedulers)
  ? security.maxActiveSchedulers
  : 20;

function clearSender(threadID) {
  const sender = activeSenders.get(threadID);
  if (!sender) return false;
  clearInterval(sender.intervalHandle);
  clearTimeout(sender.timeoutHandle);
  activeSenders.delete(threadID);
  return true;
}

function safeMessage(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function parseUnit(value) {
  const unit = String(value || "").toLowerCase();
  if (["s", "sec", "secs", "second", "seconds"].includes(unit)) return "seconds";
  if (["m", "min", "mins", "minute", "minutes"].includes(unit)) return "minutes";
  return null;
}

function parseRandomShortcut(value) {
  const match = /^r(\d+)(s|m)$/i.exec(String(value || ""));
  if (!match) return null;

  const maxValue = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase() === "m" ? "minutes" : "seconds";
  const maxSeconds = unit === "minutes" ? maxValue * 60 : maxValue;

  return { unit, maxValue, maxSeconds };
}

function formatDuration(seconds) {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

function pickRandomSeconds(minSeconds, maxSeconds) {
  return Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
}

function sendScheduledMessage(api, threadID, sender) {
  if (activeSenders.get(threadID) !== sender) return;

  try {
    api.sendMessage(sender.message, threadID, (err) => {
      if (err) {
        logger.error(`[hades] Failed to send periodic message to ${threadID}: ${err.error || err.message}`);
        if (err.error === 1545012 || err.error === "1545012") {
          clearSender(threadID);
          logger.warn(`[hades] Auto-stopped sender for thread ${threadID}.`);
          return;
        }
      }

      if (sender.random) scheduleNext(api, threadID, sender);
    });
  } catch (err) {
    logger.error(`[hades] Periodic send failed: ${err.message}`);
    clearSender(threadID);
  }
}

function scheduleNext(api, threadID, sender) {
  if (activeSenders.get(threadID) !== sender) return;

  const delaySeconds = pickRandomSeconds(sender.minSeconds, sender.maxSeconds);
  sender.nextDelaySeconds = delaySeconds;
  sender.timeoutHandle = setTimeout(
    () => sendScheduledMessage(api, threadID, sender),
    delaySeconds * 1000
  );
}

const hades = {
  name: "hades",
  description: "Send a protected periodic message in the group",
  usage: [
    `${config.bot.prefix}hades <seconds> <message> — Start periodic sender`,
    `${config.bot.prefix}hades random <min> <max> seconds <message> — Random seconds`,
    `${config.bot.prefix}hades random <min> <max> minutes <message> — Random minutes`,
    `${config.bot.prefix}hades r<number>s|m <message> — Random shortcut`,
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
        `• Thread ${tid} — ${info.scheduleLabel} — "${info.message.slice(0, 40)}${info.message.length > 40 ? "…" : ""}"`
      );
      return reply(api, `📬 Active senders (${activeSenders.size}):\n${lines.join("\n")}`, threadID);
    }

    const rawBody = event.body || "";
    const commandText = `${config.bot.prefix}hades`;
    const remainder = rawBody.slice(commandText.length).trim();
    const tokens = remainder.split(/\s+/);
    const randomShortcut = parseRandomShortcut(tokens[0]);
    const random = sub === "random" || Boolean(randomShortcut);
    const unit = randomShortcut ? randomShortcut.unit : random ? parseUnit(tokens[3]) : "seconds";
    const minValue = randomShortcut ? String(MIN_INTERVAL_SECONDS) : random ? tokens[1] : tokens[0];
    const maxValue = randomShortcut ? String(randomShortcut.maxValue) : random ? tokens[2] : tokens[0];
    const minValueNumber = Number.parseInt(minValue, 10);
    const maxValueNumber = Number.parseInt(maxValue, 10);
    const minSeconds = randomShortcut
      ? MIN_INTERVAL_SECONDS
      : random && unit === "minutes"
        ? minValueNumber * 60
        : minValueNumber;
    const maxSeconds = randomShortcut
      ? randomShortcut.maxSeconds
      : random && unit === "minutes"
        ? maxValueNumber * 60
        : maxValueNumber;
    const hasValidNumbers = /^\d+$/.test(minValue || "")
      && /^\d+$/.test(maxValue || "")
      && Number.isInteger(minSeconds)
      && Number.isInteger(maxSeconds);

    if (
      !hasValidNumbers
      || !unit
      || minSeconds < MIN_INTERVAL_SECONDS
      || maxSeconds > MAX_INTERVAL_SECONDS
      || minSeconds > maxSeconds
    ) {
      return reply(
        api,
        [
          "❌ Invalid interval.",
          `Use seconds between ${MIN_INTERVAL_SECONDS} and ${MAX_INTERVAL_SECONDS}, or a random range in seconds/minutes.`,
          "",
          `Usage: ${config.bot.prefix}hades 30 Hello everyone!`,
          `       ${config.bot.prefix}hades random 1 5 minutes Hello everyone!`,
          `       ${config.bot.prefix}hades random 10 30 seconds Hello everyone!`,
          `       ${config.bot.prefix}hades r3m Hello everyone!`,
          `       ${config.bot.prefix}hades stop`,
        ].join("\n"),
        threadID
      );
    }

    const argumentCount = randomShortcut ? 1 : random ? 4 : 1;
    const message = safeMessage(tokens.slice(argumentCount).join(" "));

    if (!message) {
      return reply(
        api,
        random
          ? `❌ No message provided.\nUsage: ${config.bot.prefix}hades random ${minValue} ${maxValue} ${unit} <your message here>`
          : `❌ No message provided.\nUsage: ${config.bot.prefix}hades ${minValue} <your message here>`,
        threadID
      );
    }
    if (!activeSenders.has(threadID) && activeSenders.size >= MAX_ACTIVE_SCHEDULERS) {
      return reply(api, "🛡️ Scheduler limit reached. Stop an existing sender first.", threadID);
    }

    clearSender(threadID);
    const messagePreview = message.length > 200 ? `${message.slice(0, 200)}…` : message;
    await reply(
      api,
      [
        "✅ Hades periodic sender started.",
        random
          ? `⏱ Interval : random between ${formatDuration(minSeconds)} and ${formatDuration(maxSeconds)}`
          : `⏱ Interval : every ${formatDuration(minSeconds)}`,
        `💬 Message  : ${messagePreview}`,
        "",
        `Use \`${config.bot.prefix}hades stop\` to stop.`,
      ].join("\n"),
      threadID
    );

    const sender = {
      timeoutHandle: null,
      message,
      random,
      seconds: minSeconds,
      minSeconds,
      maxSeconds,
      scheduleLabel: random
        ? `random ${formatDuration(minSeconds)}–${formatDuration(maxSeconds)}`
        : `every ${formatDuration(minSeconds)}`,
      startedBy: event.senderID,
    };
    activeSenders.set(threadID, sender);
    if (random) {
      scheduleNext(api, threadID, sender);
    } else {
      sender.intervalHandle = setInterval(
        () => sendScheduledMessage(api, threadID, sender),
        minSeconds * 1000
      );
    }
    logger.info(`[hades] Started sender in thread ${threadID} — ${sender.scheduleLabel}`);
  },

  stopAll() {
    for (const threadID of activeSenders.keys()) clearSender(threadID);
    logger.info("[hades] Cleared all periodic senders on shutdown.");
  },
};

module.exports = hades;
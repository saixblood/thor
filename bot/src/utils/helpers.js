"use strict";

const config = require("../../config.json");

/**
 * Parse a raw message body into a command name and arguments.
 * Returns null if the message does not start with the configured prefix.
 *
 * @param {string} body - Raw message text
 * @returns {{ command: string, args: string[] } | null}
 */
function parseCommand(body) {
  if (typeof body !== "string") return null;

  const prefix = config.bot.prefix;
  if (!body.startsWith(prefix)) return null;

  const withoutPrefix = body.slice(prefix.length).trim();
  if (!withoutPrefix) return null;

  const parts = withoutPrefix.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  return { command, args };
}

/**
 * Send a text reply to the thread that triggered the event.
 *
 * @param {object} api  - nfxfca API instance
 * @param {string} message - Text to send
 * @param {string} threadID - Target thread ID
 */
function reply(api, message, threadID) {
  return new Promise((resolve, reject) => {
    api.sendMessage(message, threadID, (err, info) => {
      if (err) return reject(err);
      resolve(info);
    });
  });
}

/**
 * Format milliseconds into a human-readable duration string.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days)    parts.push(`${days}d`);
  if (hours)   parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

module.exports = { parseCommand, reply, formatUptime };

"use strict";

const config = require("../../config.json");
const { reply, formatUptime } = require("../utils/helpers");
const logger  = require("../utils/logger");

/** @type {import("../commands/index").Command} */
const uptime = {
  name: "uptime",
  description: config.uptime.description,
  usage: `${config.bot.prefix}uptime`,

  /**
   * @param {object} api       - nkxfca API instance
   * @param {object} event     - Messenger message event
   * @param {string[]} args    - Command arguments (unused)
   */
  async execute(api, event, args) {
    const uptimeMs  = process.uptime() * 1000;
    const formatted = formatUptime(uptimeMs);

    const message = [
      `⏱ Uptime: ${formatted}`,
      `🤖 ${config.bot.name} is running smoothly.`,
    ].join("\n");

    try {
      await reply(api, message, event.threadID);
      logger.info(`[uptime] Responded to ${event.senderID} in thread ${event.threadID}`);
    } catch (err) {
      logger.error(`[uptime] Failed to send reply: ${err.message}`);
    }
  },
};

module.exports = uptime;

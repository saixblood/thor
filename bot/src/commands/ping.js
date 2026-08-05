"use strict";

const config  = require("../../config.json");
const { reply, formatUptime } = require("../utils/helpers");
const logger  = require("../utils/logger");

/** @type {import("../commands/index").Command} */
const ping = {
  name: "ping",
  description: config.ping.description,
  usage: `${config.bot.prefix}ping`,

  /**
   * @param {object} api       - nfxfca API instance
   * @param {object} event     - Messenger message event
   * @param {string[]} args    - Command arguments (unused)
   */
  async execute(api, event, args) {
    const start    = Date.now();
    const uptime   = formatUptime(process.uptime() * 1000);
    const latency  = Date.now() - start;

    const message = [
      config.ping.message,
      `⚡ Latency : ${latency}ms`,
      `⏱ Uptime  : ${uptime}`,
    ].join("\n");

    try {
      await reply(api, message, event.threadID);
      logger.info(`[ping] Responded to ${event.senderID} in thread ${event.threadID}`);
    } catch (err) {
      logger.error(`[ping] Failed to send reply: ${err.message}`);
    }
  },
};

module.exports = ping;

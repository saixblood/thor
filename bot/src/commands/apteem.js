"use strict";

const config = require("../../config.json");
const { reply } = require("../utils/helpers");
const logger   = require("../utils/logger");

/** @type {import("../commands/index").Command} */
const apteem = {
  name: "apteem",
  description: config.apteem.description,
  usage: `${config.bot.prefix}apteem`,

  /**
   * @param {object} api       - nfxfca API instance
   * @param {object} event     - Messenger message event
   * @param {string[]} args    - Command arguments (unused)
   */
  async execute(api, event, args) {
    const message = config.apteem.message;

    try {
      await reply(api, message, event.threadID);
      logger.info(`[apteem] Responded to ${event.senderID} in thread ${event.threadID}`);
    } catch (err) {
      logger.error(`[apteem] Failed to send reply: ${err.message}`);
    }
  },
};

module.exports = apteem;

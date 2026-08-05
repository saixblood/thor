"use strict";

const config      = require("../../config.json");
const { reply }   = require("../utils/helpers");
const logger      = require("../utils/logger");
const { addBotAdmin, isDeveloper, getRank } = require("../utils/permissions");

/** @type {import("./index").Command} */
const addadmin = {
  name: "addadmin",
  description: "Add a user as a Bot Admin (Developer only)",
  usage: `${config.bot.prefix}addadmin <UID>`,
  devOnly: true, // informational — enforced in handler via rank check + this flag

  /**
   * @param {object}   api
   * @param {object}   event
   * @param {string[]} args
   */
  async execute(api, event, args) {
    // Must be a developer
    if (!isDeveloper(event.senderID)) {
      return; // silently ignore — non-devs cannot add admins
    }

    const targetUID = args[0];

    if (!targetUID || !/^\d+$/.test(targetUID)) {
      return reply(
        api,
        `❌ Invalid usage.\nUsage: ${addadmin.usage}\nExample: ${config.bot.prefix}addadmin 100012345678`,
        event.threadID
      );
    }

    const result = addBotAdmin(targetUID);

    let message;
    if (result.isDev) {
      message = `⚠️ UID ${targetUID} is already a Developer — no change needed.`;
    } else if (result.alreadyAdmin) {
      message = `⚠️ UID ${targetUID} is already a Bot Admin.`;
    } else {
      message = [
        `✅ Successfully added Bot Admin.`,
        `👤 UID   : ${targetUID}`,
        `🏅 Rank  : Bot Admin`,
        `💾 Saved to disk — no restart required.`,
      ].join("\n");
    }

    try {
      await reply(api, message, event.threadID);
      logger.info(`[addadmin] Dev ${event.senderID} added bot admin ${targetUID}`);
    } catch (err) {
      logger.error(`[addadmin] Failed to send reply: ${err.message}`);
    }
  },
};

module.exports = addadmin;

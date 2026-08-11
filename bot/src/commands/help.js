"use strict";

const config = require("../../config.json");
const { reply } = require("../utils/helpers");
const { isDeveloper } = require("../utils/permissions");

/** Keep the menu readable in Messenger on both mobile and desktop. */
const MENU_WIDTH = 34;

function fit(text, width = MENU_WIDTH) {
  const value = String(text);
  return value.length > width ? `${value.slice(0, width - 1)}…` : value;
}

function section(title, items) {
  if (items.length === 0) return [];

  const lines = [`╭─╼ ${title} ╾─╮`];
  for (const command of items) {
    const usage = Array.isArray(command.usage)
      ? command.usage[0]
      : command.usage;
    lines.push(`│ ✦ ${fit(usage)}`);
    lines.push(`│   ${fit(command.description)}`);
  }
  lines.push("╰" + "─".repeat(MENU_WIDTH + 2) + "╯");
  return lines;
}

/** @type {import("./index").Command} */
const help = {
  name: "help",
  description: "Show the decorated command menu",
  usage: `${config.bot.prefix}help`,

  async execute(api, event) {
    // Require lazily to avoid a circular dependency while commands are loading.
    const commands = require("./index");
    const allCommands = [...commands.registry.values()];
    const developer = isDeveloper(event.senderID);

    const visibleCommands = allCommands.filter(
      (command) => !command.devOnly || developer
    );
    const general = visibleCommands.filter((command) => !command.devOnly);
    const developerCommands = visibleCommands.filter((command) => command.devOnly);

    const message = [
      "╔══════════════════════════════════╗",
       `║      ⚡ ${config.bot.name.toUpperCase()} COMMANDS ⚡      ║`,
      "╠══════════════════════════════════╣",
      "║   ✨ اختر أمرًا من القائمة أدناه   ║",
      "╚══════════════════════════════════╝",
      "",
      ...section("🌟 الأوامر العامة", general),
      "",
      ...section("🛡️ أوامر المطور", developerCommands),
      "",
      `╭─╼ 💡 المساعدة ╾─╮`,
      `│ اكتب ${config.bot.prefix}help لعرض القائمة`,
      `│ البادئة الحالية: ${config.bot.prefix}`,
      "╰────────────────────╯",
    ].join("\n");

    await reply(api, message, event.threadID);
  },
};

module.exports = help;
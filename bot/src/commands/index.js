"use strict";

/**
 * @typedef {Object} Command
 * @property {string}   name        - Command name (without prefix)
 * @property {string}   description - Short description
 * @property {string}   usage       - Usage example
 * @property {boolean}  [devOnly]   - If true, only developers can run it
 * @property {Function} execute     - async (api, event, args) => void
 */

const logger = require("../utils/logger");

/** @type {Map<string, Command>} */
const registry = new Map();

/**
 * Register a command into the registry.
 *
 * @param {Command} command
 */
function register(command) {
  if (!command || typeof command.name !== "string") {
    throw new Error("Invalid command: missing name");
  }
  if (typeof command.execute !== "function") {
    throw new Error(`Command "${command.name}" must export an execute function`);
  }
  if (registry.has(command.name)) {
    throw new Error(`Duplicate command: "${command.name}" is already registered`);
  }
  registry.set(command.name, command);
  const tag = command.devOnly ? " [dev-only]" : "";
  logger.info(`[commands] Registered: ${command.name}${tag}`);
}

/**
 * Look up a command by name.
 *
 * @param {string} name
 * @returns {Command | undefined}
 */
function get(name) {
  return registry.get(name);
}

/**
 * Load and register all built-in commands.
 * Add new command files here to make them available.
 */
function loadAll() {
  const commandFiles = [
    require("./help"),
    require("./ping"),
    require("./addadmin"),
    require("./hades"),
    require("./nm"),
    require("./nick"),
  ];

  for (const cmd of commandFiles) {
    try {
      register(cmd);
    } catch (err) {
      logger.error(`[commands] Failed to register: ${err.message}`);
    }
  }

  logger.info(`[commands] Ready — ${registry.size} command(s): ${[...registry.keys()].join(", ")}`);
}

module.exports = { register, get, loadAll, registry };

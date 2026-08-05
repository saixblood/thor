"use strict";

/**
 * @typedef {Object} Command
 * @property {string}   name        - Command name (without prefix)
 * @property {string}   description - Short description
 * @property {string}   usage       - Usage example
 * @property {Function} execute     - async (api, event, args) => void
 */

const logger = require("../utils/logger");

/** @type {Map<string, Command>} */
const registry = new Map();

/**
 * Register a command into the registry.
 * Throws if a command with the same name is already registered.
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
  logger.info(`[commands] Registered command: ${command.name}`);
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
    require("./ping"),
    require("./apteem"),
  ];

  for (const cmd of commandFiles) {
    try {
      register(cmd);
    } catch (err) {
      logger.error(`[commands] Failed to register command: ${err.message}`);
    }
  }

  logger.info(`[commands] Loaded ${registry.size} command(s): ${[...registry.keys()].join(", ")}`);
}

module.exports = { register, get, loadAll, registry };

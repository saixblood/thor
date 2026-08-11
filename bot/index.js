"use strict";

/**
 * Hades — Facebook Messenger Group Bot
 * Entry point: initialises login, loads commands, and starts the listener.
 */

const config          = require("./config.json");
const logger          = require("./src/utils/logger");
const commands        = require("./src/commands/index");
const { authenticate, saveAppState } = require("./src/core/login");
const { attachListener }             = require("./src/core/handler");
const { listBotAdmins }              = require("./src/utils/permissions");
const SessionKeeper                  = require("./src/core/sessionKeeper");

// ─── Banner ───────────────────────────────────────────────────────────────────

logger.bot("╔═══════════════════════════════════════╗");
logger.bot(`║   ${config.bot.name.toUpperCase()} BOT  v${config.bot.version}                     ║`);
logger.bot("╚═══════════════════════════════════════╝");
logger.info(`Prefix     : ${config.bot.prefix}`);
logger.info(`Developers : ${config.ranks.developers.join(", ")}`);
logger.info(`Bot Admins : ${listBotAdmins().length > 0 ? listBotAdmins().join(", ") : "(none)"}`);

// ─── Command Registry ─────────────────────────────────────────────────────────

commands.loadAll();

// ─── Reconnect Logic ─────────────────────────────────────────────────────────

let reconnectCount = 0;
let activeSessionKeeper = null;

/**
 * Start the bot: authenticate, start SessionKeeper, and attach the listener.
 * On failure the bot will retry up to maxReconnectAttempts times.
 */
async function start() {
  try {
    const { api } = await authenticate();
    reconnectCount = 0;

    // ── Session Keeper ────────────────────────────────────────────────────────
    if (activeSessionKeeper) activeSessionKeeper.stop();
    activeSessionKeeper = new SessionKeeper(api);
    activeSessionKeeper.start();

    // ── Message Listener ──────────────────────────────────────────────────────
    attachListener(api, activeSessionKeeper, (listenerErr) => {
      activeSessionKeeper.stop();
      logger.warn(`[main] Listener stopped (${listenerErr.error || listenerErr.message || "unknown reason"}). Scheduling reconnect…`);
      scheduleReconnect();
    });

  } catch (err) {
    logger.error(`[main] Startup failed: ${err.message}`);
    scheduleReconnect();
  }
}

/**
 * Schedule a reconnect attempt with exponential back-off.
 */
function scheduleReconnect() {
  const max = config.behavior.maxReconnectAttempts;

  if (!config.behavior.autoReconnect) {
    logger.error("[main] Auto-reconnect is disabled. Exiting.");
    process.exit(1);
  }

  if (reconnectCount >= max) {
    logger.error(`[main] Exceeded max reconnect attempts (${max}). Exiting.`);
    process.exit(1);
  }

  reconnectCount += 1;

  const baseDelay = config.behavior.reconnectDelay;
  const delay     = Math.min(baseDelay * Math.pow(2, reconnectCount - 1), 5 * 60 * 1000);

  logger.warn(`[main] Reconnect attempt ${reconnectCount}/${max} in ${Math.round(delay / 1000)}s…`);
  setTimeout(start, delay);
}

// ─── Process-level Safety Net ─────────────────────────────────────────────────

process.on("unhandledRejection", (reason) => {
  logger.error(`[main] Unhandled Promise Rejection: ${reason}`);
});

process.on("uncaughtException", (err) => {
  logger.error(`[main] Uncaught Exception: ${err.message}`);
  setTimeout(() => process.exit(1), 500);
});

function gracefulShutdown(signal) {
  logger.warn(`[main] Received ${signal}. Shutting down…`);
  if (activeSessionKeeper) activeSessionKeeper.stop();
  try {
    const hadesCmd = commands.registry.get("hades");
    if (hadesCmd && typeof hadesCmd.stopAll === "function") hadesCmd.stopAll();
  } catch (_) {}
  try {
    const nmCmd = commands.registry.get("nm");
    if (nmCmd && typeof nmCmd.stopAll === "function") nmCmd.stopAll();
  } catch (_) {}
  try {
    const nickCmd = commands.registry.get("nick");
    if (nickCmd && typeof nickCmd.stopAll === "function") nickCmd.stopAll();
  } catch (_) {}
  process.exit(0);
}

process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ─── Launch ───────────────────────────────────────────────────────────────────

start();

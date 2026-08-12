"use strict";

const config = require("../../config.json");
const { hasPermission, isDeveloper } = require("../utils/permissions");

const securityConfig = config.security || {};
const rateBuckets = new Map();
const cooldowns = new Map();
const activeCommands = new Map();

function valueOrDefault(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function securityLimits() {
  return {
    maxArgs: valueOrDefault(securityConfig.maxArgs, 20),
    maxArgLength: valueOrDefault(securityConfig.maxArgLength, 300),
    rateWindowMs: valueOrDefault(securityConfig.rateWindowMs, 10000),
    maxCommandsPerWindow: valueOrDefault(securityConfig.maxCommandsPerWindow, 5),
    maxConcurrentCommands: valueOrDefault(securityConfig.maxConcurrentCommands, 1),
    commandExecutionTimeoutMs: valueOrDefault(securityConfig.commandExecutionTimeoutMs, 15000),
  };
}

function isValidEvent(event) {
  if (!event || event.type !== "message") return false;
  if (typeof event.senderID !== "string" || !/^\d+$/.test(event.senderID)) return false;
  if (typeof event.threadID !== "string" || event.threadID.length === 0) return false;
  if (typeof event.body !== "string" || event.body.length === 0) return false;
  return true;
}

function isSafeArgument(value, maxLength = securityLimits().maxArgLength) {
  return typeof value === "string"
    && value.length <= maxLength
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function isSafeCommandInput(args, commandName) {
  const limits = securityLimits();
  if (commandName === "hades") {
    return Array.isArray(args) && args.every((value) => isSafeArgument(value, Infinity));
  }

  return Array.isArray(args)
    && args.length <= limits.maxArgs
    && args.every((value) => isSafeArgument(value, limits.maxArgLength));
}

function checkRateLimit(senderID, threadID) {
  const limits = securityLimits();
  const key = `${senderID}:${threadID}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || [];
  const recent = bucket.filter((timestamp) => now - timestamp < limits.rateWindowMs);

  if (recent.length >= limits.maxCommandsPerWindow) {
    rateBuckets.set(key, recent);
    return false;
  }

  recent.push(now);
  rateBuckets.set(key, recent);
  return true;
}

function checkCooldown(senderID) {
  const cooldownMs = Number.isFinite(config.behavior?.commandCooldown)
    && config.behavior.commandCooldown > 0
    ? config.behavior.commandCooldown
    : 0;
  if (cooldownMs === 0) return true;

  const now = Date.now();
  const last = cooldowns.get(senderID) || 0;
  if (now - last < cooldownMs) return false;

  cooldowns.set(senderID, now);
  return true;
}

function acquireCommand(senderID) {
  const limits = securityLimits();
  const current = activeCommands.get(senderID) || 0;
  if (current >= limits.maxConcurrentCommands) return false;
  activeCommands.set(senderID, current + 1);
  return true;
}

function releaseCommand(senderID) {
  const current = activeCommands.get(senderID) || 0;
  if (current <= 1) activeCommands.delete(senderID);
  else activeCommands.set(senderID, current - 1);
}

function commandTimeout() {
  return securityLimits().commandExecutionTimeoutMs;
}

function cleanup() {
  const now = Date.now();
  const windowMs = securityLimits().rateWindowMs;
  for (const [key, timestamps] of rateBuckets) {
    const recent = timestamps.filter((timestamp) => now - timestamp < windowMs);
    if (recent.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, recent);
  }
  for (const [senderID, timestamp] of cooldowns) {
    if (now - timestamp >= securityLimits().rateWindowMs) cooldowns.delete(senderID);
  }
}

const cleanupTimer = setInterval(cleanup, 60 * 1000);
cleanupTimer.unref?.();

module.exports = {
  isValidEvent,
  isSafeCommandInput,
  checkRateLimit,
  checkCooldown,
  acquireCommand,
  releaseCommand,
  commandTimeout,
  hasPermission,
  isDeveloper,
};
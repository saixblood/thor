"use strict";

const LEVELS = {
  INFO:  { label: "INFO",  color: "\x1b[36m" },
  WARN:  { label: "WARN",  color: "\x1b[33m" },
  ERROR: { label: "ERROR", color: "\x1b[31m" },
  DEBUG: { label: "DEBUG", color: "\x1b[90m" },
  BOT:   { label: "BOT",   color: "\x1b[35m" },
};

const RESET = "\x1b[0m";

function timestamp() {
  return new Date().toLocaleString("en-US", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function log(level, message, ...args) {
  const { label, color } = LEVELS[level] || LEVELS.INFO;
  const ts = timestamp();
  const prefix = `${color}[${ts}] [${label}]${RESET}`;
  if (args.length > 0) {
    console.log(`${prefix} ${message}`, ...args);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

const logger = {
  info:  (msg, ...args) => log("INFO",  msg, ...args),
  warn:  (msg, ...args) => log("WARN",  msg, ...args),
  error: (msg, ...args) => log("ERROR", msg, ...args),
  debug: (msg, ...args) => log("DEBUG", msg, ...args),
  bot:   (msg, ...args) => log("BOT",   msg, ...args),
};

module.exports = logger;

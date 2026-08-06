"use strict";

/**
 * /nick <nickname>  — Set every member's nickname in this group and protect it.
 *                     Restores one nickname every 3 s if anyone changes theirs.
 * /nick stop        — Remove the nickname lock for this group.
 * /nick status      — Show current lock info.
 *
 * Design:
 *   • On start  : fetch all participant IDs → set each nickname with a 3-second
 *                 stagger to avoid rate-limiting.
 *   • On watch  : a cycling ticker checks one participant every 3 s.
 *                 If their nickname differs from the locked value it is restored
 *                 immediately on that same tick.
 *   • Storage   : Map<threadID, LockState> — fully in-memory, no restart needed.
 */

const config    = require("../../config.json");
const { reply } = require("../utils/helpers");
const logger    = require("../utils/logger");

const TICK_MS = 3000; // 3 seconds between each nickname action

/**
 * @typedef {Object} LockState
 * @property {string}          lockedNickname
 * @property {string[]}        participants    - ordered list of UIDs
 * @property {number}          cursor          - index of next participant to check
 * @property {NodeJS.Timeout}  ticker
 * @property {string}          setBy           - senderID who activated the lock
 * @property {"setting"|"watching"} phase
 */

/** @type {Map<string, LockState>} */
const activeLocks = new Map();

// ─── API wrappers ─────────────────────────────────────────────────────────────

/**
 * Fetch participant IDs and current nickname map for a thread.
 *
 * @param {object} api
 * @param {string} threadID
 * @returns {Promise<{ participantIDs: string[], nicknames: Record<string,string> }>}
 */
function fetchThreadData(api, threadID) {
  return new Promise((resolve, reject) => {
    api.getThreadInfo(threadID, (err, info) => {
      if (err || !info) return reject(err || new Error("No thread info"));
      resolve({
        participantIDs: (info.participantIDs || []).map(String),
        nicknames:      info.nicknames || {},
      });
    });
  });
}

/**
 * Set one participant's nickname.
 *
 * @param {object} api
 * @param {string} nickname
 * @param {string} threadID
 * @param {string} participantID
 * @returns {Promise<void>}
 */
function setNickname(api, nickname, threadID, participantID) {
  return new Promise((resolve) => {
    api.setNickname(nickname, threadID, participantID, (err) => {
      if (err) logger.debug(`[nick] setNickname error for ${participantID}: ${err.message || err}`);
      resolve();
    });
  });
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Apply the locked nickname to every participant, one every TICK_MS ms.
 * When finished, transition the lock into "watching" phase.
 *
 * @param {object} api
 * @param {string} threadID
 * @param {LockState} state
 */
function startSettingPhase(api, threadID, state) {
  state.phase  = "setting";
  state.cursor = 0;

  const tick = async () => {
    if (!activeLocks.has(threadID)) return; // lock was removed

    if (state.cursor >= state.participants.length) {
      // All nicknames set — switch to watch mode
      logger.info(`[nick] All nicknames set in thread ${threadID}. Switching to watch mode.`);
      state.phase  = "watching";
      state.cursor = 0;
      state.ticker = setInterval(() => watchTick(api, threadID), TICK_MS);
      return;
    }

    const uid = state.participants[state.cursor];
    state.cursor++;

    await setNickname(api, state.lockedNickname, threadID, uid);
    state.ticker = setTimeout(tick, TICK_MS);
  };

  // Kick off the first tick immediately
  tick();
}

/**
 * One watch tick: check the next participant in the cycle.
 * If their nickname is wrong, restore it.
 *
 * @param {object} api
 * @param {string} threadID
 */
async function watchTick(api, threadID) {
  const state = activeLocks.get(threadID);
  if (!state) return;

  const uid = state.participants[state.cursor % state.participants.length];
  state.cursor = (state.cursor + 1) % state.participants.length;

  try {
    const { nicknames } = await fetchThreadData(api, threadID);
    const current       = nicknames[uid] || "";

    if (current !== state.lockedNickname) {
      logger.info(`[nick] Nickname mismatch for ${uid} in ${threadID}: "${current}" → restoring "${state.lockedNickname}"`);
      await setNickname(api, state.lockedNickname, threadID, uid);
    }
  } catch (err) {
    logger.debug(`[nick] watchTick error in ${threadID}: ${err.message}`);
  }
}

/**
 * Cleanly stop a lock (clears both timeout and interval handles).
 *
 * @param {LockState} state
 */
function clearLock(state) {
  if (state.phase === "setting") {
    clearTimeout(state.ticker);
  } else {
    clearInterval(state.ticker);
  }
}

// ─── Command definition ───────────────────────────────────────────────────────

/** @type {import("./index").Command} */
const nick = {
  name: "nick",
  description: "Lock all group member nicknames — auto-restores every 3 s if changed",
  usage: [
    `${config.bot.prefix}nick <nickname>  — Lock all nicknames`,
    `${config.bot.prefix}nick stop        — Remove the nickname lock`,
    `${config.bot.prefix}nick status      — Show lock info`,
  ].join("\n"),

  /**
   * @param {object}   api
   * @param {object}   event
   * @param {string[]} args
   */
  async execute(api, event, args) {
    const threadID = event.threadID;
    const sub      = (args[0] || "").toLowerCase();

    // ── /nick stop ────────────────────────────────────────────────────────────
    if (sub === "stop") {
      if (!activeLocks.has(threadID)) {
        return reply(api, "⚠️ No active nickname lock in this group.", threadID);
      }
      const state = activeLocks.get(threadID);
      clearLock(state);
      activeLocks.delete(threadID);
      logger.info(`[nick] Lock removed for thread ${threadID}`);
      return reply(
        api,
        `🔓 Nickname lock removed.\nMembers can now change their nicknames freely.`,
        threadID
      );
    }

    // ── /nick status ──────────────────────────────────────────────────────────
    if (sub === "status") {
      if (!activeLocks.has(threadID)) {
        return reply(api, "📭 No active nickname lock in this group.", threadID);
      }
      const { lockedNickname, participants, phase, setBy } = activeLocks.get(threadID);
      return reply(
        api,
        [
          `🔒 Nickname lock active.`,
          `📛 Locked nickname : ${lockedNickname}`,
          `👥 Members locked  : ${participants.length}`,
          `⚙️ Phase           : ${phase === "setting" ? "applying to all members…" : "watching"}`,
          `👤 Set by          : ${setBy}`,
          `⏱ Tick rate        : every 3 seconds`,
        ].join("\n"),
        threadID
      );
    }

    // ── /nick <nickname> ──────────────────────────────────────────────────────
    // Everything after "/nick " is the nickname (preserves spaces)
    const rawBody      = event.body || "";
    const lockedNickname = rawBody.slice((config.bot.prefix + "nick").length).trim();

    if (!lockedNickname) {
      return reply(
        api,
        [
          `❌ No nickname provided.`,
          `Usage: ${config.bot.prefix}nick <nickname>`,
          `Example: ${config.bot.prefix}nick ⚡ Thor Member`,
        ].join("\n"),
        threadID
      );
    }

    // Fetch participants first
    let participantIDs;
    try {
      const data = await fetchThreadData(api, threadID);
      participantIDs = data.participantIDs;
    } catch (err) {
      logger.error(`[nick] Failed to fetch thread data: ${err.message}`);
      return reply(api, `❌ Could not fetch group members.\n${err.message}`, threadID);
    }

    if (participantIDs.length === 0) {
      return reply(api, "❌ No participants found in this thread.", threadID);
    }

    // Remove any existing lock
    if (activeLocks.has(threadID)) {
      clearLock(activeLocks.get(threadID));
    }

    /** @type {LockState} */
    const state = {
      lockedNickname,
      participants: participantIDs,
      cursor:       0,
      ticker:       null,
      setBy:        event.senderID,
      phase:        "setting",
    };
    activeLocks.set(threadID, state);

    logger.info(`[nick] Lock started in thread ${threadID} — "${lockedNickname}" — ${participantIDs.length} members`);

    await reply(
      api,
      [
        `🔒 Nickname lock activated.`,
        `📛 Nickname : ${lockedNickname}`,
        `👥 Members  : ${participantIDs.length}`,
        `⏱ Applying one nickname every 3 seconds…`,
        ``,
        `Use \`${config.bot.prefix}nick stop\` to unlock.`,
      ].join("\n"),
      threadID
    );

    // Begin setting all nicknames, then automatically transition to watch mode
    startSettingPhase(api, threadID, state);
  },

  /**
   * Clear all active locks on shutdown.
   */
  stopAll() {
    for (const [threadID, state] of activeLocks) {
      clearLock(state);
      logger.info(`[nick] Cleared lock for thread ${threadID} on shutdown.`);
    }
    activeLocks.clear();
  },
};

module.exports = nick;

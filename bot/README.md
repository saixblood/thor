# ⚡ Hades Bot

A Facebook Messenger group bot powered by **nkxfca** (`@neoaz07/nkxfca`).

---

## Project Structure

```
bot/
├── config.json              ← All settings live here
├── index.js                 ← Entry point
├── session/
│   └── appstate.json        ← Facebook cookies
└── src/
    ├── commands/
    │   ├── index.js         ← Command registry & loader
    │   ├── ping.js          ← /ping + uptime command
    │   └── hades.js         ← /hades scheduler command
    ├── core/
    │   ├── login.js         ← Authentication & appstate management
    │   ├── handler.js       ← Message listener & command dispatcher
    │   └── security.js      ← Validation, rate limits & execution guards
    └── utils/
        ├── logger.js        ← Coloured console logger
        └── helpers.js       ← parseCommand, reply, formatUptime
```

---

## Setup

### 1. Install dependencies

```bash
cd bot
npm install
```

### 2. Configure credentials

Open **`config.json`** and fill in your Facebook account details:

```json
"credentials": {
  "email": "your@email.com",
  "password": "your_password",
  "appStatePath": "./session/appstate.json"
}
```

> **Use appstate instead of email/password:**  
> Put your Facebook cookies in `session/appstate.json`. The bot loads this file
> on startup and saves the latest session there after login.

### 3. Adjust settings (optional)

| Key | Description |
|-----|-------------|
| `bot.prefix` | Command prefix (default: `/`) |
| `bot.name` | Bot display name |
| `api.selfListen` | Whether the bot responds to its own messages |
| `api.autoMarkRead` | Automatically mark messages as read |
| `behavior.autoReconnect` | Reconnect on disconnect |
| `behavior.maxReconnectAttempts` | Max reconnect retries before exiting |
| `behavior.commandCooldown` | Per-user cooldown between commands (ms) |
| `security.maxMessageLength` | Maximum accepted message size |
| `security.maxCommandsPerWindow` | Maximum commands per user/thread window |
| `security.maxActiveSchedulers` | Maximum active `/hades` schedules |

### 4. Start the bot

```bash
npm start
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Shows the decorated command menu |
| `/ping` | Replies with "Pong!" + latency and uptime |
| `/hades <seconds> <message>` | Sends a protected periodic message |
| `/hades random <min> <max> seconds <message>` | Sends the message after a random delay between two second values |
| `/hades random <min> <max> minutes <message>` | Sends the message after a random delay between two minute values |
| `/hades r<number>s\|m <message>` | Shortcut for a random delay from 5 seconds up to the specified seconds/minutes |
| `/hades stop` | Stops the periodic sender in the current group |
| `/hades status` | Shows active periodic senders |

Examples:

```text
/hades 30 Hello everyone!
/hades random 1 5 minutes This message will be sent at a random time
/hades random 10 30 seconds A random seconds interval
/hades r3m A random delay from 5 seconds up to 3 minutes
```

Hades does not impose a character or word-count limit on the scheduled message.
Random scheduling chooses a new delay after every message, while the normal
seconds form keeps using the same fixed interval on every send.

---

## Login Flow

1. **First run with cookies:** The bot loads `session/appstate.json`.
2. **First run with credentials:** If no appstate exists, it logs in with email + password and saves an `appstate.json`.
3. **Subsequent runs:** The bot loads the saved appstate — no password needed.
4. **Expired session:** If the appstate is invalid or expired, it is automatically deleted and the bot asks you to restart with fresh credentials.

---

## Adding New Commands

1. Create a new file in `src/commands/`, e.g. `src/commands/hello.js`:

```js
"use strict";
const { reply } = require("../utils/helpers");

module.exports = {
  name: "hello",
  description: "Say hello",
  usage: "/hello",
  async execute(api, event, args) {
    await reply(api, "Hello there! 👋", event.threadID);
  },
};
```

2. Register it in `src/commands/index.js` by adding `require("./hello")` to the `commandFiles` array.

That's it — no other changes needed.

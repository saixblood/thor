# ⚡ Thor Bot

A Facebook Messenger group bot powered by **nfxfca**.

---

## Project Structure

```
bot/
├── config.json              ← All settings live here
├── index.js                 ← Entry point
├── session/
│   └── appstate.json        ← Auto-generated login session (gitignored)
└── src/
    ├── commands/
    │   ├── index.js         ← Command registry & loader
    │   ├── ping.js          ← /ping command
    │   └── apteem.js        ← /apteem command
    ├── core/
    │   ├── login.js         ← Authentication & appstate management
    │   └── handler.js       ← Message listener & command dispatcher
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

> **Tip — use an appstate instead of email/password:**  
> If you already have an `appstate.json` from another tool (e.g. c3c), drop it into `session/appstate.json`.  
> The bot will use it on the first run and re-save it automatically after login.

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
| `behavior.adminUIDs` | Array of admin Facebook UIDs |

### 4. Start the bot

```bash
npm start
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/ping` | Replies with "Pong!" + latency and uptime |
| `/apteem` | Sends the Apteem greeting |

---

## Login Flow

1. **First run with credentials:** The bot logs in with email + password and saves an `appstate.json` to `session/`.
2. **Subsequent runs:** The bot loads the saved appstate — no password needed.
3. **Expired session:** If the appstate is invalid or expired, it is automatically deleted and the bot asks you to restart with fresh credentials.

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

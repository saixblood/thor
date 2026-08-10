---
name: Railway bot deployment
description: Deployment constraint for the nested Thor Bot workspace on Railway
---

The Railway service must build from the repository root while treating `bot` as a pnpm workspace package; otherwise Nixpacks can install the root packages but omit the bot's runtime dependency.

**Why:** The bot entrypoint imports `@neoaz07/nkxfca`, which is declared by the nested package and requires Node.js 22 or newer.

**How to apply:** Keep the bot in `pnpm-workspace.yaml`, keep the root lockfile available to Railway, pin Node.js 22, and use a root `railway.toml` that builds the `thor-bot` filter and starts that workspace package.
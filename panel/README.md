# Hades control panel

Run `PANEL_TOKEN='a-long-random-secret' node panel/server.js`, then open port 3000. Set `PANEL_PORT` or `PORT` to change the port. Use HTTPS at your reverse proxy and keep the token secret. The panel can run without a token for initial setup, but only the non-sensitive offline status is available until one is configured. Authenticate with the Connect panel button in Settings.

The panel is a standalone service with a `PanelService` class exposing `start()` and `stop()`. An embedding process may provide a `status()` adapter, but the bot is not currently wired to this adapter; standalone status therefore reports offline rather than inventing data. Theme preferences are stored in `panel/.settings.json`.

This is an initial implementation, not a complete operational control plane: appstate replacement/live validation, bot hot-relogin, group controls, command editing, log streaming, notifications, encrypted backups, widget persistence and a service-worker offline shell are not implemented. The existing bot is not modified by the panel. Do not rely on the appstate structure check as proof of a valid Facebook session.

To add a view, add an entry to `routes` and a rendering branch in `public/app.js`. To add an icon, add a `symbol` to the sprite in `public/index.html` and reference it with `icon(name)`.

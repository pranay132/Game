# HUNTZONE — Multiplayer Virtual Survival Game

## Requirements
- Node.js 18 or newer
- Internet connection for installing packages and multiplayer hosting

## Run locally
1. Extract the ZIP.
2. Open the `HUNTZONE` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:
   ```bash
   npm install
   npm start
   ```
5. Open http://localhost:3000 in your browser.
6. For local testing, open the same address in multiple browser tabs and join with the room code. At least 5 players are required to start.

## Play with friends online
Localhost is only available on your own computer. To make it public, deploy this Node app to a host that supports long-lived WebSocket connections (for example Render), using:
- Build command: `npm install`
- Start command: `npm start`
Then share the deployed HTTPS URL with friends. Socket.IO uses the same server and supports WebSockets.

## Install on mobile
Open the deployed HTTPS URL in Chrome/Safari. Use the browser menu → Add to Home Screen / Install app.

## Current game rules
- 5–20 players per private room.
- Host can start with at least 5 players.
- 1 or 2 hunters are randomly assigned.
- 30-minute match; survivors win if time expires.
- Virtual zone stages: 5 km → 4 km → 3 km → 2 km → 1 km → 500 m, shrinking every 5 minutes.
- Hunters tag survivors within 350 virtual metres.
- Hunter movement is a small in-game speed advantage; no real vehicles are used.

## Important scope
This build deliberately uses a virtual coordinate arena. It does not request GPS/location permission, expose real player locations, or support real-world pursuit. The displayed kilometre radius is a game-world scale. This is a starter implementation for a hosted prototype, not a production anti-cheat or persistent account system.

## Notes
- Room state is held in server memory. Restarting the server clears rooms.
- Use HTTPS in deployment for PWA installation.
- For production, add authentication, rate limiting, persistent storage, reconnect handling, host controls, server-side movement cooldowns, and moderation.

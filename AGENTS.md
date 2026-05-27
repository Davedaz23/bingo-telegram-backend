# Bingo Telegram Backend — Agent Guide

## Commands

| Command | Action |
|---------|--------|
| `npm run dev` | Start dev server with nodemon |
| `npm start` | Production start |
| `npm test` | Run jest (no tests exist yet — would pass vacuously) |

## Architecture

- **Single-package Express app** at `src/server.js`
- **No linter, formatter, typechecker, or pre-commit hooks** configured
- **Jest** installed as devDependency but no test files or jest config exist
- **Winston** logs to console + `logs/error.log` / `logs/combined.log` (5MB rotated)

## Key non-obvious facts

- **Socket.IO** auth accepts either JWT (`socket.handshake.auth.token`) or Telegram initData (`socket.handshake.auth.initData`)
- **Webhook** routes live at `/webhook` (not under `/api`) with no rate limiter
- **Auth/payment routes** have a stricter rate limit: 20 req / 15 min (global is 100)
- **Body limit** is 10kb on all JSON/URL-encoded requests
- **CORS** only allows `https://web.telegram.org`, `https://telegram.org`, and `null` origin
- **Card lock TTL**: 120 seconds (cards auto-release via cron every minute)
- **Stale game cleanup**: cron cancels `starting` games stuck >10 min (runs every 5 min)
- **Game numbers** drawn every 5 seconds; countdown is 30 seconds; max 75 draws before refund
- **`.env` is gitignored** — use `.env.example` as template (not yet created, create if adding new vars)

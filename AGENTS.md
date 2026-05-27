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
- **400 cards per game** (`CARDS_PER_GAME: 400`)
- **`.env` is gitignored** — use `.env.example` as template (not yet created, create if adding new vars)

## Game Lifecycle

- **SELECTION** → **starting** → **active** → **finished**
- Always exactly 1 game in `SELECTION` state (auto-created via `ensureSelectionGame()`)
- Called on server startup (`server.js`), every 30s via cron (`gameScheduler.js`), and on every `listGames` call (`game.controller.js`)
- When a game finishes (bingo win) or is cancelled+refunded, `ensureNextGameOnFinish()` creates the next selection game
- Auto-start countdown begins when ≥2 players purchase cards (`purchaseCard` in `gameService.js`)
- Max 75 draws before game auto-cancels and refunds

## SMS Deposit Flow

- **No more Chapa** — deposits are confirmed via SMS matching
- Supported channels: `cbe`, `cbebirr`, `abyssinia`, `telebirr`
- User pastes SMS they received after transfer → `POST /api/payments/deposit`
- Admin pastes their own SMS in admin panel → `POST /api/admin/deposits/:id/match`
- System extracts reference number and amount from both SMS texts via regex
- If amounts or refs match, auto-confirms; otherwise admin can manually confirm → `POST /api/admin/deposits/:id/confirm`
- Deposit account numbers exposed via `GET /api/payments/deposit/accounts` (configured in `.env`)
- `DepositRequest` model tracks the full flow
- Admin routes: `GET /api/admin/deposits`, `POST /api/admin/deposits/:id/match`, `POST /api/admin/deposits/:id/confirm`

## New/Modified Files in This Session

- `src/routes/admin.routes.js` — added deposit management routes
- `src/routes/webhook.routes.js` — removed Chapa webhook
- `src/services/gameScheduler.js` — added ensureSelectionGame cron every 30s, log stats every 30min
- `src/server.js` — calls ensureSelectionGame() on startup
- `src/controllers/payment.controller.js` — added getDepositAccounts endpoint
- `src/routes/payment.routes.js` — added GET /deposit/accounts route

## Frontend (separate repo: `D:\Works\bingo-telegram-frontend`)

- `src/app/wallet/page.tsx` — SMS deposit UI with channel selection, account display, SMS text input
- `src/app/admin/deposits/page.tsx` — admin deposit request list with SMS match/confirm UI
- `src/lib/api.ts` — added getDepositAccounts, requestSmsDeposit, admin deposit functions
- `src/types/index.ts` — added DepositRequest, DepositAccounts types
- `src/app/games/[id]/page.tsx` — uses `selection` state instead of `waiting`
- `src/components/GameListItem.tsx` — added `selection` badge variant, simplified display
- `src/app/admin/games/page.tsx` — uses `selection` state instead of `waiting`

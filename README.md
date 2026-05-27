# 🎱 Bingo Telegram Mini App — Backend

A secure, production-ready Node.js/Express backend for a real-money Bingo game running as a Telegram Mini App.

---

## 📁 Folder Structure

```
bingo-telegram-backend/
├── src/
│   ├── server.js              # Entry point
│   ├── app.js                 # Express app + middleware
│   ├── config/
│   │   ├── database.js        # MongoDB connection
│   │   └── constants.js       # Game config, enums, status codes
│   ├── controllers/
│   │   ├── auth.controller.js      # Telegram login, JWT
│   │   ├── game.controller.js      # Game flow, card select/purchase/bingo
│   │   ├── payment.controller.js   # Deposit, withdrawal, transfer
│   │   └── admin.controller.js     # Admin dashboard & management
│   ├── middleware/
│   │   ├── telegramAuth.js    # Validate Telegram initData + JWT
│   │   └── errorHandler.js    # Global error handling + AppError class
│   ├── models/
│   │   ├── User.js            # Users with wallet balance
│   │   ├── Game.js            # Game sessions
│   │   ├── BingoCard.js       # Cards with atomic locking
│   │   ├── Transaction.js     # All financial transactions
│   │   └── Withdrawal.js      # Withdrawal requests
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── game.routes.js
│   │   ├── card.routes.js
│   │   ├── payment.routes.js
│   │   ├── withdrawal.routes.js
│   │   ├── user.routes.js
│   │   ├── admin.routes.js
│   │   └── webhook.routes.js
│   ├── services/
│   │   ├── gameService.js       # Full game lifecycle
│   │   ├── walletService.js     # Atomic balance operations
│   │   ├── paymentService.js    # Chapa integration
│   │   ├── withdrawalService.js # Withdrawal management
│   │   └── gameScheduler.js     # Cron jobs
│   ├── socket/
│   │   └── socketManager.js    # Socket.IO with auth + rooms
│   └── utils/
│       ├── bingoUtils.js       # Card generation, bingo check
│       └── logger.js           # Winston logger
├── logs/
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your values

# 3. Start in development
npm run dev

# 4. Start in production
npm start
```

---

## 🔐 Authentication Flow

1. Telegram Mini App launches and provides `initData`
2. Frontend sends `POST /api/auth/telegram` with `{ initData }`
3. Backend validates HMAC-SHA256 signature using Bot Token
4. Returns JWT for subsequent requests
5. JWT is sent as `Authorization: Bearer <token>` header

**Admin Setup:** Add Telegram user IDs to `ADMIN_TELEGRAM_IDS` in `.env` (comma-separated). These users get `admin` role automatically.

---

## 🎮 Game Flow

```
Admin creates game → Cards generated (90 cards)
   ↓
Players browse available cards → Select (2-min lock)
   ↓
Player purchases (wallet debit + card confirmed)
   ↓
Admin (or auto) starts countdown → 30s
   ↓
Game activates → Numbers drawn every 5 seconds
   ↓
Player claims BINGO → Server verifies card
   ↓
Winner credited → Platform fee deducted
   ↓
If no winner after 75 numbers → Full refund
```

---

## 💳 Payment Flow (Chapa - Ethiopia)

```
User requests deposit → Chapa checkout URL returned
   ↓
User pays on Chapa → Webhook fires to /webhook/chapa
   ↓
Backend verifies with Chapa API → Credits wallet
```

---

## 🔌 Socket.IO Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `game:join` | `{ gameId }` | Join a game room |
| `game:leave` | `{ gameId }` | Leave game room |
| `ping` | - | Heartbeat |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `game:new` | game info | New game created |
| `game:countdown` | `{ seconds, playerCount }` | Countdown started |
| `game:started` | game info | Game is live |
| `game:numberDrawn` | `{ number, drawnNumbers }` | Number called |
| `game:winner` | winner + prize info | Game won |
| `game:cancelled` | `{ reason, refunded }` | Game cancelled |
| `card:locked` | `{ cardId, cardNumber }` | Card selected by someone |
| `card:released` | `{ cardId, cardNumber }` | Card back to available |
| `card:purchased` | `{ cardId, userId }` | Card sold |
| `game:playerJoined` | `{ playerCount, prizePool }` | New player joined |
| `withdrawal:completed` | `{ amount }` | Your withdrawal processed |

---

## 🛡️ Security Features

- **Telegram HMAC validation** on every initData
- **JWT** for session management
- **Atomic card locking** via MongoDB `findOneAndUpdate` — prevents double-selection
- **Atomic wallet debits** — insufficient balance check is atomic (no race condition)
- **MongoDB sessions** for multi-document transactions (card purchase, refunds)
- **Rate limiting** — 100 req/15min global, 20/15min on auth/payment endpoints
- **Helmet** security headers
- **Input size limits** (10kb body)
- **Admin role** required for all admin routes
- **Idempotent webhook** handling (deposit verified only once)

---

## 📋 API Reference

### Auth
```
POST /api/auth/telegram     { initData }           → { token, user }
GET  /api/auth/me                                   → { user }
```

### Games
```
GET  /api/games                                     → open games
GET  /api/games/:id                                 → game details
GET  /api/games/:id/cards                          → available cards
POST /api/games/:id/cards/:cardId/select           → lock card
POST /api/games/:id/cards/:cardId/release          → release lock
POST /api/games/:id/cards/:cardId/purchase         → buy card
POST /api/games/:id/bingo                          → claim bingo
GET  /api/games/history                            → my game history
```

### Payments
```
GET  /api/payments/balance                          → wallet balance
POST /api/payments/deposit           { amount }     → checkout URL
GET  /api/payments/deposit/verify/:txRef            → verify deposit
GET  /api/payments/transactions                     → tx history
POST /api/payments/transfer   { toTelegramId, amount } → transfer
```

### Withdrawals
```
POST /api/withdrawals        { amount, accountNumber, ... }
GET  /api/withdrawals
```

### Admin
```
GET  /api/admin/dashboard
POST /api/admin/games              create game
POST /api/admin/games/:id/start    start countdown
POST /api/admin/games/:id/cancel   cancel + refund
GET  /api/admin/users
POST /api/admin/users/:id/ban
POST /api/admin/users/:id/credit
GET  /api/admin/withdrawals
POST /api/admin/withdrawals/:id/approve
POST /api/admin/withdrawals/:id/reject
```

---

## ⚙️ Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Strong random secret (32+ chars) |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook validation secret |
| `ADMIN_TELEGRAM_IDS` | Comma-separated Telegram user IDs |
| `CHAPA_SECRET_KEY` | Chapa payment gateway key |
| `CARD_PRICE` | Default card price in ETB |
| `PLATFORM_FEE_PERCENT` | Platform cut (default: 10%) |
| `MIN_PLAYERS` | Min players to start a game |

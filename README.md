# 💰 Finance & Installments Tracker

A Telegram bot + Mini App for tracking income, expenses, and monthly installments — built on the **Persian (Shamsi) calendar**, running entirely on **Cloudflare Workers**.

Log a transaction from a chat message, an iOS Shortcut, or the in-app dashboard. Get an automatic reminder in Telegram the day before an installment is due. See a live forecast of what your balance will look like once this month's installments are paid.

Built by [@ArefKp](https://t.me/ArefKp).

---

## ✨ Features

- **Multiple ways to log a transaction** — natural-language Telegram messages (`expense - 50 - Lunch`), the Mini App, or a GET-based endpoint designed for iOS Shortcuts.
- **Installments on the Shamsi calendar** — set a due day (and month, for yearly installments), choose monthly or yearly recurrence, and get a Telegram reminder one day before it's due.
- **Financial forecast** — a live projection of your balance after this month's remaining installments are paid.
- **Categories & budgets** — tag expenses with a category and set a monthly spending limit per category, with progress bars.
- **Daily logging streak & badges** — lightweight gamification based on how consistently you log transactions.
- **Light/dark theme and a bilingual (Persian/English) interface**, both persisted per device.
- **Instant chat report** — send `گزارش` (or `/report`) to the bot for a full financial summary, no need to open the app.
- **Efficient reminder cron** — a single lightweight index is read once a day rather than querying every user's data, so it stays well within Cloudflare's free-tier limits even as the user base grows.

## 🧱 Tech stack

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — serverless runtime (fetch handler + a daily cron trigger)
- [Workers KV](https://developers.cloudflare.com/kv/) — storage for transactions, installments, budgets, and the reminder index
- [Telegram Bot API](https://core.telegram.org/bots/api) — chat interface + [Mini Apps](https://core.telegram.org/bots/webapps) for the dashboard
- Vanilla JS + [Tailwind CSS](https://tailwindcss.com/) (via CDN) + [Chart.js](https://www.chartjs.org/) for the Mini App — no build step required

## 📋 Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (the free tier is enough)
- [Node.js](https://nodejs.org/) 18+ and npm
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## 🚀 Setup & deployment

```bash
git clone https://github.com/<your-username>/finance-tracker-bot.git
cd finance-tracker-bot
npm install
```

**1. Create a KV namespace**

```bash
npx wrangler kv namespace create PERSONALFIN
```

Copy the `id` it prints and paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "PERSONALFIN"
id = "paste-your-id-here"
```

**2. Create a Telegram bot**

Message [@BotFather](https://t.me/BotFather), run `/newbot`, and save the token it gives you.

**3. Set the bot token as a secret**

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
```

**4. Deploy**

```bash
npx wrangler deploy
```

Wrangler prints your Worker's URL, e.g. `https://finance-tracker-bot.<your-subdomain>.workers.dev`.

**5. Register the Telegram webhook**

Visit `https://<your-worker-url>/set-webhook` once in a browser. You should see `{"status":"SUCCESS", ...}`.

**6. (Optional) Add a menu button in Telegram**

In BotFather: `/mybots` → your bot → **Bot Settings** → **Menu Button** → set the URL to `https://<your-worker-url>/app`. This gives users a one-tap button to open the dashboard.

**7. (Optional) iOS Shortcuts**

Create a Shortcut with a "Get Contents of URL" action, method `GET`, pointing to:

```
https://<your-worker-url>/api/shortcut?userId=<your-telegram-id>&amount=50&desc=Coffee&type=expense
```

Use `type=income` for a second shortcut to log income. `<your-telegram-id>` is your numeric Telegram user ID (message [@userinfobot](https://t.me/userinfobot) to get it).

## 💬 Usage

**In Telegram chat:**
- `/start` — welcome message and quick syntax guide
- `expense - 50 - Lunch` or `income - 2500 - Salary` — log a transaction
- `گزارش` or `/report` — get an instant financial summary, including this month's pending installments and the projected balance after paying them

**In the Mini App** (three tabs):
- **Dashboard** — balance, income/expense breakdown, financial forecast, category budgets, streak & badges, transaction list
- **Installments** — add/edit/delete installments, mark one as paid, see which are due this month
- **About** — feature list and author credit

## 🔌 API reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/app` | GET | Serves the Mini App |
| `/api/transactions` | GET | List a user's transactions |
| `/api/add` | POST | Add a transaction |
| `/api/update` | POST | Edit a transaction |
| `/api/delete` | POST | Delete a transaction |
| `/api/shortcut` | GET | Log a transaction (built for iOS Shortcuts) |
| `/api/installments` | GET | List a user's installments (enriched with due/paid status) |
| `/api/installments/add` | POST | Add an installment |
| `/api/installments/edit` | POST | Edit an installment |
| `/api/installments/delete` | POST | Delete an installment |
| `/api/installments/pay` | POST | Mark an installment paid (also logs an expense) |
| `/api/budgets` | GET / POST | Read or set per-category monthly budget limits |
| `/api/summary` | GET | Balance, income, expense, and the financial forecast |
| `/set-webhook` | GET | Registers the Telegram webhook to this Worker |

All endpoints (except `/set-webhook` and the Telegram webhook handler) take/return JSON and expect a `userId` — the caller's Telegram user ID.

## 🗂️ Project structure

```
finance-tracker-bot/
├── src/
│   └── index.js       # the entire Worker: routes, cron, and the Mini App HTML/CSS/JS
├── wrangler.toml       # Cloudflare Workers config (KV binding, cron schedule)
├── package.json
├── .dev.vars.example   # template for local secrets (wrangler dev)
└── README.md
```

## 🔐 Environment variables / secrets

| Name | Where | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Worker secret | Your bot's token from BotFather |
| `PERSONALFIN` | KV binding | The KV namespace storing all app data |

## 🤝 Contributing

Issues and pull requests are welcome — this started as a personal project, so feel free to open an issue if you run into something.

## 📄 License

MIT — see [LICENSE](./LICENSE).

## 👤 Author

Built by **Aref** — [@ArefKp](https://t.me/ArefKp) on Telegram.

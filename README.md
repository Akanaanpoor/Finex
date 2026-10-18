# 💰 Finance & Installments Tracker

A Telegram bot + Mini App for tracking income, expenses, and monthly installments — built on the **Persian (Shamsi) calendar**, running entirely on **Cloudflare Workers**.

Log a transaction from a chat message, an iOS Shortcut, or the in-app dashboard. Get an automatic reminder in Telegram the day before an installment is due. See a live forecast of what your balance will look like once this month's installments are paid.

Built by [@ArefKp](https://t.me/ArefKp).

---

## ✨ Features

- **Multiple ways to log a transaction** — natural-language Telegram messages (`expense - 50 - Lunch`, `قهوه ۵۰ هزار`), the Mini App, or a GET-based endpoint designed for iOS Shortcuts.
- **Installments on the Shamsi calendar** — set a due day (and month, for yearly installments), choose monthly or yearly recurrence, and get a Telegram reminder one day before it's due. A due day of 31 falls on the last day of shorter months. Overdue and "due in N days" badges in the app.
- **Financial forecast** — a live projection of your balance after this month's remaining installments are paid.
- **Financial flow** — how much of the selected month's income has been spent, with the remaining amount.
- **Month browsing** — step back through earlier months on the Dashboard and Reports tabs, edit or delete old transactions.
- **Reports tab** — cumulative income/expense chart against the previous month, end-of-month forecast (spent so far + average daily pace × remaining days + unpaid installments), spending by category, and a few insights (average daily spend, no-spend days, biggest expense).
- **Categories & budgets** — tag expenses with a category and set a monthly spending limit per category, with progress bars.
- **Daily logging streak & badges** — lightweight gamification based on how consistently you log transactions.
- **One currency everywhere** — Toman (default) or USD, switchable in Settings; used for transactions, installments, forecasts and bot messages.
- **Your data, your control** — export a full backup (JSON) and a CSV of all transactions into the bot chat, and delete your transactions / installments / budgets / everything from Settings (or `/deletedata` in chat).
- **Light/dark theme and a bilingual (Persian/English) interface**, both persisted per device.
- **Instant chat report** — send `گزارش` (or `/report`) to the bot for a full financial summary, no need to open the app.
- **Reminder cron** — one daily run scans installments and only marks a reminder as sent when Telegram actually accepted the message.

## 🧱 Tech stack

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) — serverless runtime (fetch handler + a daily cron trigger)
- [Workers KV](https://developers.cloudflare.com/kv/) — storage for transactions, installments, budgets and settings
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

Send `/shortcut` to the bot — it replies with your personal URL. Create a Shortcut with a "Get Contents of URL" action, method `GET`, pointing to it:

```
https://<your-worker-url>/api/shortcut?userId=<your-telegram-id>&amount=50&desc=Coffee&type=expense
```

Use `type=income` for a second shortcut to log income. `<your-telegram-id>` is your numeric Telegram user ID (message [@userinfobot](https://t.me/userinfobot) to get it). If `SHORTCUT_SECRET` is configured (see Security), the URL also needs the `&token=…` that `/shortcut` gives you.

## 💬 Usage

**In Telegram chat:**
- `/start` / `/help` — welcome message and quick syntax guide
- `expense - 50 - Lunch` or `income - 2500 - Salary` — log a transaction. The type is decided only by a leading keyword (`income`, `inc`, `in`, `+`, `واریز`, `درآمد` → income; everything else is an expense), so a note like "Shopping" or "Parking" can never flip a transaction to income.
- `قهوه ۵۰ هزار`, `اجاره 2 میلیون`, `30k lunch` — Persian/English digits and the multipliers `هزار`, `میلیون`, `k` work too. Add `#food`, `#bills`, … to set a category.
- `گزارش` or `/report` — instant financial summary, including this month's pending installments and the projected balance after paying them
- `/export` — receive a JSON backup and a CSV of your transactions in the chat
- `/shortcut` — your iOS Shortcut link
- `/deletedata` — delete all your data (asks for `/deletedata confirm`; only available when `WEBHOOK_SECRET` is configured, otherwise use the Mini App)

**In the Mini App** (four tabs):
- **Dashboard** — balance, financial forecast, financial flow, category budgets, streak & badges, transactions of the selected month
- **Reports** — trend chart vs. the previous month, forecast, category breakdown, insights
- **Installments** — add/edit/delete installments, mark one as paid (once per month), see what is overdue or due soon
- **About** — feature list and author credit

**Settings (⚙️ in the Mini App):** theme, language, currency, export backup, delete data.

## 🔌 API reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/app` | GET | Serves the Mini App |
| `/api/dashboard` | GET | Everything the dashboard needs in one call: month records (`?month=YYYY-MM`), month stats, all-time summary, installments, budgets, settings, streak, list of months |
| `/api/transactions` | GET | List a user's transactions for the current month (or a specific month via `?month=YYYY-MM`) |
| `/api/add` | POST | Add a transaction |
| `/api/update` | POST | Edit a transaction |
| `/api/delete` | POST | Delete a transaction |
| `/api/shortcut` | GET | Log a transaction (built for iOS Shortcuts) |
| `/api/installments` | GET | List a user's installments (enriched with due/paid/overdue status and days until due) |
| `/api/installments/add` | POST | Add an installment |
| `/api/installments/edit` | POST | Edit an installment |
| `/api/installments/delete` | POST | Delete an installment |
| `/api/installments/pay` | POST | Mark an installment paid (also logs an expense); `409` if already paid this month |
| `/api/budgets` | GET / POST | Read or set per-category monthly budget limits |
| `/api/settings` | GET / POST | Read or set per-user settings (`currency`: `toman` \| `usd`) |
| `/api/summary` | GET | Balance, income, expense, and the financial forecast |
| `/api/reports` | GET | Daily/cumulative series for a month vs. the previous one (`?month=YYYY-MM`), forecast, category breakdown, insights |
| `/api/data/export` | POST | Send a JSON backup + CSV to the user's chat. **Requires a verified Mini App session** |
| `/api/data/delete` | POST | Delete data: body `{ "scope": "transactions" \| "installments" \| "budgets" \| "all", "confirm": "DELETE" }`. **Requires a verified Mini App session** |
| `/set-webhook` | GET | Registers the Telegram webhook to this Worker |

All endpoints (except `/set-webhook` and the Telegram webhook handler) take/return JSON. Mini App requests send Telegram's signed `initData` in the `X-Telegram-Init-Data` header, from which the server takes the user id; legacy clients may still pass a `userId` (see Security).

## 🔐 Security

Everything below is **opt-in or backwards compatible**, so deploying this version never locks existing users out. Turn the switches on in this order:

1. **`WEBHOOK_SECRET`** — `npx wrangler secret put WEBHOOK_SECRET`, then open `/set-webhook` once. Telegram then sends the secret with every update and the Worker rejects anything else. Without it, anybody who knows a Telegram user id could forge messages for that user (log transactions, and — if it were allowed — delete data). Chat-side `/deletedata` stays disabled until this is set.
2. **`ENFORCE_AUTH=1`** — (`[vars]` in `wrangler.toml`) every `/api/*` call must carry a valid Telegram `initData` session; the user id comes from the signature, never from the request. Switch it on once users have re-opened the Mini App (the page is always served fresh, so this happens on their next open). Until then the old "userId in the request" mode keeps working, but a request that *does* carry a signature is always verified.
3. **`SHORTCUT_SECRET`** — iOS Shortcut URLs need a per-user `&token=…` (get it with `/shortcut`). Without it the endpoint stays open, as before.

Export and delete **always** require a verified session, regardless of these switches.

## ⚙️ Cron & limits

A daily cron (`30 17 * * *` ≈ 21:00 Iran time) lists every `installments_*` key, reminds users whose installment is due tomorrow, and refreshes a `system_installments_index` snapshot. Workers allow ~1,000 KV operations per invocation, so one run covers roughly 900 users with installments; beyond that, move the data to D1 or shard the scan.

## 🧪 Development

```bash
npm test            # contract + regression + security tests (node:test, no dependencies)
npm run dev:mock    # the real Worker + Mini App on http://localhost:8787 with in-memory KV and sample data
npm run dev         # wrangler dev (real KV simulation)
```

`npm run dev:mock` prints a URL that simulates a signed Telegram session, so export and delete can be tried without Telegram. Telegram API calls are stubbed.

## 🗂️ Project structure

```
finance-tracker-bot/
├── src/
│   ├── index.js        # routes, daily cron, Telegram webhook
│   ├── lib.js          # Persian calendar, parsing, KV access, aggregation, auth, exports
│   └── miniapp.js      # the Mini App HTML/CSS/JS (served at /app)
├── test/               # node:test suites + dev-server.mjs
├── wrangler.toml       # Cloudflare Workers config (KV binding, cron schedule)
├── package.json
├── .dev.vars.example   # template for local secrets (wrangler dev)
└── README.md
```

## 🗃️ Data layout (Workers KV)

| Key | Content |
|---|---|
| `user_{uid}_{YYYY-MM}` | transactions of one Persian month, newest first |
| `user_index_{uid}` | sorted list of months that exist for the user |
| `user_{uid}` | **legacy** single-array backup from before monthly keys; read once by the migration, deleted by "delete data" |
| `installments_{uid}` | installments |
| `budgets_{uid}` | category limits |
| `settings_{uid}` | `{ currency }` |
| `system_all_users`, `system_installments_index` | housekeeping (the latter is a daily snapshot, not read by the Worker) |

## 🔄 Upgrading from 2.0

No data migration is needed: every existing key keeps its format; the only new key is `settings_{uid}`. Bot confirmations and the app now show amounts in **Toman** (previously transactions were labelled `$` and installments `تومان`, although forecasts treated them as one unit) — users can switch to USD in Settings. To roll back, redeploy the previous version: it ignores `settings_*`, and the cron keeps `system_installments_index` fresh for the old reminder logic.

## 🔐 Environment variables / secrets

| Name | Where | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Worker secret | Your bot's token from BotFather |
| `PERSONALFIN` | KV binding | The KV namespace storing all app data |
| `WEBHOOK_SECRET` | Worker secret (optional) | Authenticates Telegram → Worker calls |
| `ENFORCE_AUTH` | var (optional) | `1` = require a verified Mini App session on every API call |
| `SHORTCUT_SECRET` | Worker secret (optional) | Per-user token for the iOS Shortcut endpoint |

## 🤝 Contributing

Issues and pull requests are welcome — this started as a personal project, so feel free to open an issue if you run into something.

## 📄 License

MIT — see [LICENSE](./LICENSE).

## 👤 Author

Built by **Aref** — [@ArefKp](https://t.me/ArefKp) on Telegram.

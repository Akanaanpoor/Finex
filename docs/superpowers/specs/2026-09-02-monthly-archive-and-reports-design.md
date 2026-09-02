# Monthly transaction archiving + Reports tab — design spec

Date: 2026-09-02
Status: approved by user, ready for implementation planning

## Context

`src/index.js` is the entire Cloudflare Worker (routes, cron, and the Mini App
HTML/CSS/JS inline). Today every user's transactions live in a single
ever-growing KV value at key `user_{userId}` (a JSON array). This spec adds
two related, sequential features:

1. **Monthly archiving** — split that single blob into one KV key per
   Persian-calendar month, purely for performance/scalability. No user-facing
   change in behavior.
2. **Reports tab** — a new Mini App tab showing a line chart of this month's
   cumulative income/expense vs. the same days last month, plus an
   end-of-month forecast. Depends on (1)'s per-month storage.

**Hard constraint (from the user):** the app is in active daily use right
now. The migration from the old single-key format to the new per-month
format must not lose, duplicate, or corrupt any existing transaction. This
governs every migration decision below.

## Feature 1 — Monthly archiving

### Data model

- Transactions move from `user_{userId}` (single array) to one key per
  month: `user_{userId}_{YYYY-MM}` in the Persian calendar (e.g.
  `user_123456_1404-06`), each holding the JSON array of that month's
  transactions, newest-first (same shape/order as today).
- New index key `user_index_{userId}` = JSON array of month keys
  (`"1404-06"` strings) that have data for this user, kept sorted
  ascending. This is the source of truth for "which months exist" — used by
  summary computation and by the Reports endpoint. It must always be kept
  in sync whenever a month key is created or would become empty.

### Migration (safety-critical)

- Add `ensureMigrated(kv, userId)`, called at the top of every route that
  touches a given user's transactions (add/update/delete/transactions/
  summary/reports/installment-pay/telegram-log).
- Logic, in order, so a crash mid-migration never loses data:
  1. If `user_index_{userId}` already exists, return immediately (already
     migrated) — this makes the function idempotent and cheap on the hot
     path after the first call.
  2. Read `user_{userId}` (legacy key). If it doesn't exist, there is
     nothing to migrate: write an empty `user_index_{userId}` (`[]`) and
     return.
  3. Group the legacy records by the Persian month derived from each
     record's `date` field.
  4. Write each month's group to its `user_{userId}_{YYYY-MM}` key.
  5. Write `user_index_{userId}` with the resulting sorted month-key list.
  6. Only after all of the above KV writes succeed, delete the legacy
     `user_{userId}` key.
- If step 6 never runs (e.g. the worker is killed between steps), the next
  call re-enters `ensureMigrated`: `user_index_{userId}` now exists, so step
  1 short-circuits and the (already-correct) monthly data is left alone —
  the stale legacy key is simply ignored from then on. This means a
  half-finished migration cannot double-apply or duplicate data; worst case
  the harmless legacy key lingers, which is acceptable (not deleted, but
  also never read again).
- No manual/offline migration script — this happens automatically and
  lazily on first touch per user, per the user's decision.

### API changes

- `POST /api/add`: after `ensureMigrated`, write the new record into the
  current month's key (`user_{userId}_{currentMonthKey}`), creating it if
  absent, and add the month key to `user_index_{userId}` if not already
  present.
- `GET /api/transactions`: after `ensureMigrated`, defaults to the current
  month. Accepts an optional `?month=YYYY-MM` query param to fetch a
  specific month's key directly (used by the Reports endpoint and available
  for future history browsing). Missing month key → `[]`.
- `POST /api/update` / `POST /api/delete`: request body gains a `month`
  field (`YYYY-MM`). The frontend already holds the full record (including
  `date`) for any item it's editing/deleting, so it derives `month` from
  `date` client-side and sends it — the backend goes straight to
  `user_{userId}_{month}` instead of scanning every month.
- `computeSummary`: after `ensureMigrated`, reads `user_index_{userId}`,
  fetches every listed month key, and sums `income`/`expense` across all of
  them — same all-time balance semantics as today, just sourced from N
  monthly reads instead of one blob read.
- `POST /api/installments/pay` (line ~246–277) and the Telegram
  natural-language transaction logger (line ~362–365): both currently read/
  write `user_{userId}` directly. Both are updated to call
  `ensureMigrated`, then append to the current month's key and update the
  index, the same as `/api/add`.

### Frontend changes

- `loadDashboardData()` no longer needs to fetch the *entire* history just
  to filter it down to the current month client-side — `/api/transactions`
  now returns the current month directly. The existing client-side
  `persianMonthKeyOf` filtering becomes redundant for the dashboard view and
  can be dropped (budgets/streak calculations that relied on "current
  month only" already get that for free now).
- Edit/delete calls add `month` (derived from the record's `date`) to their
  request bodies.

## Feature 2 — Reports tab

### New endpoint

`GET /api/reports?userId=...`:

1. Calls `ensureMigrated`.
2. Determines current Persian month key and previous Persian month key.
3. Reads `user_{userId}_{currentMonth}` and `user_{userId}_{previousMonth}`
   (each `[]` if absent — e.g. a brand-new user or no spending last month).
4. Buckets each month's transactions by day-of-month, then produces daily
   and cumulative income/expense arrays:
   - `currentMonth`: `{ label, totalDays, dailyIncome[], dailyExpense[], cumulativeIncome[], cumulativeExpense[] }`, arrays sized to today's day-of-month (so far this month).
   - `previousMonth`: same shape, arrays sized to that month's full `totalDays`.
5. `forecast`: `{ projectedIncome, projectedExpense, projectedBalance }`,
   computed as `(cumulative-so-far / days-elapsed-so-far) * totalDaysInCurrentMonth`
   for income and expense independently; `projectedBalance` = projected
   income − projected expense. Requires a helper to compute the number of
   days in a given Persian month/year (29–31, leap-year-aware for Esfand).
6. All aggregation happens in the Worker (per user's choice) — the endpoint
   returns ready-to-chart series, not raw transaction lists.

### Frontend

- Fourth tab "گزارشات" (Reports) alongside Dashboard / Installments / About,
  same visual language (Tailwind + existing Chart.js instance patterns).
- One line chart:
  - Current month income (solid) and expense (solid) cumulative lines up to
    today, continuing as a lighter/dashed segment to end-of-month as the
    forecast.
  - Previous month income and expense cumulative lines, lower-opacity, as
    the comparison baseline, aligned by day-of-month (not by date).
- A summary card below the chart: projected end-of-month income, expense,
  balance, and percentage change vs. last month's actuals.
- New i18n strings added to both the `fa` and `en` dictionaries following
  the existing pattern.

### Dependency

Feature 2 is built only after Feature 1 is deployed and its migration path
is exercised — it relies on `user_index_{userId}` and the
`user_{userId}_{YYYY-MM}` keys existing.

## Testing approach

No automated test suite exists in this repo today (manual verification via
`wrangler dev` / deployed worker is the existing project convention). Manual
checks for this work:

- **Migration:** a user with existing legacy `user_{userId}` data hits any
  endpoint → transactions reappear identically (same amounts, descriptions,
  dates, order) split correctly across month keys; legacy key is gone
  afterward; a second request for the same user is a no-op (idempotency).
- A user with **no** legacy key and no data at all → empty index, empty
  transaction list, no errors.
- Add/edit/delete a transaction in the current month → correct month key
  updated, index unaffected (month already present).
- `computeSummary` matches the pre-migration all-time balance for a test
  user with transactions spanning multiple months.
- Installment payment and Telegram chat logging still append transactions
  correctly post-migration.
- Reports tab: cumulative lines match manually-computed totals for a test
  dataset; previous-month-empty case renders without errors; forecast
  numbers match the stated formula; Esfand (leap year) day-count handled
  correctly.

## Out of scope

- Any UI for browsing/editing transactions from months other than the
  current one (the `?month=` param on `/api/transactions` exists for the
  Reports endpoint's internal use, not a new history-browsing screen).
- Deleting or compacting old monthly data (\"archiving\" here means
  performance-oriented separation, not cold storage/export).

# Monthly Transaction Archiving + Reports Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split each user's transactions from one ever-growing KV blob into one key per Persian-calendar month (for performance, no user-visible change beyond the transaction list now showing only the current month), then add a new "Reports" tab with a cumulative income/expense line chart (this month vs. same days last month) and an end-of-month forecast.

**Architecture:** Everything lives in the single-file Cloudflare Worker `src/index.js` (routes + cron + inline Mini App HTML/CSS/JS), following the codebase's existing convention — no new files. Backend: transactions move from `user_{userId}` to `user_{userId}_{YYYY-MM}` keys plus a `user_index_{userId}` key listing which months exist; a lazy, idempotent `ensureMigrated()` call at the top of every transaction-touching route performs the one-time migration per user. Frontend: the dashboard's transaction list narrows to the current month (matches the new default API behavior); a new Reports tab calls a new `/api/reports` endpoint that returns ready-to-chart daily/cumulative series plus a forecast.

**Tech Stack:** Cloudflare Workers, Workers KV, vanilla JS + Tailwind (CDN) + Chart.js (CDN) for the Mini App, `wrangler dev` for local testing (local KV persistence, `--local` flag, safe to use — never touches production data).

**Spec:** [docs/superpowers/specs/2026-09-02-monthly-archive-and-reports-design.md](../specs/2026-09-02-monthly-archive-and-reports-design.md)

## Global Constraints

- Single file: all changes go in `src/index.js`. Do not create new source files — this matches the project's established single-Worker-file convention.
- **No existing user data may ever be lost, duplicated, or silently dropped** during migration — this is the user's explicit, hard requirement. Every migration step must be idempotent and safe to interrupt.
- Persian (Shamsi) calendar throughout — reuse the existing `toPersianDate()` / `cycleKey()` helpers (do not reimplement Persian date math).
- No automated test framework exists in this repo. Verification is manual: `npx wrangler dev` (local KV, safe) + `curl`. Do not run anything against the production/deployed Worker or a real user's data.
- Follow existing code conventions: Persian comments for backend logic (matches surrounding code), `corsHeaders` on every JSON response, try/catch returning `{ error: err.message }` with status 500 on failure.

---

## Task 1: Month-key helpers and the migration function

**Files:**
- Modify: `src/index.js` (add new functions near the existing helpers, right after `removeFromInstallmentIndex` at line 524)

**Interfaces:**
- Produces: `monthKeyOf(date)` → `"YYYY-MM"` string (Persian calendar) for a JS `Date`.
- Produces: `shiftMonthKey(monthKey, delta)` → `"YYYY-MM"` string, `delta` months away from `monthKey` (handles year rollover both directions).
- Produces: `daysInPersianMonth(dateInThatMonth)` → integer day count (29–31) for the Persian month containing the given `Date`.
- Produces: `addMonthToIndex(kv, userId, monthKey)` → `Promise<void>`, ensures `monthKey` is present in `user_index_{userId}` (sorted, deduped).
- Produces: `ensureMigrated(kv, userId)` → `Promise<void>`, idempotent one-time migration of legacy `user_{userId}` data into monthly keys + index. Must be called (and awaited) before any other read/write touching a user's transactions.

- [ ] **Step 1: Add the helper functions**

Insert this block in `src/index.js` immediately after the `removeFromInstallmentIndex` function (after line 524, before `function convertPersianDigits`):

```js
// کلید ماه شمسی یک تاریخ، به‌صورت "YYYY-MM" (برای نام‌گذاری کلیدهای KV تراکنش‌های ماهانه)
function monthKeyOf(date) {
  return cycleKey(toPersianDate(date));
}

// جابه‌جایی یک کلید ماه (YYYY-MM) به تعداد delta ماه (مثبت یا منفی)، با پوشش تغییر سال
function shiftMonthKey(monthKey, delta) {
  const parts = monthKey.split('-');
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10) + delta;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}

// تعداد روزهای ماه شمسی‌ای که تاریخ داده‌شده در آن قرار دارد (۲۹ تا ۳۱، با پوشش سال کبیسه)
// با پیمایش روز‌به‌روز حول تاریخ ورودی محاسبه می‌شود تا نیازی به پیاده‌سازی جداگانه‌ی قانون کبیسه‌ی شمسی نباشد
function daysInPersianMonth(dateInThatMonth) {
  const target = toPersianDate(dateInThatMonth);
  // برگرد عقب تا روز اول همان ماه شمسی
  let firstOfMonth = new Date(dateInThatMonth.getTime());
  while (true) {
    const prevDay = new Date(firstOfMonth.getTime() - 86400000);
    const prevP = toPersianDate(prevDay);
    if (prevP.month !== target.month || prevP.year !== target.year) break;
    firstOfMonth = prevDay;
  }
  // از روز اول جلو بشمار تا ماه عوض شود
  let count = 0;
  let probe = firstOfMonth;
  while (true) {
    const p = toPersianDate(probe);
    if (p.month !== target.month || p.year !== target.year) break;
    count++;
    probe = new Date(probe.getTime() + 86400000);
  }
  return count;
}

// افزودن یک کلید ماه به ایندکس ماه‌های کاربر (اگر از قبل نبود)، مرتب‌شده و بدون تکرار
async function addMonthToIndex(kv, userId, monthKey) {
  const raw = await kv.get(`user_index_${userId}`);
  let months = raw ? JSON.parse(raw) : [];
  if (!months.includes(monthKey)) {
    months.push(monthKey);
    months.sort();
    await kv.put(`user_index_${userId}`, JSON.stringify(months));
  }
}

// مهاجرت یک‌باره و ایمن از کلید قدیمی تک‌آرایه‌ای (user_{userId}) به کلیدهای ماهانه.
// idempotent: اگر user_index_{userId} از قبل موجود باشد (حتی آرایه‌ی خالی)، بلافاصله برمی‌گردد
// و هیچ کاری انجام نمی‌دهد - یعنی اجرای مکرر یا نیمه‌کاره هرگز داده را تکراری یا گم نمی‌کند.
// کلید قدیمی فقط پس از موفقیت کامل نوشتن تمام کلیدهای ماهانه + ایندکس حذف می‌شود.
async function ensureMigrated(kv, userId) {
  const existingIndex = await kv.get(`user_index_${userId}`);
  if (existingIndex !== null) return; // قبلاً مهاجرت شده

  const legacyRaw = await kv.get(`user_${userId}`);
  if (!legacyRaw) {
    await kv.put(`user_index_${userId}`, JSON.stringify([]));
    return;
  }

  let legacyList;
  try {
    legacyList = JSON.parse(legacyRaw);
    if (!Array.isArray(legacyList)) legacyList = [];
  } catch (e) {
    // داده‌ی قدیمی خراب/غیرقابل‌خواندن است: کلید قدیمی را دست‌نخورده نگه می‌داریم
    // (برای بازیابی دستی بعدی) و فقط با ایندکس خالی کار برنامه را ادامه می‌دهیم.
    await kv.put(`user_index_${userId}`, JSON.stringify([]));
    return;
  }

  const byMonth = {};
  for (const record of legacyList) {
    const mKey = monthKeyOf(new Date(record.date));
    if (!byMonth[mKey]) byMonth[mKey] = [];
    byMonth[mKey].push(record);
  }

  const monthKeys = Object.keys(byMonth).sort();
  for (const mKey of monthKeys) {
    await kv.put(`user_${userId}_${mKey}`, JSON.stringify(byMonth[mKey]));
  }
  await kv.put(`user_index_${userId}`, JSON.stringify(monthKeys));
  await kv.delete(`user_${userId}`);
}
```

- [ ] **Step 2: Start the local dev server**

Run: `npm run dev`
Expected: wrangler prints a local URL, typically `http://localhost:8787`. Leave it running in the background for the rest of this task (and every task below that uses curl).

- [ ] **Step 3: Seed a fake legacy user in local KV**

In a second terminal, run (Bash; note the JSON has to survive shell quoting — use a file to avoid escaping issues):

```bash
cat > /tmp/legacy-tx.json << 'EOF'
[
  {"id":"1","type":"expense","amount":50,"description":"Lunch","date":"2025-01-15T10:00:00.000Z"},
  {"id":"2","type":"income","amount":2000,"description":"Salary","date":"2025-01-01T08:00:00.000Z"},
  {"id":"3","type":"expense","amount":30,"description":"Coffee","date":"2024-12-20T09:00:00.000Z"}
]
EOF
npx wrangler kv key put --binding=PERSONALFIN "user_planTestUser" --path /tmp/legacy-tx.json --local
```

Expected: `Writing the value to the store...` success message, no errors.

- [ ] **Step 4: Trigger migration by calling an existing endpoint**

```bash
curl "http://localhost:8787/api/transactions?userId=planTestUser"
```

Expected right now (before Task 3 rewires this route): the route still reads the old `user_{userId}` key directly, so this call does **not** yet trigger `ensureMigrated` — that's expected, `ensureMigrated` isn't wired into any route yet. This step is just confirming the dev server and seed data are in place; skip straight to Step 5.

- [ ] **Step 5: Verify the helpers work via a temporary debug route**

Since no route calls `ensureMigrated` yet, temporarily add a throwaway debug line to confirm the function behaves correctly. Open `src/index.js` and temporarily change the `/api/transactions` GET handler (around line 89) by adding one line at the top of its `try` block:

```js
    if (url.pathname === '/api/transactions' && request.method === 'GET') {
      const userId = url.searchParams.get('userId') || 'guest_user';
      try {
        await ensureMigrated(kv, userId); // TEMP: remove after verifying in this step
        const raw = await kv.get(`user_${userId}`);
        return Response.json(raw ? JSON.parse(raw) : [], { headers: corsHeaders });
```

Restart `npm run dev` (Ctrl+C, rerun), then:

```bash
curl "http://localhost:8787/api/transactions?userId=planTestUser"
npx wrangler kv key get --binding=PERSONALFIN "user_index_planTestUser" --local
npx wrangler kv key get --binding=PERSONALFIN "user_planTestUser_1403-10" --local
npx wrangler kv key get --binding=PERSONALFIN "user_planTestUser_1404-10" --local
npx wrangler kv key get --binding=PERSONALFIN "user_planTestUser" --local
```

Expected:
- `user_index_planTestUser` → a JSON array with two month keys (the Persian months for 2025-01-15/2025-01-01 and 2024-12-20).
- The two monthly keys each contain the correct subset of the 3 seeded records, with all fields intact.
- `user_planTestUser` (legacy key) → not found / empty (it was deleted after successful migration).
- Run the same `curl` again → no errors, and `user_index_planTestUser` is unchanged (idempotency).

- [ ] **Step 6: Revert the temporary debug line**

Remove the `await ensureMigrated(kv, userId); // TEMP...` line added in Step 5 — Task 3 will wire this route properly with its full intended behavior. Confirm with a diff that `/api/transactions` is back to its original form from before this task.

```bash
git diff src/index.js
```

Expected: the diff shows only the new helper functions added in Step 1 (nothing inside any route handler yet).

- [ ] **Step 7: Commit**

```bash
git add src/index.js
git commit -m "Add Persian month-key helpers and idempotent transaction migration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Migrate `/api/add` and `/api/shortcut` to monthly keys

**Files:**
- Modify: `src/index.js:24-71` (`/api/shortcut`)
- Modify: `src/index.js:99-120` (`/api/add`)

**Interfaces:**
- Consumes: `ensureMigrated(kv, userId)`, `monthKeyOf(date)`, `addMonthToIndex(kv, userId, monthKey)` from Task 1.

- [ ] **Step 1: Update `/api/add`**

Replace the body of the `/api/add` handler (`src/index.js:99-120`):

```js
    if (url.pathname === '/api/add' && request.method === 'POST') {
      try {
        const { userId, type, amount, description } = await request.json();
        const targetUser = userId || 'guest_user';
        await ensureMigrated(kv, targetUser);
        const numAmount = parseFloat(String(amount).replace(/,/g, '')) || 0;
        const newRecord = {
          id: Date.now().toString(),
          type: type || 'expense',
          amount: Math.abs(numAmount),
          description: (description || 'General').trim(),
          date: new Date().toISOString()
        };
        const monthKey = monthKeyOf(new Date(newRecord.date));
        const raw = await kv.get(`user_${targetUser}_${monthKey}`);
        let list = raw ? JSON.parse(raw) : [];
        list.unshift(newRecord);
        await kv.put(`user_${targetUser}_${monthKey}`, JSON.stringify(list));
        await addMonthToIndex(kv, targetUser, monthKey);
        await saveUserIndex(kv, targetUser);
        return Response.json({ success: true, item: newRecord }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }
```

(`saveUserIndex` is the pre-existing, unrelated `system_all_users` index — kept as-is.)

- [ ] **Step 2: Update `/api/shortcut`**

In `src/index.js:24-71`, replace lines 48-53:

```js
      const raw = await kv.get(`user_${userId}`);
      let list = raw ? JSON.parse(raw) : [];
      list.unshift(newRecord);
      await kv.put(`user_${userId}`, JSON.stringify(list));

      await saveUserIndex(kv, userId);
```

with:

```js
      await ensureMigrated(kv, userId);
      const monthKey = monthKeyOf(new Date(newRecord.date));
      const raw = await kv.get(`user_${userId}_${monthKey}`);
      let list = raw ? JSON.parse(raw) : [];
      list.unshift(newRecord);
      await kv.put(`user_${userId}_${monthKey}`, JSON.stringify(list));
      await addMonthToIndex(kv, userId, monthKey);

      await saveUserIndex(kv, userId);
```

- [ ] **Step 3: Restart dev server and test `/api/add`**

```bash
npm run dev
```

In another terminal:

```bash
curl -X POST http://localhost:8787/api/add -H "Content-Type: application/json" -d '{"userId":"planTestUser2","type":"expense","amount":75,"description":"Groceries"}'
npx wrangler kv key get --binding=PERSONALFIN "user_index_planTestUser2" --local
```

Expected: JSON response `{"success":true,"item":{...}}`; the index key contains exactly one month key (this month). Then find that month key with:

```bash
npx wrangler kv key list --binding=PERSONALFIN --local --prefix "user_planTestUser2_"
```

Expected: one key, containing an array with the "Groceries" record.

- [ ] **Step 4: Test `/api/shortcut`**

```bash
curl "http://localhost:8787/api/shortcut?userId=planTestUser2&amount=20&desc=Coffee&type=expense"
```

Expected: JSON `{"success":true,...}` (the Telegram send call inside will fail/no-op silently without a real bot token in `.dev.vars` — that's fine, it's wrapped and doesn't block the response... if it throws and blocks the response, that's pre-existing behavior unrelated to this change; if the curl errors out entirely, verify `.dev.vars` exists per README step 1, copy `.dev.vars.example` to `.dev.vars` if missing). Confirm the new record landed in the same month key as Step 3 (now 2 records: Groceries, Coffee):

```bash
npx wrangler kv key get --binding=PERSONALFIN "user_planTestUser2_<month-key-from-step-3>" --local
```

- [ ] **Step 5: Commit**

```bash
git add src/index.js
git commit -m "Route /api/add and /api/shortcut through monthly transaction keys

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Migrate `/api/transactions`, `/api/update`, `/api/delete`

**Files:**
- Modify: `src/index.js:88-134`

**Interfaces:**
- Consumes: `ensureMigrated`, `monthKeyOf` from Task 1.
- Produces: `GET /api/transactions` now defaults to current month; accepts `?month=YYYY-MM` for a specific month.
- Produces: `POST /api/update` and `POST /api/delete` now require a `month` field (`YYYY-MM`) in the JSON body, in addition to `id`/`userId`.

- [ ] **Step 1: Replace the three handlers**

Replace `src/index.js:88-134` (the `/api/transactions`, `/api/add`... — note `/api/add` was already edited in Task 2, so replace only the `/api/transactions`, `/api/delete`, `/api/update` blocks; keep the Task-2 version of `/api/add` between them untouched) — specifically replace:

```js
    if (url.pathname === '/api/transactions' && request.method === 'GET') {
      const userId = url.searchParams.get('userId') || 'guest_user';
      try {
        const raw = await kv.get(`user_${userId}`);
        return Response.json(raw ? JSON.parse(raw) : [], { headers: corsHeaders });
      } catch (err) {
        return Response.json([], { headers: corsHeaders });
      }
    }
```

with:

```js
    if (url.pathname === '/api/transactions' && request.method === 'GET') {
      const userId = url.searchParams.get('userId') || 'guest_user';
      try {
        await ensureMigrated(kv, userId);
        const requestedMonth = url.searchParams.get('month');
        const monthKey = requestedMonth || monthKeyOf(new Date());
        const raw = await kv.get(`user_${userId}_${monthKey}`);
        return Response.json(raw ? JSON.parse(raw) : [], { headers: corsHeaders });
      } catch (err) {
        return Response.json([], { headers: corsHeaders });
      }
    }
```

and replace:

```js
    if (url.pathname === '/api/delete' && request.method === 'POST') {
      try {
        const { id, userId } = await request.json();
        const raw = await kv.get(`user_${userId}`);
        let list = raw ? JSON.parse(raw) : [];
        list = list.filter(item => item.id !== id);
        await kv.put(`user_${userId}`, JSON.stringify(list));
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/update' && request.method === 'POST') {
      try {
        const { id, amount, description, type, userId } = await request.json();
        const raw = await kv.get(`user_${userId}`);
        let list = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex(item => item.id === id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], amount: Math.abs(parseFloat(amount) || 0), description, type };
          await kv.put(`user_${userId}`, JSON.stringify(list));
        }
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }
```

with:

```js
    if (url.pathname === '/api/delete' && request.method === 'POST') {
      try {
        const { id, userId, month } = await request.json();
        await ensureMigrated(kv, userId);
        const monthKey = month || monthKeyOf(new Date());
        const raw = await kv.get(`user_${userId}_${monthKey}`);
        let list = raw ? JSON.parse(raw) : [];
        list = list.filter(item => item.id !== id);
        await kv.put(`user_${userId}_${monthKey}`, JSON.stringify(list));
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === '/api/update' && request.method === 'POST') {
      try {
        const { id, amount, description, type, userId, month } = await request.json();
        await ensureMigrated(kv, userId);
        const monthKey = month || monthKeyOf(new Date());
        const raw = await kv.get(`user_${userId}_${monthKey}`);
        let list = raw ? JSON.parse(raw) : [];
        const idx = list.findIndex(item => item.id === id);
        if (idx !== -1) {
          list[idx] = { ...list[idx], amount: Math.abs(parseFloat(amount) || 0), description, type };
          await kv.put(`user_${userId}_${monthKey}`, JSON.stringify(list));
        }
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }
```

- [ ] **Step 2: Restart dev server and test the current-month default**

```bash
curl "http://localhost:8787/api/transactions?userId=planTestUser2"
```

Expected: JSON array with the 2 records added in Task 2 (Groceries, Coffee) — both in the current month.

- [ ] **Step 3: Test the `?month=` override against migrated historical data**

```bash
curl "http://localhost:8787/api/transactions?userId=planTestUser&month=1403-10"
```

(use whichever of the two month keys Task 1 Step 5 produced for `planTestUser`)

Expected: JSON array with the correct historical record(s) for that month, unchanged from the original seed data.

- [ ] **Step 4: Test update and delete with the new `month` field**

```bash
curl "http://localhost:8787/api/transactions?userId=planTestUser2" # note an id from the response, e.g. "1735..."
curl -X POST http://localhost:8787/api/update -H "Content-Type: application/json" -d '{"id":"<id-from-above>","userId":"planTestUser2","month":"<current-month-key>","amount":99,"description":"Groceries (edited)","type":"expense"}'
curl "http://localhost:8787/api/transactions?userId=planTestUser2"
```

Expected: the record's amount/description updated in the response.

```bash
curl -X POST http://localhost:8787/api/delete -H "Content-Type: application/json" -d '{"id":"<id-from-above>","userId":"planTestUser2","month":"<current-month-key>"}'
curl "http://localhost:8787/api/transactions?userId=planTestUser2"
```

Expected: that record no longer appears; the other record is untouched.

- [ ] **Step 5: Commit**

```bash
git add src/index.js
git commit -m "Scope /api/transactions to current month by default; add month to update/delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Migrate `computeSummary` to sum across the month index

**Files:**
- Modify: `src/index.js:605-653` (`computeSummary`)

**Interfaces:**
- Consumes: `ensureMigrated`, from Task 1.
- Produces: `computeSummary(kv, userId)` return shape is unchanged (still `{ income, expense, balance, pendingTotal, projectedBalance, pendingList, paidList, currentCycle, currentMonthLabel, now }`) — only the internal data source changes. Used by `GET /api/summary` and the Telegram `/report` command.

- [ ] **Step 1: Replace the all-time totals section**

Replace `src/index.js:605-618`:

```js
// موجودی فعلی + اقساط باقیمانده‌ی این ماه + موجودی پیش‌بینی‌شده پس از پرداخت آن‌ها
async function computeSummary(kv, userId) {
  const rawTx = await kv.get(`user_${userId}`);
  const rawInst = await kv.get(`installments_${userId}`);
  const records = rawTx ? JSON.parse(rawTx) : [];
  const installments = rawInst ? JSON.parse(rawInst) : [];

  let income = 0, expense = 0;
  for (const r of records) {
    const amt = Number(r.amount) || 0;
    if (r.type === 'income') income += amt;
    else if (r.type === 'expense') expense += amt;
  }
  const balance = income - expense;
```

with:

```js
// موجودی فعلی (جمع تمام تاریخچه‌ی کاربر از روی ایندکس ماهانه) + اقساط باقیمانده‌ی این ماه
// + موجودی پیش‌بینی‌شده پس از پرداخت آن‌ها
async function computeSummary(kv, userId) {
  await ensureMigrated(kv, userId);
  const rawIndex = await kv.get(`user_index_${userId}`);
  const monthKeys = rawIndex ? JSON.parse(rawIndex) : [];
  const rawInst = await kv.get(`installments_${userId}`);
  const installments = rawInst ? JSON.parse(rawInst) : [];

  let income = 0, expense = 0;
  const monthlyRaws = await Promise.all(monthKeys.map(mKey => kv.get(`user_${userId}_${mKey}`)));
  for (const raw of monthlyRaws) {
    const monthRecords = raw ? JSON.parse(raw) : [];
    for (const r of monthRecords) {
      const amt = Number(r.amount) || 0;
      if (r.type === 'income') income += amt;
      else if (r.type === 'expense') expense += amt;
    }
  }
  const balance = income - expense;
```

The rest of the function (installment pending/paid loop, `projectedBalance`, return statement) is unchanged.

- [ ] **Step 2: Restart dev server and test `/api/summary`**

```bash
curl "http://localhost:8787/api/summary?userId=planTestUser"
```

Expected: `income`/`expense`/`balance` reflect the sum across **both** migrated historical months for `planTestUser` (2000 income, 80 expense → balance 1920), not just one month.

- [ ] **Step 3: Add a transaction and confirm the sum updates**

```bash
curl -X POST http://localhost:8787/api/add -H "Content-Type: application/json" -d '{"userId":"planTestUser","type":"income","amount":100,"description":"Bonus"}'
curl "http://localhost:8787/api/summary?userId=planTestUser"
```

Expected: `income` increased by 100 (now spans 3 months for this user).

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "Sum computeSummary across all months in the user's month index

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Migrate installment payment and the Telegram NL logger

**Files:**
- Modify: `src/index.js:246-277` (`/api/installments/pay`)
- Modify: `src/index.js:352-366` (Telegram natural-language transaction logger)

**Interfaces:**
- Consumes: `ensureMigrated`, `monthKeyOf`, `addMonthToIndex` from Task 1.

- [ ] **Step 1: Update `/api/installments/pay`**

In `src/index.js:246-277`, replace lines 266-269:

```js
        const rawTx = await kv.get(`user_${userId}`);
        let txList = rawTx ? JSON.parse(rawTx) : [];
        txList.unshift(txRecord);
        await kv.put(`user_${userId}`, JSON.stringify(txList));
```

with:

```js
        await ensureMigrated(kv, userId);
        const txMonthKey = monthKeyOf(new Date(txRecord.date));
        const rawTx = await kv.get(`user_${userId}_${txMonthKey}`);
        let txList = rawTx ? JSON.parse(rawTx) : [];
        txList.unshift(txRecord);
        await kv.put(`user_${userId}_${txMonthKey}`, JSON.stringify(txList));
        await addMonthToIndex(kv, userId, txMonthKey);
```

- [ ] **Step 2: Update the Telegram NL logger**

In `src/index.js:352-366`, replace lines 362-365:

```js
          const raw = await kv.get(`user_${userId}`);
          let userTransactions = raw ? JSON.parse(raw) : [];
          userTransactions.unshift(newRecord);
          await kv.put(`user_${userId}`, JSON.stringify(userTransactions));
```

with:

```js
          await ensureMigrated(kv, userId);
          const txMonthKey = monthKeyOf(new Date(newRecord.date));
          const raw = await kv.get(`user_${userId}_${txMonthKey}`);
          let userTransactions = raw ? JSON.parse(raw) : [];
          userTransactions.unshift(newRecord);
          await kv.put(`user_${userId}_${txMonthKey}`, JSON.stringify(userTransactions));
          await addMonthToIndex(kv, userId, txMonthKey);
```

- [ ] **Step 3: Restart dev server and test installment payment**

First seed an installment so there's something to pay:

```bash
curl -X POST http://localhost:8787/api/installments/add -H "Content-Type: application/json" -d '{"userId":"planTestUser3","title":"Rent","amount":500,"dueDay":10,"recurrenceType":"monthly"}'
curl "http://localhost:8787/api/installments?userId=planTestUser3"
```

Note the returned installment's `id`, then:

```bash
curl -X POST http://localhost:8787/api/installments/pay -H "Content-Type: application/json" -d '{"id":"<id-from-above>","userId":"planTestUser3"}'
curl "http://localhost:8787/api/transactions?userId=planTestUser3"
```

Expected: the pay call succeeds, and the resulting expense transaction ("پرداخت قسط: Rent") appears in `/api/transactions` for the current month.

- [ ] **Step 4: Test the Telegram NL logger path**

This route only runs from a Telegram webhook POST, which is harder to hit directly via curl without a real update payload. Instead, verify by code review: re-read `src/index.js` around the edited lines and confirm the pattern matches Step 1/2 (`ensureMigrated` → `monthKeyOf` → get/set on the monthly key → `addMonthToIndex`) exactly, with no leftover reference to `user_${userId}` (without a month suffix) in either edited block.

```bash
grep -n "kv.get(\`user_\${userId}\`)\|kv.put(\`user_\${userId}\`" src/index.js
```

Expected: no matches remain anywhere in the file (every direct legacy-key read/write has been migrated across Tasks 2, 3, 4, 5).

- [ ] **Step 5: Commit**

```bash
git add src/index.js
git commit -m "Route installment payments and Telegram NL logging through monthly keys

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Frontend — send `month` on edit/delete, fix cross-month streak calculation

**Files:**
- Modify: `src/index.js:1422-1446` (`loadDashboardData`)
- Modify: `src/index.js:1634-1653` (`computeStreak`)
- Modify: `src/index.js:1828-1864` (`saveEntry`, `deleteItem`)

**Interfaces:**
- Consumes: `/api/transactions?month=` (Task 3), `POST /api/update`/`POST /api/delete` now expecting `month` (Task 3).
- Produces: new frontend global `previousMonthRecords` (array), populated by `loadDashboardData`, consumed by `computeStreak`.

**Why the streak fix is needed:** `/api/transactions` (no `month` param) now returns only the current month. `computeStreak()` (badges: 3/7/30-day streaks) needs to see transaction days that can span back across a month boundary — e.g. on the 2nd of a new month, a 10-day streak includes 9 days from last month. Fetching last month's days too (in parallel, already a cheap single extra KV read) keeps the streak/badges feature working exactly as before, without pulling last month's transactions into the visible list.

- [ ] **Step 1: Add `previousMonthRecords` global and fetch it in `loadDashboardData`**

In `src/index.js`, find the globals block (around line 1244) and add one line after `let records = [];`:

```js
    let records = [];
    let previousMonthRecords = [];
```

Then replace `loadDashboardData` (`src/index.js:1422-1446`):

```js
    async function loadDashboardData() {
      showSkeleton('items-container', 3);
      try {
        const results = await Promise.all([
          fetch(BASE_URL + '/api/transactions?userId=' + currentUserId),
          fetch(BASE_URL + '/api/summary?userId=' + currentUserId),
          fetch(BASE_URL + '/api/budgets?userId=' + currentUserId),
          fetch(BASE_URL + '/api/installments?userId=' + currentUserId)
        ]);
        records = await results[0].json();
        if (!Array.isArray(records)) records = [];
        summary = await results[1].json();
        const budgetData = await results[2].json();
        budgetLimits = (budgetData && budgetData.limits) || {};
        const instData = await results[3].json();
        installments = Array.isArray(instData) ? instData : [];
        renderDashboard();
      } catch (err) {
        document.getElementById('items-container').innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'text-center text-rose-400 py-6 text-xs';
        errDiv.textContent = t('loadErrDash');
        document.getElementById('items-container').appendChild(errDiv);
      }
    }
```

with:

```js
    async function loadDashboardData() {
      showSkeleton('items-container', 3);
      try {
        const prevMonthKey = persianMonthKeyOfShifted(-1);
        const results = await Promise.all([
          fetch(BASE_URL + '/api/transactions?userId=' + currentUserId),
          fetch(BASE_URL + '/api/summary?userId=' + currentUserId),
          fetch(BASE_URL + '/api/budgets?userId=' + currentUserId),
          fetch(BASE_URL + '/api/installments?userId=' + currentUserId),
          fetch(BASE_URL + '/api/transactions?userId=' + currentUserId + '&month=' + prevMonthKey)
        ]);
        records = await results[0].json();
        if (!Array.isArray(records)) records = [];
        summary = await results[1].json();
        const budgetData = await results[2].json();
        budgetLimits = (budgetData && budgetData.limits) || {};
        const instData = await results[3].json();
        installments = Array.isArray(instData) ? instData : [];
        previousMonthRecords = await results[4].json();
        if (!Array.isArray(previousMonthRecords)) previousMonthRecords = [];
        renderDashboard();
      } catch (err) {
        document.getElementById('items-container').innerHTML = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'text-center text-rose-400 py-6 text-xs';
        errDiv.textContent = t('loadErrDash');
        document.getElementById('items-container').appendChild(errDiv);
      }
    }
```

- [ ] **Step 2: Add the `persianMonthKeyOfShifted` helper**

Right after the existing `persianMonthKeyOf` function (`src/index.js:1524-1529`), add:

```js
    // کلید ماه شمسی N ماه قبل/بعد از امروز (delta منفی = گذشته)، فرمت "YYYY-MM" هم‌راستا با کلیدهای بک‌اند
    // (این تابع منطق shiftMonthKey سمت بک‌اند را برای فرانت‌اند تکرار می‌کند - قالب فرانت‌اند
    // نمی‌تواند توابع بک‌اند را صدا بزند، چون در محیط اجرایی جدایی (مرورگر) اجرا می‌شود)
    function persianMonthKeyOfShifted(delta) {
      const todayParts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric' }).formatToParts(new Date());
      const map = {};
      todayParts.forEach(function(p) { if (p.type === 'year' || p.type === 'month') map[p.type] = parseInt(p.value, 10); });
      let y = map.year, m = map.month + delta;
      while (m > 12) { m -= 12; y += 1; }
      while (m < 1) { m += 12; y -= 1; }
      return y + '-' + String(m).padStart(2, '0');
    }
```

- [ ] **Step 3: Update `computeStreak` to include `previousMonthRecords`**

Replace `src/index.js:1634-1653`:

```js
    function computeStreak() {
      const days = new Set();
      records.forEach(function(r) {
        days.add(new Date(r.date).toLocaleDateString('en-US-u-ca-persian'));
      });
```

with:

```js
    function computeStreak() {
      const days = new Set();
      records.concat(previousMonthRecords).forEach(function(r) {
        days.add(new Date(r.date).toLocaleDateString('en-US-u-ca-persian'));
      });
```

(the rest of the function is unchanged)

- [ ] **Step 4: Send `month` from `saveEntry` (update) and `deleteItem` (delete)**

Replace `src/index.js:1828-1854` (`saveEntry`):

```js
    async function saveEntry() {
      const id = document.getElementById('entry-id').value;
      const descRaw = document.getElementById('entry-desc').value;
      const amount = document.getElementById('entry-amount').value;
      const type = document.getElementById('entry-type').value;
      const categoryId = document.getElementById('entry-category').value;
      const description = buildDescriptionWithCategory(descRaw, categoryId);

      if (!amount) { alert(t('alertAmount')); return; }

      if (id) {
        await fetch(BASE_URL + '/api/update', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ id: id, userId: currentUserId, description: description, amount: amount, type: type })
        });
      } else {
        await fetch(BASE_URL + '/api/add', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ userId: currentUserId, description: description, amount: amount, type: type })
        });
      }

      closeModal('entryModal');
      loadDashboardData();
    }
```

with:

```js
    async function saveEntry() {
      const id = document.getElementById('entry-id').value;
      const descRaw = document.getElementById('entry-desc').value;
      const amount = document.getElementById('entry-amount').value;
      const type = document.getElementById('entry-type').value;
      const categoryId = document.getElementById('entry-category').value;
      const description = buildDescriptionWithCategory(descRaw, categoryId);

      if (!amount) { alert(t('alertAmount')); return; }

      if (id) {
        const existing = records.find(function(r) { return r.id === id; });
        const monthKey = existing ? persianMonthKeyOf(existing.date) : persianMonthKeyOf(new Date());
        await fetch(BASE_URL + '/api/update', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ id: id, userId: currentUserId, month: monthKey, description: description, amount: amount, type: type })
        });
      } else {
        await fetch(BASE_URL + '/api/add', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ userId: currentUserId, description: description, amount: amount, type: type })
        });
      }

      closeModal('entryModal');
      loadDashboardData();
    }
```

Note: `persianMonthKeyOf` (`src/index.js:1524-1529`) currently returns `"YYYY-M"` (no zero-pad on month, since it reads the Intl part value directly) while the backend's `monthKeyOf`/`cycleKey` produces `"YYYY-MM"` (zero-padded, via `String(p.month).padStart(2, '0')`). These must match exactly for the backend's `user_${userId}_${month}` key lookup to hit the right KV key. Fix `persianMonthKeyOf` to zero-pad — replace `src/index.js:1524-1529`:

```js
    function persianMonthKeyOf(dateInput) {
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric' }).formatToParts(new Date(dateInput));
      const map = {};
      parts.forEach(function(p) { if (p.type === 'year' || p.type === 'month') map[p.type] = p.value; });
      return map.year + '-' + map.month;
    }
```

with:

```js
    function persianMonthKeyOf(dateInput) {
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric' }).formatToParts(new Date(dateInput));
      const map = {};
      parts.forEach(function(p) { if (p.type === 'year' || p.type === 'month') map[p.type] = p.value; });
      return map.year + '-' + String(map.month).padStart(2, '0');
    }
```

Now replace `deleteItem` (`src/index.js:1856-1864`):

```js
    async function deleteItem(id) {
      if (!confirm(t('confirmDeleteTx'))) return;
      await fetch(BASE_URL + '/api/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: id, userId: currentUserId })
      });
      loadDashboardData();
    }
```

with:

```js
    async function deleteItem(id) {
      if (!confirm(t('confirmDeleteTx'))) return;
      const existing = records.find(function(r) { return r.id === id; });
      const monthKey = existing ? persianMonthKeyOf(existing.date) : persianMonthKeyOf(new Date());
      await fetch(BASE_URL + '/api/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: id, userId: currentUserId, month: monthKey })
      });
      loadDashboardData();
    }
```

- [ ] **Step 5: Manual browser test**

```bash
npm run dev
```

Open `http://localhost:8787/app?uid=planTestUser2` in a browser. Confirm:
- The dashboard loads without console errors (check devtools console).
- The transaction list shows this month's transactions.
- Add a new transaction via the "+" button → it appears in the list immediately after.
- Edit that transaction (change amount/description) → the change persists after a page reload.
- Delete it → it disappears and stays gone after reload.
- The streak counter at the top still shows a sensible number (not reset to 0 incorrectly).

- [ ] **Step 6: Commit**

```bash
git add src/index.js
git commit -m "Frontend: send month on edit/delete, fix streak across month boundary

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Backend — `/api/reports` endpoint

**Files:**
- Modify: `src/index.js` (add new route near the other `/api/*` GET routes, e.g. right after the `/api/summary` block — search for `url.pathname === '/api/summary'` to locate it)
- Modify: `src/index.js` (add `bucketDaily` helper near `computeSummary`)

**Interfaces:**
- Consumes: `ensureMigrated`, `monthKeyOf`, `shiftMonthKey`, `daysInPersianMonth`, `toPersianDate`, `cycleKey`, `PERSIAN_MONTHS` from existing code / Task 1.
- Produces: `GET /api/reports?userId=...` → JSON:
  ```json
  {
    "currentMonth": { "label": "شهریور", "totalDays": 15, "dailyIncome": [...], "dailyExpense": [...], "cumulativeIncome": [...], "cumulativeExpense": [...] },
    "previousMonth": { "label": "مرداد", "totalDays": 31, "dailyIncome": [...], "dailyExpense": [...], "cumulativeIncome": [...], "cumulativeExpense": [...] },
    "forecast": { "projectedIncome": 12345, "projectedExpense": 6789, "projectedBalance": 5556 }
  }
  ```
  `currentMonth` arrays are sized to today's day-of-month (so far this month); `previousMonth` arrays are sized to that month's full day count.

- [ ] **Step 1: Add the `bucketDaily` helper**

Add this function right before `computeSummary` (near `src/index.js:605`):

```js
// گروه‌بندی روزانه‌ی یک لیست تراکنش بر اساس روز-از-ماه، به همراه سری تجمعی
// totalDays طول آرایه‌های خروجی را تعیین می‌کند (برای ماه جاری: تا امروز، برای ماه قبل: کل ماه)
function bucketDaily(records, totalDays) {
  const dailyIncome = new Array(totalDays).fill(0);
  const dailyExpense = new Array(totalDays).fill(0);
  for (const r of records) {
    const day = toPersianDate(new Date(r.date)).day;
    const idx = day - 1;
    if (idx < 0 || idx >= totalDays) continue;
    const amt = Number(r.amount) || 0;
    if (r.type === 'income') dailyIncome[idx] += amt;
    else if (r.type === 'expense') dailyExpense[idx] += amt;
  }
  const cumulativeIncome = [];
  const cumulativeExpense = [];
  let ci = 0, ce = 0;
  for (let i = 0; i < totalDays; i++) {
    ci += dailyIncome[i];
    ce += dailyExpense[i];
    cumulativeIncome.push(ci);
    cumulativeExpense.push(ce);
  }
  return { dailyIncome, dailyExpense, cumulativeIncome, cumulativeExpense };
}
```

- [ ] **Step 2: Add the `/api/reports` route**

Find the `/api/summary` GET route (search for `url.pathname === '/api/summary'`) and add this new block immediately after its closing `}`:

```js
    if (url.pathname === '/api/reports' && request.method === 'GET') {
      const userId = url.searchParams.get('userId') || 'guest_user';
      try {
        await ensureMigrated(kv, userId);
        const now = new Date();
        const nowP = toPersianDate(now);
        const currentKey = cycleKey(nowP);
        const prevKey = shiftMonthKey(currentKey, -1);

        const [currentRaw, prevRaw] = await Promise.all([
          kv.get(`user_${userId}_${currentKey}`),
          kv.get(`user_${userId}_${prevKey}`)
        ]);
        const currentRecords = currentRaw ? JSON.parse(currentRaw) : [];
        const prevRecords = prevRaw ? JSON.parse(prevRaw) : [];

        const daysElapsed = nowP.day;
        const totalDaysCurrent = daysInPersianMonth(now);
        const prevMonthProbeDate = new Date(now.getTime() - daysElapsed * 86400000);
        const totalDaysPrev = daysInPersianMonth(prevMonthProbeDate);
        const prevMonthLabel = PERSIAN_MONTHS[toPersianDate(prevMonthProbeDate).month - 1];

        const currentBuckets = bucketDaily(currentRecords, daysElapsed);
        const prevBuckets = bucketDaily(prevRecords, totalDaysPrev);

        const incomeSoFar = daysElapsed > 0 ? currentBuckets.cumulativeIncome[daysElapsed - 1] : 0;
        const expenseSoFar = daysElapsed > 0 ? currentBuckets.cumulativeExpense[daysElapsed - 1] : 0;
        const projectedIncome = daysElapsed > 0 ? (incomeSoFar / daysElapsed) * totalDaysCurrent : 0;
        const projectedExpense = daysElapsed > 0 ? (expenseSoFar / daysElapsed) * totalDaysCurrent : 0;

        return Response.json({
          currentMonth: {
            label: PERSIAN_MONTHS[nowP.month - 1],
            totalDays: totalDaysCurrent,
            dailyIncome: currentBuckets.dailyIncome,
            dailyExpense: currentBuckets.dailyExpense,
            cumulativeIncome: currentBuckets.cumulativeIncome,
            cumulativeExpense: currentBuckets.cumulativeExpense
          },
          previousMonth: {
            label: prevMonthLabel,
            totalDays: totalDaysPrev,
            dailyIncome: prevBuckets.dailyIncome,
            dailyExpense: prevBuckets.dailyExpense,
            cumulativeIncome: prevBuckets.cumulativeIncome,
            cumulativeExpense: prevBuckets.cumulativeExpense
          },
          forecast: {
            projectedIncome: Math.round(projectedIncome),
            projectedExpense: Math.round(projectedExpense),
            projectedBalance: Math.round(projectedIncome - projectedExpense)
          }
        }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }
```

- [ ] **Step 3: Restart dev server and test**

```bash
curl "http://localhost:8787/api/reports?userId=planTestUser2" | python3 -m json.tool
```

(if `python3` isn't available, drop the pipe and eyeball the raw JSON)

Expected:
- `currentMonth.totalDays` equals today's Persian day-of-month.
- `currentMonth.cumulativeIncome`/`cumulativeExpense` last element equals the totals from `/api/summary` restricted to this month's transactions (sanity-check against `curl "http://localhost:8787/api/transactions?userId=planTestUser2"`).
- `previousMonth.totalDays` is 29, 30, or 31.
- `forecast.projectedExpense` ≈ `(expense so far / days elapsed) * totalDaysCurrent` — verify by hand with a calculator against the numbers in the response.
- No user with zero transactions in either month → arrays of zeros, no errors (test with a fresh `userId=reportsEmptyUser`).

- [ ] **Step 4: Commit**

```bash
git add src/index.js
git commit -m "Add /api/reports endpoint: daily/cumulative series + end-of-month forecast

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Frontend — Reports tab shell (nav, view container, i18n)

**Files:**
- Modify: `src/index.js:831-835` (bottom nav)
- Modify: `src/index.js:956` area (add new tab view container before `tab-about-view` or after it)
- Modify: `src/index.js:1381-1382` (`TAB_NAV_IDS`, `TAB_VIEW_IDS`)
- Modify: `src/index.js:1397-1399` (`switchMainTab`, top-add-button visibility)
- Modify: `src/index.js:1118-1220`-ish (`I18N` dictionaries, both `fa` and `en`)

**Interfaces:**
- Produces: a 4th nav button `nav-reports` and view container `tab-reports-view`, wired into the existing `switchMainTab` tab system.
- Produces: new i18n keys: `navReports`, `reportsTitle`, `reportsChartLegendIncome`, `reportsChartLegendExpense`, `reportsChartLegendIncomePrev`, `reportsChartLegendExpensePrev`, `reportsForecastTitle`, `reportsForecastIncome`, `reportsForecastExpense`, `reportsForecastBalance`, `reportsVsLastMonth`, `reportsNoDataYet`.

- [ ] **Step 1: Update the bottom nav grid to 4 columns**

Replace `src/index.js:831-835`:

```html
    <div class="grid grid-cols-3 app-surface-nav p-1 rounded-2xl border app-border-1 text-xs font-bold">
      <button onclick="switchMainTab('dashboard')" id="nav-dash" class="tap py-2.5 rounded-xl bg-indigo-600 text-white transition shadow-lg">📊 <span data-i18n="navDashboard">داشبورد</span></button>
      <button onclick="switchMainTab('installments')" id="nav-inst" class="tap py-2.5 rounded-xl app-text-4 transition">🗓 <span data-i18n="navInstallments">اقساط</span></button>
      <button onclick="switchMainTab('about')" id="nav-about" class="tap py-2.5 rounded-xl app-text-4 transition">✨ <span data-i18n="navAbout">درباره</span></button>
    </div>
```

with:

```html
    <div class="grid grid-cols-4 app-surface-nav p-1 rounded-2xl border app-border-1 text-xs font-bold">
      <button onclick="switchMainTab('dashboard')" id="nav-dash" class="tap py-2.5 rounded-xl bg-indigo-600 text-white transition shadow-lg">📊 <span data-i18n="navDashboard">داشبورد</span></button>
      <button onclick="switchMainTab('installments')" id="nav-inst" class="tap py-2.5 rounded-xl app-text-4 transition">🗓 <span data-i18n="navInstallments">اقساط</span></button>
      <button onclick="switchMainTab('reports')" id="nav-reports" class="tap py-2.5 rounded-xl app-text-4 transition">📈 <span data-i18n="navReports">گزارشات</span></button>
      <button onclick="switchMainTab('about')" id="nav-about" class="tap py-2.5 rounded-xl app-text-4 transition">✨ <span data-i18n="navAbout">درباره</span></button>
    </div>
```

- [ ] **Step 2: Add the Reports tab view container**

Find `<div id="tab-about-view" class="space-y-4 hidden">` (`src/index.js:956`) and insert a new view container immediately **before** it:

```html
    <div id="tab-reports-view" class="space-y-4 hidden">
      <div class="card-glass p-5 rounded-3xl fade-in">
        <div class="text-xs font-bold app-text-4 uppercase tracking-wider mb-3" data-i18n="reportsTitle">روند درآمد و هزینه</div>
        <div id="reports-empty-state" class="hidden text-center text-xs app-text-4 py-8" data-i18n="reportsNoDataYet">هنوز داده‌ای برای این ماه ثبت نشده.</div>
        <div id="reports-chart-wrap" style="height: 220px;">
          <canvas id="reportsChart"></canvas>
        </div>
        <div class="flex flex-wrap gap-3 mt-3 text-[10px] app-text-4">
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#10b981"></span><span data-i18n="reportsChartLegendIncome">درآمد (این ماه)</span></span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:#f43f5e"></span><span data-i18n="reportsChartLegendExpense">هزینه (این ماه)</span></span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block opacity-50" style="background:#10b981"></span><span data-i18n="reportsChartLegendIncomePrev">درآمد (ماه قبل)</span></span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full inline-block opacity-50" style="background:#f43f5e"></span><span data-i18n="reportsChartLegendExpensePrev">هزینه (ماه قبل)</span></span>
        </div>
      </div>

      <div class="card-glass p-5 rounded-3xl fade-in">
        <div class="text-xs font-bold app-text-4 uppercase tracking-wider mb-3" data-i18n="reportsForecastTitle">پیش‌بینی ته ماه</div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <div class="text-[10px] app-text-4" data-i18n="reportsForecastIncome">درآمد</div>
            <div id="reports-forecast-income" class="text-sm font-extrabold text-emerald-400 en-font mt-1">-</div>
          </div>
          <div>
            <div class="text-[10px] app-text-4" data-i18n="reportsForecastExpense">هزینه</div>
            <div id="reports-forecast-expense" class="text-sm font-extrabold text-rose-400 en-font mt-1">-</div>
          </div>
          <div>
            <div class="text-[10px] app-text-4" data-i18n="reportsForecastBalance">موجودی</div>
            <div id="reports-forecast-balance" class="text-sm font-extrabold app-text-1 en-font mt-1">-</div>
          </div>
        </div>
        <div id="reports-vs-last-month" class="text-center text-[10px] app-text-4 mt-3"></div>
      </div>
    </div>

    <div id="tab-about-view" class="space-y-4 hidden">
```

- [ ] **Step 3: Wire the new tab into `TAB_NAV_IDS`/`TAB_VIEW_IDS` and `switchMainTab`**

Replace `src/index.js:1381-1382`:

```js
    const TAB_NAV_IDS = { dashboard: 'nav-dash', installments: 'nav-inst', about: 'nav-about' };
    const TAB_VIEW_IDS = { dashboard: 'tab-dashboard-view', installments: 'tab-installments-view', about: 'tab-about-view' };
```

with:

```js
    const TAB_NAV_IDS = { dashboard: 'nav-dash', installments: 'nav-inst', reports: 'nav-reports', about: 'nav-about' };
    const TAB_VIEW_IDS = { dashboard: 'tab-dashboard-view', installments: 'tab-installments-view', reports: 'tab-reports-view', about: 'tab-about-view' };
```

Replace `src/index.js:1397-1399`:

```js
      const addBtn = document.getElementById('top-add-btn');
      addBtn.style.visibility = (tab === 'about') ? 'hidden' : 'visible';
      if (tab === 'installments') loadInstallmentsData();
```

with:

```js
      const addBtn = document.getElementById('top-add-btn');
      addBtn.style.visibility = (tab === 'about' || tab === 'reports') ? 'hidden' : 'visible';
      if (tab === 'installments') loadInstallmentsData();
      if (tab === 'reports') loadReportsData();
```

(`loadReportsData` is defined in Task 9 — this reference will be a no-op error if the Reports tab is opened before Task 9 lands; that's expected mid-plan and gets resolved by the next task.)

- [ ] **Step 4: Add the Persian (`fa`) i18n strings**

In the `fa` block of `I18N` (starts `src/index.js:1119`), find the line `langLabel: 'زبان', navDashboard: 'داشبورد', navInstallments: 'اقساط', navAbout: 'درباره',` and replace it with:

```js
        langLabel: 'زبان', navDashboard: 'داشبورد', navInstallments: 'اقساط', navReports: 'گزارشات', navAbout: 'درباره',
        reportsTitle: 'روند درآمد و هزینه', reportsNoDataYet: 'هنوز داده‌ای برای این ماه ثبت نشده.',
        reportsChartLegendIncome: 'درآمد (این ماه)', reportsChartLegendExpense: 'هزینه (این ماه)',
        reportsChartLegendIncomePrev: 'درآمد (ماه قبل)', reportsChartLegendExpensePrev: 'هزینه (ماه قبل)',
        reportsForecastTitle: 'پیش‌بینی ته ماه', reportsForecastIncome: 'درآمد', reportsForecastExpense: 'هزینه', reportsForecastBalance: 'موجودی',
        reportsVsLastMonth: 'نسبت به ماه قبل',
```

- [ ] **Step 5: Add the English (`en`) i18n strings**

In the `en` block of `I18N` (starts `src/index.js:1171`), find the line `langLabel: 'Language', navDashboard: 'Dashboard', navInstallments: 'Installments', navAbout: 'About',` and replace it with:

```js
        langLabel: 'Language', navDashboard: 'Dashboard', navInstallments: 'Installments', navReports: 'Reports', navAbout: 'About',
        reportsTitle: 'Income & Expense Trend', reportsNoDataYet: 'No data recorded yet for this month.',
        reportsChartLegendIncome: 'Income (this month)', reportsChartLegendExpense: 'Expense (this month)',
        reportsChartLegendIncomePrev: 'Income (last month)', reportsChartLegendExpensePrev: 'Expense (last month)',
        reportsForecastTitle: 'End-of-month forecast', reportsForecastIncome: 'Income', reportsForecastExpense: 'Expense', reportsForecastBalance: 'Balance',
        reportsVsLastMonth: 'vs. last month',
```

- [ ] **Step 6: Restart dev server and visually verify the shell**

```bash
npm run dev
```

Open `http://localhost:8787/app?uid=planTestUser2` in a browser. Confirm:
- 4 nav buttons now show: Dashboard, Installments, Reports, About — evenly spaced.
- Clicking "گزارشات"/"Reports" switches to the new (currently empty-looking, since the chart isn't wired yet) view without hiding/breaking the other tabs.
- Devtools console shows an error like `loadReportsData is not defined` when clicking the Reports tab — expected at this point, resolved in Task 9.
- Switch language (fa/en toggle in settings) and confirm the new nav label and card titles translate correctly.

- [ ] **Step 7: Commit**

```bash
git add src/index.js
git commit -m "Add Reports tab shell: nav button, view container, i18n strings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Frontend — Reports chart, forecast card, and data loading

**Files:**
- Modify: `src/index.js` (add `loadReportsData` and `renderReportsChart` near `updateChart`, `src/index.js:1680-1696`)
- Modify: `README.md` (API reference table + features list)

**Interfaces:**
- Consumes: `GET /api/reports` (Task 7), `t(key)` i18n helper, `fmtToman`/`toman`-style formatting already used elsewhere in the file (search for `fmtToman` to match the exact existing money-formatting convention), Chart.js (`type: 'line'`), `reportsChart` canvas + `reports-forecast-*`/`reports-vs-last-month`/`reports-empty-state` elements from Task 8.
- Produces: `loadReportsData()` (called from `switchMainTab`, wired in Task 8 Step 3), `renderReportsChart(data)`.

- [ ] **Step 1: Check the existing money-formatting helper**

```bash
grep -n "function fmtToman\|function fmtUsd" src/index.js
```

Use whichever formatter the rest of the dashboard already uses for displaying amounts (there should be exactly one canonical one — read its implementation before Step 2 so the new code matches it instead of introducing a second formatting convention).

- [ ] **Step 2: Add `loadReportsData` and `renderReportsChart`**

Add these two functions right after `updateChart` (`src/index.js:1680-1696`):

```js
    let reportsChartInstance = null;

    async function loadReportsData() {
      try {
        const res = await fetch(BASE_URL + '/api/reports?userId=' + currentUserId);
        const data = await res.json();
        renderReportsChart(data);
      } catch (err) {
        document.getElementById('reports-empty-state').classList.remove('hidden');
        document.getElementById('reports-empty-state').textContent = t('loadErrDash');
      }
    }

    function renderReportsChart(data) {
      const cur = data.currentMonth;
      const prev = data.previousMonth;
      const forecast = data.forecast;

      const hasAnyData = (cur.cumulativeIncome.some(function(v) { return v > 0; })) ||
                          (cur.cumulativeExpense.some(function(v) { return v > 0; })) ||
                          (prev.cumulativeIncome.some(function(v) { return v > 0; })) ||
                          (prev.cumulativeExpense.some(function(v) { return v > 0; }));
      document.getElementById('reports-empty-state').classList.toggle('hidden', hasAnyData);
      document.getElementById('reports-empty-state').textContent = t('reportsNoDataYet');

      const labels = [];
      const maxLen = Math.max(cur.totalDays, prev.totalDays);
      for (let i = 1; i <= maxLen; i++) labels.push(String(i));

      const padToLength = function(arr, len) {
        const out = arr.slice();
        while (out.length < len) out.push(null);
        return out;
      };

      const ctx = document.getElementById('reportsChart').getContext('2d');
      if (reportsChartInstance) reportsChartInstance.destroy();
      reportsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: t('reportsChartLegendIncome'),
              data: padToLength(cur.cumulativeIncome, maxLen),
              borderColor: '#10b981',
              backgroundColor: 'transparent',
              tension: 0.3,
              pointRadius: 0
            },
            {
              label: t('reportsChartLegendExpense'),
              data: padToLength(cur.cumulativeExpense, maxLen),
              borderColor: '#f43f5e',
              backgroundColor: 'transparent',
              tension: 0.3,
              pointRadius: 0
            },
            {
              label: t('reportsChartLegendIncomePrev'),
              data: padToLength(prev.cumulativeIncome, maxLen),
              borderColor: '#10b981',
              backgroundColor: 'transparent',
              borderDash: [4, 4],
              borderWidth: 1,
              tension: 0.3,
              pointRadius: 0
            },
            {
              label: t('reportsChartLegendExpensePrev'),
              data: padToLength(prev.cumulativeExpense, maxLen),
              borderColor: '#f43f5e',
              backgroundColor: 'transparent',
              borderDash: [4, 4],
              borderWidth: 1,
              tension: 0.3,
              pointRadius: 0
            }
          ]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#9ca3af', maxTicksLimit: 8 }, grid: { display: false } },
            y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(156,163,175,0.1)' } }
          },
          interaction: { intersect: false, mode: 'index' }
        }
      });

      document.getElementById('reports-forecast-income').textContent = fmtToman(forecast.projectedIncome);
      document.getElementById('reports-forecast-expense').textContent = fmtToman(forecast.projectedExpense);
      document.getElementById('reports-forecast-balance').textContent = fmtToman(forecast.projectedBalance);

      const prevExpenseTotal = prev.cumulativeExpense.length ? prev.cumulativeExpense[prev.cumulativeExpense.length - 1] : 0;
      const vsLastMonthEl = document.getElementById('reports-vs-last-month');
      if (prevExpenseTotal > 0) {
        const pctChange = Math.round(((forecast.projectedExpense - prevExpenseTotal) / prevExpenseTotal) * 100);
        const sign = pctChange > 0 ? '+' : '';
        vsLastMonthEl.textContent = t('reportsVsLastMonth') + ': ' + sign + pctChange + '%';
      } else {
        vsLastMonthEl.textContent = '';
      }
    }
```

Replace `fmtToman(...)` calls above with whatever the actual existing formatter name/signature is from Step 1, if it differs from `fmtToman`.

- [ ] **Step 3: Restart dev server and visually verify the full Reports tab**

```bash
npm run dev
```

Open `http://localhost:8787/app?uid=planTestUser2` (a user with transactions in both the current and previous month from earlier tasks) and click the Reports tab. Confirm:
- No console errors.
- The line chart renders with 4 lines (2 solid for this month, 2 dashed for last month).
- The forecast card shows non-"-" numbers for income/expense/balance.
- The "vs last month" line shows a percentage (or is blank if last month had zero expense).
- Test with a fresh user with zero transactions this month and last month (e.g. `uid=reportsEmptyUser`) → the empty-state message shows instead of a blank/broken chart, and no console errors.
- Switch fa/en language → chart legend text and card labels translate (note: Chart.js legend itself is hidden per the config above — the custom legend row from Task 8 Step 2 is what's shown, and it already has `data-i18n` attributes).

- [ ] **Step 4: Update the README**

In `README.md`, add a bullet to the `## ✨ Features` list (after the "Instant chat report" bullet):

```markdown
- **Reports tab** — a line chart comparing this month's cumulative income/expense against the same days last month, plus a simple end-of-month forecast based on your average daily pace so far.
```

Add a row to the `## 🔌 API reference` table (after the `/api/summary` row):

```markdown
| `/api/reports` | GET | Daily/cumulative income & expense series for this month vs. last month, plus an end-of-month forecast |
```

Update the `/api/transactions` row's description to reflect the new default scope:

```markdown
| `/api/transactions` | GET | List a user's transactions for the current month (or a specific month via `?month=YYYY-MM`) |
```

- [ ] **Step 5: Commit**

```bash
git add src/index.js README.md
git commit -m "Add Reports tab chart, forecast card, and README updates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Full manual smoke test against a fresh local KV: delete any local wrangler state (`.wrangler/state` directory) to start clean, run `npm run dev`, and walk through: add a transaction → edit it → delete a different one → check the dashboard total → open Installments and pay one → open Reports and confirm the chart/forecast reflect all of the above → switch language → switch theme.
- [ ] Confirm no remaining references to the legacy single-key pattern:
  ```bash
  grep -n "kv\.get(\`user_\${" src/index.js
  grep -n "kv\.put(\`user_\${" src/index.js
  ```
  Every match should include a month-key suffix (` _${...month...} `) or be one of the intentionally-untouched keys (`installments_${userId}`, `budgets_${userId}`, `user_index_${userId}`) — none should be the bare legacy `user_${userId}` pattern.
- [ ] Re-read the spec (`docs/superpowers/specs/2026-09-02-monthly-archive-and-reports-design.md`) top to bottom and confirm every requirement has a corresponding completed task above.

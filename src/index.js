import {
  PERSIAN_MONTHS, CATEGORY_IDS, INSTALLMENT_TX_PREFIX, KEYS,
  newId, escapeHtml, isValidUserId, isValidMonthKey, convertPersianDigits, parseAmount, normalizeType, cleanText,
  toPersianDate, getPersianFormattedDate, cycleKey, monthKeyOf, shiftMonthKey, parseMonthKey, daysInPersianMonth, effectiveDueDay,
  parseTransaction, parseCategory, normalizeSettings, fmtMoney,
  getJSON, readMonth, writeMonth, readInstallments, writeInstallments, readSettings, listKeys, ensureMigrated, appendTransaction,
  sumRecords, bucketDaily, computeStreak, enrichInstallments, buildSummary, buildSummaryMessage,
  sendTelegramMessage, sendTelegramDocument, verifyInitData, shortcutToken, timingSafeEqual, transactionsToCsv
} from './lib.js';
import { renderFullMiniApp } from './miniapp.js';

const DAY_MS = 86400000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data'
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

// Runs a side effect after the response when the runtime allows it (faster replies), else awaits it.
async function later(ctx, promise) {
  if (ctx && typeof ctx.waitUntil === 'function') { ctx.waitUntil(promise); return; }
  await promise;
}

// ---------------------------------------------------------------------------
// Authentication
//  * Mini App requests carry Telegram's signed initData in X-Telegram-Init-Data. When present it is always
//    verified and the user id comes from it.
//  * Without it, the legacy "userId in the request" behaviour is kept unless ENFORCE_AUTH=1.
//  * Destructive/private endpoints (data export + delete) always require a verified session.
// ---------------------------------------------------------------------------
async function resolveUser(c, claimedUserId, { fallback = null, strict = false } = {}) {
  const initData = c.request.headers.get('X-Telegram-Init-Data');
  const enforce = strict || c.env.ENFORCE_AUTH === '1' || c.env.ENFORCE_AUTH === 'true';

  if (initData) {
    const verified = await verifyInitData(initData, c.env.TELEGRAM_BOT_TOKEN);
    if (!verified) return { error: json({ error: 'Invalid or expired Telegram session' }, 401) };
    if (claimedUserId && String(claimedUserId) !== verified.id) return { error: json({ error: 'User mismatch' }, 403) };
    return { userId: verified.id, verified: true };
  }
  if (enforce) return { error: json({ error: 'Authentication required' }, 401) };

  const userId = claimedUserId ? String(claimedUserId) : fallback;
  if (!userId) return { error: json({ success: false, error: 'userId is required' }, 400) };
  if (!isValidUserId(userId)) return { error: json({ success: false, error: 'Invalid userId' }, 400) };
  return { userId, verified: false };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
const routes = new Map();
const route = (method, path, handler) => routes.set(method + ' ' + path, handler);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const kv = env.PERSONALFIN || env.EXPENSE_KV;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      if (url.pathname === '/app') {
        return new Response(renderFullMiniApp(url.origin), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
        });
      }

      if (url.pathname === '/set-webhook') {
        const params = new URLSearchParams({ url: `${url.origin}/` });
        if (env.WEBHOOK_SECRET) params.set('secret_token', env.WEBHOOK_SECRET);
        const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?${params}`);
        const data = await res.json();
        return Response.json({ status: data.ok ? 'SUCCESS' : 'FAILED', secretToken: !!env.WEBHOOK_SECRET, telegram: data });
      }

      const handler = routes.get(request.method + ' ' + url.pathname);
      if (handler) {
        let body = {};
        if (request.method === 'POST') {
          try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid JSON body' }, 400); }
          if (!body || typeof body !== 'object') body = {};
        }
        return await handler({ request, env, kv, url, body, ctx });
      }

      if (request.method === 'POST') return await handleTelegramWebhook({ request, env, kv, url, ctx });
      return new Response('Worker running.');
    } catch (err) {
      console.error(`${request.method} ${url.pathname} failed: ${err && err.message}`);
      return json({ error: err && err.message ? err.message : 'Internal error' }, 500);
    }
  },

  // Daily cron: remind users the day before an installment is due.
  // The truth lives in installments_{uid}; the cron scans those keys (so nothing can drift out of sync)
  // and refreshes system_installments_index as a snapshot that older deployments can still read.
  async scheduled(event, env, ctx) {
    const kv = env.PERSONALFIN || env.EXPENSE_KV;
    if (!kv || !env.TELEGRAM_BOT_TOKEN) return;

    const tomorrow = new Date(Date.now() + DAY_MS);
    const tP = toPersianDate(tomorrow);
    const tCycle = cycleKey(tP);
    const tomorrowLabel = getPersianFormattedDate(tomorrow);
    const prefix = 'installments_';

    const snapshot = [];
    const names = await listKeys(kv, prefix);
    for (const name of names) {
      const userId = name.slice(prefix.length);
      let list;
      try {
        list = JSON.parse(await kv.get(name));
      } catch (e) {
        console.error(`cron: unreadable installments for userId=${userId}`);
        continue;
      }
      if (!Array.isArray(list) || list.length === 0) continue;

      let changed = false;
      for (const inst of list) {
        const dueTomorrow = effectiveDueDay(inst.dueDay, tP.year, tP.month) === tP.day;
        const cycleMatches = inst.recurrenceType === 'yearly' ? inst.dueMonth === tP.month : true;
        if (dueTomorrow && cycleMatches && inst.lastReminderCycle !== tCycle && inst.lastPaidCycle !== tCycle) {
          const msg =
            `⏰ <b>یادآوری سررسید قسط (فردا)</b>\n\n` +
            `📌 <b>عنوان:</b> ${escapeHtml(inst.title)}\n` +
            `💰 <b>مبلغ قسط:</b> ${fmtMoney(inst.amount, 'toman')}\n` +
            `🗓 <b>موعد پرداخت:</b> فردا (${tomorrowLabel})\n\n` +
            `<i>برای ثبت پرداخت از تب «اقساط» در مینی‌اپ اقدام کنید.</i>`;
          // only mark as reminded when Telegram really accepted the message
          if (await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, userId, msg)) {
            inst.lastReminderCycle = tCycle;
            changed = true;
          }
        }
        snapshot.push({
          userId, id: inst.id, title: inst.title, amount: inst.amount, dueDay: inst.dueDay, dueMonth: inst.dueMonth,
          recurrenceType: inst.recurrenceType, lastReminderCycle: inst.lastReminderCycle || null, lastPaidCycle: inst.lastPaidCycle || null
        });
      }
      if (changed) await kv.put(name, JSON.stringify(list));
    }
    await kv.put('system_installments_index', JSON.stringify(snapshot));
  }
};

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

route('GET', '/api/shortcut', async c => {
  const p = c.url.searchParams;
  const rawUser = p.get('userId');
  const amountStr = p.get('amount');
  if (!rawUser || !amountStr) return json({ success: false, error: 'userId and amount are required' }, 400);
  if (!isValidUserId(rawUser)) return json({ success: false, error: 'Invalid userId' }, 400);

  if (c.env.SHORTCUT_SECRET) {
    const expected = await shortcutToken(c.env.SHORTCUT_SECRET, rawUser);
    if (!timingSafeEqual(expected, p.get('token') || '')) return json({ success: false, error: 'Invalid or missing token' }, 403);
  }

  const amount = parseAmount(amountStr);
  if (amount === null) return json({ success: false, error: 'Invalid amount' }, 400);

  const desc = cleanText(p.get('desc') || p.get('description'), 'Shortcut Entry');
  const type = (p.get('type') || 'expense').toLowerCase();
  const isInc = type === 'income' || type === 'in' || type === 'واریز';
  const record = { id: newId(), type: isInc ? 'income' : 'expense', amount, description: desc, date: new Date().toISOString() };

  await appendTransaction(c.kv, rawUser, record);
  const settings = await readSettings(c.kv, rawUser);
  const money = fmtMoney(amount, settings.currency);

  const msg =
    `⚡️ <b>Saved via iOS Shortcut!</b>\n\n` +
    `• <b>Type:</b> ${isInc ? '🟢 Income (Shortcut)' : '🔴 Expense (Shortcut)'}\n` +
    `• <b>Amount:</b> <code>${money}</code>\n` +
    `• <b>Note:</b> ${escapeHtml(desc)}\n` +
    `• <b>Date:</b> ${getPersianFormattedDate(new Date())}`;
  await later(c.ctx, sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, rawUser, msg, `${c.url.origin}/app?uid=${rawUser}`));

  return json({ success: true, message: `Saved ${isInc ? 'Income' : 'Expense'}: ${money} (${desc})`, record });
});

route('GET', '/api/transactions', async c => {
  const u = await resolveUser(c, c.url.searchParams.get('userId'), { fallback: 'guest_user' });
  if (u.error) return u.error;
  await ensureMigrated(c.kv, u.userId);
  const requested = c.url.searchParams.get('month');
  const monthKey = requested && (isValidMonthKey(requested) || requested === 'unknown-date') ? requested : monthKeyOf(new Date());
  return json(await readMonth(c.kv, u.userId, monthKey));
});

route('POST', '/api/add', async c => {
  const { userId, type, amount, description } = c.body;
  const u = await resolveUser(c, userId, { fallback: 'guest_user' });
  if (u.error) return u.error;
  const amt = parseAmount(amount);
  if (amt === null) return json({ success: false, error: 'Invalid amount' }, 400);
  const record = {
    id: newId(),
    type: normalizeType(type, 'expense'),
    amount: amt,
    description: cleanText(description, 'General'),
    date: new Date().toISOString()
  };
  await appendTransaction(c.kv, u.userId, record);
  return json({ success: true, item: record });
});

// Finds a transaction by id, trying the client's month first and then its two neighbours
// (covers a stale/off-by-one month key on the client). Returns { monthKey, list, idx } or null.
async function locateTransaction(kv, userId, id, month) {
  const base = month && (isValidMonthKey(month) || month === 'unknown-date') ? month : monthKeyOf(new Date());
  const candidates = isValidMonthKey(base) ? [base, shiftMonthKey(base, 1), shiftMonthKey(base, -1)] : [base];
  for (const monthKey of candidates) {
    const list = await readMonth(kv, userId, monthKey);
    const idx = list.findIndex(item => item.id === id);
    if (idx !== -1) return { monthKey, list, idx };
  }
  return null;
}

route('POST', '/api/update', async c => {
  const { id, amount, description, type, userId, month } = c.body;
  const u = await resolveUser(c, userId);
  if (u.error) return u.error;
  if (!id) return json({ success: false, error: 'id is required' }, 400);
  const amt = parseAmount(amount);
  if (amt === null) return json({ success: false, error: 'Invalid amount' }, 400);

  await ensureMigrated(c.kv, u.userId);
  const hit = await locateTransaction(c.kv, u.userId, id, month);
  if (!hit) return json({ success: false, error: 'Transaction not found' }, 404);
  const existing = hit.list[hit.idx];
  hit.list[hit.idx] = {
    ...existing,
    amount: amt,
    description: cleanText(description, existing.description),
    type: normalizeType(type, existing.type)
  };
  await writeMonth(c.kv, u.userId, hit.monthKey, hit.list);
  return json({ success: true });
});

route('POST', '/api/delete', async c => {
  const { id, userId, month } = c.body;
  const u = await resolveUser(c, userId);
  if (u.error) return u.error;
  if (!id) return json({ success: false, error: 'id is required' }, 400);

  await ensureMigrated(c.kv, u.userId);
  const hit = await locateTransaction(c.kv, u.userId, id, month);
  if (!hit) return json({ success: false, error: 'Transaction not found' }, 404);
  hit.list.splice(hit.idx, 1);
  await writeMonth(c.kv, u.userId, hit.monthKey, hit.list);
  return json({ success: true });
});

// ---------------------------------------------------------------------------
// Installments
// ---------------------------------------------------------------------------

route('GET', '/api/installments', async c => {
  const u = await resolveUser(c, c.url.searchParams.get('userId'), { fallback: 'guest_user' });
  if (u.error) return u.error;
  const list = await readInstallments(c.kv, u.userId);
  return json(enrichInstallments(list, toPersianDate(new Date())));
});

function clampDay(v, fallback = 1) {
  return Math.min(31, Math.max(1, parseInt(convertPersianDigits(v), 10) || fallback));
}
function clampMonth(v, fallback = 1) {
  return Math.min(12, Math.max(1, parseInt(convertPersianDigits(v), 10) || fallback));
}

route('POST', '/api/installments/add', async c => {
  const { userId, title, amount, dueDay, dueMonth, recurrenceType, notes } = c.body;
  const u = await resolveUser(c, userId);
  if (u.error) return u.error;
  const amt = parseAmount(amount);
  if (amt === null) return json({ success: false, error: 'Invalid amount' }, 400);
  const type = recurrenceType === 'yearly' ? 'yearly' : 'monthly';
  const inst = {
    id: newId(),
    title: cleanText(title, 'Installment'),
    amount: amt,
    dueDay: clampDay(dueDay),
    dueMonth: type === 'yearly' ? clampMonth(dueMonth) : null,
    recurrenceType: type,
    notes: cleanText(notes, '', 300),
    lastPaidCycle: null,
    lastReminderCycle: null,
    createdAt: new Date().toISOString()
  };
  const list = await readInstallments(c.kv, u.userId);
  list.push(inst);
  await writeInstallments(c.kv, u.userId, list);
  return json({ success: true, item: inst });
});

route('POST', '/api/installments/edit', async c => {
  const { id, userId, title, amount, dueDay, dueMonth, recurrenceType, notes } = c.body;
  const u = await resolveUser(c, userId);
  if (u.error) return u.error;
  const list = await readInstallments(c.kv, u.userId);
  const idx = list.findIndex(i => i.id === id);
  if (idx === -1) return json({ error: 'Installment not found' }, 404);

  const hasAmount = amount !== undefined && amount !== null && String(amount).trim() !== '';
  const amt = hasAmount ? parseAmount(amount) : list[idx].amount;
  if (amt === null) return json({ success: false, error: 'Invalid amount' }, 400);

  const type = recurrenceType === 'yearly' ? 'yearly' : 'monthly';
  list[idx] = {
    ...list[idx],
    title: cleanText(title, list[idx].title),
    amount: amt,
    dueDay: clampDay(dueDay, list[idx].dueDay),
    dueMonth: type === 'yearly' ? clampMonth(dueMonth) : null,
    recurrenceType: type,
    notes: cleanText(notes === undefined ? list[idx].notes : notes, '', 300)
  };
  await writeInstallments(c.kv, u.userId, list);
  return json({ success: true, item: list[idx] });
});

route('POST', '/api/installments/delete', async c => {
  const { id, userId } = c.body;
  const u = await resolveUser(c, userId);
  if (u.error) return u.error;
  const list = (await readInstallments(c.kv, u.userId)).filter(item => item.id !== id);
  await writeInstallments(c.kv, u.userId, list);
  return json({ success: true });
});

// Quick-pay: records an expense and marks this month's cycle paid (once per cycle).
route('POST', '/api/installments/pay', async c => {
  const { id, userId } = c.body;
  const u = await resolveUser(c, userId);
  if (u.error) return u.error;
  const list = await readInstallments(c.kv, u.userId);
  const idx = list.findIndex(i => i.id === id);
  if (idx === -1) return json({ error: 'Installment not found' }, 404);
  const inst = list[idx];

  const currentCycle = cycleKey(toPersianDate(new Date()));
  if (inst.lastPaidCycle === currentCycle) return json({ success: false, error: 'Already paid this month' }, 409);

  const tx = {
    id: newId(),
    type: 'expense',
    amount: inst.amount,
    description: INSTALLMENT_TX_PREFIX + inst.title,
    date: new Date().toISOString()
  };
  await appendTransaction(c.kv, u.userId, tx);
  inst.lastPaidCycle = currentCycle;
  await writeInstallments(c.kv, u.userId, list);
  return json({ success: true, transaction: tx, item: inst });
});

// ---------------------------------------------------------------------------
// Budgets + settings
// ---------------------------------------------------------------------------

route('GET', '/api/budgets', async c => {
  const u = await resolveUser(c, c.url.searchParams.get('userId'), { fallback: 'guest_user' });
  if (u.error) return u.error;
  return json({ limits: await getJSON(c.kv, KEYS.budgets(u.userId), {}) });
});

route('POST', '/api/budgets', async c => {
  const { userId, limits } = c.body;
  const u = await resolveUser(c, userId, { fallback: 'guest_user' });
  if (u.error) return u.error;
  const safe = {};
  if (limits && typeof limits === 'object') {
    for (const key of Object.keys(limits)) {
      if (!/^[a-z]{1,24}$/.test(key)) continue;
      const n = parseFloat(convertPersianDigits(String(limits[key])).replace(/[,،٬]/g, ''));
      if (Number.isFinite(n) && n >= 0) safe[key] = n;
    }
  }
  await c.kv.put(KEYS.budgets(u.userId), JSON.stringify(safe));
  return json({ success: true, limits: safe });
});

route('GET', '/api/settings', async c => {
  const u = await resolveUser(c, c.url.searchParams.get('userId'), { fallback: 'guest_user' });
  if (u.error) return u.error;
  return json(await readSettings(c.kv, u.userId));
});

route('POST', '/api/settings', async c => {
  const u = await resolveUser(c, c.body.userId, { fallback: 'guest_user' });
  if (u.error) return u.error;
  const current = await readSettings(c.kv, u.userId);
  const next = normalizeSettings({ ...current, ...(c.body.settings || {}) });
  await c.kv.put(KEYS.settings(u.userId), JSON.stringify(next));
  return json({ success: true, settings: next });
});

// ---------------------------------------------------------------------------
// Summary / dashboard / reports
// ---------------------------------------------------------------------------

// Loads every month bucket of a user in parallel. Returns { months, byMonth: Map<monthKey, records[]> }.
async function loadLedger(kv, userId, extraMonths = []) {
  const months = await ensureMigrated(kv, userId);
  const keys = [...new Set([...months, ...extraMonths])];
  const lists = await Promise.all(keys.map(k => readMonth(kv, userId, k)));
  const byMonth = new Map(keys.map((k, i) => [k, lists[i]]));
  return { months, byMonth };
}

async function computeSummary(kv, userId) {
  const [{ byMonth }, installments] = await Promise.all([loadLedger(kv, userId), readInstallments(kv, userId)]);
  return buildSummary([...byMonth.values()], installments, toPersianDate(new Date()));
}

route('GET', '/api/summary', async c => {
  const u = await resolveUser(c, c.url.searchParams.get('userId'), { fallback: 'guest_user' });
  if (u.error) return u.error;
  return json(await computeSummary(c.kv, u.userId));
});

// One round trip for the whole dashboard: replaces five separate calls from the Mini App.
route('GET', '/api/dashboard', async c => {
  const u = await resolveUser(c, c.url.searchParams.get('userId'), { fallback: 'guest_user' });
  if (u.error) return u.error;
  const uid = u.userId;

  const now = new Date();
  const nowP = toPersianDate(now);
  const curKey = cycleKey(nowP);
  const requested = c.url.searchParams.get('month');
  const month = requested && (isValidMonthKey(requested) || requested === 'unknown-date') ? requested : curKey;
  const prevKey = shiftMonthKey(curKey, -1);

  const [{ months, byMonth }, installments, budgets, settings] = await Promise.all([
    loadLedger(c.kv, uid, [month, curKey, prevKey]),
    readInstallments(c.kv, uid),
    getJSON(c.kv, KEYS.budgets(uid), {}),
    readSettings(c.kv, uid)
  ]);

  // newest first, regardless of the order legacy data was stored in
  const records = [...(byMonth.get(month) || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const stats = sumRecords(records);
  const monthList = [...new Set([...months.filter(isValidMonthKey), curKey])].sort();

  return json({
    month,
    monthLabel: isValidMonthKey(month) ? PERSIAN_MONTHS[parseMonthKey(month).month - 1] + ' ' + parseMonthKey(month).year : month,
    isCurrentMonth: month === curKey,
    currentMonth: curKey,
    months: monthList,
    records,
    monthStats: { income: stats.income, expense: stats.expense, net: stats.income - stats.expense, count: stats.count },
    summary: buildSummary([...byMonth.values()], installments, nowP),
    installments: enrichInstallments(installments, nowP),
    budgets: { limits: budgets },
    settings,
    streak: computeStreak([...(byMonth.get(curKey) || []), ...(byMonth.get(prevKey) || [])], now)
  });
});

async function buildReport(kv, userId, requestedMonth) {
  await ensureMigrated(kv, userId);
  const now = new Date();
  const nowP = toPersianDate(now);
  const curKey = cycleKey(nowP);
  let selKey = isValidMonthKey(requestedMonth) ? requestedMonth : curKey;
  if (selKey > curKey) selKey = curKey;
  const isCurrent = selKey === curKey;

  const sel = parseMonthKey(selKey);
  const prevKey = shiftMonthKey(selKey, -1);
  const prev = parseMonthKey(prevKey);
  const daysInMonth = daysInPersianMonth(sel.year, sel.month);
  const prevDays = daysInPersianMonth(prev.year, prev.month);
  const daysElapsed = isCurrent ? nowP.day : daysInMonth;

  const [curRecords, prevRecords, installments] = await Promise.all([
    readMonth(kv, userId, selKey),
    readMonth(kv, userId, prevKey),
    isCurrent ? readInstallments(kv, userId) : Promise.resolve([])
  ]);

  const cur = bucketDaily(curRecords, daysElapsed);
  const prv = bucketDaily(prevRecords, prevDays);
  const incomeSoFar = cur.cumulativeIncome[daysElapsed - 1] || 0;
  const expenseSoFar = cur.cumulativeExpense[daysElapsed - 1] || 0;
  const prevTotals = sumRecords(prevRecords);

  // Installment payments are lumpy, so they are kept out of the daily spending pace and added back
  // explicitly: projected = spent so far + pace * remaining days + installments still pending.
  const installmentPaid = curRecords
    .filter(r => r.type === 'expense' && String(r.description || '').startsWith(INSTALLMENT_TX_PREFIX))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const dailyPace = daysElapsed > 0 ? (expenseSoFar - installmentPaid) / daysElapsed : 0;
  let pendingInstallments = 0;
  if (isCurrent) {
    pendingInstallments = buildSummary([], installments, nowP).pendingTotal;
  }
  const remainingDays = isCurrent ? daysInMonth - daysElapsed : 0;
  const projectedIncome = incomeSoFar; // income is lumpy (salary), so it is not extrapolated
  const projectedExpense = expenseSoFar + dailyPace * remainingDays + pendingInstallments;

  const categoryTotals = new Map();
  let biggest = null;
  for (const r of curRecords) {
    if (r.type !== 'expense') continue;
    const amt = Number(r.amount) || 0;
    const desc = String(r.description || '');
    const catId = desc.startsWith(INSTALLMENT_TX_PREFIX) ? 'installments' : (parseCategory(desc).categoryId || 'other');
    categoryTotals.set(catId, (categoryTotals.get(catId) || 0) + amt);
    if (!biggest || amt > biggest.amount) biggest = { description: parseCategory(desc).clean || desc, amount: amt };
  }
  const categories = [...categoryTotals.entries()].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);

  return {
    month: selKey,
    monthLabel: PERSIAN_MONTHS[sel.month - 1] + ' ' + sel.year,
    isCurrentMonth: isCurrent,
    daysInMonth,
    currentMonth: {
      label: PERSIAN_MONTHS[sel.month - 1],
      totalDays: daysElapsed,
      ...cur,
      totals: { income: incomeSoFar, expense: expenseSoFar, net: incomeSoFar - expenseSoFar }
    },
    previousMonth: {
      label: PERSIAN_MONTHS[prev.month - 1],
      totalDays: prevDays,
      ...prv,
      totals: { income: prevTotals.income, expense: prevTotals.expense, net: prevTotals.income - prevTotals.expense }
    },
    forecast: {
      projectedIncome: Math.round(projectedIncome),
      projectedExpense: Math.round(projectedExpense),
      projectedBalance: Math.round(projectedIncome - projectedExpense),
      pendingInstallments: Math.round(pendingInstallments),
      dailyPace: Math.round(dailyPace)
    },
    categories,
    insights: {
      avgDailyExpense: daysElapsed > 0 ? Math.round(expenseSoFar / daysElapsed) : 0,
      noSpendDays: cur.dailyExpense.filter(v => v === 0).length,
      biggestExpense: biggest
    }
  };
}

route('GET', '/api/reports', async c => {
  const u = await resolveUser(c, c.url.searchParams.get('userId'), { fallback: 'guest_user' });
  if (u.error) return u.error;
  return json(await buildReport(c.kv, u.userId, c.url.searchParams.get('month')));
});

// ---------------------------------------------------------------------------
// Data export + delete (always require a verified Telegram session)
// ---------------------------------------------------------------------------

async function resolveVerifiedUser(c) {
  const u = await resolveUser(c, c.body.userId, { strict: true });
  if (u.error) return u;
  if (!/^\d+$/.test(u.userId)) return { error: json({ error: 'Invalid user' }, 403) };
  return u;
}

async function sendExport(kv, env, userId) {
  const { byMonth } = await loadLedger(kv, userId);
  const records = [...byMonth.values()].flat();
  const installments = await readInstallments(kv, userId);
  const budgets = await getJSON(kv, KEYS.budgets(userId), {});
  const settings = await readSettings(kv, userId);

  const p = toPersianDate(new Date());
  const stamp = p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0');
  const backup = { version: 1, exportedAt: new Date().toISOString(), userId, transactions: records, installments, budgets, settings };

  const okJson = await sendTelegramDocument(env.TELEGRAM_BOT_TOKEN, userId, `finex-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json', '💾 Backup / پشتیبان کامل');
  const okCsv = await sendTelegramDocument(env.TELEGRAM_BOT_TOKEN, userId, `finex-transactions-${stamp}.csv`, transactionsToCsv(records), 'text/csv', '📄 Transactions / تراکنش‌ها (CSV)');
  return { sent: okJson && okCsv, transactions: records.length, installments: installments.length };
}

const WIPE_SCOPES = ['transactions', 'installments', 'budgets', 'all'];

// Deletes the requested part of one user's data. Idempotent; touches only keys of this user.
async function wipeUserData(kv, userId, scope) {
  const deleted = {};
  const all = scope === 'all';

  if (scope === 'transactions' || all) {
    const names = new Set(await listKeys(kv, KEYS.monthPrefix(userId)));
    const indexed = await getJSON(kv, KEYS.index(userId), []).catch(() => []);
    for (const m of Array.isArray(indexed) ? indexed : []) names.add(KEYS.month(userId, m));
    for (const name of names) await kv.delete(name);
    // The legacy single-array key is the pre-migration backup: if it stayed, ensureMigrated would restore the data.
    await kv.delete(KEYS.legacy(userId));
    if (all) await kv.delete(KEYS.index(userId));
    else await kv.put(KEYS.index(userId), '[]');
    deleted.transactionMonths = names.size;
  }

  if (scope === 'installments' || all) {
    await kv.delete(KEYS.installments(userId));
    // also drop this user from the reminder snapshot so no stale copy of the data remains
    try {
      const snap = await getJSON(kv, 'system_installments_index', null);
      if (Array.isArray(snap)) {
        await kv.put('system_installments_index', JSON.stringify(snap.filter(e => e.userId !== userId)));
      }
    } catch (e) { /* best effort */ }
    deleted.installments = true;
  }

  if (scope === 'budgets' || all) {
    await kv.delete(KEYS.budgets(userId));
    deleted.budgets = true;
  }

  if (all) {
    await kv.delete(KEYS.settings(userId));
    try {
      const users = await getJSON(kv, 'system_all_users', null);
      if (Array.isArray(users)) await kv.put('system_all_users', JSON.stringify(users.filter(id => id !== userId)));
    } catch (e) { /* best effort */ }
    deleted.settings = true;
  }
  return deleted;
}

route('POST', '/api/data/export', async c => {
  const u = await resolveVerifiedUser(c);
  if (u.error) return u.error;
  const result = await sendExport(c.kv, c.env, u.userId);
  return json({ success: result.sent, ...result }, result.sent ? 200 : 502);
});

route('POST', '/api/data/delete', async c => {
  const u = await resolveVerifiedUser(c);
  if (u.error) return u.error;
  const { scope, confirm } = c.body;
  if (!WIPE_SCOPES.includes(scope)) return json({ success: false, error: 'Invalid scope' }, 400);
  if (confirm !== 'DELETE') return json({ success: false, error: 'Confirmation required' }, 400);
  const deleted = await wipeUserData(c.kv, u.userId, scope);
  console.log(`data wiped: userId=${u.userId} scope=${scope}`);
  return json({ success: true, scope, deleted });
});

// ---------------------------------------------------------------------------
// Telegram webhook
// ---------------------------------------------------------------------------

const HELP_TEXT =
  `👋 <b>Welcome to Finance Tracker!</b>\n\n` +
  `• <code>expense - 50 - Lunch</code>\n` +
  `• <code>income - 2500 - Salary</code>\n` +
  `• <code>قهوه ۵۰ هزار</code> — اعداد با «هزار / میلیون» هم کار می‌کنند\n\n` +
  `Use the button below to view transactions & installments! 📊\n` +
  `<code>گزارش</code> — خلاصه‌ی وضعیت مالی و اقساط این ماه\n` +
  `<code>/export</code> — دریافت پشتیبان (JSON) و فایل CSV تراکنش‌ها\n` +
  `<code>/shortcut</code> — لینک iOS Shortcut\n` +
  `<code>/deletedata</code> — حذف همه‌ی داده‌های شما`;

async function handleTelegramWebhook(c) {
  const { request, env, kv, url, ctx } = c;

  if (env.WEBHOOK_SECRET) {
    const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (!timingSafeEqual(env.WEBHOOK_SECRET, got)) return new Response('Forbidden', { status: 403 });
  }

  try {
    const update = await request.json();
    // edited messages are ignored on purpose: re-processing them would log a duplicate transaction
    const message = update.message;
    if (!message || !message.text) return new Response('OK');

    const chatId = message.chat.id;
    const userId = message.from && message.from.id ? String(message.from.id) : String(chatId);
    const text = message.text.trim();
    const token = env.TELEGRAM_BOT_TOKEN;
    const appUrl = `${url.origin}/app?uid=${userId}`;
    const reply = (html, withButton = true) => sendTelegramMessage(token, chatId, html, withButton ? appUrl : undefined);

    const [rawCmd, ...args] = text.split(/\s+/);
    const cmd = rawCmd.startsWith('/') ? rawCmd.replace(/@.+$/, '').toLowerCase() : rawCmd;

    if (cmd === '/start' || cmd === '/help') { await reply(HELP_TEXT); return new Response('OK'); }

    if (cmd === '/report' || text === 'گزارش' || cmd === '/گزارش') {
      const [summary, settings] = await Promise.all([computeSummary(kv, userId), readSettings(kv, userId)]);
      await reply(buildSummaryMessage(summary, settings.currency));
      return new Response('OK');
    }

    if (cmd === '/export') {
      const result = await sendExport(kv, env, userId);
      if (!result.sent) await reply('⚠️ ارسال فایل ناموفق بود. دوباره تلاش کنید.', false);
      return new Response('OK');
    }

    if (cmd === '/shortcut') {
      let link = `${url.origin}/api/shortcut?userId=${userId}&amount=50&desc=Coffee&type=expense`;
      if (env.SHORTCUT_SECRET) link += `&token=${await shortcutToken(env.SHORTCUT_SECRET, userId)}`;
      await reply(`⚡️ <b>iOS Shortcut</b>\n\n<code>${escapeHtml(link)}</code>\n\nمقدار <code>amount</code> و <code>desc</code> را در Shortcut با متغیر جایگزین کنید. برای درآمد <code>type=income</code> بگذارید.`, false);
      return new Response('OK');
    }

    if (cmd === '/deletedata') {
      // Chat deletion is only offered when webhook calls are authenticated; otherwise anyone could forge it.
      if (!env.WEBHOOK_SECRET) {
        await reply('🔒 حذف از طریق چت فعال نیست. از مینی‌اپ: ⚙️ تنظیمات ← حذف داده‌ها.', false);
      } else if (args[0] && ['confirm', 'تایید', 'تأیید'].includes(args[0].toLowerCase())) {
        await wipeUserData(kv, userId, 'all');
        console.log(`data wiped via chat: userId=${userId}`);
        await reply('🗑 تمام داده‌های شما حذف شد.', false);
      } else {
        await reply(
          '⚠️ <b>حذف همه‌ی داده‌ها</b>\n\nتمام تراکنش‌ها، اقساط، بودجه‌ها و تنظیمات شما برای همیشه پاک می‌شود و قابل بازگشت نیست.\n' +
          'ابتدا <code>/export</code> را بزنید تا پشتیبان بگیرید.\n\nبرای تأیید بفرستید:\n<code>/deletedata confirm</code>', false);
      }
      return new Response('OK');
    }

    // an unknown /command must not be logged as an expense called "/command"
    const parsed = cmd.startsWith('/') ? null : parseTransaction(text);
    if (!parsed) {
      await reply(`⚠️ Format: <code>expense - 50 - Coffee</code>`);
      return new Response('OK');
    }

    const record = { id: newId(), type: parsed.type, amount: parsed.amount, description: parsed.description, date: new Date().toISOString() };
    await appendTransaction(kv, userId, record);
    const settings = await readSettings(kv, userId);

    const msg =
      `✅ <b>Transaction Saved!</b>\n\n` +
      `• <b>Type:</b> ${parsed.type === 'income' ? '🟢 Income' : '🔴 Expense'}\n` +
      `• <b>Amount:</b> <code>${fmtMoney(parsed.amount, settings.currency)}</code>\n` +
      `• <b>Note:</b> ${escapeHtml(parsed.description)}\n` +
      `• <b>Date:</b> ${getPersianFormattedDate(new Date())}`;
    await later(ctx, reply(msg));
    return new Response('OK');
  } catch (err) {
    // always answer 200 so Telegram does not retry the same update endlessly
    console.error(`webhook error: ${err && err.message}`);
    return new Response('OK');
  }
}

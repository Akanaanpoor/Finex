// Shared helpers: Persian-calendar math, parsing, KV storage, aggregation, Telegram I/O, auth.
// Everything here is pure or takes its dependencies (kv, token) as arguments, so it is testable in Node.

export const PERSIAN_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

// Category ids shared with the Mini App. A category is stored as a trailing "#id" in the description.
export const CATEGORY_IDS = ['food', 'transport', 'bills', 'shopping', 'health', 'entertainment', 'cafe', 'ai', 'salary', 'other'];
export const INSTALLMENT_TX_PREFIX = 'پرداخت قسط: ';

const DAY_MS = 86400000;
const VALID_USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const VALID_MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString() + '-' + Math.random().toString(36).slice(2, 8);
}

export function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function isValidUserId(id) {
  return typeof id === 'string' && VALID_USER_ID.test(id);
}

export function isValidMonthKey(key) {
  return typeof key === 'string' && VALID_MONTH_KEY.test(key);
}

export function convertPersianDigits(str) {
  return String(str)
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

// Accepts 1250, "1,250", "۱۲٬۵۰۰", "12 500"; returns a positive finite number or null.
export function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const cleaned = convertPersianDigits(String(value)).replace(/[,،٬\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 1e13) return null;
  return n;
}

export function normalizeType(value, fallback = null) {
  return value === 'income' || value === 'expense' ? value : fallback;
}

export function cleanText(value, fallback, max = 200) {
  const s = String(value === undefined || value === null ? '' : value).trim().slice(0, max);
  return s || fallback;
}

// ---------------------------------------------------------------------------
// Persian calendar (formatters are built once — constructing Intl objects per call is very slow)
// ---------------------------------------------------------------------------

const PERSIAN_PARTS_FMT = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran' });
const PERSIAN_LONG_FMT = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' });

export function toPersianDate(date) {
  const map = {};
  for (const p of PERSIAN_PARTS_FMT.formatToParts(date)) {
    if (p.type === 'year' || p.type === 'month' || p.type === 'day') {
      map[p.type] = parseInt(convertPersianDigits(p.value), 10);
    }
  }
  return { year: map.year, month: map.month, day: map.day };
}

export function getPersianFormattedDate(date) {
  return PERSIAN_LONG_FMT.format(date);
}

export function cycleKey(p) {
  return p.year + '-' + String(p.month).padStart(2, '0');
}

export function monthKeyOf(date) {
  return cycleKey(toPersianDate(date));
}

export function shiftMonthKey(monthKey, delta) {
  const parts = monthKey.split('-');
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10) + delta;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1) { m += 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}

export function parseMonthKey(monthKey) {
  const [y, m] = monthKey.split('-').map(n => parseInt(n, 10));
  return { year: y, month: m };
}

// 33-year-cycle rule; verified against Intl's Persian calendar for 1368–1457.
export function isPersianLeapYear(year) {
  return ((25 * year + 11) % 33) < 8;
}

export function daysInPersianMonth(year, month) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isPersianLeapYear(year) ? 30 : 29;
}

// A due day of 31 in a 30-day month (or 30 in a 29-day Esfand) falls on the month's last day.
export function effectiveDueDay(dueDay, year, month) {
  return Math.min(Number(dueDay) || 1, daysInPersianMonth(year, month));
}

// ---------------------------------------------------------------------------
// Parsing a chat message into a transaction
// ---------------------------------------------------------------------------

const INCOME_WORDS = new Set(['income', 'inc', 'in', 'input', 'واریز', 'درآمد', 'دریافت']);
const EXPENSE_WORDS = new Set(['expense', 'exp', 'out', 'خرج', 'هزینه', 'پرداخت']);
const MULTIPLIERS = { 'هزار': 1e3, 'k': 1e3, 'میلیون': 1e6, 'میلیارد': 1e9 };

export function parseTransaction(rawText) {
  let text = convertPersianDigits(String(rawText).trim());
  text = text.replace(/(\d)[,،٬](?=\d)/g, '$1');

  const numMatch = text.match(/\d+(?:\.\d+)?/);
  if (!numMatch) return null;
  let amount = parseFloat(numMatch[0]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // optional multiplier word right after the number: "50 هزار", "2 میلیون", "30k"
  const afterNumber = text.slice(numMatch.index + numMatch[0].length);
  const mult = afterNumber.match(/^\s*(هزار|میلیون|میلیارد|k)(?![\p{L}])/iu);
  let removeSpan = numMatch[0];
  if (mult) {
    amount *= MULTIPLIERS[mult[1].toLowerCase()];
    removeSpan = numMatch[0] + mult[0];
  }

  // type comes from the leading keyword (or +/- sign) only — never from a substring of the description
  const head = text.match(/^\s*([+-])?\s*(\p{L}+)?/u);
  const sign = head && head[1];
  const word = head && head[2] ? head[2].toLowerCase() : '';
  let type = 'expense';
  let keywordLen = 0;
  if (INCOME_WORDS.has(word)) { type = 'income'; keywordLen = head[0].length; }
  else if (EXPENSE_WORDS.has(word)) { type = 'expense'; keywordLen = head[0].length; }
  else if (sign === '+') type = 'income';
  else if (sign === '-') type = 'expense';
  if (type === 'expense' && /(^|\s)(واریز|درآمد)(\s|$)/u.test(text)) type = 'income';

  let rest = text.slice(0, numMatch.index) + ' ' + text.slice(numMatch.index + removeSpan.length);
  if (keywordLen) rest = rest.slice(keywordLen);
  let desc = rest
    .replace(/(^|\s)(تومان|تومن)(?=\s|$)/gu, ' ')
    .replace(/^[\s\-:+,،]+/, '')
    .replace(/\s[-:]\s/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-:]+$/, '')
    .trim();
  if (!desc) desc = type === 'income' ? 'Income' : 'Expense';

  return { type, amount, description: desc.slice(0, 200) };
}

export function parseCategory(description) {
  const m = String(description || '').match(/#([a-z]+)\s*$/i);
  if (m && CATEGORY_IDS.includes(m[1].toLowerCase())) {
    return { clean: String(description).slice(0, m.index).trim(), categoryId: m[1].toLowerCase() };
  }
  return { clean: String(description || ''), categoryId: '' };
}

// ---------------------------------------------------------------------------
// Money formatting for bot messages (the Mini App has its own formatter)
// ---------------------------------------------------------------------------

export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return { currency: s.currency === 'usd' ? 'usd' : 'toman' };
}

export function fmtMoney(n, currency = 'toman') {
  const v = Number(n) || 0;
  if (currency === 'usd') return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
  return v.toLocaleString('fa-IR') + ' تومان';
}

// ---------------------------------------------------------------------------
// Storage (Workers KV). Key formats are a compatibility contract — do not change them.
//   user_{uid}_{YYYY-MM}   transactions of one Persian month (newest first)
//   user_index_{uid}       sorted array of month keys that exist
//   user_{uid}             LEGACY single array; kept after migration as a backup
//   installments_{uid}     installments array
//   budgets_{uid}          { categoryId: limit }
//   settings_{uid}         { currency }
// ---------------------------------------------------------------------------

export const KEYS = {
  month: (uid, m) => `user_${uid}_${m}`,
  monthPrefix: uid => `user_${uid}_`,
  index: uid => `user_index_${uid}`,
  legacy: uid => `user_${uid}`,
  installments: uid => `installments_${uid}`,
  budgets: uid => `budgets_${uid}`,
  settings: uid => `settings_${uid}`
};

export async function getJSON(kv, key, fallback) {
  const raw = await kv.get(key);
  if (raw === null || raw === undefined || raw === '') return fallback;
  return JSON.parse(raw);
}

export async function readMonth(kv, uid, monthKey) {
  const list = await getJSON(kv, KEYS.month(uid, monthKey), []);
  return Array.isArray(list) ? list : [];
}

export async function writeMonth(kv, uid, monthKey, list) {
  await kv.put(KEYS.month(uid, monthKey), JSON.stringify(list));
}

export async function readInstallments(kv, uid) {
  const list = await getJSON(kv, KEYS.installments(uid), []);
  return Array.isArray(list) ? list : [];
}

export async function writeInstallments(kv, uid, list) {
  await kv.put(KEYS.installments(uid), JSON.stringify(list));
}

export async function readSettings(kv, uid) {
  try { return normalizeSettings(await getJSON(kv, KEYS.settings(uid), {})); } catch (e) { return normalizeSettings({}); }
}

// Lists every key with a prefix, following pagination.
export async function listKeys(kv, prefix) {
  const names = [];
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    for (const key of page.keys) names.push(key.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return names;
}

// Records a user in the (write-only) global user list; used once, when a user is first seen.
export async function registerUser(kv, userId) {
  try {
    const users = await getJSON(kv, 'system_all_users', []);
    if (!users.includes(String(userId))) {
      users.push(String(userId));
      await kv.put('system_all_users', JSON.stringify(users));
    }
  } catch (e) { /* best effort */ }
}

async function rebuildMonthIndex(kv, uid) {
  const prefix = KEYS.monthPrefix(uid);
  const months = (await listKeys(kv, prefix)).map(name => name.slice(prefix.length));
  months.sort();
  return months;
}

// One-time, idempotent migration from the legacy single-array key to monthly keys.
// Returns the user's month index. The legacy key is never deleted here (rollback backup,
// and it keeps concurrent runs idempotent). Wiping a user's data deletes it explicitly.
export async function ensureMigrated(kv, uid) {
  const existingIndex = await kv.get(KEYS.index(uid));
  if (existingIndex !== null && existingIndex !== undefined) {
    try {
      const parsed = JSON.parse(existingIndex);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) { /* corrupt index: rebuild below */ }
    const rebuilt = await rebuildMonthIndex(kv, uid);
    await kv.put(KEYS.index(uid), JSON.stringify(rebuilt));
    return rebuilt;
  }

  const legacyRaw = await kv.get(KEYS.legacy(uid));
  if (!legacyRaw) {
    // maybe monthly keys exist but the index was lost: rebuild it before writing an empty one
    const rebuilt = await rebuildMonthIndex(kv, uid);
    await kv.put(KEYS.index(uid), JSON.stringify(rebuilt));
    await registerUser(kv, uid);
    return rebuilt;
  }

  let legacyList;
  try {
    legacyList = JSON.parse(legacyRaw);
    if (!Array.isArray(legacyList)) legacyList = [];
  } catch (e) {
    // corrupt legacy data: keep the key untouched for manual recovery, continue with an empty index
    console.error(`ensureMigrated: corrupt legacy JSON for userId=${uid}, continuing with empty index`);
    await kv.put(KEYS.index(uid), JSON.stringify([]));
    return [];
  }

  const byMonth = {};
  for (const record of legacyList) {
    let mKey;
    try {
      const d = new Date(record && record.date);
      if (isNaN(d.getTime())) throw new Error('invalid date');
      mKey = monthKeyOf(d);
    } catch (e) {
      mKey = 'unknown-date'; // keep records with unparsable dates instead of dropping them
    }
    if (!byMonth[mKey]) byMonth[mKey] = [];
    byMonth[mKey].push(record);
  }

  const monthKeys = Object.keys(byMonth).sort();
  for (const mKey of monthKeys) {
    await kv.put(KEYS.month(uid, mKey), JSON.stringify(byMonth[mKey]));
  }
  await kv.put(KEYS.index(uid), JSON.stringify(monthKeys));
  await registerUser(kv, uid);
  console.log(`ensureMigrated: migrated userId=${uid}, records=${legacyList.length}, months=${monthKeys.length}`);
  return monthKeys;
}

async function addMonthToIndex(kv, uid, months, monthKey) {
  if (months.includes(monthKey)) return months;
  const next = [...months, monthKey].sort();
  await kv.put(KEYS.index(uid), JSON.stringify(next));
  return next;
}

// Prepends a transaction to its Persian month bucket and keeps the month index in sync.
export async function appendTransaction(kv, uid, record) {
  const months = await ensureMigrated(kv, uid);
  const monthKey = monthKeyOf(new Date(record.date));
  const list = await readMonth(kv, uid, monthKey);
  list.unshift(record);
  await writeMonth(kv, uid, monthKey, list);
  await addMonthToIndex(kv, uid, months, monthKey);
  return monthKey;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export function sumRecords(records) {
  let income = 0, expense = 0;
  for (const r of records) {
    const amt = Number(r.amount) || 0;
    if (r.type === 'income') income += amt;
    else if (r.type === 'expense') expense += amt;
  }
  return { income, expense, count: records.length };
}

// Daily buckets for one month plus running totals. totalDays sets the output length.
export function bucketDaily(records, totalDays) {
  const dailyIncome = new Array(totalDays).fill(0);
  const dailyExpense = new Array(totalDays).fill(0);
  for (const r of records) {
    const idx = toPersianDate(new Date(r.date)).day - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= totalDays) continue;
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

// Consecutive Tehran days with at least one transaction, counting back from today
// (or from yesterday when nothing was logged yet today).
export function computeStreak(records, now = new Date()) {
  // Only day *identity* matters here, so a Tehran-local day number (fixed UTC+3:30 since DST was dropped in 2022)
  // is enough and far cheaper than formatting every record through Intl.
  const TEHRAN_OFFSET_MS = 3.5 * 3600000;
  const dayNumber = ms => Math.floor((ms + TEHRAN_OFFSET_MS) / DAY_MS);
  const days = new Set();
  for (const r of records) {
    const ms = new Date(r.date).getTime();
    if (!isNaN(ms)) days.add(dayNumber(ms));
  }
  let day = dayNumber(now.getTime());
  if (!days.has(day)) day -= 1;
  let streak = 0;
  while (days.has(day) && streak < 400) {
    streak++;
    day -= 1;
  }
  return streak;
}

// Adds due/paid/overdue information to each stored installment for the current Persian date.
export function enrichInstallments(list, nowP) {
  const currentCycle = cycleKey(nowP);
  return list.map(item => {
    const isDueThisMonth = item.recurrenceType === 'yearly' ? item.dueMonth === nowP.month : true;
    const isPaidThisCycle = item.lastPaidCycle === currentCycle;
    const effective = effectiveDueDay(item.dueDay, nowP.year, nowP.month);
    const daysUntilDue = isDueThisMonth ? effective - nowP.day : null;
    return {
      ...item,
      isPaidThisCycle,
      isDueThisMonth,
      effectiveDueDay: effective,
      daysUntilDue,
      isOverdue: isDueThisMonth && !isPaidThisCycle && daysUntilDue < 0
    };
  });
}

// Everything the dashboard/bot summary needs from all-time data + this month's installments.
export function buildSummary(allRecordsByMonth, installments, nowP) {
  let income = 0, expense = 0, totalTx = 0;
  for (const records of allRecordsByMonth) {
    const s = sumRecords(records);
    income += s.income;
    expense += s.expense;
    totalTx += s.count;
  }
  const balance = income - expense;
  const currentCycle = cycleKey(nowP);

  let pendingTotal = 0;
  const pendingList = [];
  const paidList = [];
  for (const inst of installments) {
    const isDueThisMonth = inst.recurrenceType === 'yearly' ? inst.dueMonth === nowP.month : true;
    if (!isDueThisMonth) continue;
    if (inst.lastPaidCycle === currentCycle) {
      paidList.push({ id: inst.id, title: inst.title, amount: inst.amount });
    } else {
      pendingTotal += Number(inst.amount) || 0;
      pendingList.push({ id: inst.id, title: inst.title, amount: inst.amount });
    }
  }

  return {
    income,
    expense,
    balance,
    totalTx,
    pendingTotal,
    projectedBalance: balance - pendingTotal,
    pendingList,
    paidList,
    currentCycle,
    currentMonthLabel: PERSIAN_MONTHS[nowP.month - 1],
    now: nowP
  };
}

export function buildSummaryMessage(summary, currency = 'toman') {
  const { income, expense, balance, pendingTotal, projectedBalance, pendingList, currentMonthLabel } = summary;
  const statusEmoji = projectedBalance >= 0 ? '🟢' : '🔴';
  const money = n => '<code>' + fmtMoney(n, currency) + '</code>';

  let instBlock = 'قسط باز پرداخت‌نشده‌ای برای این ماه ثبت نشده.';
  if (pendingList.length > 0) {
    instBlock = pendingList.map(i => '• ' + escapeHtml(i.title) + ': ' + fmtMoney(i.amount, currency)).join('\n');
  }

  return (
    '📊 <b>گزارش مالی — ' + currentMonthLabel + '</b>\n\n' +
    '💰 <b>موجودی فعلی:</b> ' + money(balance) + '\n' +
    '↓ <b>مجموع درآمد:</b> ' + money(income) + '\n' +
    '↑ <b>مجموع هزینه:</b> ' + money(expense) + '\n\n' +
    '🗓 <b>اقساط باقیمانده‌ی این ماه (' + pendingList.length + ' مورد):</b>\n' + instBlock + '\n' +
    '💵 <b>جمع اقساط باقیمانده:</b> ' + fmtMoney(pendingTotal, currency) + '\n\n' +
    statusEmoji + ' <b>برآیند مالی پس از پرداخت اقساط:</b> ' + money(projectedBalance)
  );
}

// ---------------------------------------------------------------------------
// Telegram I/O
// ---------------------------------------------------------------------------

// Returns true only when Telegram accepted the message (HTTP 2xx), so callers can tell success from failure.
export async function sendTelegramMessage(token, chatId, htmlText, webAppUrl) {
  const payload = { chat_id: chatId, text: htmlText, parse_mode: 'HTML' };
  if (webAppUrl) {
    payload.reply_markup = { inline_keyboard: [[{ text: '📊 Open Dashboard', web_app: { url: webAppUrl } }]] };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) console.error(`sendMessage failed: chat=${chatId} status=${res.status}`);
    return res.ok;
  } catch (e) {
    console.error(`sendMessage error: chat=${chatId} ${e && e.message}`);
    return false;
  }
}

export async function sendTelegramDocument(token, chatId, filename, content, mime, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption);
  form.append('document', new Blob([content], { type: mime }), filename);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form });
    if (!res.ok) console.error(`sendDocument failed: chat=${chatId} status=${res.status}`);
    return res.ok;
  } catch (e) {
    console.error(`sendDocument error: chat=${chatId} ${e && e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth: Telegram Mini App initData (HMAC), webhook secret and shortcut tokens
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

async function hmacSha256(keyBytes, messageBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, messageBytes));
}

const toHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

export function timingSafeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// Validates Telegram.WebApp.initData per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Returns { id, user } for a genuine, recent session, otherwise null.
export async function verifyInitData(initData, botToken, maxAgeSec = 3 * 86400) {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secret = await hmacSha256(enc.encode('WebAppData'), enc.encode(botToken));
    const expected = toHex(await hmacSha256(secret, enc.encode(dataCheckString)));
    if (!timingSafeEqual(expected, hash)) return null;
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || user.id === undefined || user.id === null) return null;
    return { id: String(user.id), user };
  } catch (e) {
    return null;
  }
}

// Per-user token for the iOS Shortcut URL (only enforced when SHORTCUT_SECRET is configured).
export async function shortcutToken(secret, userId) {
  const sig = await hmacSha256(enc.encode(String(secret)), enc.encode('shortcut:' + userId));
  return toHex(sig).slice(0, 24);
}

// ---------------------------------------------------------------------------
// Exports (backup JSON + CSV)
// ---------------------------------------------------------------------------

function csvCell(v) {
  const s = String(v === undefined || v === null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function transactionsToCsv(records) {
  const rows = ['id,date,jalali_date,type,amount,category,description'];
  const sorted = [...records].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const r of sorted) {
    const d = new Date(r.date);
    const p = isNaN(d.getTime()) ? null : toPersianDate(d);
    const cat = parseCategory(r.description);
    rows.push([
      r.id, r.date,
      p ? p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0') : '',
      r.type, r.amount, cat.categoryId, cat.clean
    ].map(csvCell).join(','));
  }
  return '﻿' + rows.join('\r\n') + '\r\n'; // BOM so Excel opens Persian text correctly
}

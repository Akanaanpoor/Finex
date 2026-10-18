// Regression tests for bugs found in the audit. Each one failed on the pre-audit code.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryKV, makeEnv, call, stubTelegram, tgUpdate, worker } from './helpers.mjs';

const NOW = new Date('2026-10-18T09:00:00Z'); // 26 Mehr 1405
const CUR = '1405-07';

let kv, env, tg;
beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: NOW });
  kv = new MemoryKV();
  env = makeEnv(kv);
  tg = stubTelegram();
});
afterEach(() => {
  tg.restore();
  mock.timers.reset();
});

const lastTx = (uid = 111) => (kv.json(`user_${uid}_${CUR}`) || [])[0];

// ---------- parser: type was decided by substring match ("in" inside "Shopping" => income) ----------
test('parser: expense words that merely contain "in"/"inc" stay expenses', async () => {
  for (const text of ['expense - 50 - Shopping', 'expense - 80 - Parking', 'exp 20 Internet', 'expense - 30 - Dining', '40 Princess cake']) {
    kv.map.clear();
    await call(env, 'POST', '/', tgUpdate(text, 111));
    assert.equal(lastTx().type, 'expense', `"${text}" must be an expense`);
  }
});

test('parser: income keywords still work (leading keyword / + / Persian)', async () => {
  for (const text of ['income - 2500 - Salary', 'inc 100 bonus', '+500 gift', 'in - 10 - refund', 'واریز ۱۰۰۰ حقوق', 'درآمد 300 پروژه']) {
    kv.map.clear();
    await call(env, 'POST', '/', tgUpdate(text, 111));
    assert.equal(lastTx().type, 'income', `"${text}" must be income`);
  }
});

test('parser: description is cleaned of keyword and separators', async () => {
  await call(env, 'POST', '/', tgUpdate('expense - 50 - Lunch with team', 111));
  assert.equal(lastTx().description, 'Lunch with team');
  await call(env, 'POST', '/', tgUpdate('income - 1,500,000 - Salary', 111));
  assert.equal(lastTx().amount, 1500000);
});

test('telegram: editing a message must not log a second transaction', async () => {
  const upd = tgUpdate('expense - 50 - Lunch', 111);
  await call(env, 'POST', '/', { update_id: 1, edited_message: upd.message });
  assert.equal(kv.json(`user_111_${CUR}`), null);
  assert.equal(tg.messages().length, 0);
});

// ---------- input validation ----------
test('add/update reject invalid type and non-positive amounts', async () => {
  const a = await call(env, 'POST', '/api/add', { userId: 'u1', type: 'weird', amount: 10, description: 'x' });
  assert.equal(a.json.item.type, 'expense', 'unknown type falls back to expense');
  const zero = await call(env, 'POST', '/api/add', { userId: 'u1', type: 'expense', amount: 0, description: 'x' });
  assert.equal(zero.status, 400);
  const neg = await call(env, 'POST', '/api/add', { userId: 'u1', type: 'expense', amount: 'abc' });
  assert.equal(neg.status, 400);
  const noUser = await call(env, 'POST', '/api/delete', { id: 'x' });
  assert.equal(noUser.status, 400, 'missing userId must not touch user_undefined_* keys');
  assert.equal(kv.keys('user_undefined').length, 0);
});

test('add accepts Persian digits in amount', async () => {
  const a = await call(env, 'POST', '/api/add', { userId: 'u1', type: 'income', amount: '۱۲٬۵۰۰', description: 'x' });
  assert.equal(a.json.item.amount, 12500);
});

// ---------- installments ----------
test('pay installment twice in the same cycle does not duplicate the expense', async () => {
  const add = await call(env, 'POST', '/api/installments/add', { userId: 'u1', title: 'Loan', amount: 700, dueDay: 28 });
  const id = add.json.item.id;
  const first = await call(env, 'POST', '/api/installments/pay', { userId: 'u1', id });
  assert.equal(first.status, 200);
  const second = await call(env, 'POST', '/api/installments/pay', { userId: 'u1', id });
  assert.equal(second.status, 409);
  assert.equal(kv.json(`user_u1_${CUR}`).length, 1);
});

test('installments list reports days until due and overdue state', async () => {
  await call(env, 'POST', '/api/installments/add', { userId: 'u1', title: 'Late', amount: 1, dueDay: 10 });
  await call(env, 'POST', '/api/installments/add', { userId: 'u1', title: 'Soon', amount: 1, dueDay: 28 });
  const list = (await call(env, 'GET', '/api/installments?userId=u1')).json;
  const late = list.find(i => i.title === 'Late');
  const soon = list.find(i => i.title === 'Soon');
  assert.equal(late.isOverdue, true);
  assert.equal(late.daysUntilDue, -16);
  assert.equal(soon.isOverdue, false);
  assert.equal(soon.daysUntilDue, 2);
});

test('summary: day 31 installment in a 30-day month is still due that month (clamped)', async () => {
  await call(env, 'POST', '/api/installments/add', { userId: 'u1', title: 'EndOfMonth', amount: 10, dueDay: 31 });
  const list = (await call(env, 'GET', '/api/installments?userId=u1')).json;
  assert.equal(list[0].effectiveDueDay, 30); // Mehr has 30 days
  assert.equal(list[0].daysUntilDue, 4);
});

// ---------- cron ----------
async function runCron() {
  await worker.scheduled({}, env, { waitUntil() {} });
}

test('cron: reminds installments that were never added to the legacy global index', async () => {
  // due day 27 -> tomorrow (27 Mehr) matches; stored only in the user key (no system_installments_index)
  kv.seed('installments_u1', [{ id: 'i1', title: 'Loan', amount: 500, dueDay: 27, dueMonth: null, recurrenceType: 'monthly', lastPaidCycle: null, lastReminderCycle: null }]);
  await runCron();
  const msgs = tg.messages();
  assert.equal(msgs.length, 1);
  assert.equal(String(msgs[0].chat_id), 'u1');
  assert.equal(msgs[0].parse_mode, 'HTML');
  assert.ok(!/(^|\s)_[^_]+_(\s|$)/.test(msgs[0].text), 'no markdown-style _italics_ in an HTML message');
  assert.equal(kv.json('installments_u1')[0].lastReminderCycle, CUR);
});

test('cron: does not remind twice, and not for paid installments', async () => {
  kv.seed('installments_u1', [
    { id: 'i1', title: 'A', amount: 5, dueDay: 27, recurrenceType: 'monthly', lastPaidCycle: null, lastReminderCycle: CUR },
    { id: 'i2', title: 'B', amount: 5, dueDay: 27, recurrenceType: 'monthly', lastPaidCycle: CUR, lastReminderCycle: null }
  ]);
  await runCron();
  assert.equal(tg.messages().length, 0);
});

test('cron: a failed Telegram send (HTTP 403) is not recorded as reminded', async () => {
  tg.restore();
  tg = stubTelegram({ failFor: ['u1'] });
  kv.seed('installments_u1', [{ id: 'i1', title: 'A', amount: 5, dueDay: 27, recurrenceType: 'monthly', lastPaidCycle: null, lastReminderCycle: null }]);
  await runCron();
  assert.equal(kv.json('installments_u1')[0].lastReminderCycle, null);
});

test('cron: day-31 installment is reminded the day before the last day of a 30-day month', async () => {
  // tomorrow = 27 Mehr in the default clock; move clock to 29 Mehr so tomorrow = 30 Mehr (last day)
  mock.timers.setTime(new Date('2026-10-21T09:00:00Z').getTime());
  kv.seed('installments_u1', [{ id: 'i1', title: 'A', amount: 5, dueDay: 31, recurrenceType: 'monthly', lastPaidCycle: null, lastReminderCycle: null }]);
  await runCron();
  assert.equal(tg.messages().length, 1);
});

test('cron: paginates through many users', async () => {
  for (let n = 0; n < 5; n++) {
    kv.seed(`installments_u${n}`, [{ id: 'i' + n, title: 'A', amount: 5, dueDay: 27, recurrenceType: 'monthly', lastPaidCycle: null, lastReminderCycle: null }]);
  }
  const origList = kv.list.bind(kv);
  kv.list = (opts = {}) => origList({ ...opts, limit: 2 });
  await runCron();
  assert.equal(tg.messages().length, 5);
});

// ---------- reports ----------
test('reports: forecast does not extrapolate lumpy income from a few days', async () => {
  // salary of 1000 on day 1 only. Old logic projected 1000/26*30 = 1154 income.
  kv.seed('user_index_u1', [CUR]);
  kv.seed('user_u1_' + CUR, [{ id: '1', type: 'income', amount: 1000, description: 's', date: '2026-09-23T09:00:00Z' }]);
  const res = await call(env, 'GET', '/api/reports?userId=u1');
  assert.equal(res.json.forecast.projectedIncome, 1000);
});

test('reports: forecast expense = spent so far + daily pace * remaining days + pending installments', async () => {
  kv.seed('user_index_u1', [CUR]);
  kv.seed('user_u1_' + CUR, [{ id: '1', type: 'expense', amount: 260, description: 'e', date: '2026-09-23T09:00:00Z' }]);
  await call(env, 'POST', '/api/installments/add', { userId: 'u1', title: 'L', amount: 100, dueDay: 28 });
  const res = await call(env, 'GET', '/api/reports?userId=u1');
  // 260 over 26 days = 10/day, 4 remaining days => 260 + 40 = 300 variable, + 100 pending installment
  assert.equal(res.json.forecast.projectedExpense, 400);
  assert.equal(res.json.forecast.pendingInstallments, 100);
});

test('reports: category breakdown for the month from #hashtag descriptions', async () => {
  kv.seed('user_index_u1', [CUR]);
  kv.seed('user_u1_' + CUR, [
    { id: '1', type: 'expense', amount: 30, description: 'Lunch #food', date: '2026-09-24T09:00:00Z' },
    { id: '2', type: 'expense', amount: 20, description: 'Taxi #transport', date: '2026-09-24T09:00:00Z' },
    { id: '3', type: 'expense', amount: 10, description: 'More #food', date: '2026-09-25T09:00:00Z' },
    { id: '4', type: 'expense', amount: 5, description: 'no category', date: '2026-09-25T09:00:00Z' }
  ]);
  const res = await call(env, 'GET', '/api/reports?userId=u1');
  assert.deepEqual(res.json.categories, [
    { id: 'food', amount: 40 },
    { id: 'transport', amount: 20 },
    { id: 'other', amount: 5 }
  ]);
});

test('reports: month totals match what the dashboard shows for the same month', async () => {
  kv.seed('user_index_u1', [CUR]);
  kv.seed('user_u1_' + CUR, [
    { id: '1', type: 'income', amount: 1000, description: 's', date: '2026-09-23T09:00:00Z' },
    { id: '2', type: 'expense', amount: 250, description: 'e', date: '2026-09-27T09:00:00Z' }
  ]);
  const res = await call(env, 'GET', '/api/dashboard?userId=u1');
  assert.equal(res.status, 200);
  assert.equal(res.json.monthStats.income, 1000);
  assert.equal(res.json.monthStats.expense, 250);
  assert.equal(res.json.summary.balance, 750);
  assert.equal(res.json.records.length, 2);
});

// ---------- dashboard aggregate endpoint ----------
test('dashboard: one call returns everything the Mini App needs, any month selectable', async () => {
  kv.seed('user_index_u1', ['1405-05', '1405-06', CUR]);
  kv.seed('user_u1_1405-05', [{ id: 'old', type: 'expense', amount: 7, description: 'old', date: '2026-08-10T09:00:00Z' }]);
  kv.seed('user_u1_' + CUR, [{ id: 'new', type: 'income', amount: 9, description: 'new', date: '2026-10-10T09:00:00Z' }]);
  const cur = (await call(env, 'GET', '/api/dashboard?userId=u1')).json;
  assert.equal(cur.month, CUR);
  assert.equal(cur.isCurrentMonth, true);
  assert.deepEqual(cur.records.map(r => r.id), ['new']);
  assert.deepEqual(cur.months, ['1405-05', '1405-06', CUR]);
  assert.ok(cur.summary && Array.isArray(cur.installments) && cur.budgets && typeof cur.streak === 'number');
  assert.equal(cur.summary.totalTx, 2);

  const old = (await call(env, 'GET', '/api/dashboard?userId=u1&month=1405-05')).json;
  assert.equal(old.isCurrentMonth, false);
  assert.deepEqual(old.records.map(r => r.id), ['old']);
  assert.equal(old.monthStats.expense, 7);
});

test('dashboard: streak counts consecutive Tehran days up to today (or yesterday)', async () => {
  kv.seed('user_index_u1', ['1405-06', CUR]);
  kv.seed('user_u1_' + CUR, [
    { id: 'a', type: 'expense', amount: 1, description: '', date: '2026-10-17T09:00:00Z' }, // 25 Mehr
    { id: 'b', type: 'expense', amount: 1, description: '', date: '2026-10-16T09:00:00Z' }  // 24 Mehr
  ]);
  kv.seed('user_u1_1405-06', [{ id: 'c', type: 'expense', amount: 1, description: '', date: '2026-09-22T09:00:00Z' }]); // gap
  const res = (await call(env, 'GET', '/api/dashboard?userId=u1')).json;
  assert.equal(res.streak, 2); // nothing logged today -> counts back from yesterday
});

test('/api/transactions reports a server failure instead of pretending the list is empty', async () => {
  const broken = { get: async () => { throw new Error('kv down'); }, put: async () => {}, list: async () => ({ keys: [], list_complete: true }) };
  const res = await call(makeEnv(broken), 'GET', '/api/transactions?userId=u1');
  assert.equal(res.status, 500);
});

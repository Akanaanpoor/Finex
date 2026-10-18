// Contract tests: the public API shapes and KV key formats used by live clients
// (Mini App, iOS Shortcuts, Telegram webhook). These must keep passing across refactors —
// they are what protects existing users' data.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryKV, makeEnv, call, stubTelegram, tgUpdate } from './helpers.mjs';

// 2026-10-18 09:00Z = 12:30 Tehran = 26 Mehr 1405 (Mehr has 30 days, Shahrivar 31)
const NOW = new Date('2026-10-18T09:00:00Z');
const CUR = '1405-07';
const PREV = '1405-06';

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

test('legacy single-array key migrates to monthly keys and is kept as backup', async () => {
  kv.seed('user_u1', [
    { id: 'a', type: 'income', amount: 100, description: 'old', date: '2026-10-10T08:00:00Z' },
    { id: 'b', type: 'expense', amount: 40, description: 'older', date: '2026-09-01T08:00:00Z' }
  ]);
  const cur = await call(env, 'GET', '/api/transactions?userId=u1');
  assert.equal(cur.status, 200);
  assert.deepEqual(cur.json.map(r => r.id), ['a']);
  assert.deepEqual(kv.json('user_index_u1'), [PREV, CUR]);
  assert.equal(kv.json('user_u1_' + PREV).length, 1);
  assert.ok(kv.map.has('user_u1'), 'legacy key must survive as rollback backup');
});

test('add -> list -> update -> delete round trip keeps documented response shapes', async () => {
  const add = await call(env, 'POST', '/api/add', { userId: 'u1', type: 'expense', amount: '1,250', description: ' Lunch ' });
  assert.equal(add.status, 200);
  assert.equal(add.json.success, true);
  assert.equal(add.json.item.amount, 1250);
  assert.equal(add.json.item.description, 'Lunch');
  assert.equal(add.json.item.type, 'expense');
  const id = add.json.item.id;

  const list = await call(env, 'GET', '/api/transactions?userId=u1');
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].id, id);
  assert.deepEqual(kv.json('user_index_u1'), [CUR]);

  const upd = await call(env, 'POST', '/api/update', { userId: 'u1', id, month: CUR, amount: '2000', description: 'Dinner', type: 'income' });
  assert.deepEqual(upd.json, { success: true });
  const after = kv.json('user_u1_' + CUR)[0];
  assert.equal(after.amount, 2000);
  assert.equal(after.type, 'income');
  assert.equal(after.description, 'Dinner');
  assert.equal(after.date, add.json.item.date, 'date must not change on update');

  const del = await call(env, 'POST', '/api/delete', { userId: 'u1', id, month: CUR });
  assert.deepEqual(del.json, { success: true });
  assert.equal(kv.json('user_u1_' + CUR).length, 0);

  const missing = await call(env, 'POST', '/api/delete', { userId: 'u1', id: 'nope', month: CUR });
  assert.equal(missing.status, 404);
});

test('delete finds a record in a neighbouring month when client month key is off by one', async () => {
  kv.seed('user_index_u1', [PREV]);
  kv.seed('user_u1_' + PREV, [{ id: 'x', type: 'expense', amount: 5, description: 'd', date: '2026-09-22T08:00:00Z' }]);
  const del = await call(env, 'POST', '/api/delete', { userId: 'u1', id: 'x', month: CUR });
  assert.equal(del.json.success, true);
});

test('iOS shortcut GET endpoint still logs a transaction', async () => {
  const res = await call(env, 'GET', '/api/shortcut?userId=u1&amount=50&desc=Coffee&type=expense');
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.equal(res.json.record.amount, 50);
  assert.equal(res.json.record.type, 'expense');
  assert.equal(kv.json('user_u1_' + CUR).length, 1);
  assert.equal(tg.messages().length, 1);

  const bad = await call(env, 'GET', '/api/shortcut?userId=u1&amount=abc');
  assert.equal(bad.status, 400);
});

test('installments: add / list enrichment / edit / delete', async () => {
  const add = await call(env, 'POST', '/api/installments/add', { userId: 'u1', title: 'Loan', amount: '5,000,000', dueDay: '28', recurrenceType: 'monthly', notes: 'n' });
  assert.equal(add.json.success, true);
  const id = add.json.item.id;
  assert.equal(add.json.item.amount, 5000000);
  assert.equal(add.json.item.lastPaidCycle, null);

  const yearly = await call(env, 'POST', '/api/installments/add', { userId: 'u1', title: 'Insurance', amount: 100, dueDay: 5, dueMonth: 3, recurrenceType: 'yearly' });
  assert.equal(yearly.json.item.dueMonth, 3);

  const list = await call(env, 'GET', '/api/installments?userId=u1');
  assert.equal(list.json.length, 2);
  const loan = list.json.find(i => i.id === id);
  assert.equal(loan.isDueThisMonth, true);
  assert.equal(loan.isPaidThisCycle, false);
  const ins = list.json.find(i => i.title === 'Insurance');
  assert.equal(ins.isDueThisMonth, false);

  const edit = await call(env, 'POST', '/api/installments/edit', { userId: 'u1', id, title: 'Loan2', amount: 6000000, dueDay: 29, recurrenceType: 'monthly' });
  assert.equal(edit.json.item.title, 'Loan2');
  assert.equal(edit.json.item.dueDay, 29);

  const del = await call(env, 'POST', '/api/installments/delete', { userId: 'u1', id });
  assert.deepEqual(del.json, { success: true });
  assert.equal((await call(env, 'GET', '/api/installments?userId=u1')).json.length, 1);
});

test('pay installment logs an expense and marks the cycle paid', async () => {
  const add = await call(env, 'POST', '/api/installments/add', { userId: 'u1', title: 'Loan', amount: 700, dueDay: 28 });
  const pay = await call(env, 'POST', '/api/installments/pay', { userId: 'u1', id: add.json.item.id });
  assert.equal(pay.json.success, true);
  assert.equal(pay.json.item.lastPaidCycle, CUR);
  assert.equal(pay.json.transaction.type, 'expense');
  assert.equal(pay.json.transaction.amount, 700);
  assert.equal(kv.json('user_u1_' + CUR).length, 1);
  const list = await call(env, 'GET', '/api/installments?userId=u1');
  assert.equal(list.json[0].isPaidThisCycle, true);
});

test('budgets round trip', async () => {
  const set = await call(env, 'POST', '/api/budgets', { userId: 'u1', limits: { food: '1,000', bills: 'x', cafe: -5 } });
  assert.deepEqual(set.json.limits, { food: 1000 });
  const get = await call(env, 'GET', '/api/budgets?userId=u1');
  assert.deepEqual(get.json, { limits: { food: 1000 } });
});

test('summary: all-time balance, pending installments, projected balance', async () => {
  kv.seed('user_index_u1', [PREV, CUR]);
  kv.seed('user_u1_' + PREV, [{ id: '1', type: 'income', amount: 1000, description: 'a', date: '2026-09-22T08:00:00Z' }]);
  kv.seed('user_u1_' + CUR, [{ id: '2', type: 'expense', amount: 300, description: 'b', date: '2026-10-10T08:00:00Z' }]);
  await call(env, 'POST', '/api/installments/add', { userId: 'u1', title: 'L', amount: 200, dueDay: 28 });
  const res = await call(env, 'GET', '/api/summary?userId=u1');
  assert.equal(res.json.income, 1000);
  assert.equal(res.json.expense, 300);
  assert.equal(res.json.balance, 700);
  assert.equal(res.json.pendingTotal, 200);
  assert.equal(res.json.projectedBalance, 500);
  assert.equal(res.json.pendingList.length, 1);
  assert.equal(res.json.currentCycle, CUR);
  assert.equal(res.json.currentMonthLabel, 'مهر');
});

test('reports: shape and daily/cumulative buckets (current vs previous month)', async () => {
  kv.seed('user_index_u1', [PREV, CUR]);
  kv.seed('user_u1_' + CUR, [
    { id: '1', type: 'income', amount: 1000, description: 'sal', date: '2026-09-23T09:00:00Z' }, // 1 Mehr
    { id: '2', type: 'expense', amount: 200, description: 'e', date: '2026-09-27T09:00:00Z' },  // 5 Mehr
    { id: '3', type: 'expense', amount: 50, description: 'e', date: '2026-09-27T10:00:00Z' }    // 5 Mehr
  ]);
  kv.seed('user_u1_' + PREV, [
    { id: '4', type: 'expense', amount: 300, description: 'e', date: '2026-09-22T09:00:00Z' }   // 31 Shahrivar
  ]);
  const res = await call(env, 'GET', '/api/reports?userId=u1');
  assert.equal(res.status, 200);
  const { currentMonth: c, previousMonth: p, forecast } = res.json;
  assert.equal(c.label, 'مهر');
  assert.equal(c.totalDays, 26);
  assert.equal(c.dailyIncome[0], 1000);
  assert.equal(c.dailyExpense[4], 250);
  assert.equal(c.cumulativeIncome[25], 1000);
  assert.equal(c.cumulativeExpense[25], 250);
  assert.equal(p.label, 'شهریور');
  assert.equal(p.totalDays, 31);
  assert.equal(p.cumulativeExpense[30], 300);
  assert.ok('projectedIncome' in forecast && 'projectedExpense' in forecast && 'projectedBalance' in forecast);
});

test('telegram: plain expense message is stored and acknowledged', async () => {
  const res = await call(env, 'POST', '/', tgUpdate('expense - 50 - Lunch', 111));
  assert.equal(res.status, 200);
  const rec = kv.json('user_111_' + CUR)[0];
  assert.equal(rec.type, 'expense');
  assert.equal(rec.amount, 50);
  assert.equal(rec.description, 'Lunch');
  assert.equal(tg.messages().length, 1);
});

test('telegram: Persian digits, income keyword and report command', async () => {
  await call(env, 'POST', '/', tgUpdate('income - ۲۵۰۰ - Salary', 111));
  const rec = kv.json('user_111_' + CUR)[0];
  assert.equal(rec.type, 'income');
  assert.equal(rec.amount, 2500);
  await call(env, 'POST', '/', tgUpdate('گزارش', 111));
  assert.match(tg.messages().at(-1).text, /گزارش مالی/);
});

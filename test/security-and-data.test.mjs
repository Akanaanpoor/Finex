// Auth (Telegram initData / webhook secret / shortcut token), data export + wipe, settings.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { MemoryKV, makeEnv, call, stubTelegram, tgUpdate, worker } from './helpers.mjs';

const NOW = new Date('2026-10-18T09:00:00Z');
const CUR = '1405-07';
const TOKEN = '123456:TEST_TOKEN';

// Independent implementation of Telegram's signing algorithm (does not reuse src/lib.js).
function signInitData(user, { authDate = Math.floor(NOW.getTime() / 1000), token = TOKEN, tamper = false } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAH', user: JSON.stringify(user) });
  const dcs = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  params.set('hash', tamper ? hash.replace(/.$/, c => (c === '0' ? '1' : '0')) : hash);
  return params.toString();
}
const auth = (userId, opts) => ({ 'X-Telegram-Init-Data': signInitData({ id: Number(userId), first_name: 'T' }, opts) });

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

function seedUser(uid, extra = {}) {
  kv.seed(`user_index_${uid}`, [CUR]);
  kv.seed(`user_${uid}_${CUR}`, [{ id: 't' + uid, type: 'expense', amount: 10, description: 'x', date: '2026-10-10T09:00:00Z' }]);
  kv.seed(`installments_${uid}`, [{ id: 'i' + uid, title: 'L', amount: 5, dueDay: 28, recurrenceType: 'monthly', lastPaidCycle: null, lastReminderCycle: null }]);
  kv.seed(`budgets_${uid}`, { food: 100 });
  kv.seed(`settings_${uid}`, { currency: 'usd' });
  Object.entries(extra).forEach(([k, v]) => kv.seed(k, v));
}

// ---------- initData authentication ----------

test('wipe: rejects missing, forged, tampered and expired sessions', async () => {
  seedUser('111');
  const body = { scope: 'all', confirm: 'DELETE' };
  assert.equal((await call(env, 'POST', '/api/data/delete', { ...body, userId: '111' })).status, 401, 'userId in body alone is not enough');
  assert.equal((await call(env, 'POST', '/api/data/delete', body, auth(111, { tamper: true }))).status, 401);
  assert.equal((await call(env, 'POST', '/api/data/delete', body, auth(111, { token: 'other:token' }))).status, 401);
  const old = Math.floor(NOW.getTime() / 1000) - 4 * 86400;
  assert.equal((await call(env, 'POST', '/api/data/delete', body, auth(111, { authDate: old }))).status, 401);
  assert.ok(kv.map.has('installments_111'), 'nothing may be deleted by rejected requests');
});

test('wipe: a verified session for user A cannot target user B', async () => {
  seedUser('111');
  seedUser('222');
  const res = await call(env, 'POST', '/api/data/delete', { scope: 'all', confirm: 'DELETE', userId: '222' }, auth(111));
  assert.equal(res.status, 403);
  assert.ok(kv.map.has('installments_222'));
});

test('wipe: requires a valid scope and the literal confirmation', async () => {
  seedUser('111');
  assert.equal((await call(env, 'POST', '/api/data/delete', { scope: 'everything', confirm: 'DELETE' }, auth(111))).status, 400);
  assert.equal((await call(env, 'POST', '/api/data/delete', { scope: 'all' }, auth(111))).status, 400);
  assert.equal((await call(env, 'POST', '/api/data/delete', { scope: 'all', confirm: 'yes' }, auth(111))).status, 400);
  assert.ok(kv.map.has('installments_111'));
});

// ---------- wipe behaviour ----------

test('wipe all: removes every key of that user and never touches other users (incl. id-prefix lookalikes)', async () => {
  seedUser('111');
  seedUser('1111');     // "user_111" is a string prefix of "user_1111"
  seedUser('11');
  kv.seed('user_111', [{ id: 'legacy', type: 'income', amount: 1, description: '', date: '2026-10-01T09:00:00Z' }]);
  kv.seed('system_all_users', ['111', '1111']);
  kv.seed('system_installments_index', [{ userId: '111', id: 'i111' }, { userId: '1111', id: 'i1111' }]);

  const res = await call(env, 'POST', '/api/data/delete', { scope: 'all', confirm: 'DELETE' }, auth(111));
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);

  assert.deepEqual(kv.keys().filter(k => /_111($|_)|^user_111$/.test(k) && !/1111/.test(k)), []);
  for (const other of ['1111', '11']) {
    assert.ok(kv.map.has(`user_${other}_${CUR}`), `${other} transactions intact`);
    assert.ok(kv.map.has(`user_index_${other}`));
    assert.ok(kv.map.has(`installments_${other}`));
    assert.ok(kv.map.has(`budgets_${other}`));
    assert.ok(kv.map.has(`settings_${other}`));
  }
  assert.deepEqual(kv.json('system_all_users'), ['1111']);
  assert.deepEqual(kv.json('system_installments_index').map(e => e.userId), ['1111']);
});

test('wipe: legacy backup key is deleted so migration cannot resurrect wiped data', async () => {
  kv.seed('user_111', [{ id: 'old', type: 'income', amount: 500, description: 'legacy', date: '2026-10-10T09:00:00Z' }]);
  let dash = (await call(env, 'GET', '/api/dashboard?userId=111')).json; // triggers migration
  assert.equal(dash.records.length, 1);

  await call(env, 'POST', '/api/data/delete', { scope: 'transactions', confirm: 'DELETE' }, auth(111));
  assert.ok(!kv.map.has('user_111'), 'legacy key gone');
  dash = (await call(env, 'GET', '/api/dashboard?userId=111')).json;
  assert.equal(dash.records.length, 0);
  assert.equal(dash.summary.totalTx, 0);
  assert.equal(dash.summary.balance, 0);
});

test('wipe by scope only removes that scope', async () => {
  seedUser('111');
  await call(env, 'POST', '/api/data/delete', { scope: 'installments', confirm: 'DELETE' }, auth(111));
  assert.ok(!kv.map.has('installments_111'));
  assert.ok(kv.map.has(`user_111_${CUR}`) && kv.map.has('budgets_111'));

  await call(env, 'POST', '/api/data/delete', { scope: 'budgets', confirm: 'DELETE' }, auth(111));
  assert.ok(!kv.map.has('budgets_111'));
  assert.ok(kv.map.has(`user_111_${CUR}`));

  await call(env, 'POST', '/api/data/delete', { scope: 'transactions', confirm: 'DELETE' }, auth(111));
  assert.ok(!kv.map.has(`user_111_${CUR}`));
  assert.deepEqual(kv.json('user_index_111'), []);
  // user can immediately start fresh
  const add = await call(env, 'POST', '/api/add', { userId: '111', type: 'income', amount: 5, description: 'again' });
  assert.equal(add.json.success, true);
  assert.deepEqual(kv.json('user_index_111'), [CUR]);
});

test('wipe is idempotent and works for a user with no data', async () => {
  const a = await call(env, 'POST', '/api/data/delete', { scope: 'all', confirm: 'DELETE' }, auth(333));
  const b = await call(env, 'POST', '/api/data/delete', { scope: 'all', confirm: 'DELETE' }, auth(333));
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
});

test('wipe also finds month keys that are missing from the index', async () => {
  kv.seed('user_index_111', [CUR]);
  kv.seed(`user_111_${CUR}`, [{ id: 'a', type: 'expense', amount: 1, description: '', date: '2026-10-10T09:00:00Z' }]);
  kv.seed('user_111_1405-01', [{ id: 'b', type: 'expense', amount: 1, description: '', date: '2026-04-10T09:00:00Z' }]); // not indexed
  await call(env, 'POST', '/api/data/delete', { scope: 'transactions', confirm: 'DELETE' }, auth(111));
  assert.equal(kv.keys('user_111_').length, 0);
});

// ---------- ENFORCE_AUTH ----------

test('ENFORCE_AUTH=1 blocks unauthenticated API calls and scopes verified calls to the signed-in user', async () => {
  seedUser('111');
  seedUser('222');
  env = makeEnv(kv, { ENFORCE_AUTH: '1' });
  assert.equal((await call(env, 'GET', '/api/dashboard?userId=111')).status, 401);
  assert.equal((await call(env, 'POST', '/api/add', { userId: '111', amount: 5 })).status, 401);
  const ok = await call(env, 'GET', '/api/dashboard', undefined, auth(111));
  assert.equal(ok.status, 200);
  assert.equal(ok.json.records[0].id, 't111');
  assert.equal((await call(env, 'GET', '/api/dashboard?userId=222', undefined, auth(111))).status, 403);
});

test('legacy clients without initData still work when auth is not enforced (rollout safety)', async () => {
  seedUser('111');
  assert.equal((await call(env, 'GET', '/api/dashboard?userId=111')).status, 200);
  // but a *bad* signature is never accepted
  assert.equal((await call(env, 'GET', '/api/dashboard?userId=111', undefined, auth(111, { tamper: true }))).status, 401);
});

test('invalid userId formats are rejected before touching KV', async () => {
  const res = await call(env, 'POST', '/api/add', { userId: 'index', amount: 5 });
  assert.equal(res.status, 200); // "index" is a syntactically valid id; it only reaches its own keys
  const bad = await call(env, 'POST', '/api/add', { userId: 'a b/../c', amount: 5 });
  assert.equal(bad.status, 400);
});

// ---------- export ----------

test('export sends backup JSON + CSV to the verified user only', async () => {
  seedUser('111');
  const res = await call(env, 'POST', '/api/data/export', {}, auth(111));
  assert.equal(res.status, 200);
  const docs = tg.filter(c => c.url.endsWith('/sendDocument'));
  assert.equal(docs.length, 2);
  for (const d of docs) assert.equal(d.body.get('chat_id'), '111');
  const names = docs.map(d => d.body.get('document').name);
  assert.ok(names.some(n => n.endsWith('.json')) && names.some(n => n.endsWith('.csv')));
  const backup = JSON.parse(await docs.find(d => d.body.get('document').name.endsWith('.json')).body.get('document').text());
  assert.equal(backup.transactions.length, 1);
  assert.equal(backup.installments.length, 1);
  assert.deepEqual(backup.budgets, { food: 100 });
  const csv = await docs.find(d => d.body.get('document').name.endsWith('.csv')).body.get('document').text();
  assert.match(csv, /id,date,jalali_date,type,amount,category,description/);
  assert.match(csv, /1405-07-18/);

  assert.equal((await call(env, 'POST', '/api/data/export', { userId: '111' })).status, 401);
});

// ---------- webhook secret ----------

test('webhook secret: enforced only when WEBHOOK_SECRET is set', async () => {
  const open = await call(env, 'POST', '/', tgUpdate('expense 5 a', 111));
  assert.equal(open.status, 200);

  env = makeEnv(kv, { WEBHOOK_SECRET: 's3cret' });
  const forged = await call(env, 'POST', '/', tgUpdate('expense 7 forged', 111));
  assert.equal(forged.status, 403);
  const wrong = await call(env, 'POST', '/', tgUpdate('expense 7 forged', 111), { 'X-Telegram-Bot-Api-Secret-Token': 'nope' });
  assert.equal(wrong.status, 403);
  const good = await call(env, 'POST', '/', tgUpdate('expense 9 real', 111), { 'X-Telegram-Bot-Api-Secret-Token': 's3cret' });
  assert.equal(good.status, 200);
  const descs = kv.json(`user_111_${CUR}`).map(r => r.description);
  assert.ok(descs.includes('real') && !descs.includes('forged'));
});

test('set-webhook registers the secret token when configured', async () => {
  env = makeEnv(kv, { WEBHOOK_SECRET: 's3cret' });
  const res = await call(env, 'GET', '/set-webhook');
  assert.equal(res.json.status, 'SUCCESS');
  assert.match(tg[0].url, /secret_token=s3cret/);
  assert.match(tg[0].url, /url=https%3A%2F%2Fworker\.test%2F/);
});

// ---------- chat commands ----------

test('chat /deletedata is disabled without WEBHOOK_SECRET and never deletes', async () => {
  seedUser('111');
  await call(env, 'POST', '/', tgUpdate('/deletedata confirm', 111));
  assert.ok(kv.map.has(`user_111_${CUR}`));
  assert.match(tg.messages().at(-1).text, /مینی‌اپ/);
});

test('chat /deletedata asks first, then deletes on confirm (authenticated webhook)', async () => {
  seedUser('111');
  seedUser('222');
  env = makeEnv(kv, { WEBHOOK_SECRET: 's' });
  const h = { 'X-Telegram-Bot-Api-Secret-Token': 's' };
  await call(env, 'POST', '/', tgUpdate('/deletedata', 111), h);
  assert.ok(kv.map.has(`user_111_${CUR}`), 'no deletion before confirmation');
  assert.match(tg.messages().at(-1).text, /deletedata confirm/);
  await call(env, 'POST', '/', tgUpdate('/deletedata confirm', 111), h);
  assert.ok(!kv.map.has(`user_111_${CUR}`));
  assert.ok(kv.map.has(`user_222_${CUR}`));
});

test('chat /export sends the files to the chat', async () => {
  seedUser('111');
  await call(env, 'POST', '/', tgUpdate('/export', 111));
  assert.equal(tg.filter(c => c.url.endsWith('/sendDocument')).length, 2);
});

// ---------- shortcut token ----------

test('shortcut: token enforced only when SHORTCUT_SECRET is configured; /shortcut gives the personal link', async () => {
  assert.equal((await call(env, 'GET', '/api/shortcut?userId=111&amount=5')).status, 200);

  env = makeEnv(kv, { SHORTCUT_SECRET: 'abc' });
  assert.equal((await call(env, 'GET', '/api/shortcut?userId=111&amount=5')).status, 403);
  assert.equal((await call(env, 'GET', '/api/shortcut?userId=111&amount=5&token=bad')).status, 403);

  await call(env, 'POST', '/', tgUpdate('/shortcut', 111));
  const link = tg.messages().at(-1).text.match(/token=([0-9a-f]{24})/);
  assert.ok(link, 'bot sends a tokenised link');
  assert.equal((await call(env, 'GET', `/api/shortcut?userId=111&amount=5&token=${link[1]}`)).status, 200);
  assert.equal((await call(env, 'GET', `/api/shortcut?userId=222&amount=5&token=${link[1]}`)).status, 403, 'token is bound to the user');
});

// ---------- settings / currency ----------

test('settings: default toman, switchable to usd, reflected in bot messages and dashboard', async () => {
  assert.equal((await call(env, 'GET', '/api/settings?userId=111')).json.currency, 'toman');
  await call(env, 'POST', '/', tgUpdate('expense 50 lunch', 111));
  assert.match(tg.messages().at(-1).text, /تومان/);

  const set = await call(env, 'POST', '/api/settings', { userId: '111', settings: { currency: 'usd' } });
  assert.equal(set.json.settings.currency, 'usd');
  await call(env, 'POST', '/', tgUpdate('expense 50 lunch', 111));
  assert.match(tg.messages().at(-1).text, /\$50/);
  assert.equal((await call(env, 'GET', '/api/dashboard?userId=111')).json.settings.currency, 'usd');

  const junk = await call(env, 'POST', '/api/settings', { userId: '111', settings: { currency: 'bitcoin', evil: 1 } });
  assert.deepEqual(junk.json.settings, { currency: 'toman' });
});

// ---------- cron snapshot (rollback aid) ----------

test('cron refreshes system_installments_index so a rollback to the old reader still works', async () => {
  kv.seed('installments_u1', [{ id: 'i1', title: 'A', amount: 5, dueDay: 27, dueMonth: null, recurrenceType: 'monthly', lastPaidCycle: null, lastReminderCycle: null }]);
  await worker.scheduled({}, env, { waitUntil() {} });
  const snap = kv.json('system_installments_index');
  assert.equal(snap.length, 1);
  assert.deepEqual(Object.keys(snap[0]).sort(), ['amount', 'dueDay', 'dueMonth', 'id', 'lastPaidCycle', 'lastReminderCycle', 'recurrenceType', 'title', 'userId']);
  assert.equal(snap[0].lastReminderCycle, CUR);
});

// ---------- front-end shell ----------

test('/app serves the Mini App with the base url injected and no stale cache', async () => {
  const res = await worker.fetch(new Request('https://worker.test/app'), env);
  const html = await res.text();
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes("const BASE_URL = 'https://worker.test';"));
  assert.ok(!html.includes('__BASE_URL__'));
});

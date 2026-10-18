// Local playground: runs the real Worker against an in-memory KV with sample data, no Cloudflare account needed.
//   npm run dev:mock      then open the signed URL it prints (it simulates a Telegram Mini App session).
// Telegram API calls are stubbed (printed, never sent). Nothing here touches production data.
import http from 'node:http';
import { createHmac } from 'node:crypto';
import worker from '../src/index.js';
import { appendTransaction, writeInstallments, newId, KEYS } from '../src/lib.js';
import { MemoryKV } from './helpers.mjs';

const PORT = Number(process.env.PORT || 8787);
const TOKEN = '123456:DEV_TOKEN';
const USER = { id: 777000111, first_name: 'Aref' };

const kv = new MemoryKV();
const env = { PERSONALFIN: kv, TELEGRAM_BOT_TOKEN: TOKEN };

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.telegram.org/')) {
    const what = String(url).split('/').pop().split('?')[0];
    console.log(`[telegram stub] ${what}`, init && typeof init.body === 'string' ? init.body.slice(0, 160) : '(multipart)');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
  return realFetch(url, init);
};

async function seed() {
  const uid = String(USER.id);
  const day = 86400000;
  const now = Date.now();
  const samples = [
    // this month
    [0, 'income', 45000000, 'Salary #salary'], [1, 'expense', 1200000, 'Lunch #food'], [2, 'expense', 350000, 'Taxi #transport'],
    [3, 'expense', 980000, 'Groceries #food'], [5, 'expense', 2400000, 'Electricity bill #bills'], [6, 'expense', 150000, 'Coffee #cafe'],
    [8, 'income', 3000000, 'Freelance gig'], [9, 'expense', 6500000, 'Shopping Mall #shopping'], [11, 'expense', 420000, 'Parking'],
    // last month
    [33, 'income', 45000000, 'Salary #salary'], [35, 'expense', 5200000, 'Rent share'], [40, 'expense', 1800000, 'Dinner out #food'],
    [48, 'expense', 800000, 'Internet #bills'],
    // two months ago
    [62, 'income', 42000000, 'Salary #salary'], [70, 'expense', 9000000, 'Phone repair'], [80, 'expense', 1100000, 'Gym #health']
  ];
  for (const [ago, type, amount, description] of samples) {
    await appendTransaction(kv, uid, { id: newId(), type, amount, description, date: new Date(now - ago * day).toISOString() });
  }
  const today = new Intl.DateTimeFormat('en-US-u-ca-persian', { day: 'numeric', timeZone: 'Asia/Tehran' }).formatToParts(new Date()).find(p => p.type === 'day').value;
  const d = parseInt(today, 10);
  await writeInstallments(kv, uid, [
    { id: newId(), title: 'Bank loan', amount: 8000000, dueDay: Math.max(1, d - 3), dueMonth: null, recurrenceType: 'monthly', notes: 'acct 1234', lastPaidCycle: null, lastReminderCycle: null },
    { id: newId(), title: 'Phone installment', amount: 3500000, dueDay: Math.min(31, d + 2), dueMonth: null, recurrenceType: 'monthly', notes: '', lastPaidCycle: null, lastReminderCycle: null },
    { id: newId(), title: 'Car insurance', amount: 20000000, dueDay: 5, dueMonth: 1, recurrenceType: 'yearly', notes: '', lastPaidCycle: null, lastReminderCycle: null },
    { id: newId(), title: 'Gym', amount: 900000, dueDay: Math.min(31, d + 9), dueMonth: null, recurrenceType: 'monthly', notes: '', lastPaidCycle: null, lastReminderCycle: null }
  ]);
  await kv.put(KEYS.budgets(uid), JSON.stringify({ food: 4000000, shopping: 5000000, cafe: 100000 }));
}

function signedInitData() {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAHdev', user: JSON.stringify(USER) });
  const dcs = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(dcs).digest('hex'));
  return params.toString();
}

await seed();

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
  });
  const response = await worker.fetch(request, env, { waitUntil(p) { p.catch(() => {}); } });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => {
  const hash = new URLSearchParams({ tgWebAppData: signedInitData(), tgWebAppVersion: '7.0', tgWebAppPlatform: 'web' });
  console.log(`\nMini App (simulated Telegram session):\n  http://localhost:${PORT}/app#${hash.toString()}\n`);
  console.log(`Plain browser (no session; export/delete disabled):\n  http://localhost:${PORT}/app?uid=${USER.id}\n`);
});

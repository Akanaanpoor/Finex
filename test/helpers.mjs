// Shared helpers for the node:test suite. No dependencies — run with `npm test`.
import worker from '../src/index.js';

// Minimal in-memory stand-in for a Workers KV namespace (get/put/delete/list with prefix + cursor).
export class MemoryKV {
  constructor() {
    this.map = new Map();
    this.ops = { get: 0, put: 0, delete: 0, list: 0 };
  }
  async get(key) {
    this.ops.get++;
    return this.map.has(key) ? this.map.get(key) : null;
  }
  async put(key, value) {
    this.ops.put++;
    this.map.set(key, String(value));
  }
  async delete(key) {
    this.ops.delete++;
    this.map.delete(key);
  }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    this.ops.list++;
    const all = [...this.map.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? parseInt(cursor, 10) : 0;
    const slice = all.slice(start, start + limit);
    const done = start + limit >= all.length;
    return {
      keys: slice.map(name => ({ name })),
      list_complete: done,
      cursor: done ? undefined : String(start + limit)
    };
  }
  // test convenience
  seed(key, value) {
    this.map.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  json(key) {
    return this.map.has(key) ? JSON.parse(this.map.get(key)) : null;
  }
  keys(prefix = '') {
    return [...this.map.keys()].filter(k => k.startsWith(prefix)).sort();
  }
}

export function makeEnv(kv, extra = {}) {
  return { PERSONALFIN: kv, TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN', ...extra };
}

export async function call(env, method, path, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await worker.fetch(new Request('https://worker.test' + path, init), env);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { status: res.status, json, text };
}

// Replace global fetch with a recorder that answers like the Telegram API.
export function stubTelegram({ failFor = [] } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const entry = { url: String(url), method: (init && init.method) || 'GET', body: init && init.body };
    if (typeof entry.body === 'string') {
      try { entry.json = JSON.parse(entry.body); } catch (e) { /* ignore */ }
    }
    calls.push(entry);
    const failed = entry.json && failFor.includes(String(entry.json.chat_id));
    return new Response(JSON.stringify({ ok: !failed }), { status: failed ? 403 : 200 });
  };
  calls.restore = () => { globalThis.fetch = original; };
  calls.messages = () => calls.filter(c => c.url.endsWith('/sendMessage')).map(c => c.json);
  return calls;
}

export function tgUpdate(text, userId = 111, extra = {}) {
  return { update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, text, from: { id: userId }, chat: { id: userId }, ...extra } };
}

export { worker };

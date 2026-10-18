import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTransaction, parseAmount, daysInPersianMonth, isPersianLeapYear, toPersianDate } from '../src/lib.js';

const cases = [
  // [input, type, amount, description]
  ['expense - 50 - Lunch', 'expense', 50, 'Lunch'],
  ['income - 2500 - Salary', 'income', 2500, 'Salary'],
  ['expense - 50 - Shopping', 'expense', 50, 'Shopping'],
  ['exp 20 Internet', 'expense', 20, 'Internet'],
  ['Lunch 50', 'expense', 50, 'Lunch'],
  ['40 Princess cake', 'expense', 40, 'Princess cake'],
  ['inc 100 bonus', 'income', 100, 'bonus'],
  ['in - 10 - refund', 'income', 10, 'refund'],
  ['input- 1000- Shopping', 'income', 1000, 'Shopping'],
  ['+500 gift', 'income', 500, 'gift'],
  ['-500 taxi', 'expense', 500, 'taxi'],
  ['income - 1,500,000 - Salary', 'income', 1500000, 'Salary'],
  ['واریز ۱۰۰۰ حقوق', 'income', 1000, 'حقوق'],
  ['درآمد 300 پروژه', 'income', 300, 'پروژه'],
  ['خرج ۲۵۰ ناهار', 'expense', 250, 'ناهار'],
  ['قهوه ۵۰ هزار', 'expense', 50000, 'قهوه'],
  ['اجاره ۲ میلیون تومان', 'expense', 2000000, 'اجاره'],
  ['30k lunch', 'expense', 30000, 'lunch'],
  ['5 kg rice', 'expense', 5, 'kg rice'],
  ['expense 12.5 snack', 'expense', 12.5, 'snack'],
  ['expense - 50 - Coca-Cola #cafe', 'expense', 50, 'Coca-Cola #cafe']
];

for (const [input, type, amount, description] of cases) {
  test(`parseTransaction: ${input}`, () => {
    const r = parseTransaction(input);
    assert.ok(r, 'should parse');
    assert.equal(r.type, type);
    assert.equal(r.amount, amount);
    assert.equal(r.description, description);
  });
}

test('parseTransaction: no number or zero amount is rejected', () => {
  assert.equal(parseTransaction('hello there'), null);
  assert.equal(parseTransaction('expense 0 nothing'), null);
});

test('parseTransaction: empty description gets a default', () => {
  assert.equal(parseTransaction('income 100').description, 'Income');
  assert.equal(parseTransaction('expense 100').description, 'Expense');
});

test('parseAmount: accepts separators and digits in several scripts, rejects junk', () => {
  assert.equal(parseAmount('1,250'), 1250);
  assert.equal(parseAmount('۱۲٬۵۰۰'), 12500);
  assert.equal(parseAmount('١٢٣'), 123);
  assert.equal(parseAmount(7), 7);
  for (const bad of ['', 'abc', '-5', '0', '1e5', null, undefined, '12abc', 1e14]) assert.equal(parseAmount(bad), null, String(bad));
});

test('daysInPersianMonth agrees with the Intl Persian calendar', () => {
  const fmt = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Tehran' });
  const maxDay = new Map();
  for (let d = new Date('2000-04-01T12:00:00Z'); d < new Date('2060-01-01T12:00:00Z'); d = new Date(d.getTime() + 86400000)) {
    const p = toPersianDate(d);
    const k = p.year + '-' + p.month;
    maxDay.set(k, Math.max(maxDay.get(k) || 0, p.day));
  }
  for (const [k, max] of maxDay) {
    const [y, m] = k.split('-').map(Number);
    if (y === 1379 || y === 1438) continue; // partial boundary years
    assert.equal(daysInPersianMonth(y, m), max, k);
  }
  assert.equal(isPersianLeapYear(1403), true);
  assert.equal(isPersianLeapYear(1404), false);
  assert.equal(isPersianLeapYear(1408), true);
});

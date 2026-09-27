import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, redactString, redactValue } from '../src/logger.js';

function capture() {
  const lines = [];
  return {
    stream: { write: (s) => lines.push(s) },
    lines,
    parse: () => lines.map((l) => JSON.parse(l)),
  };
}

test('U-LOG-01: menyamarkan pola token Telegram', () => {
  const token = '123456789:AAabcdefghijklmnopqrstuvwxyz0123456789';
  const out = redactString(`token=${token}`);
  assert.ok(!out.includes(token));
  assert.ok(out.includes('[REDACTED]'));
});

test('U-LOG-02: menyamarkan secret terdaftar', () => {
  const secret = 'supersecretvalue123';
  const out = redactString(`key=${secret}`, [secret]);
  assert.ok(!out.includes(secret));
});

test('U-LOG-03: menyamarkan JWT (Supabase key)', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.abc123DEF456';
  const out = redactString(`key=${jwt}`);
  assert.ok(!out.includes(jwt));
});

test('U-LOG-04: redactValue rekursif pada objek & error', () => {
  const secret = 'my-secret-token';
  const val = redactValue({ a: secret, nested: { b: `x${secret}y` }, err: new Error(`boom ${secret}`) }, [secret]);
  assert.equal(val.a, '[REDACTED]');
  assert.ok(!JSON.stringify(val).includes(secret));
});

test('U-LOG-05: level threshold menyaring debug', () => {
  const cap = capture();
  const log = createLogger({ level: 'warn', stream: cap.stream });
  log.debug('debug msg');
  log.info('info msg');
  log.warn('warn msg');
  log.error('error msg', { k: 'v' });
  const parsed = cap.parse();
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].level, 'warn');
  assert.equal(parsed[1].level, 'error');
});

test('U-LOG-06: output adalah JSON per baris dengan timestamp', () => {
  const cap = capture();
  const log = createLogger({ level: 'info', stream: cap.stream });
  log.info('halo', { n: 1 });
  const entry = cap.parse()[0];
  assert.equal(entry.msg, 'halo');
  assert.deepEqual(entry.meta, { n: 1 });
  assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T/);
});

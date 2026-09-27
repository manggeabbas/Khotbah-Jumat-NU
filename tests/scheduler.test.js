import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler, buildExpression } from '../src/scheduler/scheduler.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

function fakeCron({ valid = true } = {}) {
  return {
    fn: null,
    scheduled: 0,
    validate: () => valid,
    schedule(expr, fn) {
      this.scheduled++;
      this.expr = expr;
      this.fn = fn;
      return { stop() {}, destroy() {} };
    },
  };
}

test('buildExpression: interval 6 jam', () => {
  assert.equal(buildExpression(6), '0 */6 * * *');
  assert.equal(buildExpression(0), '0 */6 * * *'); // fallback default
});

test('S-SCHED-01: start idempoten, stop menonaktifkan', () => {
  const cron = fakeCron();
  const s = createScheduler({ config: { scraper: { intervalHours: 6 } }, logger: silentLogger, runSync: async () => {}, cronImpl: cron });
  s.start();
  s.start();
  assert.equal(cron.scheduled, 1);
  assert.equal(s.running, true);
  s.stop();
  assert.equal(s.running, false);
});

test('S-SCHED-02: tugas menjalankan runSync', async () => {
  const cron = fakeCron();
  let ran = 0;
  const s = createScheduler({ config: { scraper: { intervalHours: 6 } }, logger: silentLogger, runSync: async () => { ran++; }, cronImpl: cron });
  s.start();
  await cron.fn();
  assert.equal(ran, 1);
});

test('S-SCHED-03: error runSync tidak menjatuhkan scheduler', async () => {
  const cron = fakeCron();
  const s = createScheduler({ config: { scraper: { intervalHours: 6 } }, logger: silentLogger, runSync: async () => { throw new Error('boom'); }, cronImpl: cron });
  s.start();
  await assert.doesNotReject(() => cron.fn());
});

test('S-SCHED-04: ekspresi tidak valid -> tidak dijadwalkan', () => {
  const cron = fakeCron({ valid: false });
  const s = createScheduler({ config: { scraper: { intervalHours: 6 } }, logger: silentLogger, runSync: async () => {}, cronImpl: cron });
  s.start();
  assert.equal(cron.scheduled, 0);
  assert.equal(s.running, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseArticle, parseListing } from '../src/scraper/parser.js';
import { cleanHtmlBody } from '../src/scraper/cleaner.js';
import { createFetchClient } from '../src/scraper/fetchClient.js';
import { createSyncService } from '../src/scraper/sync.js';
import { ScraperError } from '../src/utils/errors.js';
import { loadConfig } from '../src/config.js';
import { createMemoryStore } from '../src/database/memoryStore.js';
import { createRepositories } from '../src/database/repositories.js';
import { createPdfService } from '../src/pdf/generator.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };
const OUT = path.join(process.cwd(), 'tmp', 'hardening-pdf');

test('H-HTML-01: HTML rusak/aneh tidak melempar', () => {
  assert.doesNotThrow(() => parseArticle('<html><body><h1>X', 'https://x/y'));
  assert.doesNotThrow(() => parseArticle('', 'https://x/y'));
  assert.doesNotThrow(() => parseListing('<<<>>>', 'https://x'));
  assert.doesNotThrow(() => cleanHtmlBody('<p>a<p>b</p><div><span>c'));
});

test('H-INPUT-01: query ekstrem tidak melempar', async () => {
  const { createSearchService } = await import('../src/search/search.js');
  const repos = createRepositories(createMemoryStore());
  const svc = createSearchService({ repos, config: { search: { maxResults: 8 } } });
  await assert.doesNotReject(() => svc.search({ query: 'a'.repeat(10000) }));
  await assert.doesNotReject(() => svc.search({ query: '🕌🕌🕌🔥' }));
  await assert.doesNotReject(() => svc.search({ query: '!!!@@@###' }));
});

test('H-ENV-01: env tidak valid -> ConfigError jelas (bukan crash)', () => {
  assert.throws(() => loadConfig({ SCRAPE_INTERVAL_HOURS: 'x' }), /SCRAPE_INTERVAL_HOURS/);
  assert.throws(() => loadConfig({ LOG_LEVEL: 'ngawur' }), /LOG_LEVEL/);
});

test('H-RATE-01: rate limiting memakai jeda antar permintaan', async () => {
  const sleeps = [];
  let calls = 0;
  const client = createFetchClient({
    fetchImpl: async () => {
      calls++;
      return { status: 200, ok: true, text: async () => 'ok' };
    },
    sleepImpl: async (ms) => sleeps.push(ms),
    requestDelayMs: 100,
    maxRetries: 0,
  });
  await client.getText('https://x/1');
  await client.getText('https://x/2');
  await client.getText('https://x/3');
  assert.equal(calls, 3);
  assert.ok(sleeps.length >= 2, 'harus ada jeda');
  assert.ok(sleeps.every((ms) => ms > 0 && ms <= 100));
});

test('H-OFFLINE-01: sumber offline -> retry lalu ScraperError', async () => {
  let calls = 0;
  const client = createFetchClient({
    fetchImpl: async () => {
      calls++;
      throw new Error('ECONNRESET');
    },
    sleepImpl: async () => {},
    requestDelayMs: 0,
    maxRetries: 2,
  });
  await assert.rejects(() => client.getText('https://x'), ScraperError);
  assert.equal(calls, 3); // 1 awal + 2 retry
});

test('H-SYNC-01: sumber offline -> sync status failed tanpa throw', async () => {
  const repos = createRepositories(createMemoryStore());
  const config = { scraper: { source: { baseUrl: 'https://x', listPath: '/khutbah' }, maxListingPages: 1, maxArticles: 10 }, content: { fullContentEnabled: false, snippetMaxLength: 400 } };
  const scraper = {
    async discover() {
      throw new ScraperError('offline');
    },
  };
  const sync = createSyncService({ repos, config, scraper });
  const res = await sync.run();
  assert.equal(res.status, 'failed');
  const last = await repos.syncLogs.last();
  assert.equal(last.status, 'failed');
});

test('H-PDF-01: konten sangat panjang tidak melempar', async () => {
  const svc = createPdfService({ config: {}, logger: silentLogger, outputDir: OUT });
  const huge = Array.from({ length: 800 }, (_, i) => `Paragraf ${i} ` + 'kata '.repeat(40)).join('\n\n');
  const { path: file } = await svc.generate({ title: 'x'.repeat(300), content: huge, url: 'https://x' });
  assert.ok(fs.existsSync(file));
  assert.ok(fs.statSync(file).size > 1000);
  await svc.cleanup(file);
  fs.rmSync(OUT, { recursive: true, force: true });
});

test('H-SECRET-01: logger menyamarkan rahasia bertingkat', async () => {
  const { createLogger } = await import('../src/logger.js');
  const secret = '123456789:AAsecrettokenvalue000000000000000000';
  const lines = [];
  const log = createLogger({ level: 'info', secrets: [secret], stream: { write: (s) => lines.push(s) } });
  log.info('pesan', { nested: { deep: [secret, `prefix-${secret}`] } });
  const joined = lines.join('');
  assert.ok(!joined.includes(secret));
  assert.ok(joined.includes('[REDACTED]'));
});

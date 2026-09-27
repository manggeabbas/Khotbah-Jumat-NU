import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, findConfigProblems, parseBool, SOURCE } from '../src/config.js';
import { ConfigError } from '../src/utils/errors.js';

const FULL_ENV = {
  BOT_TOKEN: '123456789:AAabcdefghijklmnopqrstuvwxyz0123456789',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
  ADMIN_TELEGRAM_ID: '111,222',
};

test('U-CONF-01: env lengkap valid terparse', () => {
  const cfg = loadConfig(FULL_ENV, { requireSecrets: true });
  assert.equal(cfg.telegram.token, FULL_ENV.BOT_TOKEN);
  assert.equal(cfg.supabase.url, FULL_ENV.SUPABASE_URL);
  assert.equal(cfg.supabase.keyType, 'service_role');
  assert.deepEqual(cfg.admin.telegramIds, ['111', '222']);
  assert.equal(cfg.scraper.source.name, 'NU Online');
});

test('U-CONF-03: nilai default diterapkan', () => {
  const cfg = loadConfig({}, { requireSecrets: false });
  assert.equal(cfg.search.maxResults, 8);
  assert.equal(cfg.history.max, 50);
  assert.equal(cfg.scraper.intervalHours, 6);
  assert.equal(cfg.content.fullContentEnabled, false);
  assert.equal(cfg.content.snippetMaxLength, 400);
  assert.equal(cfg.logging.level, 'info');
});

test('U-CONF-02: env kosong + requireSecrets -> ConfigError jelas', () => {
  assert.throws(
    () => loadConfig({}, { requireSecrets: true }),
    (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /BOT_TOKEN/);
      assert.match(err.message, /SUPABASE_URL/);
      return true;
    },
  );
});

test('U-CONF-04: angka tidak valid -> ConfigError', () => {
  assert.throws(() => loadConfig({ MAX_SEARCH_RESULTS: 'abc' }), ConfigError);
  assert.throws(() => loadConfig({ MAX_SEARCH_RESULTS: '-3' }), ConfigError);
});

test('U-CONF-05: boolean tidak valid -> ConfigError', () => {
  assert.throws(() => loadConfig({ FULL_CONTENT_ENABLED: 'mungkin' }), ConfigError);
  assert.equal(loadConfig({ FULL_CONTENT_ENABLED: 'true' }).content.fullContentEnabled, true);
  assert.equal(loadConfig({ FULL_CONTENT_ENABLED: '0' }).content.fullContentEnabled, false);
});

test('parseBool: nilai umum', () => {
  assert.equal(parseBool('on'), true);
  assert.equal(parseBool('off'), false);
  assert.equal(parseBool(undefined, true), true);
});

test('U-CONF-06: anon key dipakai bila service-role tidak ada', () => {
  const cfg = loadConfig({ ...FULL_ENV, SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_ANON_KEY: 'anon-abc' });
  assert.equal(cfg.supabase.keyType, 'anon');
  assert.equal(cfg.supabase.key, 'anon-abc');
});

test('findConfigProblems: mendeteksi kredensial kurang', () => {
  const cfg = loadConfig({});
  const problems = findConfigProblems(cfg);
  assert.ok(problems.length >= 3);
});

test('SOURCE: konstanta sumber benar', () => {
  assert.equal(SOURCE.baseUrl, 'https://islam.nu.or.id');
  assert.equal(SOURCE.listPath, '/khutbah');
});

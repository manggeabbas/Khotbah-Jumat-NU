import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, findConfigProblems, parseBool, SOURCE } from '../src/config.js';
import { ConfigError } from '../src/utils/errors.js';

const FULL_ENV = {
  TELEGRAM_BOT_TOKEN: '123456789:AAabcdefghijklmnopqrstuvwxyz0123456789',
  TELEGRAM_USER_ID: '111222333',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_examplekeyvalue000000000000',
};

test('U-CONF-01: env lengkap valid terparse', () => {
  const cfg = loadConfig(FULL_ENV, { requireSecrets: true });
  assert.equal(cfg.telegram.token, FULL_ENV.TELEGRAM_BOT_TOKEN);
  assert.equal(cfg.supabase.url, FULL_ENV.SUPABASE_URL);
  assert.equal(cfg.supabase.secretKey, FULL_ENV.SUPABASE_SECRET_KEY);
  assert.equal(cfg.admin.ownerId, '111222333');
  assert.deepEqual(cfg.admin.telegramIds, ['111222333']);
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
      assert.match(err.message, /TELEGRAM_BOT_TOKEN/);
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

test('U-CONF-06: SUPABASE_SECRET_KEY dibaca; ANON/SERVICE_ROLE lama diabaikan', () => {
  const cfg = loadConfig(FULL_ENV, { requireSecrets: true });
  assert.equal(cfg.supabase.secretKey, FULL_ENV.SUPABASE_SECRET_KEY);
  // Nama lama tidak lagi digunakan.
  const legacy = loadConfig({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-lama', SUPABASE_SERVICE_ROLE_KEY: 'sr-lama' });
  assert.equal(legacy.supabase.secretKey, '');
});

test('U-CONF-07: BOT_TOKEN lama masih diterima sebagai alias', () => {
  const cfg = loadConfig({ BOT_TOKEN: '123456789:AAlegacytoken000000000000000000000000' });
  assert.equal(cfg.telegram.token, '123456789:AAlegacytoken000000000000000000000000');
});

test('U-CONF-08: TELEGRAM_USER_ID numerik valid diterima', () => {
  const cfg = loadConfig({ ...FULL_ENV, TELEGRAM_USER_ID: '987654321' }, { requireSecrets: true });
  assert.deepEqual(cfg.admin.telegramIds, ['987654321']);
  assert.deepEqual(findConfigProblems(cfg), []);
});

test('U-CONF-09: TELEGRAM_USER_ID non-numerik -> ConfigError (tanpa nilai)', () => {
  const bad = 'bukan-angka';
  try {
    loadConfig({ ...FULL_ENV, TELEGRAM_USER_ID: bad }, { requireSecrets: true });
    assert.fail('seharusnya melempar');
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.match(err.message, /TELEGRAM_USER_ID/);
    assert.ok(!err.message.includes(bad), 'nilai variabel bocor');
  }
});

test('U-CONF-09b: banyak ID numerik dipisah koma (dedupe)', () => {
  const cfg = loadConfig({ TELEGRAM_USER_ID: '111,222,111' });
  assert.deepEqual(cfg.admin.telegramIds, ['111', '222']);
  assert.equal(cfg.admin.ownerId, '111');
});

test('U-CONF-10: pesan validasi tidak memuat nilai rahasia', () => {
  const secret = 'sb_secret_superrahasiajangantercetak';
  const token = '123456789:AArahasiajangantercetak0000000000000';
  try {
    loadConfig(
      { TELEGRAM_BOT_TOKEN: token, SUPABASE_URL: '', SUPABASE_SECRET_KEY: secret, TELEGRAM_USER_ID: '' },
      { requireSecrets: true },
    );
    assert.fail('seharusnya melempar');
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.ok(!err.message.includes(secret), 'nilai secret bocor');
    assert.ok(!err.message.includes(token), 'nilai token bocor');
    assert.match(err.message, /SUPABASE_URL/);
  }
});

test('findConfigProblems: mendeteksi kredensial kurang', () => {
  const cfg = loadConfig({});
  const problems = findConfigProblems(cfg);
  assert.ok(problems.length >= 4);
  assert.ok(problems.some((p) => /TELEGRAM_USER_ID/.test(p)));
  assert.ok(problems.some((p) => /SUPABASE_SECRET_KEY/.test(p)));
});

test('SOURCE: konstanta sumber benar', () => {
  assert.equal(SOURCE.baseUrl, 'https://islam.nu.or.id');
  assert.equal(SOURCE.listPath, '/khutbah');
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, isEnvLoaded, resetEnvLoader } from '../src/loadEnv.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'khutbah-env-'));
const ENV_PATH = path.join(TMP, '.env');
fs.writeFileSync(ENV_PATH, 'PHASE1_TEST_VAR=hello-env\nPHASE1_SECOND=world\n', 'utf8');

after(() => {
  delete process.env.PHASE1_TEST_VAR;
  delete process.env.PHASE1_SECOND;
  resetEnvLoader();
  fs.rmSync(TMP, { recursive: true, force: true });
});

test('U-ENV-01: loadEnv memuat .env ke process.env (tanpa mencetak nilai)', () => {
  delete process.env.PHASE1_TEST_VAR;
  delete process.env.PHASE1_SECOND;
  resetEnvLoader();
  const ran = loadEnv({ path: ENV_PATH });
  assert.equal(ran, true);
  assert.equal(process.env.PHASE1_TEST_VAR, 'hello-env');
  assert.equal(process.env.PHASE1_SECOND, 'world');
  assert.equal(isEnvLoaded(), true);
});

test('U-ENV-02: loadEnv tidak dijalankan dua kali kecuali force', () => {
  resetEnvLoader();
  assert.equal(loadEnv({ path: ENV_PATH }), true);
  assert.equal(loadEnv({ path: ENV_PATH }), false); // sudah dimuat
  assert.equal(loadEnv({ path: ENV_PATH, force: true }), true);
});

test('U-ENV-03: file .env yang tidak ada tidak melempar', () => {
  resetEnvLoader();
  assert.doesNotThrow(() => loadEnv({ path: path.join(TMP, 'tidak-ada.env') }));
});

test('U-ENV-04: entrypoint memuat .env sebelum membaca konfigurasi/env', () => {
  const withConfig = ['../src/index.js', '../src/scraper/cli-sync.js'];
  for (const rel of withConfig) {
    const src = fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    const envIdx = src.indexOf('loadEnv()');
    const cfgIdx = src.indexOf('loadConfig(');
    assert.notEqual(envIdx, -1, `${rel}: harus memanggil loadEnv()`);
    assert.notEqual(cfgIdx, -1, `${rel}: harus memanggil loadConfig()`);
    assert.ok(envIdx < cfgIdx, `${rel}: loadEnv() harus sebelum loadConfig()`);
  }

  const migrateSrc = fs.readFileSync(
    fileURLToPath(new URL('../src/database/migrate.js', import.meta.url)),
    'utf8',
  );
  const mEnvIdx = migrateSrc.indexOf('loadEnv()');
  const dbIdx = migrateSrc.indexOf('process.env.DATABASE_URL');
  assert.notEqual(mEnvIdx, -1, 'migrate.js: harus memanggil loadEnv()');
  assert.ok(dbIdx === -1 || mEnvIdx < dbIdx, 'migrate.js: loadEnv() harus sebelum DATABASE_URL dibaca');
});

#!/usr/bin/env node
/**
 * Validasi environment tanpa mencetak NILAI apa pun.
 *
 * Menampilkan status ADA/KOSONG per variabel dan daftar variabel wajib yang
 * kurang. Berguna untuk memastikan `.env` sudah benar sebelum menjalankan bot.
 *
 *   npm run check:env
 */
import { loadEnv } from './loadEnv.js';
import { loadConfig, findConfigProblems, ENV_KEYS } from './config.js';
import { ConfigError } from './utils/errors.js';

// [nama, wajib?, keterangan]
const CHECKS = [
  [ENV_KEYS.telegramToken, true, 'rahasia'],
  [ENV_KEYS.telegramUserId, true, 'non-rahasia (owner/admin)'],
  [ENV_KEYS.sqliteDbPath, false, 'path lokal (default data/khutbah.db)'],
];

function main() {
  loadEnv();

  process.stdout.write('Pemeriksaan environment (nilai TIDAK ditampilkan):\n');
  for (const [name, required, kind] of CHECKS) {
    const status = process.env[name] ? 'ADA' : 'KOSONG';
    const flag = required ? 'wajib' : 'opsional';
    process.stdout.write(`  - ${name} [${flag}, ${kind}]: ${status}\n`);
  }

  let config;
  try {
    config = loadConfig(process.env, { requireSecrets: true });
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stdout.write(`\nStatus: GAGAL\n${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const problems = findConfigProblems(config);
  if (problems.length > 0) {
    process.stdout.write(`\nStatus: GAGAL\n- ${problems.join('\n- ')}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write('\nStatus: OK — semua variabel wajib tersedia.\n');
  process.stdout.write(
    `Owner/admin terdeteksi: ${config.admin.telegramIds.length} ID numerik.\n`,
  );
}

main();

/**
 * Entry point produksi.
 *
 * Semua efek samping (koneksi jaringan, long polling, cron) hanya terjadi di
 * sini. Modul lain dirancang agar dapat dites tanpa token.
 */
import { loadConfig, findConfigProblems } from './config.js';
import { ConfigError } from './utils/errors.js';
import { createLogger } from './logger.js';
import { createApp } from './app.js';

function printConfigProblems(problems) {
  process.stderr.write(
    '\n[BOOT] Konfigurasi belum lengkap — bot tidak dijalankan.\n' +
      problems.map((p) => `  - ${p}`).join('\n') +
      '\n\nLangkah:\n' +
      "  1. Salin .env.example menjadi .env\n" +
      '  2. Isi BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (atau ANON), ADMIN_TELEGRAM_ID\n' +
      '  3. Jalankan ulang: npm start\n\n',
  );
}

async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      printConfigProblems([err.message]);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const problems = findConfigProblems(config);
  if (problems.length > 0) {
    printConfigProblems(problems);
    process.exitCode = 1;
    return;
  }

  const logger = createLogger({
    level: config.logging.level,
    secrets: [config.telegram.token, config.supabase.serviceRoleKey, config.supabase.anonKey],
  });

  logger.info('[BOOT] Starting Khutbah Bot...', { env: config.env, node: process.version });

  const app = await createApp(config, { logger });

  const shutdown = async (signal) => {
    logger.info(`[SHUTDOWN] Menerima ${signal}, menghentikan dengan rapi...`);
    try {
      await app.stop();
    } catch (err) {
      logger.error('[SHUTDOWN] Gagal berhenti rapi', err);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await app.start();

  // Tangani error tak tertangkap agar bot tidak mati diam-diam.
  process.on('unhandledRejection', (reason) => {
    logger.error('[UNHANDLED_REJECTION]', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('[UNCAUGHT_EXCEPTION]', err);
  });
}

main().catch((err) => {
  process.stderr.write(`[BOOT] Fatal: ${err?.message || err}\n`);
  process.exit(1);
});

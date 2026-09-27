/**
 * Composition root.
 *
 * Merakit komponen aplikasi TANPA efek samping jaringan pada saat pembuatan.
 * `start()`/`stop()` yang menjalankan/menghentikan komponen.
 *
 * Fase awal: struktur minimal. Wiring penuh (database, telegram, scraper,
 * scheduler) ditambahkan pada fase terkait.
 */
import { createLogger } from './logger.js';

/**
 * @param {object} config
 * @param {{ logger?: object }} [deps]
 */
export async function createApp(config, deps = {}) {
  const logger =
    deps.logger ||
    createLogger({
      level: config.logging?.level || 'info',
      secrets: [config.telegram?.token, config.supabase?.serviceRoleKey, config.supabase?.anonKey],
    });

  const components = [];
  let started = false;

  return {
    config,
    logger,
    components,
    get started() {
      return started;
    },
    async start() {
      if (started) return;
      started = true;
      for (const c of components) {
        if (typeof c.start === 'function') await c.start();
      }
      logger.info('[APP] started', { env: config.env });
    },
    async stop() {
      if (!started) return;
      for (const c of [...components].reverse()) {
        if (typeof c.stop === 'function') {
          try {
            await c.stop();
          } catch (err) {
            logger.error('[APP] komponen gagal berhenti', err);
          }
        }
      }
      started = false;
      logger.info('[APP] stopped');
    },
  };
}

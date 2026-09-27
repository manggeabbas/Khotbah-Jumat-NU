/**
 * Penjadwal sinkronisasi (node-cron). Default tiap 6 jam.
 * Idempoten: start() tidak mendaftarkan tugas ganda.
 */
import cron from 'node-cron';

export function buildExpression(intervalHours) {
  const h = Math.min(23, Math.max(1, Number(intervalHours) || 6));
  return `0 */${h} * * *`;
}

/**
 * @param {{ config: object, logger?: object, runSync: Function, cronImpl?: object }} deps
 */
export function createScheduler({ config, logger, runSync, cronImpl = cron }) {
  const expression = buildExpression(config.scraper?.intervalHours);
  let task = null;

  return {
    expression,
    start() {
      if (task) return;
      if (!cronImpl.validate(expression)) {
        logger?.error('[SCHEDULER] ekspresi cron tidak valid', { expression });
        return;
      }
      task = cronImpl.schedule(
        expression,
        async () => {
          logger?.info('[SCHEDULER] menjalankan sinkronisasi terjadwal');
          try {
            await runSync();
          } catch (err) {
            logger?.error('[SCHEDULER] sinkronisasi terjadwal gagal', err);
          }
        },
        { timezone: 'Asia/Jakarta' },
      );
      logger?.info('[SCHEDULER] Started', { expression });
    },
    stop() {
      if (!task) return;
      try {
        task.stop();
        task.destroy?.();
      } catch (err) {
        logger?.warn('[SCHEDULER] gagal menghentikan', { error: err.message });
      }
      task = null;
      logger?.info('[SCHEDULER] stopped');
    },
    get running() {
      return Boolean(task);
    },
  };
}

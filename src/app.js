/**
 * Composition root: merakit seluruh komponen TANPA efek samping jaringan saat
 * pembuatan. `start()`/`stop()` menjalankan/menghentikan bot.
 */
import { createLogger } from './logger.js';
import { createDatabase } from './database/index.js';
import { createSessionStore } from './bot/session.js';
import { createSearchService } from './search/search.js';
import { createBot } from './bot/createBot.js';
import { createFetchClient } from './scraper/fetchClient.js';
import { createRobotsGuard } from './scraper/robots.js';
import { createNuOnlineScraper } from './scraper/nuonline.js';
import { createSyncService } from './scraper/sync.js';
import { createPdfService } from './pdf/generator.js';
import { createScheduler } from './scheduler/scheduler.js';

/**
 * @param {object} config
 * @param {{ logger?: object, pdfService?: object, scheduler?: object }} [deps]
 */
export async function createApp(config, deps = {}) {
  const logger =
    deps.logger ||
    createLogger({
      level: config.logging?.level || 'info',
      secrets: [config.telegram?.token],
    });

  // --- Database ---
  const repos = createDatabase(config, { logger });
  try {
    if (typeof repos.store?.ping === 'function') {
      await repos.store.ping();
      logger.info('[DATABASE] Connected', { backend: repos.kind });
    }
  } catch (err) {
    logger.error('[DATABASE] Gagal terhubung — bot tetap berjalan dengan keterbatasan', err);
  }

  // --- Layanan inti ---
  const session = createSessionStore();
  const searchService = createSearchService({ repos, config, logger });

  // --- Scraper & sync ---
  const fetchClient = createFetchClient({
    userAgent: config.scraper.userAgent,
    timeoutMs: config.scraper.timeoutMs,
    requestDelayMs: config.scraper.requestDelayMs,
    maxRetries: config.scraper.maxRetries,
    logger,
  });
  const robots = createRobotsGuard({
    baseUrl: config.scraper.source.baseUrl,
    userAgent: config.scraper.userAgent,
    fetchClient,
    logger,
  });
  const scraper = createNuOnlineScraper({ fetchClient, config, logger });
  const syncService = createSyncService({ repos, config, logger, scraper, robots });

  // --- PDF ---
  const pdfService = deps.pdfService || createPdfService({ config, logger });

  // --- Scheduler ---
  const scheduler =
    deps.scheduler ||
    createScheduler({
      config,
      logger,
      runSync: () => syncService.run({ trigger: 'scheduled' }),
    });

  // --- Bot ---
  const botApp = createBot({
    config,
    services: { repos, searchService, session, syncService, pdfService },
    logger,
  });

  let started = false;

  return {
    config,
    logger,
    repos,
    session,
    searchService,
    syncService,
    pdfService,
    scheduler,
    bot: botApp.bot,
    async start() {
      if (started) return;
      started = true;
      await botApp.start();
      scheduler.start();
    },
    async stop() {
      if (!started) return;
      scheduler.stop();
      await botApp.stop();
      try {
        repos.close?.();
      } catch (err) {
        logger.warn('[DATABASE] gagal menutup SQLite', { error: err.message });
      }
      started = false;
    },
  };
}

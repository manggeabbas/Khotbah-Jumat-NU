#!/usr/bin/env node
/**
 * CLI sinkronisasi manual: `npm run sync`
 */
import { loadConfig } from '../config.js';
import { loadEnv } from '../loadEnv.js';
import { createLogger } from '../logger.js';
import { createDatabase } from '../database/index.js';
import { createFetchClient } from './fetchClient.js';
import { createRobotsGuard } from './robots.js';
import { createNuOnlineScraper } from './nuonline.js';
import { createSyncService } from './sync.js';

async function main() {
  loadEnv();
  const config = loadConfig(process.env);
  const logger = createLogger({
    level: config.logging.level,
    secrets: [config.telegram.token, config.supabase.secretKey],
  });

  const repos = createDatabase(config, { logger });
  if (repos.kind === 'memory') {
    logger.warn('[SYNC] Backend in-memory: data TIDAK akan tersimpan permanen.');
  }

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
  const sync = createSyncService({ repos, config, logger, scraper, robots });

  const result = await sync.run({ trigger: 'cli' });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`[SYNC] Fatal: ${err?.message || err}\n`);
  process.exit(1);
});

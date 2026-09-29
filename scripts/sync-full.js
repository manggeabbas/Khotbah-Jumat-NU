#!/usr/bin/env node
/**
 * Sinkronisasi PENUH: memindai seluruh halaman listing NU Online lalu menyimpan
 * semua artikel khutbah ke SQLite. Berbeda dari `npm run sync` (yang dibatasi
 * `SCRAPER_MAX_LISTING_PAGES`/`SCRAPER_MAX_ARTICLES` untuk menjaga kesegaran
 * artikel terbaru), perintah ini sengaja melewati batas tersebut.
 *
 * Pemakaian:
 *   npm run sync:full                 # semua halaman (maks 500) & semua artikel
 *   npm run sync:full -- --max=300    # batasi jumlah artikel (uji coba)
 *   npm run sync:full -- --pages=10   # batasi jumlah halaman listing
 *   npm run sync:full -- --delay=800  # jeda antar permintaan (ms)
 *
 * Tetap sopan: robots.txt, rate limit, timeout, retry terbatas. Aman diulang
 * (upsert by URL + content_hash, jadi artikel yang tidak berubah dilewati).
 */
import { loadConfig } from '../src/config.js';
import { loadEnv } from '../src/loadEnv.js';
import { createLogger } from '../src/logger.js';
import { createDatabase } from '../src/database/index.js';
import { createFetchClient } from '../src/scraper/fetchClient.js';
import { createRobotsGuard } from '../src/scraper/robots.js';
import { createNuOnlineScraper } from '../src/scraper/nuonline.js';
import { createSyncService } from '../src/scraper/sync.js';

function numArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split('=')[1]);
  return Number.isFinite(n) ? n : fallback;
}

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

async function main() {
  loadEnv();
  const config = loadConfig(process.env);

  // Override khusus mode penuh.
  config.scraper.maxListingPages = numArg('pages', 500);
  config.scraper.maxArticles = numArg('max', 0);
  config.scraper.requestDelayMs = numArg('delay', config.scraper.requestDelayMs);
  const progressEvery = Math.max(1, numArg('progress', 25));

  const logger = createLogger({
    level: process.env.LOG_LEVEL || config.logging.level,
    secrets: [config.telegram.token],
  });

  const repos = createDatabase(config, { logger });
  if (repos.kind !== 'sqlite') {
    process.stderr.write('[SYNC:FULL] Backend bukan SQLite — dihentikan agar tidak salah tulis.\n');
    process.exitCode = 1;
    return;
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

  process.stdout.write('\nSINKRONISASI PENUH (SQLite)\n');
  process.stdout.write('===========================\n');
  process.stdout.write(`Listing maks : ${config.scraper.maxListingPages} halaman\n`);
  process.stdout.write(
    `Artikel maks : ${config.scraper.maxArticles > 0 ? config.scraper.maxArticles : 'tanpa batas'}\n`,
  );
  process.stdout.write(`Jeda         : ${config.scraper.requestDelayMs} ms\n\n`);

  const startedAt = Date.now();
  const refresh = process.argv.includes('--refresh');
  const skipCandidate = refresh
    ? null
    : async (candidate) => {
        const row = await repos.articles.findByUrl(candidate.url);
        if (!row || row.status !== 'active') return false;
        return config.content.fullContentEnabled ? Boolean(row.content) : true;
      };

  const sync = createSyncService({
    repos,
    config,
    logger,
    scraper,
    robots,
    skipCandidate,
    onProgress: ({ processed, total, inserted, updated, failed, skipped }) => {
      if (processed % progressEvery === 0 || processed === total) {
        process.stdout.write(
          `  ${processed}/${total}  baru:${inserted} ubah:${updated} gagal:${failed} lompat:${skipped || 0}  (${fmtDuration(Date.now() - startedAt)})\n`,
        );
      }
    },
  });

  const result = await sync.run({ trigger: 'full' });

  const total = await repos.articles.count();
  process.stdout.write('\nHASIL\n-----\n');
  process.stdout.write(`Status      : ${result.status || (result.skipped ? 'dilewati' : '-')}\n`);
  process.stdout.write(`Ditemukan   : ${result.stats?.found ?? 0}\n`);
  process.stdout.write(`Baru        : ${result.stats?.inserted ?? 0}\n`);
  process.stdout.write(`Diperbarui  : ${result.stats?.updated ?? 0}\n`);
  process.stdout.write(`Dilewati    : ${result.stats?.skipped ?? 0} (sudah tersimpan)\n`);
  process.stdout.write(`Gagal       : ${result.stats?.failed ?? 0}\n`);
  process.stdout.write(`Total di DB : ${total} artikel\n`);
  process.stdout.write(`Durasi      : ${fmtDuration(Date.now() - startedAt)}\n`);

  repos.close();
  if (result.status === 'failed') process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`[SYNC:FULL] Fatal: ${err?.message || err}\n`);
  process.exit(1);
});

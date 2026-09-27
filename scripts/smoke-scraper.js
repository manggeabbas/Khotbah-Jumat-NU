#!/usr/bin/env node
/**
 * Live smoke test scraper NU Online (TERBATAS) + upsert ke Supabase + cleanup.
 *
 * Batasan: maksimum 1 halaman listing dan 2 artikel (tanpa full crawl).
 * Cleanup: hanya menghapus baris yang DIBUAT oleh smoke test ini.
 * Tidak mencetak credential, token, maupun isi artikel.
 *
 *   npm run smoke:scraper
 */
import { loadEnv } from '../src/loadEnv.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createDatabase } from '../src/database/index.js';
import { createFetchClient } from '../src/scraper/fetchClient.js';
import { createRobotsGuard } from '../src/scraper/robots.js';
import { createNuOnlineScraper } from '../src/scraper/nuonline.js';
import { buildArticleRecord } from '../src/scraper/sync.js';

const MAX_PAGES = 1;
const MAX_ARTICLES = 2;

async function main() {
  loadEnv();
  const config = loadConfig(process.env, { requireSecrets: true });
  const logger = createLogger({
    level: 'warn',
    secrets: [config.telegram.token, config.supabase.secretKey],
  });
  const repos = createDatabase(config, { logger });

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

  const results = [];
  const ok = (name, pass, detail = '') => {
    results.push(pass);
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
  };

  const allowed = await robots.allowed(config.scraper.source.listPath);
  ok('robots.txt mengizinkan /khutbah', allowed);
  if (!allowed) {
    process.exitCode = 1;
    return;
  }

  const candidates = await scraper.discover({ maxPages: MAX_PAGES });
  ok('listing terbaca', candidates.length > 0, `${candidates.length} item`);

  const picked = candidates.slice(0, MAX_ARTICLES);
  const createdIds = [];
  let activeCount = 0;

  for (const candidate of picked) {
    const parsed = await scraper.fetchArticle(candidate.url);
    const merged = {
      ...parsed,
      category: parsed.category || candidate.category || null,
      image_url: parsed.image_url || candidate.imageUrl || null,
    };
    const record = buildArticleRecord(merged, config);
    if (!record || record.status !== 'active') {
      ok(`parse ${candidate.url}`, false, record?.status || 'tanpa-record');
      continue;
    }
    activeCount++;

    const existed = await repos.articles.findByUrl(record.url);
    const first = await repos.articles.upsert(record);
    if (!existed && first.article?.id) createdIds.push(first.article.id);
    ok(`upsert ${record.url}`, Boolean(first.article?.id), existed ? 'sudah ada' : 'baru');

    const second = await repos.articles.upsert(record);
    ok(`dedup (upsert kedua) ${record.url}`, second.inserted === false);

    const found = await repos.articles.findByUrl(record.url);
    ok(`select ${record.url}`, Boolean(found) && found.title === record.title);
  }

  ok('parser menghasilkan data valid', activeCount > 0, `${activeCount} artikel aktif`);

  // Cleanup: hanya baris yang dibuat smoke test ini.
  for (const id of createdIds) {
    await repos.store.delete('articles', { id });
  }
  let leftover = 0;
  for (const id of createdIds) {
    const row = await repos.store.selectOne('articles', { id });
    if (row) leftover++;
  }
  ok('cleanup data smoke test', leftover === 0, `${createdIds.length} baris dihapus`);

  const failed = results.filter((r) => !r).length;
  process.stdout.write(`\nRINGKASAN SMOKE: ${results.length - failed}/${results.length} PASS\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`[SMOKE] Gagal: ${err?.message || err}\n`);
  process.exit(1);
});

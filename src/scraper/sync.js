/**
 * Sinkronisasi: discovery -> fetch -> parse -> validasi -> upsert -> log.
 *
 * Aturan:
 *  - hormati robots.txt;
 *  - mode aman menyimpan metadata + cuplikan saja (FULL_CONTENT_ENABLED=false);
 *  - validasi minimal (title, url, panjang konten) -> parse_failed bila gagal;
 *  - cegah sinkronisasi berjalan ganda (lock).
 */
import { createHash } from 'node:crypto';
import { ScraperError } from '../utils/errors.js';

export const LIMITS = Object.freeze({
  minContentLength: 200,
  minSnippetLength: 40,
});

function hashArticle({ title, text }) {
  return createHash('sha256').update(`${title || ''}\n${text || ''}`).digest('hex');
}

/**
 * Membangun record artikel sesuai mode konten.
 * @param {object} parsed hasil parseArticle
 * @param {object} config
 * @returns {object|null} record untuk upsert, atau null bila gagal validasi
 */
export function buildArticleRecord(parsed, config) {
  const fullEnabled = Boolean(config?.content?.fullContentEnabled);
  const snippetMax = config?.content?.snippetMaxLength ?? 400;
  const fullText = parsed.content || '';
  const snippet = (fullText || parsed.description || '').slice(0, snippetMax).trim();

  const base = {
    title: parsed.title || null,
    url: parsed.url || null,
    author: parsed.author || null,
    published_at: parsed.published_at || null,
    language: parsed.language || 'id',
    description: parsed.description || null,
    snippet: snippet || null,
    category: parsed.category || null,
    source: parsed.source || 'NU Online',
    content_hash: null,
    status: 'active',
    content: null,
    khutbah_1: null,
    khutbah_2: null,
  };

  // Validasi minimal
  const problems = [];
  if (!base.title) problems.push('title kosong');
  if (!base.url) problems.push('url kosong');
  if (fullEnabled) {
    if (!fullText || fullText.length < LIMITS.minContentLength) problems.push('konten terlalu pendek');
  } else {
    if (!snippet || snippet.length < LIMITS.minSnippetLength) problems.push('cuplikan terlalu pendek');
  }

  if (problems.length > 0) {
    // Simpan sebagai parse_failed agar dapat diperiksa admin (bila url ada).
    if (!base.url) return null;
    return {
      ...base,
      status: 'parse_failed',
      content_hash: hashArticle({ title: base.title, text: fullText || snippet }),
    };
  }

  if (fullEnabled) {
    base.content = fullText || null;
    base.khutbah_1 = parsed.khutbah_1 || null;
    base.khutbah_2 = parsed.khutbah_2 || null;
  }
  base.content_hash = hashArticle({ title: base.title, text: fullEnabled ? fullText : snippet });
  return base;
}

/**
 * @param {{ repos: object, config: object, logger?: object, scraper: object, robots?: object }} deps
 */
export function createSyncService({ repos, config, logger, scraper, robots }) {
  let running = false;

  async function run({ trigger = 'manual' } = {}) {
    if (running) {
      logger?.warn('[SYNC] sinkronisasi lain sedang berjalan, dilewati');
      return { skipped: true, reason: 'already_running' };
    }
    running = true;

    const stats = { found: 0, inserted: 0, updated: 0, failed: 0 };
    const logRow = await repos.syncLogs.start();
    logger?.info('[SYNC] mulai', { trigger, logId: logRow.id });

    try {
      if (robots) {
        const listPath = config.scraper.source.listPath;
        if (!(await robots.allowed(listPath))) {
          logger?.warn('[SYNC] robots.txt melarang listing, sinkronisasi dibatalkan');
          await repos.syncLogs.finish(logRow.id, {
            status: 'failed',
            error_message: 'robots.txt melarang pengambilan listing',
            ...stats,
          });
          return { skipped: true, reason: 'robots_disallowed' };
        }
      }

      const candidates = await scraper.discover({ maxPages: config.scraper.maxListingPages });
      stats.found = candidates.length;
      const limit = config.scraper.maxArticles > 0 ? config.scraper.maxArticles : candidates.length;
      logger?.info('[SYNC] kandidat artikel ditemukan', { count: candidates.length, limit });

      let processed = 0;
      for (const candidate of candidates) {
        if (processed >= limit) break;
        processed++;
        try {
          if (robots) {
            const p = new URL(candidate.url).pathname;
            if (!(await robots.allowed(p))) {
              stats.failed++;
              continue;
            }
          }
          const parsed = await scraper.fetchArticle(candidate.url);
          const record = buildArticleRecord(parsed, config);
          if (!record) {
            stats.failed++;
            logger?.warn('[SYNC] artikel gagal validasi (tanpa url)', { url: candidate.url });
            continue;
          }
          const res = await repos.articles.upsert(record);
          if (record.status === 'parse_failed') stats.failed++;
          else if (res.inserted) stats.inserted++;
          else if (res.updated) stats.updated++;
        } catch (err) {
          stats.failed++;
          logger?.error('[SYNC] gagal memproses artikel', { url: candidate.url, error: err });
        }
      }

      const status = stats.failed > 0 ? 'partial' : 'success';
      await repos.syncLogs.finish(logRow.id, { status, ...stats });
      logger?.info('[SYNC] selesai', { status, ...stats });
      return { skipped: false, status, stats };
    } catch (err) {
      await repos.syncLogs.finish(logRow.id, {
        status: 'failed',
        error_message: err?.message || String(err),
        ...stats,
      });
      logger?.error('[SYNC] gagal total', err);
      if (err instanceof ScraperError) return { skipped: false, status: 'failed', stats, error: err.message };
      throw err;
    } finally {
      running = false;
    }
  }

  return {
    run,
    get running() {
      return running;
    },
  };
}

/**
 * Layanan pencarian: normalisasi query -> repository -> pagination + log.
 */
import { expandQuery } from './normalize.js';

/**
 * @param {{ repos: object, config: object, logger?: object }} deps
 */
export function createSearchService({ repos, config, logger }) {
  const pageSize = config.search?.maxResults || 8;

  /**
   * @param {{ query: string, page?: number, userId?: number|null, pageSize?: number }} params
   */
  async function search({ query, page = 0, userId = null, pageSize: sizeOverride }) {
    const size = sizeOverride || pageSize;
    const safePage = Math.max(0, page);
    const offset = safePage * size;
    const terms = expandQuery(query);

    let res = { total: 0, items: [] };

    if (terms.length > 0) {
      res = await repos.articles.search({ terms, limit: size, offset });
      // Fallback: bila bentuk gabungan kosong, coba term tunggal terkuat.
      if (res.total === 0 && terms.length > 1) {
        for (const term of terms) {
          const single = await repos.articles.search({ terms: [term], limit: size, offset: 0 });
          if (single.total > 0) {
            res = single;
            break;
          }
        }
      }
    }

    try {
      await repos.searchLogs.add({ userId, query, resultCount: res.total });
    } catch (err) {
      logger?.warn('[SEARCH] gagal mencatat search_logs', { error: err.message });
    }

    const hasMore = offset + res.items.length < res.total;
    return { total: res.total, items: res.items, page: safePage, pageSize: size, hasMore, terms };
  }

  return { search, pageSize };
}

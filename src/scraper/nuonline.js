/**
 * Orchestrator sumber NU Online: discovery URL + pengambilan artikel.
 */
import { parseListing, parseArticle, normalizeUrl } from './parser.js';

/**
 * @param {{ fetchClient: object, config: object, logger?: object }} deps
 */
export function createNuOnlineScraper({ fetchClient, config, logger }) {
  const base = config.scraper?.source?.baseUrl || 'https://islam.nu.or.id';
  const listPath = config.scraper?.source?.listPath || '/khutbah';

  /**
   * Menemukan URL artikel dari halaman listing (dengan pagination).
   * @returns {Promise<Array<{url:string,title:string,dateText:string|null}>>}
   */
  async function discover({ maxPages = 1 } = {}) {
    const found = new Map();
    let page = normalizeUrl(listPath, base);
    let pages = 0;
    const visitedPages = new Set();

    while (page && pages < maxPages && !visitedPages.has(page)) {
      visitedPages.add(page);
      const html = await fetchClient.getText(page);
      const { items, nextPage } = parseListing(html, base);
      for (const item of items) found.set(item.url, item);
      logger?.debug('[SCRAPER] listing dipindai', { page, items: items.length });
      page = nextPage;
      pages++;
    }
    return [...found.values()];
  }

  async function fetchArticle(url) {
    const html = await fetchClient.getText(url);
    return parseArticle(html, url, base);
  }

  return { discover, fetchArticle, base, listPath };
}

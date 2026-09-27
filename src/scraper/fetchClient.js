/**
 * Klien HTTP sopan untuk scraper: rate limit, timeout, retry + backoff,
 * User-Agent jelas. Tidak mengakali blokir/paywall/CAPTCHA.
 */
import { ScraperError } from '../utils/errors.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} opts
 * @param {string} opts.userAgent
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.requestDelayMs]  jeda minimum antar permintaan
 * @param {number} [opts.maxRetries]
 * @param {object} [opts.logger]
 * @param {Function} [opts.fetchImpl]
 * @param {Function} [opts.sleepImpl]
 */
export function createFetchClient(opts = {}) {
  const {
    userAgent = 'KhutbahJumatBot/0.1',
    timeoutMs = 20000,
    requestDelayMs = 1500,
    maxRetries = 3,
    logger,
    fetchImpl = globalThis.fetch,
    sleepImpl = sleep,
  } = opts;

  if (typeof fetchImpl !== 'function') {
    throw new ScraperError('fetch tidak tersedia di runtime ini.');
  }

  let lastRequestAt = 0;

  async function throttle() {
    const wait = requestDelayMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleepImpl(wait);
    lastRequestAt = Date.now();
  }

  async function getText(url) {
    let attempt = 0;
    let lastErr;
    while (attempt <= maxRetries) {
      await throttle();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
          redirect: 'follow',
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status === 429 || res.status === 403) {
          const err = new ScraperError(`HTTP ${res.status} (kemungkinan diblokir/rate-limited): ${url}`);
          err.status = res.status;
          err.noRetry = res.status === 403;
          throw err;
        }
        if (res.status >= 500) {
          const err = new ScraperError(`HTTP ${res.status}: ${url}`);
          err.status = res.status;
          throw err;
        }
        if (!res.ok) {
          const err = new ScraperError(`HTTP ${res.status}: ${url}`);
          err.status = res.status;
          err.noRetry = true;
          throw err;
        }
        return await res.text();
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        const retryable = !err.noRetry;
        attempt++;
        if (!retryable || attempt > maxRetries) break;
        const backoff = Math.min(8000, 500 * 2 ** attempt);
        logger?.warn('[SCRAPER] permintaan gagal, mengulang', {
          url,
          attempt,
          backoff,
          error: err.message,
        });
        await sleepImpl(backoff);
      }
    }
    if (lastErr instanceof ScraperError) throw lastErr;
    throw new ScraperError(`Gagal mengambil ${url}: ${lastErr?.message || lastErr}`, { cause: lastErr });
  }

  return { getText, _throttle: throttle, userAgent };
}

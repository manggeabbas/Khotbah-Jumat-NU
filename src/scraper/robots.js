/**
 * Pemeriksaan robots.txt sederhana + guard dengan cache.
 * Menghormati larangan; bila situs melarang, scraper berhenti.
 */
import { ScraperError } from '../utils/errors.js';

/** Parse teks robots.txt. */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === 'allow' || field === 'disallow') && current) {
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }
  return groups;
}

/** Menentukan apakah `path` diizinkan berdasarkan rules yang berlaku. */
export function isAllowed(rules, path) {
  const p = path || '/';
  let best = null;
  for (const r of rules) {
    if (r.path === '') continue; // Disallow kosong = tidak membatasi
    if (p.startsWith(r.path)) {
      if (
        !best ||
        r.path.length > best.path.length ||
        (r.path.length === best.path.length && r.allow && !best.allow)
      ) {
        best = r;
      }
    }
  }
  return best ? best.allow : true;
}

export function selectRules(groups, userAgent) {
  const token = String(userAgent || '').toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return applicable.flatMap((g) => g.rules);
}

/**
 * Membuat guard robots dengan cache.
 * @param {{ baseUrl: string, userAgent: string, fetchClient: object, logger?: object }} opts
 */
export function createRobotsGuard({ baseUrl, userAgent, fetchClient, logger }) {
  let cached = null;

  async function load() {
    if (cached) return cached;
    try {
      const text = await fetchClient.getText(new URL('/robots.txt', baseUrl).toString());
      cached = selectRules(parseRobots(text), userAgent);
      logger?.debug('[ROBOTS] robots.txt dimuat', { rules: cached.length });
    } catch (err) {
      logger?.warn('[ROBOTS] gagal memuat robots.txt, menganggap diizinkan', { error: err.message });
      cached = [];
    }
    return cached;
  }

  return {
    async allowed(path) {
      const rules = await load();
      return isAllowed(rules, path);
    },
    _reset() {
      cached = null;
    },
  };
}

export { ScraperError };

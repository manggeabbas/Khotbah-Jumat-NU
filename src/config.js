/**
 * Pemuat konfigurasi dari environment.
 *
 * Prinsip: TANPA efek samping. Fungsi ini hanya membaca `env` yang diberikan
 * (default `process.env`), memberi nilai default, dan memvalidasi. Tidak ada
 * koneksi jaringan atau penulisan file.
 */

import { ConfigError } from './utils/errors.js';

const DEFAULTS = Object.freeze({
  MAX_SEARCH_RESULTS: 8,
  MAX_HISTORY: 50,
  SCRAPE_INTERVAL_HOURS: 6,
  SNIPPET_MAX_LENGTH: 400,
  SCRAPER_USER_AGENT: 'KhutbahJumatBot/0.1 (+https://github.com/; contact: developer@example.com)',
  SCRAPER_REQUEST_DELAY_MS: 1500,
  SCRAPER_TIMEOUT_MS: 20000,
  SCRAPER_MAX_RETRIES: 3,
  SCRAPER_MAX_ARTICLES: 50,
  SCRAPER_MAX_LISTING_PAGES: 3,
  LOG_LEVEL: 'info',
});

export const SOURCE = Object.freeze({
  name: 'NU Online',
  baseUrl: 'https://islam.nu.or.id',
  listPath: '/khutbah',
});

const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'silent']);

function parseIntStrict(raw, fallback, { min = 0, name } = {}) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (Number.isNaN(n)) {
    throw new ConfigError(`${name} harus berupa angka, diterima: "${raw}"`);
  }
  if (n < min) {
    throw new ConfigError(`${name} minimal ${min}, diterima: ${n}`);
  }
  return n;
}

export function parseBool(raw, fallback = false) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'ya'].includes(v)) return true;
  if (['0', 'false', 'no', 'off', 'tidak'].includes(v)) return false;
  throw new ConfigError(`Nilai boolean tidak valid: "${raw}" (gunakan true/false)`);
}

function parseAdminIds(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ requireSecrets?: boolean }} [opts]
 * @returns {object} config
 * @throws {ConfigError}
 */
export function loadConfig(env = process.env, { requireSecrets = false } = {}) {
  const get = (k) => (env[k] !== undefined && env[k] !== null ? String(env[k]).trim() : '');

  const errors = [];

  const token = get('BOT_TOKEN');
  const supabaseUrl = get('SUPABASE_URL');
  const serviceRoleKey = get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = get('SUPABASE_ANON_KEY');
  const supabaseKey = serviceRoleKey || anonKey;
  const supabaseKeyType = serviceRoleKey ? 'service_role' : anonKey ? 'anon' : null;

  if (requireSecrets) {
    if (!token) errors.push('BOT_TOKEN belum diisi (dapatkan dari @BotFather).');
    if (!supabaseUrl) errors.push('SUPABASE_URL belum diisi.');
    if (!supabaseKey) errors.push('SUPABASE_SERVICE_ROLE_KEY atau SUPABASE_ANON_KEY belum diisi.');
  }

  const required = (name, value) => {
    if (!value) errors.push(`${name} belum diisi.`);
  };
  // Hanya wajib bila kredensial diminta; tetap terhitung agar pesan jelas.
  if (requireSecrets) {
    required('ADMIN_TELEGRAM_ID', get('ADMIN_TELEGRAM_ID'));
  }

  const num = (key, opts) => {
    try {
      return parseIntStrict(env[key], DEFAULTS[key], { name: key, ...opts });
    } catch (e) {
      errors.push(e.message);
      return DEFAULTS[key];
    }
  };

  const bool = (key, fallback) => {
    try {
      return parseBool(env[key], fallback);
    } catch (e) {
      errors.push(e.message);
      return fallback;
    }
  };

  const logLevel = get('LOG_LEVEL') || DEFAULTS.LOG_LEVEL;
  if (!VALID_LOG_LEVELS.has(logLevel)) {
    errors.push(`LOG_LEVEL tidak valid: "${logLevel}" (pilih: ${[...VALID_LOG_LEVELS].join(', ')}).`);
  }

  const fullContentEnabled = bool('FULL_CONTENT_ENABLED', false);

  const config = {
    env: get('NODE_ENV') || 'development',
    telegram: { token },
    supabase: {
      url: supabaseUrl,
      serviceRoleKey,
      anonKey,
      key: supabaseKey,
      keyType: supabaseKeyType,
    },
    admin: { telegramIds: parseAdminIds(get('ADMIN_TELEGRAM_ID')) },
    search: { maxResults: num('MAX_SEARCH_RESULTS', { min: 1 }) },
    history: { max: num('MAX_HISTORY', { min: 1 }) },
    content: {
      fullContentEnabled,
      snippetMaxLength: num('SNIPPET_MAX_LENGTH', { min: 0 }),
    },
    scraper: {
      intervalHours: num('SCRAPE_INTERVAL_HOURS', { min: 1 }),
      userAgent: get('SCRAPER_USER_AGENT') || DEFAULTS.SCRAPER_USER_AGENT,
      requestDelayMs: num('SCRAPER_REQUEST_DELAY_MS', { min: 0 }),
      timeoutMs: num('SCRAPER_TIMEOUT_MS', { min: 1000 }),
      maxRetries: num('SCRAPER_MAX_RETRIES', { min: 0 }),
      maxArticles: num('SCRAPER_MAX_ARTICLES', { min: 0 }),
      maxListingPages: num('SCRAPER_MAX_LISTING_PAGES', { min: 1 }),
      source: SOURCE,
    },
    logging: { level: logLevel },
  };

  if (errors.length > 0) {
    throw new ConfigError(`Konfigurasi bermasalah:\n- ${errors.join('\n- ')}`);
  }

  return config;
}

/**
 * Cek apakah kredensial cukup untuk menjalankan bot. Mengembalikan daftar
 * masalah (array kosong = siap).
 * @param {object} config
 * @returns {string[]}
 */
export function findConfigProblems(config) {
  const problems = [];
  if (!config?.telegram?.token) problems.push('BOT_TOKEN belum diisi.');
  if (!config?.supabase?.url) problems.push('SUPABASE_URL belum diisi.');
  if (!config?.supabase?.key) problems.push('SUPABASE_SERVICE_ROLE_KEY atau SUPABASE_ANON_KEY belum diisi.');
  if (!config?.admin?.telegramIds?.length) problems.push('ADMIN_TELEGRAM_ID belum diisi.');
  return problems;
}

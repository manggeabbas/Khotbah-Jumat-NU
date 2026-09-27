/**
 * Logger terstruktur sederhana dengan REDAKSI RAHASIA.
 *
 * Tujuan:
 *  - output konsisten (timestamp, level, pesan, meta);
 *  - mencegah token/key bocor ke log, Telegram, atau laporan.
 *
 * Tidak memakai dependency eksternal agar ringan di Termux.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

/** Pola nilai sensitif yang harus disamarkan walau tidak terdaftar. */
const SECRET_PATTERNS = [
  // Telegram bot token: 123456789:AA...
  /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g,
  // JWT (key Supabase gaya lama)
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g,
  // Supabase key gaya baru (sb_secret_... / sb_publishable_...)
  /\bsb_[A-Za-z0-9_-]{20,}\b/g,
];

const REDACTED = '[REDACTED]';

/**
 * Menyamarkan rahasia di sebuah string.
 * @param {string} value
 * @param {string[]} [extraSecrets]
 */
export function redactString(value, extraSecrets = []) {
  if (typeof value !== 'string') return value;
  let out = value;
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 6) {
      out = out.split(secret).join(REDACTED);
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/** Menyamarkan rahasia secara rekursif pada nilai apa pun. */
export function redactValue(value, extraSecrets = [], depth = 0) {
  if (depth > 6) return '[DeepObject]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value, extraSecrets);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message, extraSecrets), code: value.code };
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, extraSecrets, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, extraSecrets, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * @param {{ level?: string, secrets?: string[], stream?: {write:(s:string)=>void}, name?: string }} [opts]
 */
export function createLogger(opts = {}) {
  const level = opts.level || 'info';
  const threshold = LEVELS[level] ?? LEVELS.info;
  const secrets = (opts.secrets || []).filter(Boolean);
  const stream = opts.stream || process.stdout;
  const name = opts.name || 'khutbah';

  const emit = (lvl, message, meta) => {
    if (LEVELS[lvl] < threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      name,
      msg: redactString(String(message ?? ''), secrets),
    };
    if (meta !== undefined) entry.meta = redactValue(meta, secrets);
    let line;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({ ts: entry.ts, level: lvl, name, msg: entry.msg, meta: '[unserializable]' });
    }
    stream.write(line + '\n');
  };

  return {
    level,
    debug: (m, meta) => emit('debug', m, meta),
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
    child: (childName) => createLogger({ ...opts, name: `${name}:${childName}` }),
  };
}

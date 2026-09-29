/**
 * Pabrik database. Memakai backend SQLite lokal (default) atau backend yang
 * disuntikkan eksplisit (in-memory untuk tes/demo).
 *
 * Tidak ada lagi ketergantungan runtime pada Supabase/PostgreSQL.
 */
import { createSqliteStore } from './sqliteStore.js';
import { createMemoryStore } from './memoryStore.js';
import { createRepositories } from './repositories.js';

/**
 * @param {object} config
 * @param {{ logger?: object, store?: object }} [deps]
 */
export function createDatabase(config, { logger, store } = {}) {
  let backend = store;
  if (!backend) {
    const dbPath = config?.database?.path || 'data/khutbah.db';
    backend = createSqliteStore({ path: dbPath }, { logger });
    logger?.info(`[DATABASE] Memakai backend SQLite`);
  }
  const repos = createRepositories(backend);
  return {
    ...repos,
    kind: backend.kind,
    close: () => backend.close?.(),
  };
}

export { createSqliteStore } from './sqliteStore.js';
export { createMemoryStore } from './memoryStore.js';
export { createRepositories } from './repositories.js';

/**
 * Pabrik database. Memilih backend Supabase bila kredensial ada, jika tidak
 * memakai in-memory (berguna untuk tes/demo; produksi wajib Supabase).
 */
import { createSupabaseStore } from './supabaseStore.js';
import { createMemoryStore } from './memoryStore.js';
import { createRepositories } from './repositories.js';

/**
 * @param {object} config
 * @param {{ logger?: object, store?: object }} [deps]
 */
export function createDatabase(config, { logger, store } = {}) {
  let backend = store;
  if (!backend) {
    const { url, secretKey } = config.supabase || {};
    if (url && secretKey) {
      backend = createSupabaseStore({ url, secretKey }, { logger });
      logger?.info('[DATABASE] Memakai backend Supabase');
    } else {
      backend = createMemoryStore();
      logger?.warn('[DATABASE] Kredensial Supabase kosong — memakai in-memory (bukan produksi)');
    }
  }
  const repos = createRepositories(backend);
  return { ...repos, kind: backend.kind };
}

export { createSupabaseStore } from './supabaseStore.js';
export { createMemoryStore } from './memoryStore.js';
export { createRepositories } from './repositories.js';

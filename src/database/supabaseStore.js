/**
 * Backend Supabase untuk primitive penyimpanan.
 *
 * Semua repository ditulis sekali terhadap primitive generik di sini,
 * sehingga logika dapat diuji dengan MemoryStore tanpa jaringan.
 */
import { createClient } from '@supabase/supabase-js';
import { DatabaseError } from '../utils/errors.js';

function applyFilters(query, filters) {
  let q = query;
  for (const [col, val] of Object.entries(filters || {})) {
    if (val === undefined) continue;
    if (Array.isArray(val)) q = q.in(col, val);
    else q = q.eq(col, val);
  }
  return q;
}

/**
 * @param {{ url: string, key: string }} creds
 * @param {{ logger?: object }} [deps]
 */
export function createSupabaseStore(creds, { logger } = {}) {
  if (!creds?.url || !creds?.key) {
    throw new DatabaseError('Kredensial Supabase tidak lengkap (url/key).');
  }
  const client = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const handle = (error, ctx) => {
    if (error) {
      logger?.error(`[DATABASE] ${ctx} gagal`, error);
      throw new DatabaseError(`${ctx}: ${error.message}`, { cause: error });
    }
  };

  const store = {
    kind: 'supabase',
    client,

    async insert(table, row) {
      const { data, error } = await client.from(table).insert(row).select().single();
      handle(error, `insert ${table}`);
      return data;
    },

    async update(table, filters, patch) {
      const q = applyFilters(client.from(table).update(patch), filters);
      const { data, error } = await q.select();
      handle(error, `update ${table}`);
      return data || [];
    },

    async select(table, { filters, order, limit, offset, columns } = {}) {
      let q = client.from(table).select(columns || '*');
      q = applyFilters(q, filters);
      if (order) q = q.order(order.column, { ascending: order.ascending !== false, nullsFirst: false });
      if (typeof offset === 'number' && typeof limit === 'number') q = q.range(offset, offset + limit - 1);
      else if (typeof limit === 'number') q = q.limit(limit);
      const { data, error } = await q;
      handle(error, `select ${table}`);
      return data || [];
    },

    async selectOne(table, filters) {
      const rows = await store.select(table, { filters, limit: 1 });
      return rows[0] || null;
    },

    async count(table, filters) {
      const q = applyFilters(client.from(table).select('*', { count: 'exact', head: true }), filters);
      const { count, error } = await q;
      handle(error, `count ${table}`);
      return count || 0;
    },

    async delete(table, filters) {
      const q = applyFilters(client.from(table).delete(), filters);
      const { error } = await q;
      handle(error, `delete ${table}`);
    },

    async searchArticles({ terms, limit, offset }) {
      const safeTerms = (terms || []).filter(Boolean);
      const p_query = safeTerms.join(' OR ');
      const { data, error } = await client.rpc('search_articles', {
        p_query,
        p_limit: limit,
        p_offset: offset,
      });
      handle(error, 'rpc search_articles');
      return { total: data?.total ?? 0, items: data?.items ?? [] };
    },

    async latestArticles({ limit, offset }) {
      const q = client
        .from('articles')
        .select('*')
        .eq('status', 'active')
        .order('published_at', { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
      const { data, error } = await q;
      handle(error, 'latest articles');
      return data || [];
    },

    /** Cek koneksi ringan (dipakai saat boot). */
    async ping() {
      const { error } = await client.from('articles').select('id', { count: 'exact', head: true });
      handle(error, 'ping');
      return true;
    },
  };

  return store;
}

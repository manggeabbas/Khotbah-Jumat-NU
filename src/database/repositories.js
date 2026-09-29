/**
 * Repository di atas primitive `store`. Satu implementasi dipakai untuk
 * SQLite maupun in-memory, sehingga logika mudah dites tanpa jaringan.
 */
import { slugify } from '../utils/text.js';

/**
 * @param {object} store
 */
export function createRepositories(store) {
  const articles = {
    async findByUrl(url) {
      return store.selectOne('articles', { url });
    },

    async findById(id) {
      return store.selectOne('articles', { id: Number(id) });
    },

    async upsert(input) {
      const url = input.url;
      if (!url) throw new Error('articles.upsert: url wajib ada');
      const existing = await store.selectOne('articles', { url });
      const nowIso = new Date().toISOString();
      const patch = {
        title: input.title,
        slug: input.slug || slugify(input.title),
        url,
        author: input.author ?? null,
        published_at: input.published_at ?? null,
        language: input.language || 'id',
        description: input.description ?? null,
        snippet: input.snippet ?? null,
        category: input.category ?? null,
        content: input.content ?? null,
        khutbah_1: input.khutbah_1 ?? null,
        khutbah_2: input.khutbah_2 ?? null,
        image_url: input.image_url ?? null,
        source: input.source || 'NU Online',
        content_hash: input.content_hash ?? null,
        status: input.status || 'active',
        last_synced_at: input.last_synced_at ?? nowIso,
      };

      if (!existing) {
        const row = await store.insert('articles', patch);
        return { article: row, inserted: true, updated: false };
      }
      if (existing.content_hash !== patch.content_hash) {
        const rows = await store.update('articles', { id: existing.id }, patch);
        return { article: rows[0] ?? existing, inserted: false, updated: true };
      }
      // Isi tidak berubah: tetap catat waktu sinkronisasi terakhir.
      const rows = await store.update('articles', { id: existing.id }, { last_synced_at: patch.last_synced_at });
      return { article: rows[0] ?? existing, inserted: false, updated: false };
    },

    async updateStatus(id, status) {
      const rows = await store.update('articles', { id: Number(id) }, { status });
      return rows[0] || null;
    },

    async search({ terms, limit, offset }) {
      return store.searchArticles({ terms, limit, offset });
    },

    async latest({ limit, offset = 0 }) {
      return store.latestArticles({ limit, offset });
    },

    async count(filters = {}) {
      return store.count('articles', filters);
    },
  };

  const users = {
    async upsertByTelegramId(profile) {
      const telegram_id = Number(profile.telegram_id);
      if (!telegram_id) throw new Error('users.upsert: telegram_id wajib ada');
      const existing = await store.selectOne('users', { telegram_id });
      const nowIso = new Date().toISOString();
      const fields = {
        username: profile.username ?? null,
        first_name: profile.first_name ?? null,
        last_name: profile.last_name ?? null,
        last_active_at: nowIso,
      };
      if (!existing) {
        return store.insert('users', { telegram_id, ...fields, created_at: nowIso });
      }
      const rows = await store.update('users', { id: existing.id }, fields);
      return rows[0] ?? existing;
    },

    async findByTelegramId(telegram_id) {
      return store.selectOne('users', { telegram_id: Number(telegram_id) });
    },

    async touch(id) {
      await store.update('users', { id: Number(id) }, { last_active_at: new Date().toISOString() });
    },

    async count() {
      return store.count('users', {});
    },

    async list({ limit = 20, offset = 0 } = {}) {
      return store.select('users', {
        order: { column: 'last_active_at', ascending: false },
        limit,
        offset,
      });
    },
  };

  const favorites = {
    async exists(userId, articleId) {
      const row = await store.selectOne('favorites', { user_id: Number(userId), article_id: Number(articleId) });
      return Boolean(row);
    },

    async add(userId, articleId) {
      if (await favorites.exists(userId, articleId)) return { created: false };
      await store.insert('favorites', { user_id: Number(userId), article_id: Number(articleId) });
      return { created: true };
    },

    async remove(userId, articleId) {
      await store.delete('favorites', { user_id: Number(userId), article_id: Number(articleId) });
    },

    async listByUser(userId, { limit = 20, offset = 0 } = {}) {
      const favs = await store.select('favorites', {
        filters: { user_id: Number(userId) },
        order: { column: 'created_at', ascending: false },
        limit,
        offset,
      });
      if (favs.length === 0) return [];
      const ids = favs.map((f) => f.article_id);
      const rows = await store.select('articles', { filters: { id: ids } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return favs.map((f) => ({ ...(byId.get(f.article_id) || { id: f.article_id }), favorited_at: f.created_at }));
    },

    async count(userId) {
      return store.count('favorites', userId ? { user_id: Number(userId) } : {});
    },
  };

  const history = {
    async record(userId, articleId) {
      await store.insert('history', {
        user_id: Number(userId),
        article_id: Number(articleId),
        opened_at: new Date().toISOString(),
      });
    },

    async listByUser(userId, { limit = 20, offset = 0 } = {}) {
      const rows = await store.select('history', {
        filters: { user_id: Number(userId) },
        order: { column: 'opened_at', ascending: false },
        limit,
        offset,
      });
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.article_id);
      const arts = await store.select('articles', { filters: { id: ids } });
      const byId = new Map(arts.map((r) => [r.id, r]));
      return rows.map((r) => ({ ...(byId.get(r.article_id) || { id: r.article_id }), opened_at: r.opened_at }));
    },

    /** Batasi riwayat per pengguna (hapus yang paling lama di luar `keep`). */
    async trim(userId, keep) {
      const all = await store.select('history', {
        filters: { user_id: Number(userId) },
        order: { column: 'opened_at', ascending: false },
      });
      const excess = all.slice(keep);
      for (const row of excess) {
        await store.delete('history', { id: row.id });
      }
      return excess.length;
    },

    async count() {
      return store.count('history', {});
    },
  };

  const searchLogs = {
    async add({ userId = null, query, resultCount = 0 }) {
      return store.insert('search_logs', {
        user_id: userId ? Number(userId) : null,
        query,
        result_count: resultCount,
      });
    },
    async count() {
      return store.count('search_logs', {});
    },
  };

  const syncLogs = {
    async start() {
      return store.insert('sync_logs', { started_at: new Date().toISOString(), status: 'running' });
    },
    async finish(id, patch) {
      const rows = await store.update('sync_logs', { id: Number(id) }, {
        finished_at: new Date().toISOString(),
        ...patch,
      });
      return rows[0] || null;
    },
    async last() {
      const rows = await store.select('sync_logs', { order: { column: 'started_at', ascending: false }, limit: 1 });
      return rows[0] || null;
    },
    async list({ limit = 10, offset = 0 } = {}) {
      return store.select('sync_logs', { order: { column: 'started_at', ascending: false }, limit, offset });
    },
    async recentErrors({ limit = 10 } = {}) {
      return store.select('sync_logs', {
        filters: { status: 'failed' },
        order: { column: 'started_at', ascending: false },
        limit,
      });
    },
  };

  return { store, articles, users, favorites, history, searchLogs, syncLogs };
}

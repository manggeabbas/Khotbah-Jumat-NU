import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSqliteStore } from '../src/database/sqliteStore.js';
import { createRepositories } from '../src/database/repositories.js';
import { initDatabase, applySchema, readSchema } from '../src/database/init.js';

/**
 * Setiap tes memakai database SQLite in-memory terpisah (per koneksi) sehingga
 * isolasi utuh tanpa file. Koneksi ditutup otomatis di akhir tes.
 */
function setup(t) {
  const store = createSqliteStore({ path: ':memory:' });
  if (t?.after) t.after(() => store.close());
  const repos = createRepositories(store);
  return { store, repos };
}

const baseArticle = (over = {}) => ({
  title: 'Sabar dalam Menghadapi Ujian',
  url: 'https://islam.nu.or.id/khutbah/sabar-abc',
  description: 'Khutbah tentang kesabaran',
  category: 'Khutbah Jumat',
  content: 'Isi khutbah tentang sabar dan tawakal.',
  content_hash: 'hash-1',
  published_at: '2026-09-01T00:00:00.000Z',
  ...over,
});

test('D-ART-01: upsert menyisipkan artikel baru', async (t) => {
  const { repos } = setup(t);
  const res = await repos.articles.upsert(baseArticle());
  assert.equal(res.inserted, true);
  assert.equal(res.updated, false);
  assert.ok(res.article.id);
  assert.equal(res.article.slug, 'sabar-dalam-menghadapi-ujian');
  assert.equal(res.article.source, 'NU Online');
});

test('D-ART-02: upsert memperbarui bila hash berubah', async (t) => {
  const { repos } = setup(t);
  await repos.articles.upsert(baseArticle());
  const res = await repos.articles.upsert(baseArticle({ content: 'Isi baru', content_hash: 'hash-2' }));
  assert.equal(res.inserted, false);
  assert.equal(res.updated, true);
  assert.equal(res.article.content, 'Isi baru');
  assert.equal(await repos.articles.count(), 1);
});

test('D-ART-03: upsert tidak berubah bila hash sama', async (t) => {
  const { repos } = setup(t);
  await repos.articles.upsert(baseArticle());
  const res = await repos.articles.upsert(baseArticle());
  assert.equal(res.inserted, false);
  assert.equal(res.updated, false);
});

test('D-ART-04: latest berpaginasi & urut published_at desc', async (t) => {
  const { repos } = setup(t);
  for (let i = 1; i <= 10; i++) {
    await repos.articles.upsert(
      baseArticle({
        url: `https://x/${i}`,
        title: `Artikel ${i}`,
        content_hash: `h${i}`,
        published_at: `2026-09-${String(i).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
  }
  const page1 = await repos.articles.latest({ limit: 8, offset: 0 });
  assert.equal(page1.length, 8);
  assert.equal(page1[0].title, 'Artikel 10');
  const page2 = await repos.articles.latest({ limit: 8, offset: 8 });
  assert.equal(page2.length, 2);
});

test('search: prioritas judul di atas isi', async (t) => {
  const { repos } = setup(t);
  await repos.articles.upsert(baseArticle({ url: 'https://x/a', title: 'Kesabaran', content: 'lain', content_hash: 'a' }));
  await repos.articles.upsert(
    baseArticle({ url: 'https://x/b', title: 'Topik lain', content: 'banyak sabar di sini', content_hash: 'b' }),
  );
  const res = await repos.articles.search({ terms: ['sabar'], limit: 8, offset: 0 });
  assert.ok(res.total >= 1);
  assert.match(res.items[0].title, /Kesabaran/);
});

test('search: tidak mengembalikan artikel non-aktif', async (t) => {
  const { repos } = setup(t);
  await repos.articles.upsert(baseArticle({ status: 'parse_failed' }));
  const res = await repos.articles.search({ terms: ['sabar'], limit: 8, offset: 0 });
  assert.equal(res.total, 0);
});

test('D-USR-01: telegram_id unik (update bukan duplikat)', async (t) => {
  const { repos } = setup(t);
  const u1 = await repos.users.upsertByTelegramId({ telegram_id: 555, first_name: 'A' });
  const u2 = await repos.users.upsertByTelegramId({ telegram_id: 555, first_name: 'B' });
  assert.equal(u1.id, u2.id);
  assert.equal(u2.first_name, 'B');
  assert.equal(await repos.users.count(), 1);
});

test('D-FAV-01: favorit unik per user+artikel', async (t) => {
  const { repos } = setup(t);
  const user = await repos.users.upsertByTelegramId({ telegram_id: 1 });
  const art = (await repos.articles.upsert(baseArticle())).article;
  const first = await repos.favorites.add(user.id, art.id);
  const second = await repos.favorites.add(user.id, art.id);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(await repos.favorites.count(user.id), 1);
  await repos.favorites.remove(user.id, art.id);
  assert.equal(await repos.favorites.count(user.id), 0);
});

test('D-FAV-02: listByUser mengembalikan artikel terlampir', async (t) => {
  const { repos } = setup(t);
  const user = await repos.users.upsertByTelegramId({ telegram_id: 2 });
  const art = (await repos.articles.upsert(baseArticle())).article;
  await repos.favorites.add(user.id, art.id);
  const list = await repos.favorites.listByUser(user.id, { limit: 10 });
  assert.equal(list.length, 1);
  assert.equal(list[0].title, art.title);
  assert.ok(list[0].favorited_at);
});

test('D-FAV-03: favorit user terisolasi (tidak melihat milik user lain)', async (t) => {
  const { repos } = setup(t);
  const u1 = await repos.users.upsertByTelegramId({ telegram_id: 11 });
  const u2 = await repos.users.upsertByTelegramId({ telegram_id: 22 });
  const art = (await repos.articles.upsert(baseArticle())).article;
  await repos.favorites.add(u1.id, art.id);
  assert.equal((await repos.favorites.listByUser(u2.id, { limit: 10 })).length, 0);
  assert.equal((await repos.favorites.listByUser(u1.id, { limit: 10 })).length, 1);
});

test('D-FAV-04: FOREIGN KEY favorit ditolak bila artikel tidak ada', async (t) => {
  const { repos, store } = setup(t);
  const user = await repos.users.upsertByTelegramId({ telegram_id: 99 });
  await assert.rejects(() => store.insert('favorites', { user_id: user.id, article_id: 999999 }));
});

test('D-HIS-01: riwayat dibatasi 50 terakhir', async (t) => {
  const { repos, store } = setup(t);
  const user = await repos.users.upsertByTelegramId({ telegram_id: 3 });
  const art = (await repos.articles.upsert(baseArticle())).article;
  for (let i = 1; i <= 55; i++) {
    await repos.history.record(user.id, art.id);
  }
  const removed = await repos.history.trim(user.id, 50);
  assert.equal(removed, 5);
  assert.equal(await store.count('history', { user_id: user.id }), 50);
});

test('D-HIS-02: listByUser urut terbaru dulu', async (t) => {
  const { repos } = setup(t);
  const user = await repos.users.upsertByTelegramId({ telegram_id: 4 });
  const a1 = (await repos.articles.upsert(baseArticle({ url: 'https://x/1', title: 'Pertama', content_hash: '1' }))).article;
  const a2 = (await repos.articles.upsert(baseArticle({ url: 'https://x/2', title: 'Kedua', content_hash: '2' }))).article;
  await repos.history.record(user.id, a1.id);
  await new Promise((r) => setTimeout(r, 5));
  await repos.history.record(user.id, a2.id);
  const list = await repos.history.listByUser(user.id, { limit: 10 });
  assert.equal(list[0].title, 'Kedua');
});

test('D-LOG-01: search_logs mencatat query & result_count', async (t) => {
  const { repos } = setup(t);
  await repos.searchLogs.add({ userId: null, query: 'sabar', resultCount: 8 });
  assert.equal(await repos.searchLogs.count(), 1);
});

test('D-LOG-02: sync_logs start/finish/last', async (t) => {
  const { repos } = setup(t);
  const run = await repos.syncLogs.start();
  assert.equal(run.status, 'running');
  await repos.syncLogs.finish(run.id, {
    status: 'success',
    articles_found: 14,
    articles_inserted: 9,
    articles_updated: 2,
    articles_failed: 3,
  });
  const last = await repos.syncLogs.last();
  assert.equal(last.status, 'success');
  assert.equal(last.articles_inserted, 9);
  assert.ok(last.finished_at);
});

test('D-SQL-01: skema SQLite memuat tabel, kolom, constraint, dan indeks', () => {
  const sql = readSchema();
  for (const t of ['articles', 'users', 'favorites', 'history', 'search_logs', 'sync_logs']) {
    assert.match(sql, new RegExp(`create table if not exists ${t}\\b`, 'i'), `tabel ${t} hilang`);
  }
  // Kolom penting
  for (const col of ['title', 'url', 'slug', 'category', 'published_at', 'description', 'snippet', 'content', 'khutbah_1', 'khutbah_2', 'image_url', 'source', 'content_hash', 'status', 'last_synced_at']) {
    assert.match(sql, new RegExp(`\\b${col}\\b`), `kolom ${col} hilang`);
  }
  // UNIQUE & FK
  assert.match(sql, /create unique index if not exists articles_url_key/i);
  assert.match(sql, /create unique index if not exists users_telegram_id_key/i);
  assert.match(sql, /favorites_user_article_key unique \(user_id, article_id\)/i);
  assert.match(sql, /references users \(id\) on delete cascade/i);
  assert.match(sql, /references articles \(id\) on delete cascade/i);
  // CHECK
  assert.match(sql, /articles_status_check check/i);
  assert.match(sql, /users_telegram_id_positive check/i);
  assert.match(sql, /sync_logs_status_check check/i);
  // Tidak ada sisa konstruksi PostgreSQL/Supabase.
  assert.ok(!/tsvector|row level security|grant |public\./i.test(sql), 'tidak boleh ada dialek PostgreSQL');
});

test('D-SQL-02: applySchema idempoten (dua kali aman)', (t) => {
  const { db } = initDatabase({ dbPath: ':memory:' });
  db.exec('INSERT INTO users (telegram_id, first_name) VALUES (123, \'Idem\')');
  assert.doesNotThrow(() => applySchema(db));
  assert.doesNotThrow(() => applySchema(db));
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  db.close();
});

test('D-SQL-03: store SQLite CRUD langsung + count/filter array', async (t) => {
  const { store } = setup(t);
  const row = await store.insert('articles', { title: 'A', url: 'https://x/sql-3' });
  assert.ok(row.id);
  const found = await store.selectOne('articles', { id: row.id });
  assert.equal(found.title, 'A');
  const rows = await store.select('articles', { filters: { id: [row.id, 999999] } });
  assert.equal(rows.length, 1);
  assert.equal(await store.count('articles', {}), 1);
  await store.update('articles', { id: row.id }, { title: 'B' });
  assert.equal((await store.selectOne('articles', { id: row.id })).title, 'B');
  await store.delete('articles', { id: row.id });
  assert.equal(await store.count('articles', {}), 0);
});

test('D-ART-05: image_url & last_synced_at tersimpan', async (t) => {
  const { repos } = setup(t);
  const res = await repos.articles.upsert(
    baseArticle({ image_url: 'https://img.example/a.webp', url: 'https://x/img' }),
  );
  assert.equal(res.article.image_url, 'https://img.example/a.webp');
  assert.ok(res.article.last_synced_at, 'last_synced_at harus terisi');
});

test('D-ART-06: last_synced_at diperbarui walau konten sama', async (t) => {
  const { repos } = setup(t);
  const a1 = await repos.articles.upsert(baseArticle({ url: 'https://x/sync', last_synced_at: '2026-01-01T00:00:00.000Z' }));
  assert.equal(a1.article.last_synced_at, '2026-01-01T00:00:00.000Z');
  const a2 = await repos.articles.upsert(baseArticle({ url: 'https://x/sync', last_synced_at: '2026-02-02T00:00:00.000Z' }));
  assert.equal(a2.updated, false);
  assert.equal(a2.article.last_synced_at, '2026-02-02T00:00:00.000Z');
});

test('D-SQL-04: data Unicode/Arabic tersimpan utuh', async (t) => {
  const { repos } = setup(t);
  const arabic = 'السلام عليكم ورحمة الله وبركاته';
  const res = await repos.articles.upsert(
    baseArticle({ url: 'https://x/arabic', title: 'Doa Arab', content: arabic, content_hash: 'ar' }),
  );
  const found = await repos.articles.findById(res.article.id);
  assert.equal(found.content, arabic);
});

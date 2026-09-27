import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMemoryStore } from '../src/database/memoryStore.js';
import { createRepositories } from '../src/database/repositories.js';

function setup() {
  const store = createMemoryStore();
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

test('D-ART-01: upsert menyisipkan artikel baru', async () => {
  const { repos } = setup();
  const res = await repos.articles.upsert(baseArticle());
  assert.equal(res.inserted, true);
  assert.equal(res.updated, false);
  assert.ok(res.article.id);
  assert.equal(res.article.slug, 'sabar-dalam-menghadapi-ujian');
  assert.equal(res.article.source, 'NU Online');
});

test('D-ART-02: upsert memperbarui bila hash berubah', async () => {
  const { repos } = setup();
  await repos.articles.upsert(baseArticle());
  const res = await repos.articles.upsert(baseArticle({ content: 'Isi baru', content_hash: 'hash-2' }));
  assert.equal(res.inserted, false);
  assert.equal(res.updated, true);
  assert.equal(res.article.content, 'Isi baru');
  assert.equal(await repos.articles.count(), 1);
});

test('D-ART-03: upsert tidak berubah bila hash sama', async () => {
  const { repos } = setup();
  await repos.articles.upsert(baseArticle());
  const res = await repos.articles.upsert(baseArticle());
  assert.equal(res.inserted, false);
  assert.equal(res.updated, false);
});

test('D-ART-04: latest berpaginasi & urut published_at desc', async () => {
  const { repos } = setup();
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

test('search: prioritas judul di atas isi', async () => {
  const { repos } = setup();
  await repos.articles.upsert(baseArticle({ url: 'https://x/a', title: 'Kesabaran', content: 'lain', content_hash: 'a' }));
  await repos.articles.upsert(
    baseArticle({ url: 'https://x/b', title: 'Topik lain', content: 'banyak sabar di sini', content_hash: 'b' }),
  );
  const res = await repos.articles.search({ terms: ['sabar'], limit: 8, offset: 0 });
  assert.ok(res.total >= 1);
  assert.match(res.items[0].title, /Kesabaran/);
});

test('search: tidak mengembalikan artikel non-aktif', async () => {
  const { repos } = setup();
  await repos.articles.upsert(baseArticle({ status: 'parse_failed' }));
  const res = await repos.articles.search({ terms: ['sabar'], limit: 8, offset: 0 });
  assert.equal(res.total, 0);
});

test('D-USR-01: telegram_id unik (update bukan duplikat)', async () => {
  const { repos } = setup();
  const u1 = await repos.users.upsertByTelegramId({ telegram_id: 555, first_name: 'A' });
  const u2 = await repos.users.upsertByTelegramId({ telegram_id: 555, first_name: 'B' });
  assert.equal(u1.id, u2.id);
  assert.equal(u2.first_name, 'B');
  assert.equal(await repos.users.count(), 1);
});

test('D-FAV-01: favorit unik per user+artikel', async () => {
  const { repos } = setup();
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

test('D-FAV-02: listByUser mengembalikan artikel terlampir', async () => {
  const { repos } = setup();
  const user = await repos.users.upsertByTelegramId({ telegram_id: 2 });
  const art = (await repos.articles.upsert(baseArticle())).article;
  await repos.favorites.add(user.id, art.id);
  const list = await repos.favorites.listByUser(user.id, { limit: 10 });
  assert.equal(list.length, 1);
  assert.equal(list[0].title, art.title);
  assert.ok(list[0].favorited_at);
});

test('D-HIS-01: riwayat dibatasi 50 terakhir', async () => {
  const { repos, store } = setup();
  const user = await repos.users.upsertByTelegramId({ telegram_id: 3 });
  for (let i = 1; i <= 55; i++) {
    await repos.history.record(user.id, i);
  }
  const removed = await repos.history.trim(user.id, 50);
  assert.equal(removed, 5);
  assert.equal(await store.count('history', { user_id: user.id }), 50);
});

test('D-HIS-02: listByUser urut terbaru dulu', async () => {
  const { repos } = setup();
  const user = await repos.users.upsertByTelegramId({ telegram_id: 4 });
  const a1 = (await repos.articles.upsert(baseArticle({ url: 'https://x/1', title: 'Pertama', content_hash: '1' }))).article;
  const a2 = (await repos.articles.upsert(baseArticle({ url: 'https://x/2', title: 'Kedua', content_hash: '2' }))).article;
  await repos.history.record(user.id, a1.id);
  await repos.history.record(user.id, a2.id);
  const list = await repos.history.listByUser(user.id, { limit: 10 });
  assert.equal(list[0].title, 'Kedua');
});

test('D-LOG-01: search_logs mencatat query & result_count', async () => {
  const { repos } = setup();
  await repos.searchLogs.add({ userId: null, query: 'sabar', resultCount: 8 });
  assert.equal(await repos.searchLogs.count(), 1);
});

test('D-LOG-02: sync_logs start/finish/last', async () => {
  const { repos } = setup();
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

test('D-SQL-01: schema idempoten memuat semua tabel & constraint', () => {
  const sql = readFileSync(fileURLToPath(new URL('../src/database/schema.sql', import.meta.url)), 'utf8');
  for (const t of ['articles', 'users', 'favorites', 'history', 'search_logs', 'sync_logs']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t}\\b`, 'i'), `tabel ${t} hilang`);
  }
  assert.match(sql, /create unique index if not exists articles_url_key/i);
  assert.match(sql, /create unique index if not exists users_telegram_id_key/i);
  assert.match(sql, /favorites_user_article_key unique \(user_id, article_id\)/i);
  assert.match(sql, /search_vector tsvector generated always as/i);
  assert.match(sql, /create or replace function public\.search_articles/i);
});

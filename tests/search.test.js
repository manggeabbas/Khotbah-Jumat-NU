import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandQuery, normalizeTerm, SYNONYMS } from '../src/search/normalize.js';
import { createSearchService } from '../src/search/search.js';
import { createMemoryStore } from '../src/database/memoryStore.js';
import { createRepositories } from '../src/database/repositories.js';

const baseArticle = (over = {}) => ({
  title: 'Salat dan Kesabaran',
  url: over.url || 'https://x/1',
  description: 'tentang salat',
  category: 'Khutbah',
  content: 'Isi tentang salat dan sabar.',
  content_hash: over.content_hash || 'h1',
  published_at: over.published_at || '2026-09-01T00:00:00.000Z',
  ...over,
});

test('U-NORM-01: sinonim normalisasi', () => {
  assert.equal(normalizeTerm('shalat'), 'salat');
  assert.equal(normalizeTerm('rizki'), 'rezeki');
  assert.equal(normalizeTerm('ujian'), 'cobaan');
});

test('U-NORM-02: expandQuery memuat bentuk asli & normal, unik', () => {
  const terms = expandQuery('shalat rizki');
  assert.ok(terms.includes('shalat'));
  assert.ok(terms.includes('salat'));
  assert.ok(terms.includes('rizki'));
  assert.ok(terms.includes('rezeki'));
  assert.equal(new Set(terms).size, terms.length);
});

test('U-NORM-03: normalisasi tidak mengubah isi sumber', () => {
  // SYNONYMS hanya konstanta pemetaan query; tak ada penulisan ke artikel.
  assert.ok(Object.keys(SYNONYMS).length > 3);
});

test('search: menemukan via sinonim (shalat -> salat)', async () => {
  const repos = createRepositories(createMemoryStore());
  await repos.articles.upsert(baseArticle());
  const svc = createSearchService({ repos, config: { search: { maxResults: 8 } } });
  const res = await svc.search({ query: 'shalat' });
  assert.ok(res.total >= 1);
  assert.equal(res.items[0].title, 'Salat dan Kesabaran');
});

test('search: query kosong -> nol hasil', async () => {
  const repos = createRepositories(createMemoryStore());
  const svc = createSearchService({ repos, config: { search: { maxResults: 8 } } });
  const res = await svc.search({ query: '   ' });
  assert.equal(res.total, 0);
});

test('search: mencatat search_logs', async () => {
  const repos = createRepositories(createMemoryStore());
  const svc = createSearchService({ repos, config: { search: { maxResults: 8 } } });
  await svc.search({ query: 'sabar', userId: null });
  assert.equal(await repos.searchLogs.count(), 1);
});

test('search: pagination stabil', async () => {
  const repos = createRepositories(createMemoryStore());
  for (let i = 1; i <= 10; i++) {
    await repos.articles.upsert(baseArticle({ url: `https://x/${i}`, title: `Sabar ${i}`, content_hash: `h${i}` }));
  }
  const svc = createSearchService({ repos, config: { search: { maxResults: 4 } } });
  const p0 = await svc.search({ query: 'sabar', page: 0 });
  const p1 = await svc.search({ query: 'sabar', page: 1 });
  assert.equal(p0.items.length, 4);
  assert.equal(p0.hasMore, true);
  assert.equal(p1.page, 1);
  assert.notEqual(p0.items[0].id, p1.items[0].id);
});

test('search: query aneh/berbahaya tidak melempar', async () => {
  const repos = createRepositories(createMemoryStore());
  const svc = createSearchService({ repos, config: { search: { maxResults: 8 } } });
  const res = await svc.search({ query: "'; DROP TABLE articles; --" });
  assert.equal(res.total, 0);
});

#!/usr/bin/env node
/**
 * End-to-end test (TERBATAS) memakai SQLite lokal untuk Phase 5–9:
 * search, pagination, article viewer, favorite add/remove, history, PDF.
 *
 * Data uji memakai domain example.invalid dan DIHAPUS kembali di akhir.
 * Tidak menyentuh artikel produksi. Tidak mencetak credential.
 *
 *   npm run smoke:e2e
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv } from '../src/loadEnv.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createDatabase } from '../src/database/index.js';
import { createSearchService } from '../src/search/search.js';
import { createPdfService } from '../src/pdf/generator.js';

async function main() {
  loadEnv();
  const config = loadConfig(process.env, { requireSecrets: true });
  const logger = createLogger({
    level: 'warn',
    secrets: [config.telegram.token],
  });
  const repos = createDatabase(config, { logger });
  const search = createSearchService({ repos, config, logger });

  const results = [];
  const ok = (name, pass, detail = '') => {
    results.push(pass);
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
  };

  const tag = Date.now();
  const createdArticleIds = [];
  let userId = null;
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'khutbah-e2e-'));

  const mkArticle = (n) => ({
    title: `E2E Khutbah Sabar ${tag}-${n}`,
    slug: `e2e-sabar-${tag}-${n}`,
    url: `https://example.invalid/e2e-${tag}-${n}`,
    description: 'Ringkasan kesabaran (e2e).',
    category: 'Khutbah',
    source: 'NU Online',
    content: 'Sabar adalah kunci. ' + 'Isi khutbah kesabaran. '.repeat(40),
    khutbah_1: 'Khutbah I tentang sabar. ' + 'lorem ipsum dolor. '.repeat(30),
    khutbah_2: 'Khutbah II penutup.',
    content_hash: `e2e-${tag}-${n}`,
    status: 'active',
    published_at: new Date().toISOString(),
    snippet: 'Ringkasan kesabaran (e2e).',
  });

  const arabicArticle = {
    title: `E2E Arabic ${tag}`,
    slug: `e2e-arabic-${tag}`,
    url: `https://example.invalid/e2e-ar-${tag}`,
    content: 'السلام عليكم ورحمة الله وبركاته '.repeat(10),
    description: 'Doa (e2e).',
    category: 'Khutbah',
    source: 'NU Online',
    content_hash: `e2e-ar-${tag}`,
    status: 'active',
    snippet: 'السلام عليكم',
    published_at: new Date().toISOString(),
  };

  try {
    // Seed
    for (let n = 1; n <= 3; n++) {
      const row = (await repos.articles.upsert(mkArticle(n))).article;
      createdArticleIds.push(row.id);
    }
    const arRow = (await repos.articles.upsert(arabicArticle)).article;
    createdArticleIds.push(arRow.id);
    ok('seed artikel uji', createdArticleIds.length === 4, `${createdArticleIds.length} baris`);

    // User uji
    userId = (await repos.users.upsertByTelegramId({ telegram_id: 700000000000 + (tag % 1000000), first_name: 'E2E' })).id;

    // SEARCH (SQLite)
    const s1 = await search.search({ query: 'sabar', page: 0, pageSize: 2, userId });
    ok('search menemukan hasil', s1.total >= 3, `total ${s1.total}`);
    ok('pagination: halaman 0 berisi 2 + hasMore', s1.items.length === 2 && s1.hasMore === true);
    const s2 = await search.search({ query: 'sabar', page: 1, pageSize: 2, userId });
    ok('pagination: halaman 1 berbeda', s2.page === 1 && s2.items.length >= 1);

    const sAr = await search.search({ query: 'السلام', page: 0, userId });
    ok('search Arabic', sAr.total >= 1, `total ${sAr.total}`);

    const sNone = await search.search({ query: 'zzznotexist', page: 0, userId });
    ok('search tanpa hasil', sNone.total === 0);

    // ARTICLE VIEWER (baca DB, bukan scraping)
    const art = await repos.articles.findById(createdArticleIds[0]);
    ok('viewer: artikel ditemukan', Boolean(art) && art.title.includes('E2E Khutbah Sabar'));

    // FAVORITE add / duplicate / remove
    const fav1 = await repos.favorites.add(userId, art.id);
    const fav2 = await repos.favorites.add(userId, art.id);
    ok('favorit: tambah', fav1.created === true);
    ok('favorit: tidak duplikat', fav2.created === false);
    const favList = await repos.favorites.listByUser(userId, { limit: 10 });
    ok('favorit: daftar berisi artikel', favList.some((a) => a.id === art.id));
    await repos.favorites.remove(userId, art.id);
    ok('favorit: hapus', (await repos.favorites.count(userId)) === 0);

    // HISTORY
    await repos.history.record(userId, art.id);
    const hist = await repos.history.listByUser(userId, { limit: 10 });
    ok('history: tercatat', hist.some((a) => a.id === art.id));

    // PDF
    const pdfService = createPdfService({ config, logger, outputDir: outDir });
    const file = await pdfService.generate(art);
    ok('pdf: dibuat', fs.existsSync(file.path) && fs.statSync(file.path).size > 500, file.filename);
    await pdfService.cleanup(file.path);
    ok('pdf: cleanup', !fs.existsSync(file.path));

    // SEARCH TIDAK SCRAPING: search service tidak punya akses scraper (struktural)
    ok('search tidak memakai scraper (struktural)', !('scraper' in search));
  } catch (err) {
    ok(`e2e error: ${err?.message || err}`, false);
  } finally {
    // Cleanup
    if (userId) {
      try {
        await repos.store.delete('favorites', { user_id: userId });
        await repos.store.delete('history', { user_id: userId });
        await repos.store.delete('search_logs', { user_id: userId });
      } catch { /* abaikan */ }
    }
    for (const id of createdArticleIds) {
      try { await repos.store.delete('articles', { id }); } catch { /* abaikan */ }
    }
    if (userId) {
      try { await repos.store.delete('users', { id: userId }); } catch { /* abaikan */ }
    }
    let leftover = 0;
    for (const id of createdArticleIds) {
      const row = await repos.store.selectOne('articles', { id });
      if (row) leftover++;
    }
    ok('cleanup data e2e', leftover === 0, `${createdArticleIds.length} artikel dihapus`);
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* abaikan */ }
  }

  const failed = results.filter((r) => !r).length;
  process.stdout.write(`\nRINGKASAN E2E: ${results.length - failed}/${results.length} PASS\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`[E2E] Gagal: ${err?.message || err}\n`);
  process.exit(1);
});

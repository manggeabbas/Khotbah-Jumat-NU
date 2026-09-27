import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseListing, parseArticle, normalizeUrl, parseIndonesianDate, isAllowedArticleUrl, articleSlug } from '../src/scraper/parser.js';
import { cleanHtmlBody, splitKhutbahSections } from '../src/scraper/cleaner.js';
import { parseRobots, isAllowed, selectRules } from '../src/scraper/robots.js';
import { createFetchClient } from '../src/scraper/fetchClient.js';
import { buildArticleRecord, createSyncService } from '../src/scraper/sync.js';
import { createNuOnlineScraper } from '../src/scraper/nuonline.js';
import { createMemoryStore } from '../src/database/memoryStore.js';
import { createRepositories } from '../src/database/repositories.js';
import { ScraperError } from '../src/utils/errors.js';

const fixture = (name) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
const BASE = 'https://islam.nu.or.id';

test('P-LIST-01: parse listing -> item unik + nextPage', () => {
  const { items, nextPage } = parseListing(fixture('listing.html'), BASE);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Sabar dalam Menghadapi Ujian');
  assert.equal(items[1].url, `${BASE}/khutbah/khutbah-jumat-rezeki-yang-berkah-DEF34`);
  assert.equal(nextPage, `${BASE}/khutbah/2`);
  // Tidak mengandung halaman kategori atau pagination.
  assert.ok(!items.some((i) => /\/(2|3)$/.test(i.url)));
  assert.ok(!items.some((i) => i.url === `${BASE}/khutbah`));
});

test('P-ART-01: metadata artikel', () => {
  const a = parseArticle(fixture('article.html'), `${BASE}/khutbah/khutbah-jumat-sabar-dalam-ujian-ABC12`, BASE);
  assert.equal(a.title, 'Sabar dalam Menghadapi Ujian');
  assert.equal(a.url, `${BASE}/khutbah/khutbah-jumat-sabar-dalam-ujian-ABC12`);
  assert.equal(a.description, 'Khutbah Jumat tentang kesabaran menghadapi ujian hidup (fixture).');
  assert.equal(a.source, 'NU Online');
  assert.equal(a.published_at, '2026-09-24T07:00:00.000Z'); // 14:00 WIB = 07:00 UTC
  assert.equal(a.image_url, 'https://storage.example.test/img/abc.webp');
});

test('P-ART-02: body bersih tanpa nav/iklan/script', () => {
  const a = parseArticle(fixture('article.html'), `${BASE}/khutbah/x`, BASE);
  assert.ok(!/IKLAN/i.test(a.content));
  assert.ok(!/window\.ads/.test(a.content));
  assert.ok(!/Navigasi/.test(a.content));
  assert.match(a.content, /Setiap manusia/);
});

test('P-ART-03: paragraf & teks Arab dipertahankan', () => {
  const a = parseArticle(fixture('article.html'), `${BASE}/khutbah/x`, BASE);
  assert.match(a.content, /بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ/);
  assert.match(a.content, /Transliterasi: bismillāhir/);
  assert.match(a.content, /\n\n/); // ada pemisah paragraf
});

test('P-ART-04: pemisahan Khutbah I & II bila penanda ada', () => {
  const a = parseArticle(fixture('article.html'), `${BASE}/khutbah/x`, BASE);
  assert.ok(a.khutbah_1.startsWith('Isi khutbah pertama'));
  assert.ok(a.khutbah_2.startsWith('Isi khutbah kedua'));
  assert.ok(!/^Khutbah I/.test(a.khutbah_1));
});

test('P-ART-05: tanpa body -> content kosong', () => {
  const a = parseArticle(fixture('article-no-body.html'), `${BASE}/khutbah/artikel-tanpa-body-XYZ99`, BASE);
  assert.ok(!a.content);
  assert.equal(a.khutbah_1, null);
});

test('P-ART-06: tanpa penanda -> tidak mengarang bagian khutbah', () => {
  const a = parseArticle(fixture('article-no-markers.html'), `${BASE}/khutbah/artikel-tanpa-penanda-MNO55`, BASE);
  assert.equal(a.khutbah_1, null);
  assert.equal(a.khutbah_2, null);
  assert.match(a.content, /Paragraf pertama/);
  assert.match(a.content, /الْحَمْدُ لِلَّهِ/);
});

test('P-ART-07: splitKhutbahSections hanya bila penanda ada', () => {
  const clean = cleanHtmlBody('<p>awal</p><p><strong>Khutbah I</strong></p><p>satu</p>');
  const res = splitKhutbahSections(clean.blocks);
  assert.equal(res.khutbah2, null);
  assert.match(res.khutbah1, /satu/);
});

test('parseIndonesianDate: format & invalid', () => {
  assert.equal(parseIndonesianDate('Kamis, 24 September 2026 | 14:00 WIB'), '2026-09-24T07:00:00.000Z');
  assert.equal(parseIndonesianDate('tanpa tanggal'), null);
});

test('normalizeUrl: buang query/hash/trailing slash', () => {
  assert.equal(normalizeUrl('/khutbah/x/?a=1#b', BASE), `${BASE}/khutbah/x`);
});

test('robots: parse & isAllowed', () => {
  const groups = parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/ok');
  const rules = selectRules(groups, 'KhutbahJumatBot/0.1');
  assert.equal(isAllowed(rules, '/khutbah'), true);
  assert.equal(isAllowed(rules, '/private/x'), false);
  assert.equal(isAllowed(rules, '/private/ok'), true);
});

test('robots: empty disallow = izinkan semua', () => {
  const rules = selectRules(parseRobots('User-agent: *\nDisallow:'), 'bot');
  assert.equal(isAllowed(rules, '/khutbah/x'), true);
});

test('fetchClient: retry pada 500 lalu sukses', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls < 2) return { status: 500, ok: false, text: async () => '' };
    return { status: 200, ok: true, text: async () => 'ok' };
  };
  const client = createFetchClient({ fetchImpl, sleepImpl: async () => {}, requestDelayMs: 0, maxRetries: 3 });
  assert.equal(await client.getText('https://x'), 'ok');
  assert.equal(calls, 2);
});

test('fetchClient: 403 tidak diulang', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { status: 403, ok: false, text: async () => '' };
  };
  const client = createFetchClient({ fetchImpl, sleepImpl: async () => {}, requestDelayMs: 0, maxRetries: 3 });
  await assert.rejects(() => client.getText('https://x'));
  assert.equal(calls, 1);
});

test('fetchClient: 404 tidak diulang', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { status: 404, ok: false, text: async () => '' };
  };
  const client = createFetchClient({ fetchImpl, sleepImpl: async () => {}, requestDelayMs: 0, maxRetries: 3 });
  await assert.rejects(() => client.getText('https://x'));
  assert.equal(calls, 1);
});

test('buildArticleRecord: mode aman -> content null + snippet', () => {
  const parsed = parseArticle(fixture('article.html'), `${BASE}/khutbah/x`, BASE);
  const rec = buildArticleRecord(parsed, { content: { fullContentEnabled: false, snippetMaxLength: 400 } });
  assert.equal(rec.content, null);
  assert.equal(rec.khutbah_1, null);
  assert.ok(rec.snippet && rec.snippet.length > 0);
  assert.equal(rec.status, 'active');
  assert.ok(rec.content_hash);
});

test('buildArticleRecord: mode penuh -> content + khutbah', () => {
  const parsed = parseArticle(fixture('article.html'), `${BASE}/khutbah/x`, BASE);
  const rec = buildArticleRecord(parsed, { content: { fullContentEnabled: true, snippetMaxLength: 400 } });
  assert.match(rec.content, /khutbah pertama/);
  assert.ok(rec.khutbah_1);
  assert.ok(rec.khutbah_2);
});

test('buildArticleRecord: konten pendek -> parse_failed', () => {
  const parsed = parseArticle(fixture('article-no-body.html'), `${BASE}/khutbah/artikel-tanpa-body-XYZ99`, BASE);
  const rec = buildArticleRecord(parsed, { content: { fullContentEnabled: true, snippetMaxLength: 400 } });
  assert.equal(rec.status, 'parse_failed');
});

test('buildArticleRecord: tanpa url -> null', () => {
  const rec = buildArticleRecord({ title: 'x', url: null, content: 'y' }, { content: {} });
  assert.equal(rec, null);
});

// -------------------- Sync --------------------

function makeConfig(over = {}) {
  return {
    scraper: {
      source: { baseUrl: BASE, listPath: '/khutbah' },
      maxListingPages: 1,
      maxArticles: 10,
      ...(over.scraper || {}),
    },
    content: { fullContentEnabled: false, snippetMaxLength: 400, ...(over.content || {}) },
  };
}

function fakeScraper(articles) {
  return {
    async discover() {
      return articles.map((a) => ({ url: a.url, title: a.title }));
    },
    async fetchArticle(url) {
      return articles.find((a) => a.url === url);
    },
  };
}

test('S-SYN-01: sync idempoten (run kedua tidak menyisipkan)', async () => {
  const repos = createRepositories(createMemoryStore());
  const parsed = parseArticle(fixture('article.html'), `${BASE}/khutbah/x`, BASE);
  const scraper = fakeScraper([parsed]);
  const sync = createSyncService({ repos, config: makeConfig(), scraper });
  const r1 = await sync.run();
  assert.equal(r1.stats.inserted, 1);
  const r2 = await sync.run();
  assert.equal(r2.stats.inserted, 0);
  assert.equal(r2.stats.updated, 0);
  assert.equal(await repos.articles.count(), 1);
});

test('S-SYN-02: sync ganda bersamaan dicegah (lock)', async () => {
  const repos = createRepositories(createMemoryStore());
  let resolveFetch;
  const gate = new Promise((r) => (resolveFetch = r));
  const parsed = parseArticle(fixture('article.html'), `${BASE}/khutbah/x`, BASE);
  const scraper = {
    async discover() {
      return [{ url: parsed.url, title: parsed.title }];
    },
    async fetchArticle() {
      await gate;
      return parsed;
    },
  };
  const sync = createSyncService({ repos, config: makeConfig(), scraper });
  const p1 = sync.run();
  const r2 = await sync.run();
  assert.equal(r2.skipped, true);
  assert.equal(r2.reason, 'already_running');
  resolveFetch();
  await p1;
});

test('S-SYN-03: robots menolak -> sinkronisasi dilewati', async () => {
  const repos = createRepositories(createMemoryStore());
  const sync = createSyncService({
    repos,
    config: makeConfig(),
    scraper: fakeScraper([]),
    robots: { allowed: async () => false },
  });
  const r = await sync.run();
  assert.equal(r.skipped, true);
  assert.equal(r.reason, 'robots_disallowed');
});

test('S-SYN-04: artikel gagal dihitung failed', async () => {
  const repos = createRepositories(createMemoryStore());
  const parsed = parseArticle(fixture('article.html'), `${BASE}/khutbah/x`, BASE);
  const bad = { url: `${BASE}/khutbah/bad-1`, title: null, content: '' , description: null };
  const scraper = fakeScraper([parsed, bad]);
  const sync = createSyncService({ repos, config: makeConfig(), scraper });
  const r = await sync.run();
  assert.equal(r.stats.inserted, 1);
  assert.equal(r.stats.failed, 1);
  assert.equal(r.status, 'partial');
});

test('S-SYN-05: discover dedupe & pagination (mock fetch)', async () => {
  const pages = {
    [`${BASE}/khutbah`]: fixture('listing.html'),
    [`${BASE}/khutbah/2`]: '<html><body><a href="/khutbah/khutbah-baru-ZZZ99"><h2>Baru</h2></a></body></html>',
  };
  const fetchClient = { async getText(url) { return pages[url]; } };
  const scraper = createNuOnlineScraper({ fetchClient, config: makeConfig(), logger: null });
  const items = await scraper.discover({ maxPages: 2 });
  assert.equal(items.length, 3);
});

test('P-LIST-02: listing mengekstrak kategori, gambar, dan tanggal', () => {
  const { items } = parseListing(fixture('listing.html'), BASE);
  assert.equal(items[0].category, 'Khutbah');
  assert.equal(items[0].imageUrl, 'https://example.test/a.webp');
  assert.match(items[0].dateText, /WIB/);
});

test('P-URL-01: host guard (hanya domain NU Online)', () => {
  assert.equal(isAllowedArticleUrl(`${BASE}/khutbah/x`), true);
  assert.equal(isAllowedArticleUrl('https://nu.or.id/khutbah/x'), true);
  assert.equal(isAllowedArticleUrl('https://evil-nu.or.id/khutbah/x'), false);
  assert.equal(isAllowedArticleUrl('https://example.com/khutbah/x'), false);
  assert.equal(isAllowedArticleUrl('ftp://islam.nu.or.id/khutbah/x'), false);
  assert.equal(articleSlug('https://example.com/khutbah/x', BASE), null);
});

test('P-LIST-03: tautan di luar domain NU Online diabaikan', () => {
  const html = `<body>
    <a href="https://example.com/khutbah/palsu-XYZ"><h2>Palsu</h2></a>
    <a href="/khutbah/khutbah-asli-ABC12"><h2>Asli</h2></a>
  </body>`;
  const { items } = parseListing(html, BASE);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Asli');
});

test('P-ART-08: canonical di luar domain -> fallback ke URL input', () => {
  const html = `<html><head>
    <link rel="canonical" href="https://example.com/khutbah/palsu" />
    <meta property="og:title" content="Judul" />
  </head><body><h1>Judul</h1><div id="detail-content"><p>${'isi '.repeat(80)}</p></div></body></html>`;
  const a = parseArticle(html, `${BASE}/khutbah/khutbah-asli-ABC12`, BASE);
  assert.equal(a.url, `${BASE}/khutbah/khutbah-asli-ABC12`);
});

test('P-ART-09: kategori & excerpt terparsing', () => {
  const a = parseArticle(fixture('article.html'), `${BASE}/khutbah/x`, BASE);
  assert.equal(a.category, 'Khutbah');
  assert.match(a.description, /kesabaran/i);
});

test('P-INVALID-01: URL tidak valid -> tidak disimpan (null)', () => {
  const cfg = { content: { fullContentEnabled: false, snippetMaxLength: 400 } };
  const rec = buildArticleRecord(
    { title: 'X', url: 'https://example.com/khutbah/x', content: 'isi '.repeat(100) },
    cfg,
  );
  assert.equal(rec, null);
});

test('P-INVALID-02: judul kosong (URL valid) -> status parse_failed', () => {
  const cfg = { content: { fullContentEnabled: false, snippetMaxLength: 400 } };
  const rec = buildArticleRecord(
    { title: null, url: `${BASE}/khutbah/khutbah-tanpa-judul-ABC12`, content: 'isi '.repeat(100) },
    cfg,
  );
  assert.equal(rec.status, 'parse_failed');
});

test('F-TIMEOUT-01: timeout membatalkan permintaan', async () => {
  const fetchImpl = (url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });
  const client = createFetchClient({
    fetchImpl,
    timeoutMs: 40,
    requestDelayMs: 0,
    maxRetries: 0,
    sleepImpl: async () => {},
  });
  await assert.rejects(() => client.getText('https://islam.nu.or.id/khutbah/x'), ScraperError);
});

test('S-SYN-06: error per-artikel tercatat di sync_logs.error_message', async () => {
  const repos = createRepositories(createMemoryStore());
  const scraper = {
    async discover() {
      return [{ url: `${BASE}/khutbah/ok-1` }, { url: `${BASE}/khutbah/gagal-1` }];
    },
    async fetchArticle(url) {
      if (url.endsWith('gagal-1')) throw new Error('gagal mengambil');
      return parseArticle(fixture('article.html'), url, BASE);
    },
  };
  const sync = createSyncService({ repos, config: makeConfig(), scraper });
  const r = await sync.run();
  assert.equal(r.stats.failed, 1);
  const last = await repos.syncLogs.last();
  assert.match(last.error_message, /gagal-1/);
});

test('S-SYN-07: canonical URL sama -> tidak duplikat', async () => {
  const repos = createRepositories(createMemoryStore());
  const parsed = parseArticle(fixture('article.html'), `${BASE}/khutbah/khutbah-jumat-sabar-dalam-ujian-ABC12`, BASE);
  const scraper = fakeScraper([parsed]);
  const sync = createSyncService({ repos, config: makeConfig(), scraper });
  await sync.run();
  await sync.run();
  assert.equal(await repos.articles.count(), 1);
});

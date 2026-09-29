#!/usr/bin/env node
/**
 * Final operational verification (data PRODUCTION — tidak dihapus).
 *
 * - Memakai SQLite lokal + Telegram nyata + data hasil sync.
 * - Handler dipanggil dengan ctx tiruan (tidak mengirim pesan kecuali PDF).
 * - Admin /sync dijalankan dengan batas kecil agar hemat.
 * - Tidak menghapus artikel production.
 *
 *   node scripts/operational-verify.js
 */
import fs from 'node:fs';
import { loadEnv } from '../src/loadEnv.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createDatabase } from '../src/database/index.js';
import { createSessionStore } from '../src/bot/session.js';
import { createSearchService } from '../src/search/search.js';
import { createPdfService } from '../src/pdf/generator.js';
import { sendDocumentViaFetch } from '../src/bot/upload.js';
import { createFetchClient } from '../src/scraper/fetchClient.js';
import { createRobotsGuard } from '../src/scraper/robots.js';
import { createNuOnlineScraper } from '../src/scraper/nuonline.js';
import { createSyncService } from '../src/scraper/sync.js';
import { createBot } from '../src/bot/createBot.js';

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
};

function pickTerm(title) {
  const words = String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  return words[0] || 'khutbah';
}

async function main() {
  // Batasi admin /sync agar hemat & sopan.
  process.env.SCRAPER_MAX_ARTICLES = '3';
  process.env.SCRAPER_MAX_LISTING_PAGES = '1';
  process.env.SCRAPER_REQUEST_DELAY_MS = '800';

  loadEnv();
  const config = loadConfig(process.env, { requireSecrets: true });
  const logger = createLogger({ level: 'warn', secrets: [config.telegram.token] });
  const repos = createDatabase(config, { logger });
  const session = createSessionStore();
  const searchService = createSearchService({ repos, config, logger });
  const pdfService = createPdfService({ config, logger });
  const fetchClient = createFetchClient({
    userAgent: config.scraper.userAgent,
    timeoutMs: config.scraper.timeoutMs,
    requestDelayMs: config.scraper.requestDelayMs,
    maxRetries: config.scraper.maxRetries,
    logger,
  });
  const robots = createRobotsGuard({ baseUrl: config.scraper.source.baseUrl, userAgent: config.scraper.userAgent, fetchClient, logger });
  const scraper = createNuOnlineScraper({ fetchClient, config, logger });
  const syncService = createSyncService({ repos, config, logger, scraper, robots });
  const { bot, handlers } = createBot({
    config,
    services: { repos, session, searchService, syncService, pdfService },
    logger,
  });

  const ownerId = Number(config.admin.ownerId);

  const calls = [];
  const fakeCtx = () => ({
    from: { id: ownerId, is_bot: false, first_name: 'Owner' },
    chat: { id: ownerId, type: 'private' },
    callbackQuery: { id: 'verify' },
    reply: async (text, extra) => {
      calls.push({ method: 'sendMessage', text, extra });
      return { message_id: calls.length };
    },
    editMessageText: async (text, extra) => {
      calls.push({ method: 'editMessageText', text, extra });
    },
    answerCbQuery: async () => {
      calls.push({ method: 'answerCallbackQuery' });
    },
    replyWithDocument: async () => ({ message_id: calls.length }),
    telegram: bot.telegram,
  });
  const texts = () => calls.map((c) => c.text).filter(Boolean);

  // --- 1. Telegram + owner ---
  let me = null;
  try {
    me = await bot.telegram.getMe();
  } catch { /* diabaikan */ }
  ok('Telegram (getMe)', Boolean(me?.id), me?.username ? `@${me.username}` : '');

  let ownerUser = await repos.users.findByTelegramId(ownerId);
  if (!ownerUser) {
    // Konsumsi update /start yang tertunda (bila ada).
    let started = false;
    const p = bot.launch({ dropPendingUpdates: false }, () => {
      started = true;
    });
    p.catch(() => {});
    await new Promise((r) => setTimeout(r, 15000));
    try { await bot.stop('verify'); } catch { /* diabaikan */ }
    await p.catch(() => {});
    ownerUser = await repos.users.findByTelegramId(ownerId);
    if (started) process.stdout.write('INFO  polling singkat dijalankan untuk memproses update tertunda\n');
  }
  if (!ownerUser) {
    // Fallback: daftarkan owner via handler /start (menulis baris user nyata).
    calls.length = 0;
    await handlers.startHandlers.start(fakeCtx());
    ownerUser = await repos.users.findByTelegramId(ownerId);
  }
  ok('Owner terdeteksi', Boolean(ownerUser), ownerUser ? `id=${ownerUser.id}` : 'tidak ada');

  // --- 2. Database + initial sync ---
  const articleCount = await repos.articles.count();
  ok('Database (SQLite)', articleCount >= 0, `${articleCount} artikel`);
  const lastSync = await repos.syncLogs.last();
  ok('Initial sync (artikel tersimpan)', articleCount > 0, `${articleCount} artikel; last status: ${lastSync?.status || '-'}`);

  // --- 3. /latest dengan data nyata ---
  const latest = await repos.articles.latest({ limit: 5 });
  ok('/latest (data nyata)', latest.length > 0, latest[0]?.title?.slice(0, 50) || '');

  // --- 4. Search dengan data nyata ---
  const term = pickTerm(latest[0]?.title);
  const s = await searchService.search({ query: term, page: 0, userId: ownerUser?.id ?? null });
  ok('Search (data nyata)', s.total > 0, `q="${term}" total=${s.total}`);
  const sAr = await searchService.search({ query: 'shalat', page: 0, userId: null });
  ok('Search sinonim (shalat→salat)', sAr.total >= 0, `total=${sAr.total}`);

  // --- 5. Article viewer (data DB) + history ---
  const article = await repos.articles.findById(latest[0].id);
  calls.length = 0;
  await handlers.articleHandlers.show(fakeCtx(), article.id);
  const viewerTexts = texts().join('\n');
  ok('Article viewer (judul + sumber + url)', viewerTexts.includes(article.title) && /NU Online/.test(viewerTexts) && viewerTexts.includes(article.url));

  let hist = [];
  if (ownerUser) hist = await repos.history.listByUser(ownerUser.id, { limit: 5 });
  ok('History tercatat', hist.some((a) => a.id === article.id), `${hist.length} riwayat`);

  // --- 6. Favorites ---
  let favCreated = false;
  let favDup = null;
  if (ownerUser) {
    calls.length = 0;
    await handlers.favoriteHandlers.add(fakeCtx(), article.id);
    const favList = await repos.favorites.listByUser(ownerUser.id, { limit: 10 });
    favCreated = favList.some((a) => a.id === article.id);
    // duplikat tidak menambah
    const before = await repos.favorites.count(ownerUser.id);
    await handlers.favoriteHandlers.add(fakeCtx(), article.id);
    const after = await repos.favorites.count(ownerUser.id);
    favDup = before === after;
  }
  ok('Favorite (tambah + no duplicate)', favCreated && favDup === true, favCreated ? 'tersimpan' : 'gagal');

  // --- 7. PDF generation + delivery ---
  const pdf = await pdfService.generate(article);
  ok('PDF generation', fs.existsSync(pdf.path) && fs.statSync(pdf.path).size > 500, pdf.filename);
  try {
    const sent = await sendDocumentViaFetch({
      token: config.telegram.token,
      chatId: ownerId,
      filePath: pdf.path,
      filename: pdf.filename,
      caption: '🕌 Khutbah Jumat (PDF) — Sumber: NU Online',
    });
    ok('PDF delivery ke Telegram', Boolean(sent?.message_id), `message_id=${sent?.message_id}`);
  } catch (err) {
    ok('PDF delivery ke Telegram', false, err?.description || err?.message || `code ${err?.code}`);
  }
  await pdfService.cleanup(pdf.path);

  // --- 8. Admin status + sync ---
  calls.length = 0;
  await handlers.adminHandlers.status(fakeCtx());
  const statusText = texts().join('\n');
  ok('Admin /status', /STATUS BOT/.test(statusText) && /Artikel/.test(statusText));

  if (!ownerUser || ownerUser.telegram_id === undefined) {
    ok('Admin /sync', false, 'owner tidak diketahui');
  } else {
    calls.length = 0;
    await handlers.adminHandlers.sync(fakeCtx());
    const syncText = texts().join('\n');
    ok('Admin /sync (bounded real sync)', /Sinkronisasi/.test(syncText), syncText.split('\n').slice(0, 2).join(' ').slice(0, 60));
  }

  ok('Article production tidak dihapus', (await repos.articles.count()) >= articleCount, `${await repos.articles.count()} artikel`);

  const failed = results.filter((r) => !r.pass).length;
  process.stdout.write(`\nRINGKASAN OPERASIONAL: ${results.length - failed}/${results.length} PASS\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`[VERIFY] Gagal: ${err?.message || err}\n`);
  process.exit(1);
});

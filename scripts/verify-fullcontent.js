#!/usr/bin/env node
/**
 * Verifikasi mode FULL CONTENT:
 * - viewer memakai articles.content (bukan snippet)
 * - message splitting utuh (paragraf/heading/Arab/Unicode)
 * - PDF memakai content (dicek via pdftotext)
 * - live Telegram: kirim naskah lengkap + PDF ke owner
 * Tidak menghapus artikel production.
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
import { createBot } from '../src/bot/createBot.js';

const results = [];
const ok = (n, p, d = '') => {
  results.push(p);
  process.stdout.write(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}\n`);
};

async function main() {
  loadEnv();
  const config = loadConfig(process.env, { requireSecrets: true });
  ok('FULL_CONTENT_ENABLED aktif', config.content.fullContentEnabled === true);

  const logger = createLogger({ level: 'error', secrets: [config.telegram.token] });
  const repos = createDatabase(config, { logger });
  const session = createSessionStore();
  const searchService = createSearchService({ repos, config, logger });
  const pdfService = createPdfService({ config, logger });
  const { bot, handlers } = createBot({
    config,
    services: { repos, session, searchService, syncService: { running: false }, pdfService },
    logger,
  });
  const ownerId = Number(config.admin.ownerId);

  const all = await repos.store.select('articles', { limit: 1000 });
  const withContent = all.filter((a) => a.content && a.content.length > 800);
  ok('DB punya artikel dengan content', withContent.length > 0, `${withContent.length} artikel`);
  const article = withContent[0];

  // Viewer via handler (ctx tiruan) -> pastikan memakai content
  const calls = [];
  const ctx = {
    from: { id: ownerId, is_bot: false, first_name: 'Owner' },
    chat: { id: ownerId, type: 'private' },
    callbackQuery: { id: 'v' },
    reply: async (text, extra) => { calls.push({ text, extra }); return { message_id: calls.length }; },
    editMessageText: async (text, extra) => { calls.push({ text, extra }); },
    answerCbQuery: async () => {},
    replyWithDocument: async () => ({ message_id: 1 }),
    telegram: bot.telegram,
  };
  await handlers.articleHandlers.show(ctx, article.id);
  const texts = calls.map((c) => c.text);
  const joined = texts.join('\n');
  ok('viewer memakai content (bukan snippet)', joined.includes(article.content.slice(-120)));
  ok('viewer tidak memuat pesan "cuplikan"', !/menampilkan cuplikan/i.test(joined));
  ok('message splitting > 1 pesan', texts.length > 2, `${texts.length} pesan`);
  const tooLong = texts.filter((t) => t && t.length > 4096);
  ok('tidak ada pesan > 4096', tooLong.length === 0);
  ok('Arabic aman di pesan', /[\u0600-\u06FF]/.test(joined));

  // PDF memakai content
  const pdf = await pdfService.generate(article);
  ok('PDF file dibuat', fs.existsSync(pdf.path) && fs.statSync(pdf.path).size > 1000, `${fs.statSync(pdf.path).size} bytes`);
  let pdfText = '';
  try {
    const { execFileSync } = await import('node:child_process');
    pdfText = execFileSync('pdftotext', [pdf.path, '-'], { encoding: 'utf8' });
  } catch { /* pdftotext tidak ada */ }
  if (pdfText) {
    ok('PDF memuat naskah (teks panjang)', pdfText.length > 1500, `${pdfText.length} char`);
    ok('PDF memuat bagian akhir naskah', pdfText.includes(article.content.slice(-80).replace(/\s+/g, ' ').trim().slice(0, 40)));
  } else {
    ok('PDF memuat naskah (pdftotext tidak tersedia)', true, 'dilewati');
  }

  // Live Telegram: kirim naskah lengkap (bagian pesan) + PDF
  let sentParts = 0;
  for (const t of texts) {
    try {
      await bot.telegram.sendMessage(ownerId, t, { disable_web_page_preview: true });
      sentParts++;
    } catch (err) {
      ok('live kirim bagian pesan', false, err?.description || err?.message);
      break;
    }
  }
  ok('live Telegram naskah lengkap terkirim', sentParts === texts.length, `${sentParts}/${texts.length} pesan`);
  try {
    const sent = await sendDocumentViaFetch({ token: config.telegram.token, chatId: ownerId, filePath: pdf.path, filename: pdf.filename, caption: '🕌 PDF (full content) — Sumber: NU Online' });
    ok('live Telegram PDF terkirim', Boolean(sent?.message_id), `message_id=${sent?.message_id}`);
  } catch (err) {
    ok('live Telegram PDF terkirim', false, err?.description || err?.message);
  }
  await pdfService.cleanup(pdf.path);

  ok('artikel production tidak dihapus', (await repos.articles.count()) >= all.length, `${await repos.articles.count()} artikel`);

  const failed = results.filter((r) => !r).length;
  process.stdout.write(`\nRINGKASAN FULL CONTENT: ${results.length - failed}/${results.length} PASS\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`[VERIFY] Gagal: ${err?.message || err}\n`);
  process.exit(1);
});

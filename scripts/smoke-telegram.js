#!/usr/bin/env node
/**
 * Live Telegram smoke test (TERBATAS) untuk Phase 4.
 *
 * LIVE: getMe, pastikan tidak ada webhook, kirim+hapus 1 pesan ke owner,
 *       jalankan long polling beberapa detik lalu hentikan.
 * HANDLER: inject update (/start,/help,/latest,/search,unknown,callback) dengan
 *          Telegram API di-mock agar tidak mengirim pesan nyata.
 *
 * Tidak mencetak token/secret.
 *   npm run smoke:telegram
 */
import { loadEnv } from '../src/loadEnv.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createDatabase } from '../src/database/index.js';
import { createSessionStore } from '../src/bot/session.js';
import { createSearchService } from '../src/search/search.js';
import { createBot } from '../src/bot/createBot.js';

const POLL_MS = 4000;

async function main() {
  loadEnv();
  const config = loadConfig(process.env, { requireSecrets: true });
  const logger = createLogger({
    level: 'warn',
    secrets: [config.telegram.token, config.supabase.secretKey],
  });

  const results = [];
  const ok = (name, pass, detail = '') => {
    results.push(pass);
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
  };
  const info = (name, detail = '') => {
    process.stdout.write(`INFO  ${name}${detail ? `  (${detail})` : ''}\n`);
  };

  const repos = createDatabase(config, { logger });
  const services = {
    repos,
    session: createSessionStore(),
    searchService: createSearchService({ repos, config, logger }),
    syncService: { running: false, run: async () => ({}) },
    pdfService: {},
  };
  const { bot } = createBot({ config, services, logger });

  // --- LIVE 1: token valid ---
  let me = null;
  try {
    me = await bot.telegram.getMe();
    ok('getMe (token valid)', Boolean(me?.id), me?.username ? `@${me.username}` : '');
  } catch (err) {
    ok('getMe (token valid)', false, err?.code ? `code ${err.code}` : 'gagal');
  }

  // --- LIVE 2: tidak ada webhook (mode long polling) ---
  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    const info = await bot.telegram.getWebhookInfo();
    ok('tidak ada webhook (long polling)', !info?.url, info?.url ? 'webhook aktif' : 'url kosong');
  } catch (err) {
    ok('tidak ada webhook (long polling)', false, err?.code ? `code ${err.code}` : 'gagal');
  }

  // --- LIVE 3: kirim + hapus pesan nyata ke owner (informatif) ---
  // Bot hanya bisa memulai chat bila owner sudah pernah /start ke bot.
  const ownerId = config.admin.ownerId ? Number(config.admin.ownerId) : null;
  if (ownerId) {
    try {
      const sent = await bot.telegram.sendMessage(
        ownerId,
        '🕌 Phase 4 smoke test: bot aktif (long polling). Pesan ini dihapus otomatis.',
      );
      ok('kirim pesan nyata ke owner', Boolean(sent?.message_id));
      try {
        await bot.telegram.deleteMessage(ownerId, sent.message_id);
        ok('hapus pesan smoke', true);
      } catch (err) {
        info('hapus pesan smoke gagal', err?.description || err?.message || '');
      }
    } catch (err) {
      info(
        'kirim pesan ke owner dilewati (owner mungkin belum /start bot)',
        err?.description || err?.message || `code ${err?.code}`,
      );
    }
  } else {
    ok('owner id tersedia (TELEGRAM_USER_ID)', false, 'kosong');
  }

  // --- LIVE 4: long polling start/stop ---
  let started = false;
  let launchPromise = null;
  try {
    launchPromise = bot.launch({ dropPendingUpdates: false }, () => {
      started = true;
    });
    launchPromise.catch(() => {});
    await new Promise((r) => setTimeout(r, POLL_MS));
    ok('long polling berjalan', started && Boolean(bot.polling));
  } catch (err) {
    ok('long polling berjalan', false, err?.code ? `code ${err.code}` : 'gagal');
  } finally {
    try {
      await bot.stop('smoke');
      ok('polling dihentikan', true);
    } catch (err) {
      ok('polling dihentikan', false, err?.message || 'gagal');
    }
    if (launchPromise) await launchPromise.catch(() => {});
  }

  // --- HANDLER: inject update dengan API di-mock ---
  const proto = Object.getPrototypeOf(bot.telegram);
  const originalCallApi = proto.callApi;
  const calls = [];
  proto.callApi = async (method, payload) => {
    calls.push({ method, payload });
    if (method === 'getMe') return { id: 1, is_bot: true, first_name: 'B', username: 'b' };
    return { message_id: calls.length, chat: { id: payload?.chat_id ?? 1 }, date: Math.floor(Date.now() / 1000) };
  };
  bot.botInfo = { id: 1, is_bot: true, first_name: 'B', username: 'b' };

  const uid = ownerId || 1;
  const ownerExistedBefore = Boolean(await repos.users.findByTelegramId(uid));
  const msg = (text) => ({
    update_id: Math.floor(Math.random() * 1e6),
    message: {
      message_id: Math.floor(Math.random() * 1e6),
      date: Math.floor(Date.now() / 1000),
      chat: { id: uid, type: 'private' },
      from: { id: uid, is_bot: false, first_name: 'Owner' },
      text,
      entities: text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] : undefined,
    },
  });
  const cb = (data) => ({
    update_id: Math.floor(Math.random() * 1e6),
    callback_query: {
      id: 'cb',
      from: { id: uid, is_bot: false, first_name: 'Owner' },
      message: { message_id: 1, chat: { id: uid, type: 'private' }, date: Math.floor(Date.now() / 1000), text: 'x' },
      chat_instance: 'ci',
      data,
    },
  });
  const texts = () => calls.filter((c) => c.method === 'sendMessage' || c.method === 'editMessageText').map((c) => c.payload?.text || '');

  try {
    const cases = [
      ['/start', msg('/start'), /BOT KHUTBAH JUMAT/],
      ['/help', msg('/help'), /BANTUAN/],
      ['/latest', msg('/latest'), /TERBARU|Belum ada/i],
      ['/search', msg('/search'), /CARI KHUTBAH/],
      ['unknown command', msg('/tidakada'), /tidak dikenal/i],
    ];
    for (const [name, update, expect] of cases) {
      calls.length = 0;
      await bot.handleUpdate(update);
      ok(`handler ${name}`, texts().some((t) => expect.test(t)));
    }

    // Owner detection: owner harus melihat tombol Admin.
    calls.length = 0;
    await bot.handleUpdate(msg('/start'));
    const kb = calls.find((c) => c.method === 'sendMessage')?.payload?.reply_markup?.inline_keyboard || [];
    ok('owner detection (menu admin tampil)', kb.flat().some((b) => b.callback_data === 'menu:admin'));

    calls.length = 0;
    await bot.handleUpdate(cb('menu:main'));
    ok('handler callback query', calls.some((c) => c.method === 'answerCallbackQuery'));
  } finally {
    proto.callApi = originalCallApi;
  }

  // Bersihkan user yang dibuat handler check, bila sebelumnya belum ada.
  if (!ownerExistedBefore) {
    try {
      await repos.store.delete('users', { telegram_id: Number(uid) });
      info('cleanup user smoke', 'dihapus (baru dibuat)');
    } catch (err) {
      info('cleanup user smoke gagal', err?.message || '');
    }
  }

  const failed = results.filter((r) => !r).length;
  process.stdout.write(`\nRINGKASAN SMOKE TELEGRAM: ${results.length - failed}/${results.length} PASS\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`[SMOKE] Gagal: ${err?.message || err}\n`);
  process.exit(1);
});

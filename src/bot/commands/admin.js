/**
 * Panel admin (allowlist: TELEGRAM_USER_ID, ID owner/admin).
 */
import { formatAdmin, formatStats, formatSyncResult, ERRORS } from '../messages.js';
import { adminKeyboard, backToMenuKeyboard } from '../keyboards/keyboards.js';
import { isAdminUser, respond, ackCallback } from '../context.js';

export function createAdminHandlers({ config, repos, syncService, logger }) {
  function guard(ctx) {
    if (!isAdminUser(ctx, config)) {
      respond(ctx, ERRORS.notAdmin, { reply_markup: backToMenuKeyboard() });
      return false;
    }
    return true;
  }

  const formatList = (items, emptyText) =>
    items.length === 0
      ? emptyText
      : items.map((r, i) => `${i + 1}. ${r.title || r.username || r.id} — ${r.status || ''}`.trim()).join('\n');

  return {
    async menu(ctx) {
      if (!guard(ctx)) return;
      await respond(ctx, formatAdmin(), { reply_markup: adminKeyboard() });
    },

    async status(ctx) {
      if (!guard(ctx)) return;
      let dbOk = false;
      let articles = 0;
      let lastSync = null;
      try {
        dbOk = typeof repos.store?.ping === 'function' ? await repos.store.ping() : true;
        articles = await repos.articles.count();
        lastSync = await repos.syncLogs.last();
      } catch (err) {
        logger?.error('[ADMIN] status gagal', err);
      }
      const dbKind = repos.kind === 'sqlite' ? 'SQLite' : repos.kind || 'Database';
      const text = [
        '📊 STATUS BOT',
        '',
        'Bot        : aktif (long polling)',
        `Database   : ${dbOk ? `${dbKind} OK` : `${dbKind} GAGAL`}`,
        `Artikel    : ${articles}`,
        `Scraper    : ${syncService.running ? 'berjalan' : 'idle'}`,
        `Last sync  : ${lastSync?.finished_at || lastSync?.started_at || '-'}`,
        `Sync status: ${lastSync?.status || '-'}`,
      ].join('\n');
      await respond(ctx, text, { reply_markup: adminKeyboard() });
    },

    async stats(ctx) {
      if (!guard(ctx)) return;
      try {
        const [users, articles, favorites, history, searches, lastSync] = await Promise.all([
          repos.users.count(),
          repos.articles.count(),
          repos.favorites.count(),
          repos.history.count(),
          repos.searchLogs.count(),
          repos.syncLogs.last(),
        ]);
        await respond(ctx, formatStats({ users, articles, favorites, history, searches, lastSync }), {
          reply_markup: adminKeyboard(),
        });
      } catch (err) {
        logger?.error('[ADMIN] statistik gagal', err);
        await respond(ctx, ERRORS.database, { reply_markup: adminKeyboard() });
      }
    },

    async sync(ctx) {
      if (!guard(ctx)) return;
      await ackCallback(ctx);
      if (syncService.running) {
        return respond(ctx, '⏳ Sinkronisasi sedang berjalan...', { reply_markup: adminKeyboard() });
      }
      await respond(ctx, '⏳ Sinkronisasi sedang berjalan...', { reply_markup: adminKeyboard() });
      try {
        const result = await syncService.run({ trigger: 'manual' });
        await respond(ctx, formatSyncResult(result), { reply_markup: adminKeyboard() });
      } catch (err) {
        logger?.error('[ADMIN] sinkronisasi gagal', err);
        await respond(ctx, ERRORS.database, { reply_markup: adminKeyboard() });
      }
    },

    async articles(ctx) {
      if (!guard(ctx)) return;
      const items = await repos.articles.latest({ limit: 5, offset: 0 });
      await respond(ctx, '📰 ARTIKEL TERBARU\n\n' + formatList(items, 'Belum ada artikel.'), {
        reply_markup: adminKeyboard(),
      });
    },

    async users(ctx) {
      if (!guard(ctx)) return;
      const items = await repos.users.list({ limit: 5, offset: 0 });
      await respond(
        ctx,
        '👥 PENGGUNA\n\n' +
          (items.length
            ? items.map((u, i) => `${i + 1}. ${u.first_name || '-'} @${u.username || '-'}`).join('\n')
            : 'Belum ada pengguna.'),
        { reply_markup: adminKeyboard() },
      );
    },

    async syncs(ctx) {
      if (!guard(ctx)) return;
      const items = await repos.syncLogs.list({ limit: 5, offset: 0 });
      const text = items.length
        ? items
            .map(
              (s, i) =>
                `${i + 1}. ${s.started_at} — ${s.status} (baru:${s.articles_inserted} ubah:${s.articles_updated} gagal:${s.articles_failed})`,
            )
            .join('\n')
        : 'Belum ada log sinkronisasi.';
      await respond(ctx, '📋 LOG SINKRONISASI\n\n' + text, { reply_markup: adminKeyboard() });
    },

    async errors(ctx) {
      if (!guard(ctx)) return;
      const items = await repos.syncLogs.recentErrors({ limit: 5 });
      const text = items.length
        ? items.map((s, i) => `${i + 1}. ${s.started_at} — ${s.error_message || 'tanpa pesan'}`).join('\n')
        : 'Tidak ada error tercatat.';
      await respond(ctx, '📋 ERROR LOG\n\n' + text, { reply_markup: adminKeyboard() });
    },
  };
}

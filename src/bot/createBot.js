/**
 * Pabrik bot Telegram (long polling). Memisahkan transport dari logika bisnis:
 * handler murni berada di commands/ & handlers/, di sini hanya pemetaan.
 */
import { Telegraf } from 'telegraf';
import { createStartHandlers } from './commands/start.js';
import { createSearchHandlers } from './commands/search.js';
import { createAdminHandlers } from './commands/admin.js';
import { createArticleHandlers } from './handlers/article.js';
import { createFavoriteHandlers } from './handlers/favorite.js';
import { createPdfHandlers } from './handlers/pdf.js';
import { ackCallback } from './context.js';
import { ERRORS } from './messages.js';

/**
 * @param {{ config: object, services: object, logger?: object }} deps
 */
export function createBot({ config, services, logger }) {
  if (!config.telegram?.token) {
    throw new Error('TELEGRAM_BOT_TOKEN belum diset.');
  }
  const { repos, searchService, session, syncService, pdfService } = services;

  const startHandlers = createStartHandlers({ config, repos, logger });
  const searchHandlers = createSearchHandlers({ config, repos, searchService, session, logger });
  const articleHandlers = createArticleHandlers({ config, repos, session, logger });
  const favoriteHandlers = createFavoriteHandlers({ config, repos, logger });
  const pdfHandlers = createPdfHandlers({ config, repos, pdfService, logger });
  const adminHandlers = createAdminHandlers({ config, repos, syncService, logger });

  const handlers = {
    startHandlers,
    searchHandlers,
    articleHandlers,
    favoriteHandlers,
    pdfHandlers,
    adminHandlers,
  };

  const bot = new Telegraf(config.telegram.token, { handlerTimeout: 60_000 });

  // ---- Commands ----
  bot.start((ctx) => startHandlers.start(ctx));
  bot.help((ctx) => startHandlers.help(ctx));
  bot.command('menu', (ctx) => startHandlers.menu(ctx));
  bot.command('latest', (ctx) => articleHandlers.latest(ctx, 0));
  bot.command('search', (ctx) => searchHandlers.begin(ctx));
  bot.command('admin', (ctx) => adminHandlers.menu(ctx));
  bot.command('status', (ctx) => adminHandlers.status(ctx));
  bot.command('stat', (ctx) => adminHandlers.stats(ctx));
  bot.command('sync', (ctx) => adminHandlers.sync(ctx));
  bot.command('tentang', (ctx) => startHandlers.about(ctx));

  // ---- Menu actions ----
  const action = (matcher, fn) =>
    bot.action(matcher, async (ctx) => {
      await ackCallback(ctx);
      return fn(ctx);
    });

  action('menu:main', (ctx) => startHandlers.menu(ctx));
  action('menu:search', (ctx) => searchHandlers.begin(ctx));
  action('menu:latest', (ctx) => articleHandlers.latest(ctx, 0));
  action('menu:fav', (ctx) => favoriteHandlers.list(ctx, 0));
  action('menu:history', (ctx) => articleHandlers.history(ctx, 0));
  action('menu:about', (ctx) => startHandlers.about(ctx));
  action('menu:admin', (ctx) => adminHandlers.menu(ctx));

  action(/^srch:page:(\d+)$/, (ctx) => searchHandlers.page(ctx, Number(ctx.match[1])));
  action(/^art:(\d+)$/, (ctx) => articleHandlers.show(ctx, Number(ctx.match[1])));
  action('art:back', (ctx) => {
    const state = session.get(ctx.from.id) || {};
    if (state.lastQuery) return searchHandlers.page(ctx, state.page || 0);
    return startHandlers.menu(ctx);
  });
  action(/^fav:add:(\d+)$/, (ctx) => favoriteHandlers.add(ctx, Number(ctx.match[1])));
  action(/^fav:del:(\d+)$/, (ctx) => favoriteHandlers.remove(ctx, Number(ctx.match[1])));
  action(/^fav:page:(\d+)$/, (ctx) => favoriteHandlers.list(ctx, Number(ctx.match[1])));
  action(/^hist:page:(\d+)$/, (ctx) => articleHandlers.history(ctx, Number(ctx.match[1])));
  action(/^latest:page:(\d+)$/, (ctx) => articleHandlers.latest(ctx, Number(ctx.match[1])));
  action(/^pdf:(\d+)$/, (ctx) => pdfHandlers.export(ctx, Number(ctx.match[1])));
  action(/^admin:(status|stats|sync|articles|users|syncs|errors)$/, (ctx) => adminHandlers[ctx.match[1]](ctx));

  // ---- Teks bebas ----
  bot.on('text', async (ctx) => {
    const text = ctx.message?.text || '';
    if (text.startsWith('/')) return startHandlers.unknown(ctx); // perintah tak dikenal
    return searchHandlers.onText(ctx, text);
  });

  // ---- Error handling ----
  bot.catch(async (err, ctx) => {
    logger?.error('[TELEGRAM] error saat menangani update', err);
    try {
      await ctx.reply(ERRORS.generic);
    } catch {
      /* abaikan */
    }
  });

  let launchPromise = null;

  return {
    bot,
    handlers,
    async start() {
      launchPromise = bot
        .launch({ dropPendingUpdates: false }, () => {
          logger?.info('[TELEGRAM] Bot started');
        })
        .catch((err) => {
          if (err?.code === 409) {
            logger?.error(
              '[TELEGRAM] Konflik 409: token yang sama dipakai instance lain. Hentikan instance lain lalu coba lagi.',
            );
          } else if (err?.code === 401) {
            logger?.error('[TELEGRAM] 401: token tidak valid (periksa TELEGRAM_BOT_TOKEN).');
          } else {
            logger?.error('[TELEGRAM] launch gagal', err);
          }
        });
    },
    async stop() {
      try {
        await bot.stop('SIGTERM');
      } catch (err) {
        logger?.warn('[TELEGRAM] gagal berhenti', { error: err.message });
      }
      if (launchPromise) {
        try {
          await launchPromise;
        } catch {
          /* sudah ditangani */
        }
      }
    },
  };
}

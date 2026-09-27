/**
 * Command & menu dasar: /start, /menu, /help, tentang.
 */
import { welcomeText, helpText, aboutText } from '../messages.js';
import { mainMenuKeyboard, backToMenuKeyboard } from '../keyboards/keyboards.js';
import { ensureUser, isAdminUser, respond } from '../context.js';

export function createStartHandlers({ config, repos, logger }) {
  const menuFor = (ctx) => mainMenuKeyboard({ isAdmin: isAdminUser(ctx, config) });

  return {
    async start(ctx) {
      try {
        await ensureUser(ctx, repos);
      } catch (err) {
        logger?.error('[START] gagal menyimpan user', err);
      }
      await ctx.reply(welcomeText(), { reply_markup: menuFor(ctx) });
    },

    async menu(ctx) {
      await respond(ctx, welcomeText(), { reply_markup: menuFor(ctx) });
    },

    async help(ctx) {
      await respond(ctx, helpText(), { reply_markup: menuFor(ctx) });
    },

    async about(ctx) {
      await respond(ctx, aboutText({ fullContentEnabled: config.content.fullContentEnabled }), {
        reply_markup: backToMenuKeyboard(),
      });
    },

    async fallbackText(ctx) {
      await respond(ctx, welcomeText(), { reply_markup: menuFor(ctx) });
    },
  };
}

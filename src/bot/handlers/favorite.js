/**
 * Favorit: simpan & daftar.
 */
import { formatFavoriteList, ERRORS } from '../messages.js';
import { listKeyboard, backToMenuKeyboard } from '../keyboards/keyboards.js';
import { ensureUser, respond, ackCallback } from '../context.js';

export function createFavoriteHandlers({ config, repos, logger }) {
  const pageSize = config.search?.maxResults || 8;

  return {
    async add(ctx, articleId) {
      await ackCallback(ctx);
      const user = await ensureUser(ctx, repos);
      if (!user) return respond(ctx, ERRORS.generic);
      let result;
      try {
        result = await repos.favorites.add(user.id, articleId);
      } catch (err) {
        logger?.error('[FAVORITE] gagal menyimpan', err);
        return respond(ctx, ERRORS.database);
      }
      if (result.created) {
        return respond(ctx, '✅ Khutbah berhasil disimpan ke favorit.', { reply_markup: backToMenuKeyboard() });
      }
      return respond(ctx, 'ℹ️ Khutbah ini sudah ada di favorit Anda.', { reply_markup: backToMenuKeyboard() });
    },

    async remove(ctx, articleId) {
      await ackCallback(ctx);
      const user = await ensureUser(ctx, repos);
      if (!user) return respond(ctx, ERRORS.generic);
      try {
        await repos.favorites.remove(user.id, articleId);
      } catch (err) {
        logger?.error('[FAVORITE] gagal menghapus', err);
        return respond(ctx, ERRORS.database);
      }
      return respond(ctx, '✅ Khutbah dihapus dari favorit.', { reply_markup: backToMenuKeyboard() });
    },

    async list(ctx, page = 0) {
      const user = await ensureUser(ctx, repos);
      if (!user) return respond(ctx, ERRORS.generic);
      let items;
      try {
        items = await repos.favorites.listByUser(user.id, { limit: pageSize + 1, offset: page * pageSize });
      } catch (err) {
        logger?.error('[FAVORITE] gagal memuat daftar', err);
        return respond(ctx, ERRORS.database);
      }
      const hasMore = items.length > pageSize;
      const visible = items.slice(0, pageSize);
      await respond(ctx, formatFavoriteList({ items: visible, page }), {
        reply_markup:
          visible.length === 0
            ? backToMenuKeyboard()
            : listKeyboard({ items: visible, page, hasMore, pageCallback: (p) => `fav:page:${p}` }),
      });
    },
  };
}

/**
 * Pembaca artikel, daftar terbaru, dan riwayat.
 */
import {
  formatArticleHeader,
  formatArticleBody,
  formatArticleFooter,
  articleActionsPrompt,
  formatLatestList,
  formatHistoryList,
  ERRORS,
} from '../messages.js';
import { articleActionsKeyboard, listKeyboard, backToMenuKeyboard } from '../keyboards/keyboards.js';
import { ensureUser, respond } from '../context.js';
import { splitLongMessage } from '../../utils/splitMessage.js';

export function createArticleHandlers({ config, repos, session, logger }) {
  const pageSize = config.search?.maxResults || 8;

  function canExportPdf(article) {
    return Boolean(config.content.fullContentEnabled && article.content);
  }

  async function sendArticle(ctx, article) {
    const user = await ensureUser(ctx, repos);
    let isFavorite = false;
    if (user) {
      try {
        await repos.history.record(user.id, article.id);
        await repos.history.trim(user.id, config.history.max);
        isFavorite = await repos.favorites.exists(user.id, article.id);
      } catch (err) {
        logger?.warn('[ARTICLE] gagal mencatat riwayat/favorit', { error: err.message });
      }
    }

    const header = formatArticleHeader(article);
    const body = formatArticleBody(article, { fullContentEnabled: config.content.fullContentEnabled });
    const footer = formatArticleFooter(article);
    const full = `${header}\n\n${body}\n\n${footer}`;

    const parts = splitLongMessage(full, { partLabel: article.title });
    for (const part of parts) {
      await ctx.reply(part);
    }
    await ctx.reply(articleActionsPrompt(), {
      reply_markup: articleActionsKeyboard({
        articleId: article.id,
        canExportPdf: canExportPdf(article),
        isFavorite,
      }),
    });
  }

  return {
    async show(ctx, articleId) {
      let article;
      try {
        article = await repos.articles.findById(articleId);
      } catch (err) {
        logger?.error('[ARTICLE] gagal memuat', err);
        return respond(ctx, ERRORS.database);
      }
      if (!article) return respond(ctx, ERRORS.notFound, { reply_markup: backToMenuKeyboard() });
      session.update(ctx.from.id, { lastArticleId: article.id });
      try {
        await sendArticle(ctx, article);
      } catch (err) {
        logger?.error('[ARTICLE] gagal mengirim', err);
        await respond(ctx, ERRORS.generic);
      }
    },

    async latest(ctx, page = 0) {
      let items;
      try {
        items = await repos.articles.latest({ limit: pageSize + 1, offset: page * pageSize });
      } catch (err) {
        logger?.error('[LATEST] gagal', err);
        return respond(ctx, ERRORS.database);
      }
      const hasMore = items.length > pageSize;
      const visible = items.slice(0, pageSize);
      if (visible.length === 0) {
        return respond(ctx, '🆕 Belum ada artikel terbaru.', { reply_markup: backToMenuKeyboard() });
      }
      await respond(ctx, formatLatestList({ items: visible, page }), {
        reply_markup: listKeyboard({
          items: visible,
          page,
          hasMore,
          pageCallback: (p) => `latest:page:${p}`,
        }),
      });
    },

    async history(ctx, page = 0) {
      const user = await ensureUser(ctx, repos);
      if (!user) return respond(ctx, ERRORS.generic);
      let items;
      try {
        items = await repos.history.listByUser(user.id, { limit: pageSize + 1, offset: page * pageSize });
      } catch (err) {
        logger?.error('[HISTORY] gagal', err);
        return respond(ctx, ERRORS.database);
      }
      const hasMore = items.length > pageSize;
      const visible = items.slice(0, pageSize);
      await respond(ctx, formatHistoryList({ items: visible, page }), {
        reply_markup:
          visible.length === 0
            ? backToMenuKeyboard()
            : listKeyboard({ items: visible, page, hasMore, pageCallback: (p) => `hist:page:${p}` }),
      });
    },
  };
}

/**
 * Alur pencarian: prompt tema, eksekusi query, pagination.
 */
import { searchPromptText, formatSearchResults, noResultsText, ERRORS } from '../messages.js';
import { searchPromptKeyboard, searchResultsKeyboard } from '../keyboards/keyboards.js';
import { ensureUser, respond, ackCallback } from '../context.js';

export function createSearchHandlers({ config, repos, searchService, session, logger }) {
  async function runQuery(ctx, text, page) {
    const user = await ensureUser(ctx, repos);
    const userId = user?.id ?? null;

    let res;
    try {
      res = await searchService.search({ query: text, page, userId });
    } catch (err) {
      logger?.error('[SEARCH] gagal', err);
      return respond(ctx, ERRORS.database, { reply_markup: searchPromptKeyboard() });
    }

    session.update(ctx.from.id, {
      state: 'idle',
      lastQuery: text,
      lastResults: res.items,
      lastTotal: res.total,
      page: res.page,
    });

    if (res.total === 0) {
      return respond(ctx, noResultsText(text), { reply_markup: searchPromptKeyboard() });
    }

    const text_ = formatSearchResults({
      query: text,
      items: res.items,
      total: res.total,
      page: res.page,
      pageSize: res.pageSize,
    });
    const keyboard = searchResultsKeyboard({ items: res.items, page: res.page, hasMore: res.hasMore });
    return respond(ctx, text_, { reply_markup: keyboard });
  }

  return {
    async begin(ctx) {
      session.update(ctx.from.id, { state: 'awaiting_search' });
      await respond(ctx, searchPromptText(), { reply_markup: searchPromptKeyboard() });
    },

    async onText(ctx, text) {
      const query = String(text || '').trim();
      if (query.length < 2) {
        session.update(ctx.from.id, { state: 'awaiting_search' });
        return respond(ctx, searchPromptText(), { reply_markup: searchPromptKeyboard() });
      }
      session.update(ctx.from.id, { state: 'idle' });
      return runQuery(ctx, query, 0);
    },

    async page(ctx, page) {
      await ackCallback(ctx);
      const state = session.get(ctx.from.id) || {};
      const query = state.lastQuery;
      if (!query) {
        return respond(ctx, searchPromptText(), { reply_markup: searchPromptKeyboard() });
      }
      return runQuery(ctx, query, page);
    },

    isAwaiting(ctx) {
      const state = session.get(ctx.from.id);
      return Boolean(state && state.state === 'awaiting_search');
    },
  };
}

/**
 * Helper konteks Telegram: pastikan user tersimpan & cek admin.
 * Identitas diambil dari update Telegram (ctx.from), bukan input bebas.
 */

export function getTelegramUser(ctx) {
  return ctx?.from || ctx?.update?.callback_query?.from || null;
}

export function isAdminUser(ctx, config) {
  const user = getTelegramUser(ctx);
  if (!user) return false;
  const ids = config?.admin?.telegramIds || [];
  return ids.includes(String(user.id));
}

export async function ensureUser(ctx, repos) {
  const user = getTelegramUser(ctx);
  if (!user) return null;
  return repos.users.upsertByTelegramId({
    telegram_id: user.id,
    username: user.username,
    first_name: user.first_name,
    last_name: user.last_name,
  });
}

/**
 * Membalas callback dengan edit bila memungkinkan, jika tidak kirim pesan baru.
 */
export async function respond(ctx, text, extra = {}) {
  const isCallback = Boolean(ctx.callbackQuery);
  if (isCallback && typeof ctx.editMessageText === 'function') {
    try {
      await ctx.editMessageText(text, extra);
      return;
    } catch {
      // Pesan sama / tidak bisa diedit -> kirim baru.
    }
  }
  await ctx.reply(text, extra);
}

export async function ackCallback(ctx) {
  if (ctx.callbackQuery && typeof ctx.answerCbQuery === 'function') {
    try {
      await ctx.answerCbQuery();
    } catch {
      /* abaikan */
    }
  }
}

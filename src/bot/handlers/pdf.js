/**
 * Ekspor PDF (hanya aktif bila FULL_CONTENT_ENABLED=true).
 */
import { ERRORS } from '../messages.js';
import { backToMenuKeyboard } from '../keyboards/keyboards.js';
import { respond, ackCallback } from '../context.js';
import { sendDocumentViaFetch } from '../upload.js';

export function createPdfHandlers({ config, repos, pdfService, logger, uploadDocument }) {
  const upload =
    uploadDocument ||
    ((ctx, file) =>
      sendDocumentViaFetch({
        token: config.telegram.token,
        chatId: ctx.chat.id,
        filePath: file.path,
        filename: file.filename,
        caption: '🕌 Khutbah Jumat (PDF) — Sumber: NU Online',
      }));

  return {
    async export(ctx, articleId) {
      await ackCallback(ctx);

      if (!config.content.fullContentEnabled) {
        return respond(
          ctx,
          '⚠️ Ekspor PDF dinonaktifkan.\n\n' +
            'Aktifkan FULL_CONTENT_ENABLED=true hanya setelah izin penggunaan konten dipastikan.',
          { reply_markup: backToMenuKeyboard() },
        );
      }
      if (!pdfService) return respond(ctx, ERRORS.pdf, { reply_markup: backToMenuKeyboard() });

      let article;
      try {
        article = await repos.articles.findById(articleId);
      } catch (err) {
        logger?.error('[PDF] gagal memuat artikel', err);
        return respond(ctx, ERRORS.database);
      }
      if (!article || !article.content) return respond(ctx, ERRORS.notFound, { reply_markup: backToMenuKeyboard() });

      await ctx.reply('⏳ Sedang menyiapkan PDF...');

      let file = null;
      try {
        file = await pdfService.generate(article);
        await upload(ctx, file);
      } catch (err) {
        logger?.error('[PDF] gagal membuat/mengirim', err);
        return respond(ctx, ERRORS.pdf, { reply_markup: backToMenuKeyboard() });
      } finally {
        if (file?.path) {
          try {
            await pdfService.cleanup(file.path);
          } catch (err) {
            logger?.warn('[PDF] gagal menghapus file sementara', { error: err.message });
          }
        }
      }
    },
  };
}

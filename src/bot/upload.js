/**
 * Upload dokumen ke Telegram via `fetch` native + FormData.
 *
 * Latar belakang: `ctx.replyWithDocument` (Telegraf/node-fetch) gagal
 * "socket hang up" pada multipart di Node 26, sementara `fetch` native berhasil.
 * Helper ini menyatukan cara kirim dokumen agar konsisten & teruji.
 */
import fs from 'node:fs';

/**
 * @param {{ token: string, chatId: number|string, filePath: string, filename?: string, caption?: string, signal?: AbortSignal }} opts
 * @returns {Promise<object>} result dari Telegram
 */
export async function sendDocumentViaFetch({ token, chatId, filePath, filename, caption, signal }) {
  if (!token) throw new Error('token Telegram tidak tersedia');
  const buf = await fs.promises.readFile(filePath);
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) form.append('caption', caption);
  form.append('document', new Blob([buf], { type: 'application/pdf' }), filename || 'document.pdf');

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const err = new Error(data?.description || `HTTP ${res.status}`);
    err.code = data?.error_code;
    throw err;
  }
  return data.result;
}

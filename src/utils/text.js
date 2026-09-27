/**
 * Utilitas teks: escaping untuk Telegram, slug, dan pembersihan nama file.
 */

/** Escape untuk parse_mode = HTML pada Telegram. */
export function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape untuk parse_mode = MarkdownV2 pada Telegram. */
export function escapeMarkdownV2(input) {
  return String(input ?? '').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/** Membuat slug sederhana dari judul. */
export function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const ILLEGAL_FILENAME = /[<>:"/\\|?*\u0000-\u001F]/g;

/**
 * Membersihkan judul agar aman dipakai sebagai nama file (PRD §15).
 * @param {string} title
 * @param {{ prefix?: string, maxLength?: number, ext?: string }} [opts]
 */
export function sanitizePdfFilename(title, opts = {}) {
  const prefix = opts.prefix ?? 'Khutbah_Jumat_';
  const ext = opts.ext ?? '.pdf';
  const maxLength = opts.maxLength ?? 120;

  let clean = String(title ?? '')
    .replace(ILLEGAL_FILENAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  if (!clean) clean = 'Tanpa_Judul';

  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(clean)) clean = `_${clean}`;

  let name = `${prefix}${clean}${ext}`;
  if (name.length > maxLength) {
    const keep = Math.max(1, maxLength - prefix.length - ext.length);
    name = `${prefix}${clean.slice(0, keep).trim()}${ext}`;
  }
  return name;
}

/**
 * Pembentuk teks pesan Telegram (pure functions, mudah dites).
 */

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const day = d.getUTCDate();
  const month = MONTHS_ID[d.getUTCMonth()];
  return `${day} ${month} ${d.getUTCFullYear()}`;
}

export function welcomeText() {
  return (
    '🕌 BOT KHUTBAH JUMAT\n\n' +
    "Assalamu'alaikum.\n\n" +
    'Saya dapat membantu Anda mencari materi\n' +
    'khutbah Jumat berdasarkan tema.\n\n' +
    'Silakan pilih menu:'
  );
}

export function helpText() {
  return (
    '🕌 BANTUAN\n\n' +
    '/start — menu utama\n' +
    '/menu — tampilkan menu\n' +
    '/latest — khutbah terbaru\n' +
    '/search — cari khutbah berdasarkan tema\n' +
    '/help — bantuan ini\n\n' +
    'Anda juga dapat langsung mengetik tema\n' +
    'setelah menekan 🔎 Cari Khutbah.'
  );
}

export function unknownCommandText() {
  return (
    '⚠️ Maaf, perintah tidak dikenal.\n\n' +
    'Ketik /help untuk daftar perintah, atau gunakan menu di bawah ini.'
  );
}

export function aboutText({ fullContentEnabled = false } = {}) {
  const base =
    '🕌 BOT KHUTBAH JUMAT\n\n' +
    'Bot ini membantu mencari dan membaca\n' +
    'materi khutbah Jumat berdasarkan tema.\n\n' +
    'Sumber materi:\nNU Online\n\n' +
    'Bot tidak mengubah substansi materi sumber.\n\n' +
    'Untuk artikel lengkap dan informasi terbaru,\n' +
    'silakan merujuk ke sumber asli.';
  if (!fullContentEnabled) {
    base +=
      '\n\nℹ️ Saat ini bot menampilkan metadata dan cuplikan, ' +
      'serta menautkan ke artikel asli di NU Online.';
  }
  return base;
}

export function searchPromptText() {
  return (
    '🔎 CARI KHUTBAH\n\n' +
    'Ketik tema atau kata kunci khutbah\n' +
    'yang ingin Anda cari.\n\n' +
    'Contoh:\n' +
    '• sabar\n• kematian\n• keluarga\n• rezeki\n• akhlak\n• shalat\n• sedekah'
  );
}

export function formatSearchResults({ query, items, total, page, pageSize }) {
  const lines = ['🔎 HASIL PENCARIAN', '', `Tema: ${query}`, '', `Ditemukan ${total} materi khutbah.`, ''];
  items.forEach((item, i) => lines.push(`${i + 1}. ${item.title}`));
  lines.push('', 'Silakan tekan judul di bawah:');
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  if (total > pageSize) lines.push('', `Menampilkan ${start}–${end} dari ${total}.`);
  return lines.join('\n');
}

export function noResultsText(query) {
  return `⚠️ Tidak ada materi yang cocok untuk "${query}".\n\nSilakan coba kata kunci lain.`;
}

export function formatArticleHeader(article) {
  const lines = ['🕌 KHUTBAH JUMAT', '', 'Judul:', article.title || '-', ''];
  if (article.author) lines.push(`✍️ Penulis:`, article.author, '');
  lines.push('📅 Tanggal:', formatDate(article.published_at), '', '━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

/**
 * Body artikel. Mode aman -> cuplikan + tautan sumber, bukan isi penuh.
 */
export function formatArticleBody(article, { fullContentEnabled = false } = {}) {
  const hasFull = Boolean(article.content);
  if (fullContentEnabled && hasFull) {
    return article.content;
  }
  const snippet = article.snippet || article.description || '';
  const note =
    'ℹ️ Bot menampilkan cuplikan. Untuk naskah lengkap, ' +
    'silakan buka artikel asli di NU Online.';
  return [snippet, '', note].join('\n');
}

export function formatArticleFooter(article) {
  return ['━━━━━━━━━━━━━━━━━━', '', '📚 Sumber:', article.source || 'NU Online', '', '🔗 Artikel asli:', article.url || '-'].join('\n');
}

export function articleActionsPrompt() {
  return ['━━━━━━━━━━━━━━━━━━', '', '📚 Sumber: NU Online', '', 'Pilih tindakan:'].join('\n');
}

export function formatLatestList({ items, page, total }) {
  const lines = ['🆕 KHUTBAH TERBARU', ''];
  items.forEach((item, i) => lines.push(`${i + 1}. ${item.title}`));
  lines.push('', 'Silakan tekan judul di bawah:');
  return lines.join('\n');
}

export function formatFavoriteList({ items, page }) {
  if (items.length === 0) {
    return '🔖 FAVORIT\n\nBelum ada khutbah yang disimpan.\n\nSimpan khutbah dari menu artikel.';
  }
  const lines = ['🔖 FAVORIT', ''];
  items.forEach((item, i) => lines.push(`${i + 1}. ${item.title}`));
  lines.push('', 'Silakan tekan judul di bawah:');
  return lines.join('\n');
}

export function formatHistoryList({ items, page }) {
  if (items.length === 0) {
    return '📚 RIWAYAT\n\nBelum ada riwayat khutbah yang dibuka.';
  }
  const lines = ['📚 RIWAYAT', ''];
  items.forEach((item, i) => lines.push(`${i + 1}. ${item.title}`));
  lines.push('', 'Silakan tekan judul di bawah:');
  return lines.join('\n');
}

export function formatAdmin() {
  return (
    '⚙️ ADMIN\n\n' +
    '📊 Statistik\n' +
    '🔄 Sinkronisasi Sekarang\n' +
    '📰 Artikel Terbaru\n' +
    '👥 Pengguna\n' +
    '📋 Log Sinkronisasi\n' +
    '📋 Error Log'
  );
}

export function formatStats({ users, articles, favorites, history, searches, lastSync }) {
  const lines = [
    '📊 STATISTIK',
    '',
    `Users      : ${users}`,
    `Articles   : ${articles}`,
    `Favorites  : ${favorites}`,
    `History    : ${history}`,
    `Searches   : ${searches}`,
    '',
    `Last sync  : ${lastSync?.finished_at || lastSync?.started_at || '-'}`,
    `Sync status: ${lastSync?.status || '-'}`,
  ];
  return lines.join('\n');
}

export function formatSyncResult(result) {
  if (result.skipped) {
    return `ℹ️ Sinkronisasi dilewati: ${result.reason}.`;
  }
  const s = result.stats || {};
  return [
    '✅ Sinkronisasi selesai.',
    '',
    `Ditemukan      : ${s.found ?? 0}`,
    `Artikel baru   : ${s.inserted ?? 0}`,
    `Diperbarui     : ${s.updated ?? 0}`,
    `Gagal diproses : ${s.failed ?? 0}`,
  ].join('\n');
}

export const ERRORS = Object.freeze({
  database: '⚠️ Sistem sedang mengalami gangguan.\nSilakan coba beberapa saat lagi.',
  notFound: '⚠️ Materi tidak dapat ditemukan.\n\nSilakan coba pencarian lain.',
  pdf: '⚠️ PDF gagal dibuat.\n\nSilakan coba kembali.',
  generic: '⚠️ Terjadi kesalahan. Silakan coba lagi.',
  notAdmin: '⛔ Anda tidak memiliki akses ke menu admin.',
  offline: '📶 Sumber sedang tidak dapat diakses. Artikel yang sudah tersimpan tetap dapat dibaca.',
});

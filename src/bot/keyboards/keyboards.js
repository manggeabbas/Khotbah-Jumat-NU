/**
 * Definisi inline keyboard. Mengembalikan objek biasa (reply_markup) agar
 * tidak bergantung pada instance Telegraf dan mudah dites.
 */

/**
 * Label tombol daftar: buang awalan "Khutbah Jumat:" yang redundan dengan
 * judul menu, supaya lebih banyak judul muat dalam satu baris tombol
 * (Telegram hanya menampilkan satu baris teks per tombol).
 */
function buttonLabel(item, i) {
  const title = (item.title || '').trim().replace(/^Khutbah Jumat:\s*/, '');
  return `${i + 1}. ${title}`;
}

export function mainMenuKeyboard({ isAdmin = false } = {}) {
  const rows = [
    [
      { text: '🔎 Cari Khutbah', callback_data: 'menu:search' },
      { text: '🆕 Khutbah Terbaru', callback_data: 'menu:latest' },
    ],
    [
      { text: '🔖 Favorit', callback_data: 'menu:fav' },
      { text: '📚 Riwayat', callback_data: 'menu:history' },
    ],
    [{ text: 'ℹ️ Tentang Bot', callback_data: 'menu:about' }],
  ];
  if (isAdmin) rows.push([{ text: '⚙️ Admin', callback_data: 'menu:admin' }]);
  return { inline_keyboard: rows };
}

export function searchPromptKeyboard() {
  return { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu:main' }]] };
}

export function searchResultsKeyboard({ items, page, hasMore }) {
  // Satu tombol per baris berisi nomor + judul, jadi pengguna menekan judulnya langsung.
  const rows = items.map((item, i) => [
    { text: buttonLabel(item, i), callback_data: `art:${item.id}` },
  ]);
  if (hasMore) rows.push([{ text: '➡️ Halaman Berikutnya', callback_data: `srch:page:${page + 1}` }]);
  if (page > 0) rows.push([{ text: '⬅️ Halaman Sebelumnya', callback_data: `srch:page:${page - 1}` }]);
  rows.push([
    { text: '🔎 Cari Tema Lain', callback_data: 'menu:search' },
    { text: '🏠 Menu Utama', callback_data: 'menu:main' },
  ]);
  return { inline_keyboard: rows };
}

export function articleActionsKeyboard({ articleId, canExportPdf, isFavorite = false }) {
  const rows = [[{ text: '⬅️ Kembali', callback_data: 'art:back' }]];
  const actions = [];
  if (canExportPdf) actions.push({ text: '📄 Ekspor PDF', callback_data: `pdf:${articleId}` });
  actions.push(
    isFavorite
      ? { text: '🗑️ Hapus Favorit', callback_data: `fav:del:${articleId}` }
      : { text: '⭐ Favorit', callback_data: `fav:add:${articleId}` },
  );
  rows.push(actions);
  rows.push([
    { text: '🔄 Khutbah Lain', callback_data: 'menu:latest' },
    { text: '🔎 Cari Tema Baru', callback_data: 'menu:search' },
  ]);
  rows.push([{ text: '🏠 Menu Utama', callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

export function listKeyboard({
  items,
  page,
  hasMore,
  itemCallback = (item) => `art:${item.id}`,
  pageCallback = (p) => `list:page:${p}`,
}) {
  const rows = items.map((item, i) => [
    { text: buttonLabel(item, i), callback_data: itemCallback(item) },
  ]);
  if (hasMore) rows.push([{ text: '➡️ Halaman Berikutnya', callback_data: pageCallback(page + 1) }]);
  if (page > 0) rows.push([{ text: '⬅️ Halaman Sebelumnya', callback_data: pageCallback(page - 1) }]);
  rows.push([{ text: '🏠 Menu Utama', callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}

export function adminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📊 Status', callback_data: 'admin:status' }],
      [{ text: '📈 Statistik', callback_data: 'admin:stats' }],
      [{ text: '🔄 Sinkronisasi Sekarang', callback_data: 'admin:sync' }],
      [{ text: '📰 Artikel Terbaru', callback_data: 'admin:articles' }],
      [{ text: '👥 Pengguna', callback_data: 'admin:users' }],
      [{ text: '📋 Log Sinkronisasi', callback_data: 'admin:syncs' }],
      [{ text: '📋 Error Log', callback_data: 'admin:errors' }],
      [{ text: '🏠 Menu Utama', callback_data: 'menu:main' }],
    ],
  };
}

export function backToMenuKeyboard() {
  return { inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'menu:main' }]] };
}

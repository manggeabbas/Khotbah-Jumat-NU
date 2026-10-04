import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/bot/createBot.js';
import { createMemoryStore } from '../src/database/memoryStore.js';
import { createRepositories } from '../src/database/repositories.js';
import { createSessionStore } from '../src/bot/session.js';
import { createSearchService } from '../src/search/search.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

// Telegraf membuat klien Telegram baru per update, jadi kita tambal prototype.
let calls = [];
let patchedProto = null;
let originalCallApi = null;

function installTelegramMock(bot) {
  if (!patchedProto) {
    patchedProto = Object.getPrototypeOf(bot.telegram);
    originalCallApi = patchedProto.callApi;
    patchedProto.callApi = async function (method, payload) {
      calls.push({ method, payload });
      if (method === 'getMe') {
        return { id: 1, is_bot: true, first_name: 'TestBot', username: 'testbot' };
      }
      return {
        message_id: calls.length,
        chat: { id: payload?.chat_id ?? 1 },
        date: Math.floor(Date.now() / 1000),
      };
    };
  }
}

after(() => {
  if (patchedProto && originalCallApi) patchedProto.callApi = originalCallApi;
});

function baseConfig(over = {}) {
  return {
    telegram: { token: '123456:TESTTOKEN' },
    admin: { telegramIds: ['999'] },
    search: { maxResults: 8 },
    history: { max: 50 },
    content: { fullContentEnabled: false, snippetMaxLength: 400 },
    ...over,
  };
}

async function setup({ configOverrides = {}, seed = [] } = {}) {
  const config = baseConfig(configOverrides);
  const repos = createRepositories(createMemoryStore());
  for (const a of seed) await repos.articles.upsert(a);
  const services = {
    repos,
    session: createSessionStore(),
    searchService: createSearchService({ repos, config, logger: silentLogger }),
    syncService: { running: false, run: async () => ({ skipped: true, reason: 'disabled' }) },
    pdfService: { generate: async () => ({ path: '/tmp/none.pdf', filename: 'x.pdf' }), cleanup: async () => {} },
  };
  const { bot, handlers } = createBot({ config, services, logger: silentLogger });
  installTelegramMock(bot);
  calls = [];

  return { bot, handlers, calls, repos, config, services };
}

function privateMessage(text, userId = 1) {
  const entities = text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] : undefined;
  return {
    update_id: Math.floor(Math.random() * 1e6),
    message: {
      message_id: Math.floor(Math.random() * 1e6),
      date: Math.floor(Date.now() / 1000),
      chat: { id: userId, type: 'private' },
      from: { id: userId, is_bot: false, first_name: 'Tester', username: 'tester' },
      text,
      entities,
    },
  };
}

function callback(data, userId = 1) {
  return {
    update_id: Math.floor(Math.random() * 1e6),
    callback_query: {
      id: `cb-${Math.random()}`,
      from: { id: userId, is_bot: false, first_name: 'Tester', username: 'tester' },
      message: {
        message_id: Math.floor(Math.random() * 1e6),
        chat: { id: userId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'previous',
      },
      chat_instance: 'ci',
      data,
    },
  };
}

const sentTexts = (calls) => calls.filter((c) => c.method === 'sendMessage').map((c) => c.payload.text);
const editedTexts = (calls) => calls.filter((c) => c.method === 'editMessageText').map((c) => c.payload.text);
const allTexts = (calls) => [...sentTexts(calls), ...editedTexts(calls)];

test('T-CMD-01: /start menampilkan menu', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(privateMessage('/start'));
  const texts = sentTexts(calls);
  assert.ok(texts.some((t) => t.includes('BOT KHUTBAH JUMAT')));
  const reply = calls.find((c) => c.method === 'sendMessage');
  assert.ok(reply.payload.reply_markup.inline_keyboard.length >= 3);
});

test('T-CMD-02: /help menampilkan bantuan', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(privateMessage('/help'));
  assert.ok(sentTexts(calls).some((t) => t.includes('BANTUAN')));
});

test('T-MENU-01: menu:search menampilkan prompt', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(callback('menu:search'));
  assert.ok(allTexts(calls).some((t) => t.includes('CARI KHUTBAH')));
});

test('T-SRCH-01: teks tema -> hasil + tombol artikel', async () => {
  const { bot, calls } = await setup({
    seed: [
      { title: 'Sabar dalam Ujian', url: 'https://x/1', content: 'sabar', content_hash: 'a', published_at: '2026-09-01T00:00:00.000Z', snippet: 'sabar' },
    ],
  });
  await bot.handleUpdate(privateMessage('sabar'));
  const texts = allTexts(calls);
  assert.ok(texts.some((t) => t.includes('HASIL PENCARIAN')));
  const kbCall = calls.find((c) => c.payload?.reply_markup?.inline_keyboard?.some((row) => row.some((b) => /^art:\d+$/.test(b.callback_data))));
  assert.ok(kbCall, 'tombol article_id harus ada');
});

test('T-SRCH-02: nol hasil -> fallback', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(privateMessage('zzzznotfound'));
  assert.ok(allTexts(calls).some((t) => /Tidak ada materi/.test(t)));
});

test('T-ART-01: pilih artikel -> header + aksi', async () => {
  const { bot, calls, repos } = await setup();
  const art = (await repos.articles.upsert({ title: 'Artikel Uji', url: 'https://x/9', content: 'isi', content_hash: 'z', published_at: '2026-09-02T00:00:00.000Z', snippet: 'cuplikan uji' })).article;
  await bot.handleUpdate(callback(`art:${art.id}`));
  const texts = allTexts(calls);
  assert.ok(texts.some((t) => t.includes('KHUTBAH JUMAT')));
  assert.ok(texts.some((t) => t.includes('Artikel Uji')));
  assert.ok(texts.some((t) => t.includes('📚 Sumber') || t.includes('NU Online')));
  // Mode aman: harus menautkan sumber.
  assert.ok(texts.some((t) => t.includes('https://x/9')));
});

test('T-ART-02: artikel tidak ada -> pesan tidak ditemukan', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(callback('art:999999'));
  assert.ok(allTexts(calls).some((t) => /tidak dapat ditemukan/i.test(t)));
});

test('T-FAV-01: simpan favorit + duplikat', async () => {
  const { bot, calls, repos } = await setup();
  const art = (await repos.articles.upsert({ title: 'Fav', url: 'https://x/f', content: 'x', content_hash: 'f', snippet: 'x' })).article;
  await bot.handleUpdate(callback(`fav:add:${art.id}`));
  assert.ok(allTexts(calls).some((t) => /berhasil disimpan ke favorit/i.test(t)));
  calls.length = 0;
  await bot.handleUpdate(callback(`fav:add:${art.id}`));
  assert.ok(allTexts(calls).some((t) => /sudah ada di favorit/i.test(t)));
});

test('T-FAV-02: daftar favorit menampilkan item', async () => {
  const { bot, calls, repos } = await setup();
  const user = await repos.users.upsertByTelegramId({ telegram_id: 1, first_name: 'T' });
  const art = (await repos.articles.upsert({ title: 'Favorit Saya', url: 'https://x/v', content: 'x', content_hash: 'v', snippet: 'x' })).article;
  await repos.favorites.add(user.id, art.id);
  await bot.handleUpdate(callback('menu:fav'));
  assert.ok(allTexts(calls).some((t) => t.includes('FAVORIT')));
  const favBtnTexts = calls.flatMap((c) => c.payload?.reply_markup?.inline_keyboard?.flat() || []).map((b) => b.text);
  assert.ok(favBtnTexts.some((t) => t.includes('Favorit Saya')), 'tombol harus memuat judul favorit');
});

test('T-HIS-01: riwayat terisi setelah membuka artikel', async () => {
  const { bot, calls, repos } = await setup();
  const art = (await repos.articles.upsert({ title: 'Dibuka', url: 'https://x/h', content: 'x', content_hash: 'h', snippet: 'x' })).article;
  await bot.handleUpdate(callback(`art:${art.id}`));
  assert.equal(await repos.history.count(), 1);
  calls.length = 0;
  await bot.handleUpdate(callback('menu:history'));
  assert.ok(allTexts(calls).some((t) => t.includes('RIWAYAT')));
  const histBtnTexts = calls.flatMap((c) => c.payload?.reply_markup?.inline_keyboard?.flat() || []).map((b) => b.text);
  assert.ok(histBtnTexts.some((t) => t.includes('Dibuka')), 'tombol harus memuat judul riwayat');
});

test('T-ADM-01: user biasa ditolak dari admin', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(callback('menu:admin', 12345));
  assert.ok(allTexts(calls).some((t) => /tidak memiliki akses/i.test(t)));
});

test('T-ADM-02: admin diizinkan', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(callback('menu:admin', 999));
  assert.ok(allTexts(calls).some((t) => t.includes('ADMIN')));
});

test('T-ADM-03: admin memicu sinkronisasi', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(callback('admin:sync', 999));
  assert.ok(allTexts(calls).some((t) => /Sinkronisasi/i.test(t)));
});

test('T-ART-03: mode penuh -> pesan panjang dipecah', async () => {
  const longContent = Array.from({ length: 30 }, (_, i) => `Paragraf ${i} ` + 'kata panjang '.repeat(20)).join('\n\n');
  const { bot, calls, repos } = await setup({ configOverrides: { content: { fullContentEnabled: true, snippetMaxLength: 400 } } });
  const art = (await repos.articles.upsert({ title: 'Panjang', url: 'https://x/long', content: longContent, khutbah_1: longContent, content_hash: 'l' })).article;
  await bot.handleUpdate(callback(`art:${art.id}`));
  const sends = calls.filter((c) => c.method === 'sendMessage');
  assert.ok(sends.length > 2, `harus terpecah, dapat ${sends.length} pesan`);
  for (const s of sends) assert.ok(s.payload.text.length <= 4096);
});

test('T-ART-04: metadata hilang (tanpa penulis/tanggal) tidak crash', async () => {
  const { bot, calls, repos } = await setup();
  const art = (await repos.articles.upsert({ title: 'Tanpa Metadata', url: 'https://x/nm', content: null, snippet: 'cuplikan', content_hash: 'nm' })).article;
  await bot.handleUpdate(callback(`art:${art.id}`));
  const texts = allTexts(calls);
  assert.ok(texts.some((t) => t.includes('Tanpa Metadata')));
  assert.ok(texts.some((t) => t.includes('📅 Tanggal:')));
});

test('T-ADM-04: trigger sync ganda dibatasi saat sedang berjalan', async () => {
  const { bot, calls, services } = await setup();
  services.syncService.running = true;
  await bot.handleUpdate(callback('admin:sync', 999));
  assert.ok(allTexts(calls).some((t) => /sedang berjalan/i.test(t)));
});

test('T-FAV-03: favorit terisolasi antar pengguna', async () => {
  const { bot, calls, repos } = await setup();
  const art = (await repos.articles.upsert({ title: 'Milik A', url: 'https://x/iso', content: 'x', content_hash: 'iso', snippet: 'x' })).article;
  await bot.handleUpdate(callback(`fav:add:${art.id}`, 1));
  calls.length = 0;
  await bot.handleUpdate(callback('menu:fav', 2));
  assert.ok(allTexts(calls).some((t) => /Belum ada khutbah yang disimpan/i.test(t)));
});

test('T-CB-01: callback data tidak dikenal/expired tidak crash', async () => {
  const { bot } = await setup();
  await assert.doesNotReject(() => bot.handleUpdate(callback('art:abc')));
  await assert.doesNotReject(() => bot.handleUpdate(callback('entah:apa')));
  await assert.doesNotReject(() => bot.handleUpdate(callback('srch:page:999')));
});

test('T-LATEST-01: /latest menampilkan artikel terbaru + tombol callback', async () => {
  const { bot, calls } = await setup({
    seed: [
      { title: 'Terbaru Satu', url: 'https://x/l1', content: 'x', content_hash: 'l1', snippet: 'x', published_at: '2026-09-10T00:00:00.000Z' },
      { title: 'Terbaru Dua', url: 'https://x/l2', content: 'x', content_hash: 'l2', snippet: 'x', published_at: '2026-09-12T00:00:00.000Z' },
    ],
  });
  await bot.handleUpdate(privateMessage('/latest'));
  const texts = allTexts(calls);
  assert.ok(texts.some((t) => t.includes('KHUTBAH TERBARU')));
  const kbCall = calls.find((c) => c.payload?.reply_markup?.inline_keyboard?.some((row) => row.some((b) => /^art:\d+$/.test(b.callback_data))));
  assert.ok(kbCall, 'harus ada tombol callback art:<id>');
  const latestBtnTexts = kbCall.payload.reply_markup.inline_keyboard.flat().map((b) => b.text);
  assert.ok(latestBtnTexts.some((t) => t.includes('Terbaru Dua')), 'tombol harus memuat judul artikel');
});

test('T-LATEST-02: /latest saat kosong memberi pesan aman', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(privateMessage('/latest'));
  assert.ok(allTexts(calls).some((t) => /Belum ada artikel terbaru/i.test(t)));
});

test('T-UNKNOWN-01: perintah tidak dikenal direspons aman', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(privateMessage('/perintahtidakada'));
  assert.ok(allTexts(calls).some((t) => /tidak dikenal/i.test(t)));
});

test('T-CB-ACK-01: callback query di-acknowledge', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(callback('menu:main'));
  assert.ok(calls.some((c) => c.method === 'answerCallbackQuery'), 'answerCallbackQuery harus dipanggil');
});

test('T-OWNER-01: owner melihat tombol Admin, user biasa tidak', async () => {
  const owner = await setup();
  await owner.bot.handleUpdate(privateMessage('/start', 999));
  const ownerKb = owner.calls.find((c) => c.method === 'sendMessage')?.payload?.reply_markup?.inline_keyboard || [];
  assert.ok(ownerKb.flat().some((b) => b.callback_data === 'menu:admin'), 'owner harus punya menu admin');

  const normal = await setup();
  await normal.bot.handleUpdate(privateMessage('/start', 12345));
  const normalKb = normal.calls.find((c) => c.method === 'sendMessage')?.payload?.reply_markup?.inline_keyboard || [];
  assert.ok(!normalKb.flat().some((b) => b.callback_data === 'menu:admin'), 'user biasa tidak boleh punya menu admin');
});

test('T-ERR-02: database error saat buka artikel ditangani', async () => {
  const { bot, calls, repos } = await setup();
  repos.articles.findById = async () => {
    throw new Error('db down');
  };
  await bot.handleUpdate(callback('art:1'));
  assert.ok(allTexts(calls).some((t) => /gangguan/i.test(t)));
});

test('T-ART-05: tombol Kembali ada & kembali ke menu', async () => {
  const { bot, calls, repos } = await setup();
  const art = (await repos.articles.upsert({ title: 'A', url: 'https://x/back', content: 'x', content_hash: 'back', snippet: 'x' })).article;
  await bot.handleUpdate(callback(`art:${art.id}`));
  const kb = calls.filter((c) => c.method === 'sendMessage').at(-1)?.payload?.reply_markup?.inline_keyboard || [];
  assert.ok(kb.flat().some((b) => b.callback_data === 'art:back'), 'tombol Kembali harus ada');
  calls.length = 0;
  await bot.handleUpdate(callback('art:back'));
  assert.ok(allTexts(calls).some((t) => t.includes('BOT KHUTBAH JUMAT')));
});

test('T-FAV-04: hapus favorit', async () => {
  const { bot, calls, repos } = await setup();
  const art = (await repos.articles.upsert({ title: 'F', url: 'https://x/fd', content: 'x', content_hash: 'fd', snippet: 'x' })).article;
  await bot.handleUpdate(callback(`fav:add:${art.id}`));
  calls.length = 0;
  await bot.handleUpdate(callback(`fav:del:${art.id}`));
  assert.ok(allTexts(calls).some((t) => /dihapus dari favorit/i.test(t)));
  const user = await repos.users.findByTelegramId(1);
  assert.equal(await repos.favorites.count(user.id), 0);
});

test('T-FAV-05: artikel favorit menampilkan tombol hapus', async () => {
  const { bot, calls, repos } = await setup();
  const user = await repos.users.upsertByTelegramId({ telegram_id: 1, first_name: 'T' });
  const art = (await repos.articles.upsert({ title: 'Fav2', url: 'https://x/fv', content: 'x', content_hash: 'fv', snippet: 'x' })).article;
  await repos.favorites.add(user.id, art.id);
  await bot.handleUpdate(callback(`art:${art.id}`));
  const kb = calls.filter((c) => c.method === 'sendMessage').at(-1)?.payload?.reply_markup?.inline_keyboard || [];
  assert.ok(kb.flat().some((b) => b.callback_data === `fav:del:${art.id}`));
});

test('T-SRCH-03: pagination callback bekerja', async () => {
  const seed = [];
  for (let i = 1; i <= 10; i++) {
    seed.push({
      title: `Sabar ${i}`,
      url: `https://x/s${i}`,
      content: 'sabar',
      content_hash: `s${i}`,
      snippet: 'sabar',
      published_at: `2026-09-${String(i).padStart(2, '0')}T00:00:00.000Z`,
    });
  }
  const { bot, calls } = await setup({ seed });
  await bot.handleUpdate(privateMessage('sabar'));
  calls.length = 0;
  await bot.handleUpdate(callback('srch:page:1'));
  assert.ok(allTexts(calls).some((t) => /HASIL PENCARIAN/.test(t)));
});

test('T-ADM-05: /status untuk admin', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(privateMessage('/status', 999));
  assert.ok(allTexts(calls).some((t) => t.includes('STATUS BOT')));
});

test('T-ADM-06: /stat untuk admin', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(privateMessage('/stat', 999));
  assert.ok(allTexts(calls).some((t) => t.includes('STATISTIK')));
});

test('T-ADM-07: /status user biasa ditolak', async () => {
  const { bot, calls } = await setup();
  await bot.handleUpdate(privateMessage('/status', 12345));
  assert.ok(allTexts(calls).some((t) => /tidak memiliki akses/i.test(t)));
});

test('T-ADM-08: /sync user biasa ditolak, admin diizinkan', async () => {
  const normal = await setup();
  await normal.bot.handleUpdate(privateMessage('/sync', 12345));
  assert.ok(allTexts(normal.calls).some((t) => /tidak memiliki akses/i.test(t)));

  const admin = await setup();
  await admin.bot.handleUpdate(privateMessage('/sync', 999));
  assert.ok(allTexts(admin.calls).some((t) => /Sinkronisasi/i.test(t)));
});

test('T-ART-06: mode aman (FULL_CONTENT_ENABLED=false) menampilkan cuplikan', async () => {
  const { bot, calls, repos } = await setup();
  const art = (await repos.articles.upsert({
    title: 'Safe',
    url: 'https://x/safe',
    content: 'x'.repeat(800),
    snippet: 'cuplikan singkat saja',
    content_hash: 'safe',
    status: 'active',
  })).article;
  await bot.handleUpdate(callback(`art:${art.id}`));
  assert.ok(allTexts(calls).some((t) => /menampilkan cuplikan/i.test(t)));
});

test('T-ART-07: mode penuh (FULL_CONTENT_ENABLED=true) menampilkan content', async () => {
  const long = 'Isi lengkap khutbah tentang sabar. '.repeat(60);
  const { bot, calls, repos } = await setup({ configOverrides: { content: { fullContentEnabled: true, snippetMaxLength: 400 } } });
  const art = (await repos.articles.upsert({
    title: 'Full',
    url: 'https://x/full',
    content: long,
    snippet: long.slice(0, 400),
    content_hash: 'full',
    status: 'active',
  })).article;
  await bot.handleUpdate(callback(`art:${art.id}`));
  const joined = allTexts(calls).join('\n');
  assert.ok(joined.includes(long.slice(-60)), 'harus memuat bagian akhir naskah');
  assert.ok(!/menampilkan cuplikan/i.test(joined), 'tidak boleh menampilkan catatan cuplikan');
});

test('T-KB-01: label tombol membuang awalan "Khutbah Jumat:" yang redundan', async () => {
  const { searchResultsKeyboard, listKeyboard } = await import('../src/bot/keyboards/keyboards.js');
  const items = [{ id: 7, title: 'Khutbah Jumat: Jangan Tunda Amal Baik' }];
  const sr = searchResultsKeyboard({ items, page: 0, hasMore: false });
  assert.equal(sr.inline_keyboard[0][0].text, '1. Jangan Tunda Amal Baik');
  const lk = listKeyboard({ items, page: 0, hasMore: false });
  assert.equal(lk.inline_keyboard[0][0].text, '1. Jangan Tunda Amal Baik');
  // Judul tanpa awalan itu tetap utuh
  const items2 = [{ id: 8, title: 'Khutbah Shalat Istisqa: Memohon Hujan' }];
  const sr2 = searchResultsKeyboard({ items: items2, page: 0, hasMore: false });
  assert.equal(sr2.inline_keyboard[0][0].text, '1. Khutbah Shalat Istisqa: Memohon Hujan');
});

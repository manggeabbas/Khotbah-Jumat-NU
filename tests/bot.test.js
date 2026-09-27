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
  assert.ok(allTexts(calls).some((t) => t.includes('FAVORIT') && t.includes('Favorit Saya')));
});

test('T-HIS-01: riwayat terisi setelah membuka artikel', async () => {
  const { bot, calls, repos } = await setup();
  const art = (await repos.articles.upsert({ title: 'Dibuka', url: 'https://x/h', content: 'x', content_hash: 'h', snippet: 'x' })).article;
  await bot.handleUpdate(callback(`art:${art.id}`));
  assert.equal(await repos.history.count(), 1);
  calls.length = 0;
  await bot.handleUpdate(callback('menu:history'));
  assert.ok(allTexts(calls).some((t) => t.includes('RIWAYAT') && t.includes('Dibuka')));
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

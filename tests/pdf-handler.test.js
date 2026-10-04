import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/bot/createBot.js';
import { createMemoryStore } from '../src/database/memoryStore.js';
import { createRepositories } from '../src/database/repositories.js';
import { createSessionStore } from '../src/bot/session.js';
import { createSearchService } from '../src/search/search.js';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function makeConfig() {
  return {
    telegram: { token: '123456:TESTTOKEN' },
    admin: { telegramIds: ['1'] },
    search: { maxResults: 8 },
    history: { max: 50 },
    content: { fullContentEnabled: true, snippetMaxLength: 400 },
  };
}

async function setup({ uploadDocument }) {
  const config = makeConfig();
  const repos = createRepositories(createMemoryStore());
  const art = (await repos.articles.upsert({
    title: 'PDF Uji',
    url: 'https://x/pdf',
    content: 'a'.repeat(300),
    content_hash: 'pdf',
    status: 'active',
  })).article;
  const state = { uploaded: [], cleaned: false };
  const services = {
    repos,
    session: createSessionStore(),
    searchService: createSearchService({ repos, config, logger: silent }),
    syncService: { running: false, run: async () => ({}) },
    pdfService: {
      generate: async () => ({ path: '/tmp/fake-verify.pdf', filename: 'fake.pdf' }),
      cleanup: async () => {
        state.cleaned = true;
      },
    },
    uploadDocument:
      uploadDocument ||
      (async (ctx, file) => {
        state.uploaded.push(file);
        return { message_id: 1 };
      }),
  };
  const { handlers } = createBot({ config, services, logger: silent });
  const ctx = { chat: { id: 1 }, from: { id: 1 }, reply: async () => {}, answerCbQuery: async () => {}, callbackQuery: { id: 'x' } };
  return { handlers, art, ctx, state };
}

test('T-PDF-01: handler PDF memakai uploader & cleanup', async () => {
  const { handlers, art, ctx, state } = await setup({});
  await handlers.pdfHandlers.export(ctx, art.id);
  assert.equal(state.uploaded.length, 1);
  assert.equal(state.uploaded[0].filename, 'fake.pdf');
  assert.equal(state.cleaned, true);
});

test('T-PDF-02: upload gagal -> tidak crash & tetap cleanup', async () => {
  const { handlers, art, ctx, state } = await setup({
    uploadDocument: async () => {
      throw new Error('socket hang up');
    },
  });
  await assert.doesNotReject(() => handlers.pdfHandlers.export(ctx, art.id));
  assert.equal(state.cleaned, true);
});

test('T-PDF-03: pesan status sementara dihapus setelah PDF terkirim', async () => {
  const { handlers, art, state } = await setup({});
  const deleted = [];
  const ctx = {
    chat: { id: 1 },
    from: { id: 1 },
    reply: async () => ({ message_id: 42 }),
    deleteMessage: async (id) => {
      deleted.push(id);
    },
    answerCbQuery: async () => {},
    callbackQuery: { id: 'x' },
  };
  await handlers.pdfHandlers.export(ctx, art.id);
  assert.equal(state.uploaded.length, 1);
  assert.deepEqual(deleted, [42]);
});

test('T-PDF-04: pesan status tetap dihapus bila pengiriman PDF gagal', async () => {
  const { handlers, art, state } = await setup({
    uploadDocument: async () => {
      throw new Error('socket hang up');
    },
  });
  const deleted = [];
  const texts = [];
  const ctx = {
    chat: { id: 1 },
    from: { id: 1 },
    reply: async (t) => {
      texts.push(t);
      return { message_id: 43 };
    },
    deleteMessage: async (id) => {
      deleted.push(id);
    },
    answerCbQuery: async () => {},
    callbackQuery: { id: 'x' },
  };
  await assert.doesNotReject(() => handlers.pdfHandlers.export(ctx, art.id));
  assert.deepEqual(deleted, [43]);
  assert.ok(texts.some((t) => /gagal/i.test(t)), 'pesan error tetap dikirim');
  assert.equal(state.cleaned, true);
});

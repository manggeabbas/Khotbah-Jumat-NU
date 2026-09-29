import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/bot/createBot.js';
import { createMemoryStore } from '../src/database/memoryStore.js';
import { createRepositories } from '../src/database/repositories.js';
import { createSessionStore } from '../src/bot/session.js';
import { createSearchService } from '../src/search/search.js';
import { createLogger } from '../src/logger.js';

const TOKEN = '123456789:AAsecretErrorToken000000000000000000';
const SECRET = 'sb_secret_errorSecretKey00000000000000';

let patchedProto = null;
let originalCallApi = null;
after(() => {
  if (patchedProto && originalCallApi) patchedProto.callApi = originalCallApi;
});

function makeUpdate(text) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 1, type: 'private' },
      from: { id: 1, is_bot: false, first_name: 'Tester' },
      text,
      entities: [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }],
    },
  };
}

test('T-ERR-01: handler error ditangani & rahasia diredaksi di log', async () => {
  const config = {
    telegram: { token: TOKEN },
    admin: { telegramIds: ['999'] },
    search: { maxResults: 8 },
    history: { max: 50 },
    content: { fullContentEnabled: false, snippetMaxLength: 400 },
  };
  const repos = createRepositories(createMemoryStore());
  const services = {
    repos,
    session: createSessionStore(),
    searchService: createSearchService({ repos, config, logger: { debug() {}, info() {}, warn() {}, error() {} } }),
    syncService: { running: false, run: async () => ({}) },
    pdfService: {},
  };

  const lines = [];
  const logger = createLogger({ level: 'error', secrets: [TOKEN, SECRET], stream: { write: (s) => lines.push(s) } });
  const { bot } = createBot({ config, services, logger });

  // Set botInfo agar handleUpdate tidak memanggil getMe (yang juga kita buat gagal).
  bot.botInfo = { id: 1, is_bot: true, first_name: 'TestBot', username: 'testbot' };

  // Paksa Telegram API selalu gagal, pesan error memuat token & secret.
  patchedProto = Object.getPrototypeOf(bot.telegram);
  originalCallApi = patchedProto.callApi;
  patchedProto.callApi = async () => {
    throw new Error(`boom ${TOKEN} ${SECRET}`);
  };

  await assert.doesNotReject(() => bot.handleUpdate(makeUpdate('/help')));

  const joined = lines.join('');
  assert.match(joined, /error saat menangani update/, 'error handler harus mencatat');
  assert.ok(!joined.includes(TOKEN), 'TELEGRAM_BOT_TOKEN tidak boleh bocor ke log');
  assert.ok(!joined.includes(SECRET), 'kunci rahasia terdaftar tidak boleh bocor ke log');
  assert.ok(joined.includes('[REDACTED]'), 'harus ada redaksi');
});

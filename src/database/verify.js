#!/usr/bin/env node
/**
 * Verifikasi database SQLite lokal (`npm run db:verify`).
 *
 * Memeriksa: keterbukaan database, keberadaan tabel, constraint (UNIQUE, CHECK,
 * FOREIGN KEY aktif), indeks penting, CRUD seluruh tabel, dan penutupan yang
 * benar. Data dummy dibersihkan kembali di akhir.
 *
 * Tidak pernah mencetak credential. Jika database belum ada, dibuat dulu
 * (idempoten) — jalankan `npm run db:init` untuk inisialisasi eksplisit.
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { loadEnv } from '../loadEnv.js';
import { initDatabase, summarize } from './init.js';
import { loadConfig } from '../config.js';

const REQUIRED_TABLES = ['articles', 'users', 'favorites', 'history', 'search_logs', 'sync_logs'];
const REQUIRED_INDEXES = [
  'articles_url_key',
  'articles_published_at_idx',
  'articles_status_idx',
  'articles_content_hash_idx',
  'users_telegram_id_key',
  'users_last_active_idx',
  'favorites_user_idx',
  'history_user_idx',
  'search_logs_created_idx',
  'sync_logs_started_idx',
];
const REQUIRED_CONSTRAINTS = [
  'articles_status_check',
  'articles_url_not_blank',
  'users_telegram_id_positive',
  'favorites_user_article_key',
  'search_logs_query_len',
  'search_logs_result_count_valid',
  'sync_logs_status_check',
  'sync_logs_counts_valid',
];

function throws(fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}

/** Jalankan operasi dan kembalikan nilai/errornya tanpa melempar. */
function attempt(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function main() {
  loadEnv();

  let config = {};
  try {
    config = loadConfig(process.env);
  } catch {
    // Verifikasi database tidak boleh gagal hanya karena env aplikasi tidak valid.
  }
  const dbPath = process.env.SQLITE_DB_PATH || config?.database?.path || 'data/khutbah.db';

  const results = [];
  const record = (name, pass, detail = '') => {
    results.push({ name, pass });
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
  };

  let db;
  try {
    ({ db } = initDatabase({ dbPath }));
  } catch (err) {
    process.stderr.write(`FAIL  buka database  (${err?.message || err})\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`\nDATABASE SQLITE — VERIFIKASI (${dbPath === ':memory:' ? dbPath : resolve(dbPath)})\n`);
  process.stdout.write('==============================================\n');

  const { tables, indexes } = summarize(db);
  const tableSet = new Set(tables);
  const indexSet = new Set(indexes);

  // 1) Tabel
  for (const t of REQUIRED_TABLES) record(`tabel ${t}`, tableSet.has(t));

  // 2) FOREIGN KEY aktif
  const fk = db.prepare('PRAGMA foreign_keys').get();
  record('foreign_keys aktif', fk?.foreign_keys === 1);

  // 3) Indeks + constraint
  for (const idx of REQUIRED_INDEXES) record(`indeks ${idx}`, indexSet.has(idx));
  const schemaSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type IN ('table','index')")
    .all()
    .map((r) => r.sql || '')
    .join('\n');
  for (const c of REQUIRED_CONSTRAINTS) {
    record(`constraint ${c}`, schemaSql.includes(c));
  }

  // 4) CRUD + constraint enforcement
  const tag = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dummyUrl = `https://example.invalid/${tag}`;
  const dummyTelegramId = 900000000000 + Math.floor(Math.random() * 1000000);
  let articleId = null;
  let userId = null;

  const insArticle = attempt(() =>
    db
      .prepare(
        "INSERT INTO articles (title, slug, url, source, content_hash, status) VALUES ('DB Verify', 'db-verify', ?, 'NU Online', ?, 'active') RETURNING id",
      )
      .get(dummyUrl, tag),
  );
  if (!insArticle.ok || insArticle.value?.id === undefined) {
    record('insert article', false, insArticle.error?.message || 'gagal');
  } else {
    articleId = insArticle.value.id;
    record('insert article', true);
  }
  if (articleId) {
    const dup = throws(() => db.prepare('INSERT INTO articles (title, url) VALUES (?, ?)').run('Dup', dummyUrl));
    record('unique url artikel', /UNIQUE constraint failed/.test(dup?.message || ''), dup ? 'ditolak' : 'tidak ditolak');
    db.prepare("UPDATE articles SET title = 'DB Verify Updated', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      articleId,
    );
    const updated = db.prepare('SELECT title FROM articles WHERE id = ?').get(articleId);
    record('update article', updated?.title === 'DB Verify Updated');
  }

  const insUser = attempt(() =>
    db
      .prepare('INSERT INTO users (telegram_id, first_name) VALUES (?, ?) RETURNING id')
      .get(dummyTelegramId, 'Verify'),
  );
  if (!insUser.ok || insUser.value?.id === undefined) {
    record('insert user', false, insUser.error?.message || 'gagal');
  } else {
    userId = insUser.value.id;
    record('insert user', true);
  }
  if (userId) {
    const dup = throws(() => db.prepare('INSERT INTO users (telegram_id) VALUES (?)').run(dummyTelegramId));
    record('unique telegram_id', /UNIQUE constraint failed/.test(dup?.message || ''));
  }

  if (userId && articleId) {
    const first = throws(() => db.prepare('INSERT INTO favorites (user_id, article_id) VALUES (?, ?)').run(userId, articleId));
    record('insert favorite', !first);
    const dup = throws(() => db.prepare('INSERT INTO favorites (user_id, article_id) VALUES (?, ?)').run(userId, articleId));
    record('unique favorite (user,article)', /UNIQUE constraint failed/.test(dup?.message || ''));
    const badArticle = throws(() => db.prepare('INSERT INTO favorites (user_id, article_id) VALUES (?, ?)').run(userId, 999999999999));
    record('FK favorites.article_id', /FOREIGN KEY constraint failed/.test(badArticle?.message || ''));
    const badUser = throws(() => db.prepare('INSERT INTO favorites (user_id, article_id) VALUES (?, ?)').run(999999999999, articleId));
    record('FK favorites.user_id', /FOREIGN KEY constraint failed/.test(badUser?.message || ''));

    record('insert history', !throws(() => db.prepare('INSERT INTO history (user_id, article_id) VALUES (?, ?)').run(userId, articleId)));
    record('insert search_logs', !throws(() => db.prepare('INSERT INTO search_logs (user_id, query, result_count) VALUES (?, ?, ?)').run(userId, 'verify', 0)));

    const badStatus = throws(() => db.prepare('INSERT INTO articles (title, url, status) VALUES (?, ?, ?)').run('x', `https://example.invalid/${tag}-bad`, 'ngawur'));
    record('CHECK articles.status', /CHECK constraint failed/.test(badStatus?.message || ''));
  }

  const syncRow = attempt(() => db.prepare("INSERT INTO sync_logs (status) VALUES ('running') RETURNING id").get());
  if (syncRow.ok && syncRow.value?.id !== undefined) {
    record('insert sync_logs', true);
    db.prepare("UPDATE sync_logs SET status = 'success', articles_found = 1, finished_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      syncRow.value.id,
    );
    const s = db.prepare('SELECT status FROM sync_logs WHERE id = ?').get(syncRow.value.id);
    record('update sync_logs', s?.status === 'success');
    db.prepare('DELETE FROM sync_logs WHERE id = ?').run(syncRow.value.id);
  } else {
    record('insert sync_logs', false, syncRow.error?.message || 'gagal');
  }

  // 5) Cleanup data dummy
  if (userId) {
    db.prepare('DELETE FROM favorites WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM history WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM search_logs WHERE user_id = ?').run(userId);
  }
  if (articleId) db.prepare('DELETE FROM articles WHERE id = ?').run(articleId);
  if (userId) db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  if (articleId) {
    record('cleanup article', db.prepare('SELECT id FROM articles WHERE id = ?').get(articleId) === undefined);
  }
  if (userId) {
    record('cleanup user', db.prepare('SELECT id FROM users WHERE id = ?').get(userId) === undefined);
  }

  // 6) Tutup database dengan benar
  const closed = throws(() => db.close());
  record('database dapat ditutup', !closed, closed?.message || '');
  if (dbPath === ':memory:') {
    record('database dapat dibuka ulang', true, 'in-memory');
  } else {
    const reopen = throws(() => {
      const again = new DatabaseSync(dbPath);
      const n = again.prepare('SELECT count(*) AS n FROM articles').get();
      again.close();
      return n;
    });
    record('database dapat dibuka ulang', !reopen, reopen?.message || '');
  }

  const failed = results.filter((r) => !r.pass).length;
  process.stdout.write(`\nRINGKASAN: ${results.length - failed}/${results.length} PASS\n`);
  if (failed > 0) process.exitCode = 1;
}

main();

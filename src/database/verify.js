#!/usr/bin/env node
/**
 * Verifikasi database via Supabase Data API (URL + Secret key).
 *
 * Memeriksa: keberadaan tabel, CRUD dasar, UNIQUE (url artikel, telegram_id,
 * favorit), FOREIGN KEY, dan membersihkan kembali data dummy.
 *
 * Tidak pernah mencetak nilai credential.
 *   npm run db:verify
 *
 * Catatan: skrip ini TIDAK membuat tabel. Jika tabel belum ada, jalankan
 * migration lebih dulu: npm run migrate -- --apply (butuh DATABASE_URL).
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from '../loadEnv.js';
import { loadConfig } from '../config.js';

const TABLES = ['articles', 'users', 'favorites', 'history', 'search_logs', 'sync_logs'];

const isUniqueViolation = (error) =>
  Boolean(error) && (error.code === '23505' || /duplicate key/i.test(error.message || ''));

async function main() {
  loadEnv();

  let config;
  try {
    config = loadConfig(process.env, { requireSecrets: true });
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
    return;
  }

  const { url, secretKey } = config.supabase;
  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results = [];
  const record = (name, pass, detail = '') => {
    results.push({ name, pass });
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
  };

  // 1) Keberadaan tabel (pakai GET; HEAD bisa menyesatkan)
  let missing = 0;
  for (const table of TABLES) {
    const { error } = await client.from(table).select('id').limit(1);
    if (error) missing++;
    record(`tabel ${table}`, !error, error?.code || '');
  }
  if (missing > 0) {
    process.stdout.write('\nBLOCKED: tabel belum ada — terapkan migration dulu (npm run migrate -- --apply).\n');
    process.exitCode = 2;
    return;
  }

  const tag = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dummyUrl = `https://example.invalid/${tag}`;
  const dummyTelegramId = 900000000000 + Math.floor(Math.random() * 1000000);

  let articleId = null;
  let userId = null;

  // 2) articles: insert + unique url + select + update
  {
    const { data, error } = await client
      .from('articles')
      .insert({ title: 'DB Verify', slug: 'db-verify', url: dummyUrl, source: 'NU Online', content_hash: tag, status: 'active' })
      .select()
      .single();
    record('insert article', !error && Boolean(data?.id), error?.code || '');
    if (data) articleId = data.id;
  }
  if (articleId) {
    const { error: dupErr } = await client.from('articles').insert({ title: 'Dup', url: dummyUrl, source: 'NU Online' });
    record('unique url artikel', isUniqueViolation(dupErr), dupErr?.code || 'tidak ditolak');
    const { data: found, error: selErr } = await client.from('articles').select('*').eq('url', dummyUrl).single();
    record('select article', !selErr && found?.id === articleId);
    const { data: upd, error: uerr } = await client
      .from('articles')
      .update({ title: 'DB Verify Updated' })
      .eq('id', articleId)
      .select()
      .single();
    record('update article', !uerr && upd?.title === 'DB Verify Updated');
  }

  // 3) users: insert + unique telegram_id
  {
    const { data, error } = await client
      .from('users')
      .insert({ telegram_id: dummyTelegramId, first_name: 'Verify' })
      .select()
      .single();
    record('insert user', !error && Boolean(data?.id), error?.code || '');
    if (data) userId = data.id;
  }
  if (userId) {
    const { error } = await client.from('users').insert({ telegram_id: dummyTelegramId });
    record('unique telegram_id', isUniqueViolation(error), error?.code || 'tidak ditolak');
  }

  // 4) favorites: insert + unique + FK
  if (userId && articleId) {
    const { error: e1 } = await client.from('favorites').insert({ user_id: userId, article_id: articleId });
    record('insert favorite', !e1, e1?.code || '');
    const { error: e2 } = await client.from('favorites').insert({ user_id: userId, article_id: articleId });
    record('unique favorite (user,article)', isUniqueViolation(e2), e2?.code || 'tidak ditolak');
    const { error: e3 } = await client.from('favorites').insert({ user_id: userId, article_id: 999999999999 });
    record('FK favorites.article_id', e3?.code === '23503', e3?.code || 'tidak ditolak');
    const { error: e4 } = await client.from('favorites').insert({ user_id: 999999999999, article_id: articleId });
    record('FK favorites.user_id', e4?.code === '23503', e4?.code || 'tidak ditolak');
  }

  // 5) history
  if (userId && articleId) {
    const { error } = await client.from('history').insert({ user_id: userId, article_id: articleId });
    record('insert history', !error, error?.code || '');
  }

  // 6) search_logs
  if (userId) {
    const { error } = await client.from('search_logs').insert({ user_id: userId, query: 'verify', result_count: 0 });
    record('insert search_logs', !error, error?.code || '');
  }

  // 7) sync_logs: insert + update
  {
    const { data, error } = await client.from('sync_logs').insert({ status: 'running' }).select().single();
    record('insert sync_logs', !error && Boolean(data?.id), error?.code || '');
    if (data) {
      const { error: uerr } = await client
        .from('sync_logs')
        .update({ status: 'success', articles_found: 1 })
        .eq('id', data.id);
      record('update sync_logs', !uerr, uerr?.code || '');
      await client.from('sync_logs').delete().eq('id', data.id);
    }
  }

  // 8) Cleanup data dummy
  if (userId) {
    await client.from('favorites').delete().eq('user_id', userId);
    await client.from('history').delete().eq('user_id', userId);
    await client.from('search_logs').delete().eq('user_id', userId);
  }
  if (articleId) await client.from('articles').delete().eq('id', articleId);
  if (userId) await client.from('users').delete().eq('id', userId);

  if (articleId) {
    const { data } = await client.from('articles').select('id').eq('id', articleId);
    record('cleanup article', (data || []).length === 0);
  }
  if (userId) {
    const { data } = await client.from('users').select('id').eq('id', userId);
    record('cleanup user', (data || []).length === 0);
  }

  const failed = results.filter((r) => !r.pass).length;
  process.stdout.write(`\nRINGKASAN: ${results.length - failed}/${results.length} PASS\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`[DB:VERIFY] Gagal: ${err?.message || err}\n`);
  process.exit(1);
});

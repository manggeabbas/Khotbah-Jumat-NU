#!/usr/bin/env node
/**
 * CLI migrasi database.
 *
 *   npm run migrate            -> tampilkan daftar migration + SQL (tinjau dulu)
 *   npm run migrate -- --apply -> terapkan semua migration ke database
 *
 * Penerapan memakai koneksi PostgreSQL langsung lewat `DATABASE_URL` (package
 * `pg`). PENTING: `SUPABASE_SECRET_KEY` adalah kunci Data API (PostgREST) dan
 * TIDAK dapat menjalankan DDL — jadi migration butuh `DATABASE_URL`.
 *
 * Tidak pernah mencetak nilai rahasia.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import pg from 'pg';
import { loadEnv } from '../loadEnv.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

export function listMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export function readMigration(name) {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
}

/**
 * Menerapkan migration secara berurutan dalam transaksi + advisory lock.
 * @param {{ databaseUrl: string, logger?: object, files?: string[] }} opts
 * @returns {Promise<string[]>} daftar migration yang diterapkan
 */
export async function applyMigrations({ databaseUrl, logger, files = listMigrations() }) {
  if (!databaseUrl) throw new Error('DATABASE_URL wajib untuk menerapkan migration.');
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const applied = [];
  try {
    for (const name of files) {
      const sql = readMigration(name);
      await client.query('begin');
      try {
        await client.query("select pg_advisory_xact_lock(hashtext('khutbah_bot_migrations'))");
        await client.query(sql);
        await client.query('commit');
        applied.push(name);
        logger?.info?.(`[MIGRATE] diterapkan: ${name}`);
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

function printHeader(text) {
  process.stdout.write(`\n${text}\n${'='.repeat(text.length)}\n`);
}

function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const files = listMigrations();

  if (files.length === 0) {
    process.stderr.write('Tidak ada file migration di supabase/migrations/.\n');
    process.exit(1);
    return;
  }

  if (!apply) {
    printHeader('MIGRATIONS (tinjau, lalu jalankan dengan --apply)');
    for (const name of files) process.stdout.write(`- ${name}\n`);
    for (const name of files) {
      printHeader(name);
      process.stdout.write(readMigration(name) + '\n');
    }
    printHeader('CARA MENERAPKAN');
    process.stdout.write(
      'Butuh koneksi PostgreSQL langsung (DDL tidak bisa lewat SUPABASE_SECRET_KEY).\n\n' +
        '  1. Supabase Dashboard > Project Settings > Database > Connection string\n' +
        '  2. Tambahkan ke .env:  DATABASE_URL="postgresql://..."\n' +
        '  3. Jalankan:           npm run migrate -- --apply\n\n' +
        'Alternatif tanpa DATABASE_URL: jalankan isi SQL di atas lewat klien Postgres mana pun.\n',
    );
    return;
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    process.stderr.write(
      'DATABASE_URL belum diset — migration tidak dapat diterapkan.\n' +
        'SUPABASE_SECRET_KEY (Data API) tidak dapat menjalankan DDL.\n' +
        'Tambahkan DATABASE_URL (Connection string Postgres) ke .env lalu ulangi.\n',
    );
    process.exitCode = 1;
    return;
  }

  printHeader('MENERAPKAN MIGRATION');
  applyMigrations({ databaseUrl })
    .then((applied) => {
      printHeader('SELESAI');
      process.stdout.write(`Diterapkan: ${applied.join(', ')}\n`);
    })
    .catch((error) => {
      // Hanya pesan (tanpa connection string / rahasia).
      process.stderr.write(`[MIGRATE] Gagal: ${error?.message || error}\n`);
      process.exitCode = 1;
    });
}

// Hanya jalankan main bila dipanggil langsung (bukan saat di-import tes).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

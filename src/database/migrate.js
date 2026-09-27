#!/usr/bin/env node
/**
 * CLI migrasi.
 *
 *   npm run migrate            -> tampilkan SQL (tinjau dulu)
 *   npm run migrate -- --apply -> terapkan ke database (butuh DATABASE_URL)
 *
 * Penerapan memakai `psql` (PostgreSQL client) bila tersedia. Tidak ada
 * dependency native tambahan yang harus dipasang di project.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { ConfigError } from '../utils/errors.js';

const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));

function printHeader(text) {
  process.stdout.write(`\n${text}\n${'='.repeat(text.length)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');

  let sql;
  try {
    sql = readFileSync(schemaPath, 'utf8');
  } catch (err) {
    process.stderr.write(`Gagal membaca schema.sql: ${err.message}\n`);
    process.exit(1);
  }

  if (!apply) {
    printHeader('SQL MIGRASI (tinjau, lalu jalankan dengan --apply)');
    process.stdout.write(sql + '\n');
    printHeader('CARA MENERAPKAN');
    process.stdout.write(
      'Opsi 1 (disarankan): buka Supabase Dashboard > SQL Editor, tempel isi schema.sql, Run.\n' +
        'Opsi 2: set DATABASE_URL (connection string Postgres) lalu: npm run migrate -- --apply\n\n',
    );
    return;
  }

  // Mode apply: butuh DATABASE_URL + psql.
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stderr.write(
      'DATABASE_URL belum diset. Penerapan migrasi memerlukan connection string Postgres.\n' +
        'Ambil dari Supabase > Project Settings > Database > Connection string.\n',
    );
    process.exit(1);
  }

  const psql = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  if (psql.error || psql.status !== 0) {
    process.stderr.write(
      'Perintah `psql` tidak tersedia. Pasang PostgreSQL client atau terapkan SQL via Supabase SQL Editor.\n',
    );
    process.exit(1);
  }

  printHeader('MENERAPKAN MIGRASI');
  const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', schemaPath], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.stderr.write('Migrasi gagal. Periksa output di atas.\n');
    process.exit(result.status || 1);
  }
  printHeader('MIGRASI SELESAI');
  process.stdout.write('Skema berhasil diterapkan.\n');
}

// Sengaja tidak memanggil loadConfig di mode print agar bisa ditinjau tanpa .env.
try {
  // Validasi .env seperlunya (tidak wajib untuk mode print).
  if (process.argv.includes('--apply')) loadConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

main();

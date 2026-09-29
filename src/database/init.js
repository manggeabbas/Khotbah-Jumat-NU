#!/usr/bin/env node
/**
 * Inisialisasi database SQLite dari nol (idempoten).
 *
 *   npm run db:init            -> buat data/khutbah.db + seluruh tabel/indeks
 *   npm run db:init -- <path>  -> tentukan path lain (opsional)
 *
 * Perintah aman dijalankan berulang kali: seluruh DDL memakai
 * `CREATE ... IF NOT EXISTS` sehingga tidak merusak data yang sudah ada.
 *
 * Tidak pernah membuat/menghapus database production tanpa diminta.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadEnv } from '../loadEnv.js';
import { ENV_KEYS } from '../config.js';

const SCHEMA_PATH = fileURLToPath(new URL('./schema.sql', import.meta.url));

/** Path file schema.sql (untuk tes/dokumentasi). */
export function getSchemaPath() {
  return SCHEMA_PATH;
}

/** Isi skema SQLite. */
export function readSchema() {
  return readFileSync(SCHEMA_PATH, 'utf8');
}

/** Menerapkan seluruh DDL skema. Idempoten. */
export function applySchema(db) {
  db.exec(readSchema());
  return true;
}

/**
 * Membuka (atau membuat) database SQLite pada `dbPath`, menyiapkan direktori,
 * dan menerapkan skema. Idempoten.
 *
 * @param {{ dbPath: string, logger?: object }} opts
 * @returns {{ db: DatabaseSync, path: string }}
 */
export function initDatabase({ dbPath, logger } = {}) {
  const path = dbPath || `data/khutbah.db`;
  const isMemory = path === ':memory:';
  if (!isMemory) {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  // WAL lebih tahan terhadap crash dan ramah pembaca paralel; diabaikan untuk
  // database in-memory.
  if (!isMemory) {
    try {
      db.exec('PRAGMA journal_mode = WAL');
    } catch (err) {
      logger?.warn?.('[DB:INIT] WAL tidak tersedia, memakai mode default', { error: err?.message });
    }
  }
  db.exec('PRAGMA busy_timeout = 5000');
  applySchema(db);
  logger?.info?.(`[DB:INIT] Siap: ${isMemory ? ':memory:' : resolve(path)}`);
  return { db, path };
}

/** Ringkasan tabel & indeks (dipakai CLI/verifikasi). */
export function summarize(db) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  return { tables, indexes };
}

function main() {
  loadEnv();
  const cliPath = process.argv.slice(2).find((a) => !a.startsWith('-'));
  const dbPath = cliPath || process.env[ENV_KEYS.sqliteDbPath] || 'data/khutbah.db';

  const { db, path } = initDatabase({ dbPath });
  const { tables, indexes } = summarize(db);
  const fk = db.prepare('PRAGMA foreign_keys').get();

  process.stdout.write('\nDATABASE SQLITE — INISIALISASI\n');
  process.stdout.write('==============================\n');
  process.stdout.write(`Path       : ${path === ':memory:' ? path : resolve(path)}\n`);
  process.stdout.write(`Foreign key: ${fk?.foreign_keys ? 'aktif' : 'NONAKTIF'}\n`);
  process.stdout.write(`Tabel (${tables.length})  : ${tables.join(', ')}\n`);
  process.stdout.write(`Indeks (${indexes.length}) : ${indexes.join(', ')}\n`);
  process.stdout.write('\nSelesai — database siap dipakai (aman dijalankan ulang).\n');
  db.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

/**
 * Memuat variabel dari file `.env` (bila ada) ke `process.env`.
 *
 * Satu-satunya mekanisme pemuatan environment di project ini. Hanya dipanggil
 * dari entrypoint (index.js / cli-sync.js / migrate.js) SEBELUM `process.env`
 * dibaca. Modul lain tetap murni terhadap `process.env` agar dapat dites tanpa
 * file `.env`.
 *
 * Tidak pernah mencetak nilai variabel.
 */
import dotenv from 'dotenv';

let loaded = false;

/**
 * @param {{ path?: string, force?: boolean, override?: boolean }} [opts]
 * @returns {boolean} true bila pemuatan dijalankan
 */
export function loadEnv({ path, force = false, override = false } = {}) {
  if (loaded && !force) return false;
  loaded = true;
  try {
    const result = dotenv.config({
      quiet: true,
      override,
      ...(path ? { path } : {}),
    });
    if (result?.error && result.error.code !== 'ENOENT') {
      // Kesalahan selain "file tidak ada" tetap dilaporkan tanpa nilai.
      process.stderr.write(`[ENV] Gagal memuat .env: ${result.error.message}\n`);
    }
  } catch (err) {
    process.stderr.write(`[ENV] Gagal memuat .env: ${err?.message || err}\n`);
  }
  return true;
}

/** Mengembalikan status apakah `loadEnv()` sudah dijalankan. */
export function isEnvLoaded() {
  return loaded;
}

/** Untuk pengujian: memungkinkan pemuatan ulang. */
export function resetEnvLoader() {
  loaded = false;
}

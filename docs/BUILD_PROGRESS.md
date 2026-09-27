# Build Progress — Bot Khutbah Jumat

Dokumen ini adalah mekanisme evaluasi otomatis. Setiap fase memperbarui status,
file yang berubah, perintah tes, hasil tes nyata, masalah tersisa, commit lokal,
dan langkah berikutnya.

## Audit awal repository (Fase 0)

Tanggal audit: 2026-09-27

- Repository: `Khotbah-Jumat`, branch `master`, **0 commit**, remote **kosong**.
- Node.js `v26.8.2`, npm `12.0.2` (fetch bawaan tersedia, ESM & `node:test` tersedia).
- `package.json`: minimal, `"type": "commonjs"`, tanpa dependency/script start.
- `.gitignore`: kosong. `.env.example`: kosong. `README.md`: kosong.
- `src/index.js` dan `src/config.js`: ada tapi kosong (0 byte).
- Struktur folder sesuai PRD §36, tetapi isinya kosong.
- `fonts/`, `tests/`, `tmp/`: kosong.
- Hasil: **~0% terimplementasi** (hanya `PRD.md` berisi konten).

### Kredensial & akses

- `.env` **tidak ada** dan tidak boleh dibuat berisi rahasia oleh agen.
- Token Telegram nyata: **tidak tersedia** → tes bot live = NOT_VERIFIED.
- Kredensial Supabase nyata: **tidak tersedia** → integrasi live = NOT_VERIFIED;
  migrasi hanya boleh ditinjau, bukan diterapkan tanpa persetujuan.

### Reconnaissance sumber (2026-09-27)

- `robots.txt` NU Online: `User-agent: *` / `Disallow:` → crawl diizinkan.
- Listing `/khutbah/`: item = `<a href="/khutbah/...">`, judul `<h2>`, tanggal `<p>`.
- Artikel: `h1` judul, byline "NU Online · <tanggal>", body `#detail-content`.
- Penanda bagian: `<p><strong>Khutbah I</strong></p>`, `...Khutbah II...`.
- Penulis eksplisit sering tidak ada (byline hanya "NU Online") → author opsional.

## Ringkasan status fase

| Fase | Nama | Status | Commit |
|---|---|---|---|
| 0 | Audit & rencana | PASS | — |
| 1 | Fondasi project | PASS | `750fcd3` |
| 2 | Database Supabase | IN_PROGRESS | — |
| 3 | Discovery & parser NU Online | PENDING | — |
| 4 | Fondasi Telegram | PENDING | — |
| 5 | Pencarian & pagination | PENDING | — |
| 6 | Pembaca artikel | PENDING | — |
| 7 | PDF | PENDING | — |
| 8 | Scheduler & sinkronisasi | PENDING | — |
| 9 | Favorit & riwayat | PENDING | — |
| 10 | Admin | PENDING | — |
| 11 | QA, integrasi, hardening | PENDING | — |
| 12 | Kesiapan GitHub | PENDING | — |
| 13 | Kesiapan Termux | PENDING | — |

## Keputusan yang menunggu pemilik

1. **Izin konten NU Online.** PRD meminta menampilkan/menyimpan artikel penuh dan
   membuat PDF turunan. Karena konten pihak ketiga, default diimplementasikan
   `FULL_CONTENT_ENABLED=false` (metadata + cuplikan + tautan). Aktifkan `true`
   hanya setelah izin/lisensi dipastikan.
2. **Kredensial Supabase & Telegram** untuk tes integrasi nyata + penerapan migrasi.
3. **Jenis key Supabase** (`service_role` server-only vs anon + RLS).
4. **Kebijakan RLS** dan retensi data pengguna.

## Log per fase

### Fase 0 — Audit & rencana
- File berubah: `docs/ARCHITECTURE.md`, `docs/BUILD_PROGRESS.md`, `docs/TEST_MATRIX.md`.
- Perintah tes: `find`, `git status`, `curl robots.txt`/listing/artikel.
- Hasil: audit selesai; struktur DOM terverifikasi; robots diizinkan.
- Masalah tersisa: keputusan pemilik di atas.
- Langkah berikut: Fase 1 fondasi project.

### Fase 1 — Fondasi project
- File berubah:
  - `package.json` (ESM, scripts start/test/lint/sync/migrate, 8 dependency).
  - `.gitignore`, `.env.example`, `README.md`.
  - `src/config.js`, `src/logger.js`, `src/app.js`, `src/index.js`.
  - `src/utils/errors.js`, `src/utils/splitMessage.js`, `src/utils/text.js`.
  - `scripts/lint.js`.
  - `tests/config.test.js`, `tests/logger.test.js`, `tests/text.test.js`,
    `tests/splitMessage.test.js`.
- Dependency terpasang: `telegraf@4.16.3`, `@supabase/supabase-js@2.117.2`,
  `cheerio@1.2.0`, `node-cron@4.6.0`, `pdfkit@0.20.2`, `dotenv@18.0.4`,
  `arabic-reshaper@1.1.0`, `bidi-js@1.1.0`. `npm install` -> **0 vulnerabilities**.
- Perintah tes:
  - `npm test` → **30 pass / 0 fail**.
  - `npm run lint` → **12 file OK**.
  - `npm start` (tanpa .env) → pesan konfigurasi jelas, tidak crash.
  - `npm start` (env palsu) → log `[BOOT]` + `[APP] started` (dry-run).
  - `git check-ignore .env` → terabaikan (`.gitignore:6`).
- Verifikasi library Arab: `arabic-reshaper.convertArabic` OK;
  `bidi-js` butuh `getEmbeddingLevels` lalu `getReorderedString(str, levels)`.
- Masalah tersisa: tidak ada. Bot belum benar-benar polling (fase 4).
- Langkah berikut: Fase 2 — migrasi & repository database.

### Fase 2 — Database Supabase
- File berubah:
  - `src/database/schema.sql` (idempoten: 6 tabel, indeks, unique, trigger,
    fungsi `search_articles` FTS + fallback, RLS).
  - `src/database/supabaseStore.js` (backend Supabase, primitive generik).
  - `src/database/memoryStore.js` (backend in-memory untuk tes).
  - `src/database/repositories.js` (articles/users/favorites/history/logs).
  - `src/database/index.js` (pabrik database).
  - `src/database/migrate.js` (CLI: print SQL / `--apply` via psql).
  - `tests/database.test.js`.
- Perintah tes:
  - `npm test` → **44 pass / 0 fail** (termasuk D-ART-01..04, D-USR-01,
    D-FAV-01..02, D-HIS-01..02, D-LOG-01..02, D-SQL-01 statis).
  - `npm run lint` → **18 file OK**.
  - `npm run migrate` → mencetak SQL untuk ditinjau (tanpa menyentuh DB).
- Hasil: migrasi tervalidasi statis; repository mock lulus.
- **NOT_VERIFIED:** penerapan migrasi ke Supabase nyata + CRUD live (I-SB-01)
  — butuh kredensial & persetujuan. Backend Supabase belum diuji jaringan.
- Masalah tersisa: keputusan jenis key Supabase (service_role vs anon+RLS).
- Langkah berikut: Fase 3 — discovery & parser NU Online.

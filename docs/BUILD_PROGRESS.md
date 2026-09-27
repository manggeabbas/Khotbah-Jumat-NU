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
| 2 | Database Supabase | PASS (mock) / NOT_VERIFIED (live) | `1a0869b` |
| 3 | Discovery & parser NU Online | IN_PROGRESS | — |
| 4 | Fondasi Telegram | PASS (mock) / NOT_VERIFIED (live) | — |
| 5 | Pencarian & pagination | PASS | — |
| 6 | Pembaca artikel | PASS | — |
| 7 | PDF | PASS (kecuali visual NOT_VERIFIED) | — |
| 8 | Scheduler & sinkronisasi | PASS (mock) | — |
| 9 | Favorit & riwayat | PASS | — |
| 10 | Admin | PASS | — |
| 11 | QA, integrasi, hardening | PASS (live scraper) / NOT_VERIFIED (Supabase, Telegram live) | — |
| 12 | Kesiapan GitHub | PASS | — |
| 13 | Kesiapan Termux | PASS (skrip) / NOT_VERIFIED (perangkat) | — |

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

### Fase 3 — Discovery & parser NU Online
- File berubah:
  - `src/scraper/cleaner.js` (HTML → blok teks; buang nav/iklan/script; jaga Arab).
  - `src/scraper/parser.js` (listing, artikel, tanggal Indonesia, canonical).
  - `src/scraper/fetchClient.js` (rate limit, timeout, retry/backoff, 403 stop).
  - `src/scraper/robots.js` (parse + guard cache).
  - `src/scraper/nuonline.js` (discovery + fetch artikel).
  - `src/scraper/sync.js` (orchestrasi + validasi + mode konten + lock).
  - `src/scraper/cli-sync.js` (`npm run sync`).
  - `tests/fixtures/*.html` (SINTETIS), `tests/scraper.test.js`.
  - Tambahan kolom `snippet` di `schema.sql` (untuk mode aman).
- Perintah tes:
  - `npm test` → **68 pass / 0 fail**.
  - Live check (metadata saja, tanpa menyimpan konten) 2026-09-27:
    robots `/khutbah` allowed; **40 artikel** ditemukan; judul/tanggal/deskripsi
    terparse; penanda Khutbah I/II terdeteksi; teks Arab terdeteksi.
- Hasil: fixture parser (termasuk halaman tak lengkap, tanpa penanda, markup
  berubah, duplikat, Arab) lulus; live fetch struktur terverifikasi.
- Catatan: `author` sering null (byline hanya "NU Online") — sesuai ekspektasi.
  Deteksi bahasa (id/jv) belum dilakukan; default `id`.
- Masalah tersisa: konten penuh hanya disimpan bila `FULL_CONTENT_ENABLED=true`.
- Langkah berikut: Fase 4 — fondasi Telegram.

### Fase 4 — Fondasi Telegram
- File: `src/bot/createBot.js`, `src/bot/session.js`, `src/bot/context.js`,
  `src/bot/messages.js`, `src/bot/keyboards/keyboards.js`,
  `src/bot/commands/start.js`, `src/app.js` (composition root), `tests/bot.test.js`.
- Perintah tes: `npm test` → T-CMD-01/02, T-MENU-01 lulus; `bot.handleUpdate`
  dengan klien Telegram di-mock (prototype `callApi`).
- Hasil: `/start`, `/help`, `/menu`, callback ack, sesi, error handler lulus.
- Long polling dijalankan `bot.launch()`; **live token NOT_VERIFIED** (401 tanpa token nyata).
- Langkah berikut: Fase 5.

### Fase 5 — Pencarian & pagination
- File: `src/search/normalize.js`, `src/search/search.js`, `tests/search.test.js`.
- Hasil: sinonim (shalat→salat, rizki→rezeki, ujian→cobaan), query kosong,
  search_logs, pagination stabil, query injection aman — semua PASS.
- Langkah berikut: Fase 6.

### Fase 6 — Pembaca artikel
- File: `src/bot/handlers/article.js`, `src/utils/splitMessage.js` (revisi heading).
- Hasil: header/body/footer, mode aman menautkan sumber, riwayat, metadata
  hilang, pesan panjang dipecah (<4096), Unicode/Arab aman — PASS.
  Escaping tidak relevan karena pesan dikirim sebagai teks biasa (tanpa parse_mode).
- Langkah berikut: Fase 7.

### Fase 7 — PDF
- File: `src/pdf/arabic.js`, `src/pdf/generator.js`, `tests/pdf.test.js`,
  `fonts/NotoNaskhArabic-Regular.ttf` (Noto Naskh Arabic, OFL),
  `fonts/NotoSans-Regular.ttf`, `fonts/Amiri-Regular.ttf`.
- Hasil: shaping + bidi via `arabic-reshaper` + `bidi-js`; PDF A4, nomor halaman,
  nama file aman, cleanup. Diverifikasi dgn `pdftotext` (Indonesia + Arab berharakat)
  dan `pdfinfo` (multi-halaman). **NOT_VERIFIED:** inspeksi visual manual.
- Langkah berikut: Fase 8.

### Fase 8 — Scheduler & sinkronisasi
- File: `src/scheduler/scheduler.js`, `tests/scheduler.test.js`.
- Hasil: ekspresi `0 */6 * * *`, start idempoten, stop, error ditangkap,
  ekspresi invalid ditolak — PASS. Sync lock & idempotensi (Fase 3) PASS.
- Langkah berikut: Fase 9.

### Fase 9 — Favorit & riwayat
- File: `src/bot/handlers/favorite.js`; repositori Fase 2.
- Hasil: simpan + duplikat, isolasi antar pengguna, riwayat 50 terakhir — PASS.
- Langkah berikut: Fase 10.

### Fase 10 — Admin
- File: `src/bot/commands/admin.js`.
- Hasil: user biasa ditolak, admin diizinkan, trigger ganda dibatasi, statistik/
  log tanpa rahasia — PASS.
- Langkah berikut: Fase 11 (QA/hardening).

### Fase 11 — QA, integrasi, hardening
- File: `tests/hardening.test.js` (+ tambahan tes bot).
- Perintah tes:
  - `npm test` → **114 tes, 113 pass, 1 skipped (visual PDF)**.
  - `npm audit` → **0 vulnerabilities**.
  - Scan rahasia pada `git ls-files` → tidak ada rahasia nyata (hanya token
    palsu di `tests/config.test.js` & `tests/logger.test.js`).
  - Live pipeline (mode aman, in-memory, dibatasi 3 artikel) → ditemukan 40,
    disimpan 3, gagal 0.
- Cakupan MVP PRD §38: `/start`, menu, cari, hasil, pagination, pilih artikel,
  tampilkan artikel, pesan panjang, sumber, PDF (mode penuh), terbaru, Supabase
  (mock), scraper, scheduler, error handling — terimplementasi. Favorit,
  riwayat, admin (tahap kedua PRD) juga terimplementasi.
- **NOT_VERIFIED:** Supabase live, Telegram live, kirim PDF ke Telegram, inspeksi
  visual PDF, perangkat Termux.
- Langkah berikut: Fase 12 (kesiapan GitHub).

### Fase 12 — Kesiapan GitHub
- File: `README.md` (diperluas), `CHANGELOG.md`, `docs/RELEASE_CHECKLIST.md`,
  `fonts/README.md`.
- Verifikasi: `.env`/`node_modules`/`tmp`/`*.pdf` tidak terlacak; scan rahasia
  bersih; `npm ci` + `npm test` dari lock berhasil.
- Hasil: repo siap di-`push` secara manual oleh pemilik. **Tidak** ada remote /
  `git push` yang dilakukan agen.
- Langkah berikut: Fase 13 (kesiapan Termux).

### Fase 13 — Kesiapan Termux
- File: `docs/TERMUX.md`, `scripts/setup-termux.sh`,
  `scripts/start-termux.sh`, `scripts/termux-boot.sh`.
- Verifikasi: `bash -n` pada ketiga skrip → sintaks OK.
- Dependency: murni JS (tanpa native build) — `pdfkit`, `telegraf`, `cheerio`,
  `node-cron`, `@supabase/supabase-js`, `arabic-reshaper`, `bidi-js`.
- **NOT_VERIFIED:** uji perangkat Android nyata, auto-start Termux:Boot, dan
  ketahanan proses background (butuh perangkat pemilik).

### Pekerjaan selesai — ringkasan
Seluruh fase 0–13 selesai pada tingkat yang dapat diverifikasi tanpa kredensial.
Pengujian eksternal yang tersisa memerlukan aksi pemilik (lihat
`docs/RELEASE_CHECKLIST.md`).

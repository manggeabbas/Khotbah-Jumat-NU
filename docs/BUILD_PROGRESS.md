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
| 2 | Database Supabase | PASS (mock + live) | `1a0869b` + apply live |
| 3 | Discovery & parser NU Online | PASS (unit + live smoke) | — |
| 4 | Fondasi Telegram | PASS (unit + live smoke) | — |
| 5 | Pencarian & pagination | PASS (unit + E2E live) | — |
| 6 | Pembaca artikel | PASS | — |
| 7 | PDF | PASS (kecuali visual NOT_VERIFIED) | — |
| 8 | Scheduler & sinkronisasi | PASS | — |
| 9 | Favorit & riwayat | PASS (unit + E2E live) | — |
| 10 | Admin | PASS | — |
| 11 | QA, integrasi, hardening | PASS (Supabase + Telegram live) | — |
| 12 | Production packaging | PASS | — |
| 13 | Final production test | PASS (lokal) / NOT_VERIFIED (Termux) | — |

## Keputusan yang menunggu pemilik

1. **Izin konten NU Online.** PRD meminta menampilkan/menyimpan artikel penuh dan
   membuat PDF turunan. Karena konten pihak ketiga, default diimplementasikan
   `FULL_CONTENT_ENABLED=false` (metadata + cuplikan + tautan). Aktifkan `true`
   hanya setelah izin/lisensi dipastikan.
2. **Kredensial Supabase & Telegram** untuk tes integrasi nyata + penerapan migrasi.
3. **Jenis key Supabase** — diselesaikan: memakai model API key terbaru,
   `SUPABASE_SECRET_KEY` (menggantikan `service_role`/`anon`).
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
  - `supabase/migrations/001_initial_schema.sql` (idempoten: 6 tabel, indeks, unique, FK, check, trigger,
    fungsi `search_articles` FTS + fallback, RLS). *Sebelumnya `src/database/schema.sql`, kini dipindah.*
  - `src/database/supabaseStore.js` (backend Supabase, primitive generik).
  - `src/database/memoryStore.js` (backend in-memory untuk tes).
  - `src/database/repositories.js` (articles/users/favorites/history/logs).
  - `src/database/index.js` (pabrik database).
  - `src/database/migrate.js` (CLI: print SQL / `--apply` via koneksi `pg` + DATABASE_URL).
  - `tests/database.test.js`.
- Perintah tes:
  - `npm test` → **44 pass / 0 fail** (termasuk D-ART-01..04, D-USR-01,
    D-FAV-01..02, D-HIS-01..02, D-LOG-01..02, D-SQL-01 statis).
  - `npm run lint` → **18 file OK**.
  - `npm run migrate` → mencetak SQL untuk ditinjau (tanpa menyentuh DB).
- Hasil: migrasi tervalidasi statis; repository mock lulus.
- **NOT_VERIFIED:** penerapan migrasi ke Supabase nyata + CRUD live (I-SB-01)
  — butuh kredensial & persetujuan. Backend Supabase belum diuji jaringan.
- Masalah tersisa: — (keputusan key Supabase diselesaikan dengan
  `SUPABASE_SECRET_KEY`).
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
  - Tambahan kolom `snippet` di skema (untuk mode aman).
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

### Validasi ulang Phase 1 — environment (2026-09-27)
- Variabel wajib: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
  dan `TELEGRAM_USER_ID` (owner/admin, **non-rahasia**, divalidasi numerik).
- `ADMIN_TELEGRAM_ID` **dihapus/dikonsolidasikan** — hanya satu sumber ID admin.
- Ditambahkan `src/loadEnv.js` (dotenv) yang dimuat di entrypoint `index.js`,
  `cli-sync.js`, `migrate.js` — sebelumnya `.env` **tidak pernah dimuat**.
- Ditambahkan `npm run check:env` (`src/checkEnv.js`) yang menampilkan status
  ADA/KOSONG per variabel **tanpa mencetak nilai**.
- Tes: `tests/loadEnv.test.js` (fungsional + statis entrypoint).
- Validasi `loadConfig` hanya menyebut NAMA variabel yang kurang.
- Verifikasi: `npm run check:env` OK; `npm test` 122 pass/1 skipped; lint 50 file OK;
  `.env` terabaikan Git; tidak ada credential hard-coded.
- Catatan: key `ADMIN_TELEGRAM_ID` pada `.env` lokal diganti menjadi
  `TELEGRAM_USER_ID` (nilai dipertahankan, tidak ditampilkan).

### Phase 2 — Supabase Database (2026-09-27)
Status: **PASS** ✅

- Migration kanonik: `supabase/migrations/001_initial_schema.sql`
  (menggantikan `src/database/schema.sql` yang dihapus).
- Audit schema vs PRD: 6 tabel MVP lengkap. Perbaikan:
  - tambah kolom `articles.image_url` dan `articles.last_synced_at`;
  - tambah CHECK (`articles_url_not_blank`, `users_telegram_id_positive`,
    `search_logs_query_len`, `search_logs_result_count_valid`, `sync_logs_counts_valid`);
  - `source` menjadi `not null default 'NU Online'`;
  - RLS aktif di 6 tabel, **policy publik dihapus** (least privilege);
  - FK `on delete cascade` (favorites/history) & `set null` (search_logs) dipertahankan;
  - **GRANT eksplisit** ke `service_role` (project ini tidak memberi DML via
    default privileges — hanya `Dxtm`). `anon`/`authenticated` tanpa privilese.
- Tooling:
  - `src/database/migrate.js` → `npm run migrate` (print) / `--apply` via
    koneksi `pg` + `DATABASE_URL` dalam transaksi + advisory lock.
  - `src/database/verify.js` → `npm run db:verify` (cek tabel, CRUD dummy,
    UNIQUE url/telegram_id/favorit, FK, cleanup) tanpa mencetak rahasia.
  - `pg@8.23.0` ditambahkan sebagai dependency.
- Repositori/scraper: `upsert` menyimpan `image_url` & `last_synced_at`
  (diperbarui walau konten tidak berubah); parser mengambil `og:image`.

#### Hasil penerapan (DATABASE_URL valid)
- `npm run migrate -- --apply` → **exit 0**, `001_initial_schema.sql` diterapkan.
  Dijalankan 3x (termasuk uji idempoten) → konsisten sukses.
- `npm run db:verify` → **22/22 PASS** (tabel, CRUD, UNIQUE `23505`, FK `23503`,
  cleanup).
- Intropeksi DB:
  - 6 tabel: articles, favorites, history, search_logs, sync_logs, users;
  - 18 index (termasuk `articles_url_key`, `users_telegram_id_key`,
    `favorites_user_article_key`, GIN `articles_search_vector_idx`);
  - 19 constraint (PK, FK, UNIQUE, CHECK);
  - RLS aktif di 6 tabel, **0 policy**.
- Data dummy: **0 sisa** (articles/users/search_logs/history/favorites/sync_logs).
- Tidak ada credential tersimpan di database (tidak ada kolom rahasia).
- `npm test` → **127 pass / 0 fail / 1 skipped**; `npm run lint` → 51 file OK.
- Tidak ada perubahan manual (dashboard) yang menjadi dependency.

### Phase 3 — NU Online Scraper (2026-09-27)
Status: **PASS** ✅

- Arsitektur: listing → discovery URL → article scraper → normalizer → validator →
  dedup/upsert → `articles`. Semua hanya dari `https://islam.nu.or.id/khutbah/`.
- Perubahan (tanpa mengubah schema DB):
  - `src/scraper/parser.js`: host guard `isAllowedArticleUrl` (hanya domain
    NU Online), `parseListing` mengekstrak `category`, `imageUrl`, `dateText`,
    canonical hanya diterima bila masih di domain NU Online.
  - `src/scraper/sync.js`: validasi fatal URL (tidak valid/kosong → tidak
    disimpan), metadata discovery dipakai sebagai fallback, error per-artikel
    dicatat ke `sync_logs.error_message`.
  - `scripts/smoke-scraper.js` + `npm run smoke:scraper` (smoke test terbatas).
- Normalizer/cleaner: buang nav/iklan/script/komentar/related/footer, jaga
  paragraf/heading/Arab; simpan teks (bukan HTML mentah).
- Batas crawling dihormati: `SCRAPER_MAX_LISTING_PAGES`, `SCRAPER_MAX_ARTICLES`,
  `SCRAPER_REQUEST_DELAY_MS`, `SCRAPER_TIMEOUT_MS`, `SCRAPER_MAX_RETRIES`;
  request sekuensial (tanpa concurrency berlebih).
- Unit test: **138 tes (137 pass, 1 skipped)**; mencakup listing, URL discovery,
  canonical, judul, tanggal, kategori, excerpt, isi khutbah, pembersihan HTML,
  Unicode/Arab, artikel invalid, duplicate URL, timeout, retry, rate limit.
  Fixture HTML lokal (sintetis) untuk reproducibility.
- Live smoke test (`npm run smoke:scraper`, 1 halaman + 2 artikel):
  **10/10 PASS** — robots diizinkan, listing 40 item, 2 artikel di-parse valid,
  upsert + dedup + select, cleanup. Setelah smoke: `articles=0`, `sync_logs=0`
  (tidak ada sisa; tidak ada artikel production yang dihapus).
- Tidak ada secret bocor; tidak ada full crawl; tidak ada perubahan schema.

Acceptance Criteria Phase 3: listing ✓, parser ✓, canonical ✓, content ✓,
Unicode/Arab ✓, dedup ✓, retry/timeout ✓, delay ✓, batas crawl ✓, error tercatat ✓,
unit test ✓, live smoke ✓, tanpa secret bocor ✓, schema tak diubah ✓,
tanpa full crawl ✓.

### Phase 4 — Telegram Bot Foundation (2026-09-27)
Status: **PASS** ✅

- Arsitektur: Telegram → Telegraf (long polling) → command/handler → database
  service (dipakai bersama) → Supabase. Handler terpisah dari entrypoint di
  `src/bot/` (`commands/`, `handlers/`, `keyboards/`).
- Command: `/start`, `/help`, `/menu`, **`/latest`**, `/search`, `/admin`,
  `/tentang`. `/search` sudah berfungsi (di atas placeholder Phase 4), dijelaskan
  di laporan.
- Perubahan:
  - `src/bot/createBot.js`: tambah command `/latest`, pesan error
    `TELEGRAM_BOT_TOKEN`, penanganan 401/409 pada `launch`, unknown command
    diarahkan ke handler aman.
  - `src/bot/commands/start.js`: handler `unknown`.
  - `src/bot/messages.js`: `unknownCommandText`, `/latest` di bantuan.
  - `scripts/smoke-telegram.js` + `npm run smoke:telegram`.
- Akses: fitur publik terbuka untuk semua user; `TELEGRAM_USER_ID` hanya gerbang
  fungsi admin (owner melihat menu Admin, user biasa tidak).
- `/latest` membaca dari Supabase (koneksi dipakai bersama, bukan per-handler)
  dan **tidak** menjalankan scraper.
- Error handling: `bot.catch`, handler error, error database, plus
  `unhandledRejection`/`uncaughtException` di entrypoint; semua log melewati
  logger ber-redaksi.
- Unit test: **145 tes (144 pass, 1 skipped)**. Termasuk command parsing,
  /start, /help, /latest, /search, unknown command, callback query, error
  handling, owner/admin detection, redaksi rahasia.
- Live Telegram smoke test (`npm run smoke:telegram`) → **11/11 PASS**:
  getMe (`@khotbahjumatbot`), tidak ada webhook, long polling start+stop,
  handler /start,/help,/latest,/search,unknown,callback, owner detection.
  Info: kirim pesan ke owner dilewati (`Bad Request: chat not found`) karena
  owner belum pernah `/start` ke bot — bukan masalah kode.
- Security: token/secret dari environment, tanpa hard-code; `.env` ignored;
  tidak ada webhook dibuat (deleteWebhook + url kosong); tidak membuka port
  publik. Smoke test berhenti sendiri (tidak produksi permanen).

### Phase 5 — Search + Pagination (2026-09-27)
Status: **PASS** ✅ — Search memakai database (RPC FTS `search_articles`, dengan
fallback term tunggal), normalization sinonim, ranking (judul>deskripsi/tag>isi),
pagination 8/halaman, inline keyboard + callback next/prev. Tidak ada scraping
saat search. Unit test: normal/no-result/multi/pagination/Arabic/Unicode/query
kosong/panjang/injection. **E2E live (Supabase)**: search total 3, pagination
2+halaman 1, Arabic total 1, tanpa hasil → PASS.

### Phase 6 — Article Viewer (2026-09-27)
Status: **PASS** ✅ — Baca dari DB (tanpa scraping ulang); tampil judul, tanggal,
kategori, isi, sumber, URL. `splitLongMessage` menjaga paragraf/heading/Unicode/
Arab. Keyboard: **⬅️ Kembali**, **📄 Ekspor PDF**, **⭐ Favorit** (+ Khutbah Lain,
Cari Tema Baru, Menu Utama). Tombol Kembali → kembali ke hasil pencarian atau
menu. Artikel tidak ditemukan / konten kosong → pesan aman, tidak crash.

### Phase 7 — PDF Generator (2026-09-27)
Status: **PASS** ✅ — A4, font Noto Naskh Arabic (Latin+Arab+harakat), header
(judul, penulis, tanggal, **kategori**), KHUTBAH I/II, sumber + URL, nomor
halaman. Nama file aman. Alur file sementara → kirim → cleanup. Diuji:
Indonesia, Arab berharakat (`pdftotext`), multi-halaman, judul panjang, kategori,
artikel kosong, kegagalan, cleanup. Visual manual = NOT_VERIFIED.

### Phase 8 — Scheduler + Synchronization (2026-09-27)
Status: **PASS** ✅ — `node-cron` `0 */6 * * *` (configurable), timeout, retry/
backoff, rate limit, lock anti-sync-ganda, `sync_logs`, statistik, graceful
shutdown. Kegagalan scraper tidak menghentikan search/viewer/PDF.

### Phase 9 — Favorites + History (2026-09-27)
Status: **PASS** ✅ — Favorit tambah/duplikat/hapus/daftar + pagination, isolasi
per user; riwayat 50 terakhir. E2E live: tambah, tidak duplikat, daftar, hapus,
riwayat → PASS. Tombol artikel berubah ke "🗑️ Hapus Favorit" bila sudah favorit.

### Phase 10 — Admin Features (2026-09-27)
Status: **PASS** ✅ — Command admin: `/status`, `/stat`, `/sync`, `/admin`
(allowlist `TELEGRAM_USER_ID`). Status bot/DB, jumlah artikel, status scraper,
sync terakhir, sync manual (dengan lock). User biasa ditolak aman.

### Phase 11 — Full Testing + Hardening (2026-09-27)
Status: **PASS** ✅ — `npm test` 157 tes (156 pass, 1 skipped visual); `lint` 55
file OK. Live: `db:verify` 22/22, `smoke:scraper` 10/10, `smoke:e2e` 16/16,
`smoke:telegram` 11/11. Audit keamanan: tanpa secret hard-code, `.env` ignored,
tanpa webhook/server publik. Resilensi: timeout/retry/backoff, offline source,
DB error, malformed callback, input ekstrem.

### Phase 12 — Production Packaging (2026-09-27)
Status: **PASS** ✅ — `README.md` final (semua topik), `docs/TERMUX_DEPLOYMENT.md`
(16 bagian), `docs/TERMUX.md`, `CHANGELOG.md`. `.env.example` tanpa nilai.
`package.json` scripts: start/dev/test/lint/sync/migrate/db:verify/check:env/
smoke:scraper/smoke:telegram/smoke:e2e.

### Phase 13 — Final Production Test (2026-09-27)
Status: **PASS (lokal)** ✅ / Termux perangkat **NOT_VERIFIED**:
- Fresh install: `rm -rf node_modules && npm ci` → OK, 0 vulnerabilities.
- `npm run check:env` OK; `db:verify` 22/22; `npm test` 156 pass; `lint` OK.
- Semua smoke live PASS; DB bersih setelah tiap smoke.
- Hanya butuh `npm install` + `npm start` (setelah `.env`). Tidak ada dependency
  tersembunyi di luar `package.json`.

#### GitHub
- `gh` CLI **tidak tersedia** → berhenti di tahap **commit lokal** (belum push).
  Perlu URL repository GitHub dari pemilik untuk `git remote add` + `git push`.

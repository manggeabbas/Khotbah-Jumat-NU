# Changelog

Format mengikuti Keep a Changelog; versi mengikuti Semantic Versioning.

## [Unreleased] — Migrasi database Supabase → SQLite

### Added
- Database layer SQLite lokal (`src/database/sqliteStore.js`,
  `src/database/schema.sql`) memakai driver bawaan Node.js `node:sqlite`
  (tanpa native build → ramah Termux).
- `npm run db:init` (inisialisasi idempoten) dan `npm run db:verify`
  (verifikasi tabel/constraint/FK/indeks/CRUD) untuk SQLite.
- `npm run sync:full` — indeks penuh seluruh halaman listing NU Online
  (~1.900 artikel), resumable (melewati artikel yang sudah tersimpan).
- `SQLITE_DB_PATH` (default `data/khutbah.db`).
- Dokumentasi migrasi `docs/MIGRATION_SUPABASE_TO_SQLITE.md`; skema PostgreSQL
  historis diarsipkan di `docs/historical/`.

### Changed
- Database runtime beralih dari Supabase PostgreSQL ke **SQLite lokal**.
- Status admin menampilkan `SQLite OK`.
- Node.js minimal `>= 22.5` (karena `node:sqlite`).
- `.gitignore` menambahkan `data/`, `backup/`, dan `*.db*`.
- Pencarian memakai SQLite (pembobotan judul/deskripsi/kategori/cuplikan/isi).

### Removed
- Dependency `@supabase/supabase-js` dan `pg`.
- Variabel runtime `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`.
- `src/database/supabaseStore.js` dan `src/database/migrate.js`.

## [Unreleased]

### Added
- Fondasi project ESM: `config`, `logger` (redaksi rahasia), utilitas
  (`splitMessage`, `escape`, `slug`, `sanitizePdfFilename`).
- Skema database Supabase idempoten (6 tabel, indeks, FTS `search_articles`,
  RLS) + repository dengan backend Supabase & in-memory + CLI migrasi.
- Migration reproducible: `supabase/migrations/001_initial_schema.sql`.
- Tooling database: `npm run migrate` (print/apply via `DATABASE_URL`) dan
  `npm run db:verify` (verifikasi tabel + CRUD + constraint + cleanup).
- Kolom `articles.image_url` dan `articles.last_synced_at`.
- Scraper Phase 3: host guard (hanya NU Online), discovery mengekstrak
  kategori/gambar/tanggal, validasi URL fatal, error per-artikel ke `sync_logs`,
  dan `npm run smoke:scraper` (live smoke test terbatas + cleanup).
- Telegram Phase 4: command `/latest`, respons aman untuk perintah tak dikenal,
  pesan error 401/409 yang jelas, dan `npm run smoke:telegram` (live smoke test
  long polling + handler, lalu berhenti).
- Phases 5–10: keyboard viewer (Kembali/PDF/Favorit), hapus favorit, admin
  command `/status` `/stat` `/sync`, kategori di PDF, dan `npm run smoke:e2e`
  (E2E Supabase: search FTS, pagination, viewer, favorit, history, PDF).
- Production: `docs/TERMUX_DEPLOYMENT.md` + README final.
- Scraper NU Online: discovery, parser, cleaner, fetch client sopan
  (rate limit/retry/robots), sinkronisasi + mode konten aman/penuh.
- Bot Telegram (Telegraf, long polling): `/start`, `/menu`, `/search`, `/help`,
  `/admin`, menu, pencarian + pagination, pembaca artikel, pesan panjang,
  favorit, riwayat, admin (statistik/sync/log).
- PDF A4 dengan shaping + bidi Arab (`arabic-reshaper` + `bidi-js`,
  font Noto Naskh Arabic).
- Scheduler `node-cron` (default 6 jam).
- Dokumentasi: `ARCHITECTURE`, `BUILD_PROGRESS`, `TEST_MATRIX`, `TERMUX`,
  `RELEASE_CHECKLIST`; skrip Termux.
- 114 tes otomatis.

### Changed
- Konfigurasi Supabase mengikuti model API key terbaru: `SUPABASE_SECRET_KEY`
  menggantikan `SUPABASE_SERVICE_ROLE_KEY` dan `SUPABASE_ANON_KEY`.
- Nama variabel token Telegram menjadi `TELEGRAM_BOT_TOKEN` (alias lama
  `BOT_TOKEN` masih diterima demi kompatibilitas).
- ID owner/admin memakai `TELEGRAM_USER_ID` (non-rahasia, numerik) sebagai
  satu-satunya sumber; `ADMIN_TELEGRAM_ID` dihapus (dikonsolidasikan).
- `.env` kini benar-benar dimuat lewat `src/loadEnv.js` (dotenv) pada entrypoint.
- Schema dipindah dari `src/database/schema.sql` ke `supabase/migrations/` dan
  policy publik artikel dihapus (RLS tanpa policy = least privilege).

### Fixed
- Migration menambahkan GRANT eksplisit ke `service_role` (project yang tidak
  memberi DML otomatis via default privileges). `anon`/`authenticated` tanpa
  privilese.
- `sync_logs` ditulis dengan nama kolom yang benar (`articles_*`), memperbaiki
  `PGRST204` saat menyelesaikan sinkronisasi.
- Pengiriman dokumen PDF memakai `fetch` native (mengatasi `socket hang up`
  multipart pada Node 26).
- **Rendering Arab PDF**: font static **Amiri** (Latin+Arab) + opsi
  `features: []` pada `doc.text()` agar `pdfkit` memakai `fontkit.layoutRun`
  untuk seluruh string (fontkit menangani shaping **dan arah RTL**). Tanpa
  `features`, PDFKit memecah teks per-spasi dan menyusun kata LTR (Arab terbaca
  terbalik). `arabic-reshaper`/`bidi-js` tidak dipakai lagi.
- **Cleaner**: membuang blok artikel terkait **"Baca Juga"/"Lihat Semua"** dari
  konten.
- **PDF halaman ganda**: footer nomor halaman ditulis di area margin bawah dan
  memicu PDFKit menambah halaman baru (konten 5 halaman jadi 10, 5 kosong).
  Diperbaiki dengan `margins.bottom = 0` sementara + `lineBreak: false`.

### Security
- Mode aman default (`FULL_CONTENT_ENABLED=false`): hanya metadata + cuplikan +
  tautan sumber.
- `.env` diabaikan Git; rahasia disamarkan pada log.

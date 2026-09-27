# Changelog

Format mengikuti Keep a Changelog; versi mengikuti Semantic Versioning.

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

### Security
- Mode aman default (`FULL_CONTENT_ENABLED=false`): hanya metadata + cuplikan +
  tautan sumber.
- `.env` diabaikan Git; rahasia disamarkan pada log.

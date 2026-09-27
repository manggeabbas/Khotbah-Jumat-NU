# Changelog

Format mengikuti Keep a Changelog; versi mengikuti Semantic Versioning.

## [Unreleased]

### Added
- Fondasi project ESM: `config`, `logger` (redaksi rahasia), utilitas
  (`splitMessage`, `escape`, `slug`, `sanitizePdfFilename`).
- Skema database Supabase idempoten (6 tabel, indeks, FTS `search_articles`,
  RLS) + repository dengan backend Supabase & in-memory + CLI migrasi.
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

### Security
- Mode aman default (`FULL_CONTENT_ENABLED=false`): hanya metadata + cuplikan +
  tautan sumber.
- `.env` diabaikan Git; rahasia disamarkan pada log.

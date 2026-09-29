# Migrasi Database: Supabase → SQLite

Dokumen ini mencatat perpindahan backend database Bot Khutbah Jumat dari
**Supabase PostgreSQL** ke **SQLite lokal**.

Status: **selesai** — runtime tidak lagi membutuhkan Supabase.

## Ringkasan

| Aspek | Sebelum | Sesudah |
|---|---|---|
| Database | Supabase PostgreSQL (cloud) | SQLite lokal `data/khutbah.db` |
| Driver | `@supabase/supabase-js` (Data API) + `pg` (DDL) | `node:sqlite` (bawaan Node.js) |
| Pencarian | PostgreSQL FTS (`search_articles`, `tsvector`) | Query SQLite berbobot (LIKE ter-escape) |
| Migrasi | `supabase/migrations/001_initial_schema.sql` + `DATABASE_URL` | `src/database/schema.sql` + `npm run db:init` |
| Environment | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL` | `SQLITE_DB_PATH` (opsional) |
| Biaya/layanan | Akun Supabase + koneksi internet | Tanpa layanan eksternal |

## Arsitektur baru

```
Telegram ⇄ Telegraf (Long Polling) ⇄ Node.js ⇄ SQLite (data/khutbah.db)
                                        │
NU Online → Scraper → SQLite             │
Scheduler → Scraper → SQLite             │
SQLite articles.content → PDF → Telegram │
```

## Lapisan database

```
src/database/
├── index.js          # pabrik: memilih backend (SQLite / store injeksi)
├── sqliteStore.js    # primitive store di atas node:sqlite
├── schema.sql        # schema kanonik (idempoten)
├── init.js           # npx/CLI: buat DB + terapkan schema (npm run db:init)
├── verify.js         # verifikasi constraint + CRUD (npm run db:verify)
├── repositories.js   # repository domain (articles/users/favorites/history/...)
└── memoryStore.js    # backend in-memory untuk tes
```

Handler Telegram → Service → Repository → Store (SQLite). Tidak ada SQL mentah
yang tersebar di handler.

## Kompatibilitas struktur data

Schema SQLite mempertahankan tabel, kolom, dan relasi Supabase:

- `articles` (termasuk `image_url`, `content_hash`, `status`, `last_synced_at`),
- `users` (UNIQUE `telegram_id`),
- `favorites`, `history` (FK ke `articles`/`users`, `ON DELETE CASCADE`),
- `search_logs`, `sync_logs`,
- CHECK `status`/count, UNIQUE `articles.url`, dan indeks yang relevan.

Perbedaan tipe: `timestamptz` → `TEXT` ISO-8601 (UTC), `bigint identity` →
`INTEGER PRIMARY KEY AUTOINCREMENT`. Aplikasi tetap memakai string ISO dari
`new Date().toISOString()`.

## Driver: mengapa `node:sqlite`

- Bawaan Node.js (>= 22.5, stabil di >= 24) — **tanpa native module**.
- `npm install` tidak memicu kompilasi → aman di **Android + Termux**.
- Tidak ada server database, port, atau proses tambahan.

## Inisialisasi & verifikasi

```bash
npm run db:init      # buat data/khutbah.db + seluruh tabel/indeks (idempoten)
npm run db:verify    # tabel, FK, UNIQUE, CHECK, indeks, CRUD, buka/tutup
```

Database juga dibuat otomatis saat boot bila belum ada.

## Data lama (Supabase)

Data production lama **tidak dihapus** dan **tidak** menjadi dependency runtime.
Skema PostgreSQL historis diarsipkan di
[`docs/historical/supabase-001_initial_schema.sql`](historical/supabase-001_initial_schema.sql)
sebagai referensi. Bila perlu menyalin data lama, lakukan ekspor satu kali dari
Supabase lalu impor ke SQLite (mis. lewat skrip ad-hoc `INSERT`), di luar
runtime bot.

## Cara kembali (rollback)

Branch `master` pada commit `fa8f1e3` masih berisi implementasi Supabase.
Snapshot sebelum migrasi berada di branch `migration/supabase-to-sqlite`
(commit `chore(migration): snapshot ...`). Database SQLite tidak pernah
menghapus data Supabase.

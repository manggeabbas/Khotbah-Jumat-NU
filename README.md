# Bot Khutbah Jumat (Telegram)

Bot Telegram untuk **mencari, membaca, dan mengekspor (PDF)** materi khutbah
Jumat dari **NU Online**. Dibangun dengan Node.js (ESM), database **SQLite
lokal**, dan **Telegram Long Polling** — tanpa VPS, webhook, domain, server
publik, atau layanan database cloud. Development di Linux, production di
**Android + Termux**.

> Migrasi: sebelumnya project memakai **Supabase PostgreSQL**. Sejak migrasi ini
> database berjalan **lokal di SQLite** (`data/khutbah.db`) dan **tidak lagi
> membutuhkan Supabase** (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`,
> `@supabase/supabase-js`). Lihat
> [`docs/MIGRATION_SUPABASE_TO_SQLITE.md`](docs/MIGRATION_SUPABASE_TO_SQLITE.md).

> 📖 **Baru di sini?** Baca panduan lengkap: [`TUTORIAL.md`](TUTORIAL.md).

---

## Tujuan

Memudahkan pengguna menemukan materi khutbah Jumat berdasarkan tema, tanpa
mencari manual di website, dengan selalu mencantumkan sumber asli (NU Online).

## Fitur

- `/start`, `/help`, `/menu`, `/latest`, `/search`, `/tentang`.
- Pencarian tema dengan **normalisasi sinonim** (`shalat→salat`, `rizki→rezeki`,
  `ujian→cobaan`), **pencarian SQLite** (judul/deskripsi/kategori/cuplikan/isi),
  ranking, dan **pagination**.
- Pembaca artikel (metadata, isi, sumber, URL asli) + **pemecahan pesan panjang**.
- **Khutbah terbaru** (urut `published_at`).
- **Favorit** (tambah/hapus/daftar) dan **Riwayat** (50 terakhir per pengguna).
- **PDF** A4 (Unicode + Arab + harakat) — opsional via `FULL_CONTENT_ENABLED`.
- **Scraper** NU Online terjadwal (default 6 jam) + sinkronisasi manual.
- **Admin** (`/status`, `/stat`, `/sync`, `/admin`) untuk owner.
- Error handling, retry/backoff, robots.txt, rate limit.

## Architecture

```
Telegram  ⇄  Telegraf (Long Polling)  ⇄  Node.js  ⇄  SQLite (data/khutbah.db)
                                             │
NU Online → Scraper → SQLite articles        │
Scheduler → Scraper → SQLite                 │
SQLite articles.content → PDF → Telegram      │
```

- Node.js menjalankan: bot, scraper, scheduler, search, PDF, logika aplikasi.
- SQLite lokal (driver bawaan `node:sqlite`) — tanpa server database.
- **Long polling** (bukan webhook). Tidak ada server publik / Edge Function handler.

Struktur: lihat [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Requirements

- Node.js **>= 22.5** (dikembangkan pada v26; `node:sqlite` tersedia sejak
  v22.5 dan stabil di v24+)
- Telegram Bot token (@BotFather)
- Tidak perlu akun/layanan database eksternal.

## Installation (Linux)

```bash
git clone <URL_REPOSITORY> khutbah-bot
cd khutbah-bot
npm ci
cp .env.example .env
# isi .env (TELEGRAM_BOT_TOKEN, TELEGRAM_USER_ID)
npm run db:init   # buat data/khutbah.db + tabel/indeks
npm test          # jalankan tes
npm start         # jalankan bot
```

## Environment variables

| Variabel | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ya | Token bot (rahasia) |
| `TELEGRAM_USER_ID` | ya | ID Telegram owner/admin (non-rahasia, numerik) |
| `SQLITE_DB_PATH` | tidak | Path database (default `data/khutbah.db`) |
| `FULL_CONTENT_ENABLED` | tidak | `false` default (mode aman) |
| `SCRAPE_INTERVAL_HOURS`, `MAX_SEARCH_RESULTS`, `MAX_HISTORY`, `SCRAPER_*` | tidak | Tuning |

Validasi tanpa menampilkan nilai: `npm run check:env`.
`.env` **tidak** masuk Git; `.env.example` hanya berisi nama variabel.
`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, dan `DATABASE_URL` **tidak lagi
digunakan** (diabaikan bila masih ada di `.env`).

## Database (SQLite)

Schema kanonik: `src/database/schema.sql` (idempoten; 6 tabel, indeks, UNIQUE,
FK, CHECK). Tabel: `articles`, `users`, `favorites`, `history`, `search_logs`,
`sync_logs`.

```bash
npm run db:init      # buat/menyiapkan database (aman dijalankan berulang)
npm run db:verify    # verifikasi tabel + constraint + CRUD + FK
```

Database dibuat otomatis saat boot bila belum ada (idempoten). File database
berada di `data/khutbah.db` (masuk `.gitignore` — **jangan** di-commit).

### Backup & restore

```bash
mkdir -p backup
cp data/khutbah.db backup/khutbah-$(date +%F).db   # backup
cp backup/khutbah-2026-09-29.db data/khutbah.db     # restore
```

Hentikan bot sebelum menyalin/memulihkan agar konsisten. Untuk backup aman saat
bot berjalan, gunakan `sqlite3 data/khutbah.db ".backup backup/khutbah.db"`
(bila `sqlite3` tersedia).

## Scraper

```bash
npm run sync               # sinkronisasi manual (halaman terbaru saja, cepat)
npm run sync:full          # indeks penuh: seluruh halaman listing + semua artikel
npm run sync:full -- --max=300   # batasi jumlah artikel (uji coba)
npm run sync:full -- --refresh   # paksa ambil ulang walau sudah tersimpan
npm run smoke:scraper      # live smoke terbatas (1 halaman, 2 artikel) + cleanup
```

Alur: listing → discovery URL → article scraper → normalizer → validator →
dedup/upsert → `articles`. Hanya dari `islam.nu.or.id/khutbah/`, dengan robots,
rate limit, timeout, retry terbatas, dan batas crawling.

### Mengisi database dari nol (indeks penuh)

Setelah migrasi, database SQLite dimulai kosong. Untuk memuat **seluruh** daftar
khutbah dari website (saat ini ~1.900 artikel, ~127 halaman listing), jalankan:

```bash
npm run sync:full
```

`sync:full` sengaja melewati batas `SCRAPER_MAX_LISTING_PAGES`/`SCRAPER_MAX_ARTICLES`
(maks 500 halaman, tanpa batas artikel) dan **aman diulang**: artikel yang sudah
tersimpan dan tidak berubah akan dilewati (`--refresh` untuk memaksa ambil ulang).
Sinkronisasi terjadwal (`npm run sync`) tetap dibatasi ke halaman terbaru agar
hemat — halaman listing selalu urut terbaru, sehingga artikel baru tetap terjaring.

## Telegram & search

- Search membaca **database** (bukan scraping saat user mencari).
- `/search` → ketik tema → hasil + inline keyboard (nomor, next/prev).
- Menekan nomor membuka **Article Viewer** (data dari DB).
- `FULL_CONTENT_ENABLED=true` → viewer memakai `articles.content` penuh;
  `false` → cuplikan + tautan.

## PDF

PDF dibuat dari data DB (tanpa scraping ulang): A4, font Noto Naskh Arabic
(Latin + Arab + harakat). Alur: article → generate → file sementara → Telegram
`sendDocument` → cleanup. Hanya aktif bila `FULL_CONTENT_ENABLED=true` dan izin
penggunaan konten sudah dipastikan.

## Scheduler

`node-cron`, default `0 */6 * * *` (config `SCRAPE_INTERVAL_HOURS`). Mencegah
sinkronisasi ganda (lock). Kegagalan tercatat di `sync_logs`; fitur pencarian/
baca/PDF tetap berjalan dari data tersimpan.

## Favorites & History

- Favorit unik per `(user, article)`; bisa tambah/hapus/daftar; terisolasi per user.
- Riwayat dibatasi 50 terakhir per user.

## Admin

Owner (`TELEGRAM_USER_ID`) dapat mengakses `/status`, `/stat`, `/sync`, `/admin`.
`/status` menampilkan **`SQLite OK`** (atau `GAGAL`) untuk status database. User
biasa ditolak dengan aman. Tidak ada credential yang ditampilkan.

## Development

```bash
npm run dev       # node --watch
npm test          # node:test
npm run lint      # pemeriksaan sintaks portabel
npm run check:env # validasi environment (tanpa nilai)
```

Smoke test (butuh kredensial): `npm run smoke:telegram`, `smoke:scraper`, `smoke:e2e`.

## Production

```bash
npm ci --omit=dev
npm run db:init
npm start
```

## Termux

Lihat [`docs/TERMUX_DEPLOYMENT.md`](docs/TERMUX_DEPLOYMENT.md). Ringkas:

```bash
pkg install -y nodejs git
git clone <URL_REPOSITORY> ~/Projects/Khotbah-Jumat && cd ~/Projects/Khotbah-Jumat
bash scripts/setup-termux.sh
nano .env
npm run db:init
npm run db:verify
bash scripts/start-termux.sh
```

`node:sqlite` adalah modul bawaan Node.js, sehingga **tidak ada native module
yang perlu dikompilasi** di Termux.

## Troubleshooting

| Gejala | Penanganan |
|---|---|
| `Konfigurasi belum lengkap` | isi `.env`; `npm run check:env` |
| `401: Unauthorized` | `TELEGRAM_BOT_TOKEN` salah |
| Log `409` | token dipakai instance lain — hentikan yang lain |
| Database error | cek `SQLITE_DB_PATH`; jalankan `npm run db:init` & `npm run db:verify` |
| NU Online down | sync dilewati; bot tetap jalan |
| PDF tidak muncul | `FULL_CONTENT_ENABLED` masih `false` |

## Security

- Rahasia hanya dari environment; tidak ada token/secret hard-coded.
- `.env` diabaikan Git; `.env.example` tanpa nilai.
- Tidak ada credential Supabase (sudah tidak dipakai).
- Long polling; **tidak** membuat webhook; tidak membuka port publik.
- Database lokal hanya diakses proses bot (tidak ada API publik).

## Lisensi

Kode: MIT (`package.json`). Font Noto Naskh Arabic: OFL-1.1 (`fonts/README.md`).
Konten khutbah milik **NU Online**.
# Khotbah-Jumat-NU
# Khotbah-Jumat-NU

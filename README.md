# Bot Khutbah Jumat (Telegram)

Bot Telegram untuk **mencari, membaca, dan mengekspor (PDF)** materi khutbah
Jumat dari **NU Online**. Dibangun dengan Node.js (ESM), database **Supabase
PostgreSQL**, dan **Telegram Long Polling** — tanpa VPS, webhook, domain, atau
server publik. Development di Linux, production di **Android + Termux**.

---

## Tujuan

Memudahkan pengguna menemukan materi khutbah Jumat berdasarkan tema, tanpa
mencari manual di website, dengan selalu mencantumkan sumber asli (NU Online).

## Fitur

- `/start`, `/help`, `/menu`, `/latest`, `/search`, `/tentang`.
- Pencarian tema dengan **normalisasi sinonim** (`shalat→salat`, `rizki→rezeki`,
  `ujian→cobaan`), **PostgreSQL Full-Text Search**, ranking, dan **pagination**.
- Pembaca artikel (metadata, isi, sumber, URL asli) + **pemecahan pesan panjang**.
- **Khutbah terbaru** (urut `published_at`).
- **Favorit** (tambah/hapus/daftar) dan **Riwayat** (50 terakhir per pengguna).
- **PDF** A4 (Unicode + Arab + harakat) — opsional via `FULL_CONTENT_ENABLED`.
- **Scraper** NU Online terjadwal (default 6 jam) + sinkronisasi manual.
- **Admin** (`/status`, `/stat`, `/sync`, `/admin`) untuk owner.
- Error handling, retry/backoff, robot.txt, rate limit.

## Architecture

```
Telegram  ⇄  Telegraf (Long Polling)  ⇄  Node.js  ⇄  Supabase PostgreSQL
                                             │
NU Online → Scraper → Supabase articles      │
Scheduler → Scraper → Supabase               │
```

- Node.js menjalankan: bot, scraper, scheduler, search, PDF, logika aplikasi.
- Supabase: PostgreSQL + Data API + penyimpanan.
- **Long polling** (bukan webhook). Tidak ada server publik / Edge Function handler.

Struktur: lihat [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Requirements

- Node.js **>= 20** (dikembangkan pada v26)
- Telegram Bot token (@BotFather)
- Proyek Supabase (PostgreSQL)

## Installation (Linux)

```bash
git clone <URL_REPOSITORY> khutbah-bot
cd khutbah-bot
npm ci
cp .env.example .env
# isi .env
npm test          # jalankan tes
npm start         # jalankan bot
```

## Environment variables

| Variabel | Wajib | Keterangan |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ya | Token bot (rahasia) |
| `TELEGRAM_USER_ID` | ya | ID Telegram owner/admin (non-rahasia, numerik) |
| `SUPABASE_URL` | ya | URL proyek Supabase |
| `SUPABASE_SECRET_KEY` | ya | Secret key Supabase (rahasia server) |
| `DATABASE_URL` | untuk migrasi | Connection string Postgres (DDL) |
| `FULL_CONTENT_ENABLED` | tidak | `false` default (mode aman) |
| `SCRAPE_INTERVAL_HOURS`, `MAX_SEARCH_RESULTS`, `MAX_HISTORY`, `SCRAPER_*` | tidak | Tuning |

Validasi tanpa menampilkan nilai: `npm run check:env`.
`.env` **tidak** masuk Git; `.env.example` hanya berisi nama variabel.

## Supabase & migrasi

Schema kanonik: `supabase/migrations/001_initial_schema.sql` (idempoten; 6 tabel,
indeks, UNIQUE, FK, CHECK, RLS tanpa policy publik).

```bash
npm run migrate            # cetak migration (tinjau)
npm run migrate -- --apply # terapkan (butuh DATABASE_URL)
npm run db:verify          # verifikasi tabel + CRUD + constraint
```

> `SUPABASE_SECRET_KEY` adalah kunci Data API (PostgREST) dan **tidak** bisa
> menjalankan DDL — migrasi butuh `DATABASE_URL`.

## Scraper

```bash
npm run sync               # sinkronisasi manual (NU Online)
npm run smoke:scraper      # live smoke terbatas (1 halaman, 2 artikel) + cleanup
```

Alur: listing → discovery URL → article scraper → normalizer → validator →
dedup/upsert → `articles`. Hanya dari `islam.nu.or.id/khutbah/`, dengan robots,
rate limit, timeout, retry terbatas, dan batas crawling.

## Telegram & search

- Search membaca **database** (bukan scraping saat user mencari).
- `/search` → ketik tema → hasil + inline keyboard (nomor, next/prev).
- Menekan nomor membuka **Article Viewer** (data dari DB).

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
User biasa ditolak dengan aman. Tidak ada credential yang ditampilkan.

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
npm start
```

## Termux

Lihat [`docs/TERMUX_DEPLOYMENT.md`](docs/TERMUX_DEPLOYMENT.md). Ringkas:

```bash
pkg install -y nodejs git
git clone <URL_REPOSITORY> ~/Projects/Khotbah-Jumat && cd ~/Projects/Khotbah-Jumat
bash scripts/setup-termux.sh
nano .env
npm run db:verify
bash scripts/start-termux.sh
```

## Troubleshooting

| Gejala | Penanganan |
|---|---|
| `Konfigurasi belum lengkap` | isi `.env`; `npm run check:env` |
| `401: Unauthorized` | `TELEGRAM_BOT_TOKEN` salah |
| Log `409` | token dipakai instance lain — hentikan yang lain |
| Supabase gagal | cek kredensial; data tersimpan tetap bisa dibaca |
| NU Online down | sync dilewati; bot tetap jalan |
| PDF tidak muncul | `FULL_CONTENT_ENABLED` masih `false` |

## Security

- Rahasia hanya dari environment; tidak ada token/secret hard-coded.
- `.env` diabaikan Git; `.env.example` tanpa nilai.
- Long polling; **tidak** membuat webhook; tidak membuka port publik.
- RLS aktif; hanya `service_role` (Secret key) punya akses DML.

## Lisensi

Kode: MIT (`package.json`). Font Noto Naskh Arabic: OFL-1.1 (`fonts/README.md`).
Konten khutbah milik **NU Online**.

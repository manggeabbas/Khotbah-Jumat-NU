# Bot Khutbah Jumat (Telegram)

Bot Telegram untuk mencari, membaca, dan (opsional) mengekspor materi khutbah
Jumat dari **NU Online**. Dibangun dengan Node.js (ESM), database **Supabase
PostgreSQL**, dan **long polling** — tanpa VPS, webhook, atau server publik.
Development di Linux, production di **Android + Termux**.

> **Status:** seluruh fase implementasi selesai (0–13). Lihat
> [`docs/BUILD_PROGRESS.md`](docs/BUILD_PROGRESS.md) untuk status &
> [`docs/TEST_MATRIX.md`](docs/TEST_MATRIX.md) untuk hasil pengujian. Beberapa
> pengujian eksternal (Supabase live, Telegram live, perangkat Termux) berstatus
> **NOT_VERIFIED** karena membutuhkan kredensial/perangkat pemilik.

---

## Kepatuhan penggunaan konten

Artikel NU Online adalah karya pihak ketiga. Secara default bot berjalan dalam
**mode aman** (`FULL_CONTENT_ENABLED=false`):

- hanya menyimpan **metadata** + **cuplikan pendek** + tautan artikel asli;
- menampilkan cuplikan dan tombol/tautan ke sumber asli;
- **tidak** membuat PDF turunan.

Untuk menyimpan/menampilkan isi penuh dan membuat PDF, set
`FULL_CONTENT_ENABLED=true` **hanya setelah izin/lisensi penggunaan dipastikan**.
Crawler bersikap sopan: memeriksa `robots.txt`, rate limit, User-Agent jelas,
timeout, dan retry terbatas. Bot tidak mengakali paywall/CAPTCHA/blokir.

---

## Fitur

- `/start`, `/menu`, `/help`, `/search`, `/admin`, menu inline.
- Pencarian tema dengan normalisasi sinonim (`shalat→salat`, `rizki→rezeki`,
  `ujian→cobaan`) dan pagination (≤ 8 hasil/halaman).
- Pembaca artikel (mode aman = cuplikan + tautan; mode penuh = naskah lengkap),
  pemecahan pesan panjang (`splitLongMessage`).
- Khutbah terbaru (urut `published_at`).
- Favorit & riwayat (50 terakhir per pengguna).
- Ekspor PDF A4 (mode penuh) dengan dukungan teks Arab + harakat.
- Admin: statistik, sinkronisasi manual, artikel terbaru, pengguna, log.
- Scheduler sinkronisasi otomatis (default tiap 6 jam).

---

## Persyaratan

- Node.js **>= 20** (dikembangkan dengan v26)
- Telegram Bot token (dari @BotFather)
- Proyek Supabase (PostgreSQL)
- (Termux) `pkg install nodejs git`

---

## Instalasi (Linux)

```bash
git clone <URL_REPOSITORY> khutbah-bot
cd khutbah-bot
npm ci
cp .env.example .env
# edit .env: BOT_TOKEN, SUPABASE_URL, kunci, ADMIN_TELEGRAM_ID
npm test          # jalankan tes
npm start         # jalankan bot
```

### Migrasi Supabase

```bash
npm run migrate            # cetak SQL (tinjau dulu)
npm run migrate -- --apply # terapkan (butuh DATABASE_URL + psql)
```

Cara termudah: buka **Supabase → SQL Editor**, tempel isi
`src/database/schema.sql`, lalu Run. Skema bersifat idempoten.

### Sinkronisasi manual

```bash
npm run sync
```

---

## Konfigurasi `.env`

Lihat `.env.example`. Ringkas:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `BOT_TOKEN` | ya | Token bot Telegram (rahasia) |
| `SUPABASE_URL` | ya | URL proyek Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ya* | Kunci server tepercaya (rahasia) |
| `SUPABASE_ANON_KEY` | alternatif | Dipakai bila service-role tidak ada |
| `ADMIN_TELEGRAM_ID` | ya | Telegram ID admin (pisah koma) |
| `FULL_CONTENT_ENABLED` | tidak | `false` default (mode aman) |
| `SNIPPET_MAX_LENGTH` | tidak | Panjang cuplikan mode aman (default 400) |
| `MAX_SEARCH_RESULTS` | tidak | Default 8 |
| `MAX_HISTORY` | tidak | Default 50 |
| `SCRAPE_INTERVAL_HOURS` | tidak | Default 6 |
| `SCRAPER_*` | tidak | UA, delay, timeout, retry, batas artikel/halaman |

**Jangan pernah** meng-commit `.env`. Hanya `.env.example` yang masuk Git.

---

## Menjalankan

| Perintah | Fungsi |
|---|---|
| `npm start` | jalankan bot (long polling) + scheduler |
| `npm run dev` | jalankan dengan `--watch` |
| `npm test` | tes otomatis (`node:test`) |
| `npm run lint` | pemeriksaan sintaks portabel |
| `npm run sync` | sinkronisasi manual NU Online |
| `npm run migrate` | cetak/terapkan migrasi DB |

Log awal yang diharapkan:

```text
[BOOT] Starting Khutbah Bot...
[DATABASE] Connected
[TELEGRAM] Bot started
[SCHEDULER] Started
```

---

## Deploy Termux

Lihat [`docs/TERMUX.md`](docs/TERMUX.md). Ringkas:

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git
git clone <URL_REPOSITORY> ~/khutbah-bot && cd ~/khutbah-bot
bash scripts/setup-termux.sh
nano .env
npm run migrate          # terapkan via Supabase SQL Editor
bash scripts/start-termux.sh
```

Skrip: `scripts/setup-termux.sh`, `scripts/start-termux.sh`,
`scripts/termux-boot.sh` (contoh Termux:Boot).

---

## Troubleshooting

| Gejala | Penanganan |
|---|---|
| `Konfigurasi belum lengkap` | isi `.env` (lihat `.env.example`) |
| `401: Unauthorized` saat start | `BOT_TOKEN` salah/placeholder |
| Bot tidak merespons, log 409 | ada instance lain dengan token sama — hentikan dulu |
| Supabase gagal (mode offline) | pencarian artikel lama tetap jalan; perbaiki kunci/URL |
| NU Online tidak diakses | sync dilewati; artikel tersimpan tetap bisa dibaca |
| PDF tidak muncul | `FULL_CONTENT_ENABLED` masih `false` (mode aman) |
| Riwayat kosong | baru dibuka artikelnya; riwayat per pengguna |

---

## Struktur project

```
src/
├── index.js          # entrypoint (efek samping: boot, polling, cron)
├── app.js            # composition root
├── config.js, logger.js
├── bot/              # commands/, handlers/, keyboards/, session
├── scraper/          # nuonline, parser, cleaner, fetchClient, robots, sync
├── search/           # normalize, search
├── database/         # client, schema.sql, repositories, stores, migrate
├── pdf/              # generator, arabic
└── scheduler/
fonts/                # NotoNaskhArabic-Regular.ttf (OFL)
docs/                 # ARCHITECTURE, BUILD_PROGRESS, TEST_MATRIX, TERMUX
scripts/              # skrip Termux
tests/                # tes (node:test) + fixture sintetis
```

---

## Lisensi

Kode project: MIT (lihat `package.json`). Font Noto Naskh Arabic: OFL-1.1
(lihat `fonts/README.md`). Konten khutbah tetap milik **NU Online**.

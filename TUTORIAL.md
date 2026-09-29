# 📖 Tutorial & Penjelasan Lengkap — Bot Khutbah Jumat

Dokumen ini menjelaskan **cara kerja, cara pasang, cara pakai, dan cara rawat**
Bot Khutbah Jumat secara lengkap. Cocok untuk pengguna baru maupun yang ingin
memahami isi kode.

> **Status database:** bot memakai **SQLite lokal** (`data/khutbah.db`) di dalam
> perangkat sendiri. **Tidak** memerlukan Supabase, PostgreSQL, VPS, webhook,
> domain, atau server publik.

---

## Daftar Isi

1. [Apa itu bot ini](#1-apa-itu-bot-ini)
2. [Fitur](#2-fitur)
3. [Arsitektur & alur data](#3-arsitektur--alur-data)
4. [Struktur proyek](#4-struktur-proyek)
5. [Persyaratan](#5-persyaratan)
6. [Instalasi di Linux](#6-instalasi-di-linux)
7. [Konfigurasi (.env)](#7-konfigurasi-env)
8. [Database SQLite](#8-database-sqlite)
9. [Mengisi database (sync)](#9-mengisi-database-sync)
10. [Menjalankan bot](#10-menjalankan-bot)
11. [Tutorial penggunaan bot](#11-tutorial-penggunaan-bot)
12. [Pencarian: cara kerja](#12-pencarian-cara-kerja)
13. [Article viewer & full content](#13-article-viewer--full-content)
14. [PDF](#14-pdf)
15. [Favorit & riwayat](#15-favorit--riwayat)
16. [Admin](#16-admin)
17. [Scheduler](#17-scheduler)
18. [Deploy di Termux (Android)](#18-deploy-di-termux-android)
19. [Backup & restore](#19-backup--restore)
20. [Keamanan](#20-keamanan)
21. [Pengujian & smoke test](#21-pengujian--smoke-test)
22. [Troubleshooting](#22-troubleshooting)
23. [FAQ](#23-faq)
24. [Ringkasan perintah npm](#24-ringkasan-perintah-npm)
25. [Skema database](#25-skema-database)
26. [Lisensi & atribusi](#26-lisensi--atribusi)

---

## 1. Apa itu bot ini

Bot Telegram untuk **mencari, membaca, dan mengekspor (PDF)** materi khutbah
Jumat dari **NU Online** (`https://islam.nu.or.id/khutbah/`).

Sumber materi tetap NU Online dan bot **tidak mengubah substansi** materi.
Setiap artikel selalu mencantumkan sumber dan tautan aslinya.

Konsep kunci:

- **Telegram Long Polling** (bukan webhook) → tidak butuh domain/port publik.
- **SQLite lokal** → tidak butuh layanan database eksternal.
- **Scraper terjadwal** (default tiap 6 jam) mengisi database dari NU Online.
- **Pencarian** membaca database lokal, bukan melakukan scraping saat dicari.

---

## 2. Fitur

| Fitur | Keterangan |
|---|---|
| `/start`, `/menu`, `/help`, `/tentang` | Menu & bantuan |
| `/latest` | Khutbah terbaru (urut tanggal terbit) |
| `/search` | Cari tema dengan pagination |
| Normalisasi sinonim | `shalat→salat`, `rizki→rezeki`, `ujian→cobaan`, dll. |
| Article Viewer | Judul, penulis, tanggal, isi, sumber, URL |
| Pemecahan pesan panjang | Tanpa memotong kata/heading/Arab |
| Full content | Naskah lengkap bila `FULL_CONTENT_ENABLED=true` |
| PDF A4 | Unicode + Arab + harakat, dikirim ke Telegram |
| Favorit | Simpan/hapus/daftar, terisolasi per pengguna |
| Riwayat | 50 terakhir per pengguna |
| Scraper NU Online | robots.txt, rate limit, retry, timeout |
| Scheduler | `node-cron`, default 6 jam |
| Admin | `/status`, `/stat`, `/sync`, menu admin |
| Error handling | Pesan ramah, retry, log terstruktur |
| Keamanan | Rahasia hanya dari `.env`, redaksi log |

---

## 3. Arsitektur & alur data

```
                Telegram
                    ⇅
        Telegraf + Long Polling
                    ⇅
                 Node.js
                    ⇅
     SQLite  (data/khutbah.db)
        │
        ├── Scraper NU Online ──► SQLite
        ├── Scheduler ─────────► Scraper ──► SQLite
        └── articles.content ──► PDF ──► Telegram
```

Alur detail:

```
Scraper : NU Online listing → discovery URL → fetch → parser → cleaner
          → validasi → upsert (insert/update by URL + content_hash) → sync_logs

Bot     : User pesan → Telegraf middleware → session → handler
          → search (query SQLite) → inline keyboard
          → article viewer (split pesan) → aksi (PDF/favorit/riwayat)

PDF     : artikel (SQLite) → pdfkit A4 → file sementara → Telegram sendDocument → hapus
```

Lapisan kode (handler tidak menulis SQL langsung):

```
Telegram handler  →  Service (search/sync/pdf)  →  Repository  →  Store SQLite
```

---

## 4. Struktur proyek

```
Khotbah-Jumat/
├── src/
│   ├── index.js              # entrypoint (baca env, boot, shutdown)
│   ├── app.js                # composition root (rakit komponen)
│   ├── config.js             # baca + validasi environment
│   ├── loadEnv.js            # pemuat .env
│   ├── checkEnv.js           # `npm run check:env`
│   ├── logger.js             # log terstruktur + redaksi rahasia
│   ├── bot/
│   │   ├── createBot.js      # pabrik bot (long polling)
│   │   ├── commands/         # /start /search /admin
│   │   ├── handlers/         # article, favorite, pdf
│   │   ├── keyboards/        # tombol inline
│   │   ├── messages.js       # teks pesan
│   │   ├── session.js        # state per pengguna (in-memory)
│   │   └── upload.js         # kirim dokumen via fetch
│   ├── search/               # normalisasi + service pencarian
│   ├── scraper/              # fetchClient, robots, parser, cleaner, sync
│   ├── database/
│   │   ├── index.js          # pabrik database
│   │   ├── sqliteStore.js    # store di atas node:sqlite
│   │   ├── schema.sql        # skema kanonik (idempoten)
│   │   ├── init.js           # `npm run db:init`
│   │   ├── verify.js         # `npm run db:verify`
│   │   ├── repositories.js   # repository domain
│   │   └── memoryStore.js    # backend in-memory untuk tes
│   ├── pdf/                  # generator PDF + helper Arab
│   ├── scheduler/            # node-cron
│   └── utils/                # splitMessage, teks, error
├── scripts/                  # sync-full, smoke test, termux, lint
├── tests/                    # tes otomatis (node:test)
├── docs/                     # dokumentasi
├── fonts/                    # Amiri-Regular.ttf
├── data/                     # database lokal (JANGAN di-commit)
├── tmp/                      # file sementara (JANGAN di-commit)
├── .env.example              # contoh konfigurasi
└── package.json
```

---

## 5. Persyaratan

- **Node.js >= 22.5** (dikembangkan pada v26). Driver `node:sqlite` tersedia
  sejak v22.5 dan stabil di v24+. Cek: `node --version`.
- **Telegram Bot Token** dari [@BotFather](https://t.me/BotFather).
- **ID Telegram Anda** (owner/admin) — bisa didapat dari bot seperti
  [@userinfobot](https://t.me/userinfobot).
- **Tidak perlu** akun database, VPS, domain, atau server.

---

## 6. Instalasi di Linux

```bash
git clone <URL_REPOSITORY> Khotbah-Jumat
cd Khotbah-Jumat

npm ci                 # atau: npm install
cp .env.example .env   # lalu isi .env (lihat bagian 7)

npm run db:init        # buat data/khutbah.db + tabel/indeks
npm run check:env      # cek variabel wajib (tanpa menampilkan nilai)

npm run sync:full      # muat seluruh daftar khutbah (~1.900 artikel, lihat bagian 9)
npm start              # jalankan bot
```

> `npm run db:init` dan pembuatan database juga otomatis terjadi saat boot bila
> file database belum ada.

---

## 7. Konfigurasi (.env)

Salin `.env.example` menjadi `.env`, lalu isi. **Jangan commit `.env`.**

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Token dari @BotFather (**rahasia**) |
| `TELEGRAM_USER_ID` | ✅ | — | ID Telegram owner/admin (angka; boleh `111,222`) |
| `SQLITE_DB_PATH` | — | `data/khutbah.db` | Lokasi file database |
| `MAX_SEARCH_RESULTS` | — | `8` | Hasil per halaman |
| `MAX_HISTORY` | — | `50` | Riwayat maksimum per pengguna |
| `SCRAPE_INTERVAL_HOURS` | — | `6` | Interval sinkronisasi terjadwal (jam) |
| `FULL_CONTENT_ENABLED` | — | `false` | `true` = simpan/tampilkan naskah penuh + PDF |
| `SNIPPET_MAX_LENGTH` | — | `400` | Panjang cuplikan mode aman |
| `SCRAPER_USER_AGENT` | — | `KhutbahJumatBot/0.1 ...` | User-Agent scraper |
| `SCRAPER_REQUEST_DELAY_MS` | — | `1500` | Jeda antar permintaan (ms) |
| `SCRAPER_TIMEOUT_MS` | — | `20000` | Timeout permintaan (ms) |
| `SCRAPER_MAX_RETRIES` | — | `3` | Retry per permintaan |
| `SCRAPER_MAX_ARTICLES` | — | `50` | Maks artikel per siklus (`0` = tanpa batas) |
| `SCRAPER_MAX_LISTING_PAGES` | — | `3` | Halaman listing per sinkronisasi |
| `LOG_LEVEL` | — | `info` | `debug`/`info`/`warn`/`error`/`silent` |

Contoh `.env` minimal:

```env
TELEGRAM_BOT_TOKEN=123456789:AA...
TELEGRAM_USER_ID=123456789
FULL_CONTENT_ENABLED=true
```

> Catatan: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, dan `DATABASE_URL` **tidak
> lagi dipakai**. Bila masih ada di `.env` lama, akan diabaikan dengan aman.

---

## 8. Database SQLite

### 8.1 Membuat database

```bash
npm run db:init
```

Perintah ini:

1. membuat folder `data/` bila belum ada,
2. membuat `data/khutbah.db`,
3. membuat semua tabel + indeks + constraint,
4. **aman dijalankan berulang kali** (idempoten).

### 8.2 Verifikasi

```bash
npm run db:verify
```

Memeriksa: keterbukaan database, keberadaan tabel, `PRAGMA foreign_keys` aktif,
UNIQUE, CHECK, indeks, CRUD semua tabel, lalu menutup dan membuka ulang
database. Data dummy dibersihkan otomatis.

### 8.3 Mode WAL

Database memakai `journal_mode = WAL` dan `busy_timeout = 5000 ms`, sehingga
pembacaan (bot) dan penulisan (sync) bisa berjalan bersamaan dengan aman.

### 8.4 File terkait

SQLite bisa menghasilkan berkas pendamping `data/khutbah.db-wal` dan
`data/khutbah.db-shm`. Semuanya sudah masuk `.gitignore`.

### 8.5 Melihat isi database (opsional)

```bash
# bila sqlite3 tersedia:
sqlite3 data/khutbah.db "select count(*) from articles;"
sqlite3 data/khutbah.db "select id, title, published_at from articles order by published_at desc limit 5;"
```

---

## 9. Mengisi database (sync)

Database baru **kosong**. Ada dua mode sinkronisasi:

| Perintah | Cakupan | Kegunaan |
|---|---|---|
| `npm run sync` | Halaman terbaru (sesuai `SCRAPER_MAX_LISTING_PAGES`) | Menjaga kesegaran artikel baru |
| `npm run sync:full` | **Seluruh** halaman listing + semua artikel | Mengisi database dari nol |

### 9.1 Indeks penuh (pertama kali)

```bash
npm run sync:full
```

- Memindai hingga 500 halaman listing (website saat ini ~127 halaman,
  ~1.900 artikel).
- Mengambil semua artikel dan menyimpannya ke SQLite.
- **Resumable**: artikel yang sudah tersimpan dan tidak berubah dilewati, jadi
  aman diulang bila terputus.
- Opsi:

```bash
npm run sync:full -- --max=300     # batasi jumlah artikel (uji coba)
npm run sync:full -- --pages=10    # batasi jumlah halaman listing
npm run sync:full -- --delay=800   # jeda antar permintaan (ms)
npm run sync:full -- --refresh     # paksa ambil ulang walau sudah tersimpan
```

> Perkiraan waktu indeks penuh dengan `--delay=1500`: sekitar **45–70 menit**
> (hormat pada situs sumber). Bisa ditingkatkan kecepatannya dengan `--delay`
> yang lebih kecil, namun tetap sopan.

### 9.2 Sinkronisasi rutin

```bash
npm run sync
```

Dibatasi `SCRAPER_MAX_LISTING_PAGES` (default 3) dan `SCRAPER_MAX_ARTICLES`
(default 50). Karena listing NU Online selalu **urut terbaru**, halaman awal
selalu memuat artikel baru — cukup untuk menjaga database tetap segar tanpa
crawl besar berulang.

### 9.3 Etika scraper

- Memeriksa `robots.txt` sebelum mengambil.
- Jeda antar permintaan (default 1500 ms) + timeout + retry terbatas.
- User-Agent jelas dan bisa dikonfigurasi.
- Duplikat dicegah: `UNIQUE(url)` + pembanding `content_hash`.

---

## 10. Menjalankan bot

```bash
npm start        # produksi
npm run dev      # development (auto-restart saat file berubah)
```

Log awal yang diharapkan:

```text
[BOOT] Starting Khutbah Bot...
[DB:INIT] Siap: /.../data/khutbah.db
[DATABASE] Memakai backend SQLite
[DATABASE] Connected {"backend":"sqlite"}
[TELEGRAM] Bot started
[SCHEDULER] Started
```

Hentikan dengan `Ctrl+C` (graceful shutdown: scheduler → polling → database).

---

## 11. Tutorial penggunaan bot

### 11.1 Memulai

1. Buka bot di Telegram, kirim `/start`.
2. Muncul menu:

```
🔎 Cari Khutbah     🆕 Khutbah Terbaru
🔖 Favorit          📚 Riwayat
ℹ️ Tentang Bot
⚙️ Admin            (hanya owner)
```

### 11.2 Mencari khutbah

1. Tekan **🔎 Cari Khutbah** (atau `/search`).
2. Ketik tema, misalnya: `sabar`, `kematian`, `rezeki`, `shalat`.
3. Bot menampilkan hasil (8 per halaman) + tombol nomor.
4. Gunakan **➡️ Halaman Berikutnya** / **⬅️ Halaman Sebelumnya**.
5. Tekan nomor untuk membuka artikel.

> Anda juga bisa langsung mengetik tema tanpa `/search` setelah menekan menu
> cari. Ketikan minimal 2 karakter.

### 11.3 Membaca artikel

Article Viewer menampilkan:

```
🕌 KHUTBAH JUMAT
Judul: ...
✍️ Penulis: ...
📅 Tanggal: ...
━━━━━━━━━━━━━━━━━━
<isi atau cuplikan>
━━━━━━━━━━━━━━━━━━
📚 Sumber: NU Online
🔗 Artikel asli: https://islam.nu.or.id/...
```

Bila naskah panjang, otomatis dipecah menjadi beberapa pesan (dengan penanda
bagian) tanpa memotong kata, heading, atau teks Arab.

Tombol aksi: **⬅️ Kembali**, **📄 Ekspor PDF** (bila full content aktif),
**⭐ Favorit** / **🗑️ Hapus Favorit**, **🔄 Khutbah Lain**, **🔎 Cari Tema Baru**,
**🏠 Menu Utama**.

### 11.4 Khutbah terbaru

`/latest` atau tombol **🆕 Khutbah Terbaru** — daftar artikel terbaru
(urut tanggal terbit) dengan pagination.

### 11.5 Favorit

- Simpan: pada artikel, tekan **⭐ Favorit**.
- Hapus: tekan **🗑️ Hapus Favorit**.
- Daftar: menu **🔖 Favorit**.
- Anti-duplikat dan **terisolasi per pengguna** (favorit Anda tidak terlihat
  pengguna lain).

### 11.6 Riwayat

Menu **📚 Riwayat** menampilkan 50 artikel terakhir yang Anda buka (otomatis
dipotong agar tidak menumpuk).

### 11.7 Ekspor PDF

Pada artikel, tekan **📄 Ekspor PDF** (hanya muncul bila
`FULL_CONTENT_ENABLED=true` **dan** artikel memiliki naskah lengkap). Bot
mengirim dokumen PDF ke chat, lalu menghapus file sementara.

---

## 12. Pencarian: cara kerja

1. **Normalisasi**: query dibersihkan (huruf kecil, tanda baca) dan kata < 2
   huruf dibuang.
2. **Perluasan sinonim** (bukan penggantian, agar recall tinggi):

   | Ditulis | Dicari juga |
   |---|---|
   | shalat / sholat / solat | salat |
   | rizki / rizqi | rezeki |
   | ujian / musibah / bencana | cobaan |
   | akhlaq | akhlak |
   | jum'at | jumat |
   | shadaqah / sadaqah | sedekah |
   | shaum | puasa |

3. **Pembobotan** (judul paling berpengaruh):
   - `title` = 4
   - `description` = 2
   - `category` = 2
   - `snippet` = 1
   - `content` = 1
4. **Filter**: hanya artikel `status = 'active'`.
5. **Urutan**: skor tertinggi, lalu `published_at` terbaru.
6. **Pagination**: stabil (tie-breaker `id`), `hasMore` ditandai tombol.
7. **Log**: setiap query dicatat di `search_logs` (untuk statistik admin).

Pencarian menggunakan parameter terikat (aman dari injeksi) dan mendukung
Unicode/Arab serta query panjang (dipangkas aman).

> **Catatan:** normalisasi hanya diterapkan pada **query** pengguna, tidak
> pernah pada isi artikel. Teks sumber tidak diubah.

---

## 13. Article viewer & full content

- `FULL_CONTENT_ENABLED=false` (default, mode aman):
  menampilkan **metadata + cuplikan pendek + tautan** ke NU Online.
- `FULL_CONTENT_ENABLED=true`:
  menyimpan dan menampilkan **naskah lengkap** dari `articles.content`, serta
  mengaktifkan tombol **Ekspor PDF**.

Saat sync dengan mode penuh, `content`, `khutbah_1`, dan `khutbah_2` diisi
(partisi Khutbah I/II hanya bila penanda benar-benar ada di halaman).

> **Penting:** viewer **tidak** melakukan scraping ulang. Semua isi berasal dari
> SQLite. Mengaktifkan `FULL_CONTENT_ENABLED=true` berarti Anda menyimpan naskah
> pihak ketiga — pastikan Anda memiliki izin/justifikasi penggunaan.

---

## 14. PDF

- Ukuran **A4**, margin nyaman, footer nomor halaman.
- Font **Amiri-Regular.ttf** (Latin + Arab + harakat) yang didesain untuk
  rendering Arab yang benar (shaping + arah RTL ditangani pdfkit/fontkit).
- Sumber data: `articles.content` / `khutbah_1` / `khutbah_2` dari SQLite.
- Alur: generate ke `tmp/` → kirim via Telegram `sendDocument` → hapus file
  (juga saat gagal).

PDF hanya tersedia bila `FULL_CONTENT_ENABLED=true`.

---

## 15. Favorit & riwayat

- Tabel `favorites`: UNIQUE `(user_id, article_id)`, FK ke `users` & `articles`
  dengan `ON DELETE CASCADE`.
- Tabel `history`: satu baris per pembukaan; otomatis dipangkas ke
  `MAX_HISTORY` (default 50) per pengguna.
- `search_logs`: mencatat query + jumlah hasil.

Semua operasi terisolasi per pengguna Telegram.

---

## 16. Admin

Owner (sesuai `TELEGRAM_USER_ID`) mendapatkan tombol **⚙️ Admin** dan perintah:

| Perintah | Tombol admin | Fungsi |
|---|---|---|
| `/status` | 📊 Status | Status bot + **`SQLite OK`** + jumlah artikel + status scraper |
| `/stat` | 📈 Statistik | Users, Articles, Favorites, History, Searches, sync terakhir |
| `/sync` | 🔄 Sinkronisasi Sekarang | Menjalankan sinkronisasi manual |
| `/admin` | ⚙️ Admin | Membuka menu admin |
| — | 📰 Artikel Terbaru | 5 artikel terbaru |
| — | 👥 Pengguna | 5 pengguna terakhir |
| — | 📋 Log Sinkronisasi | 5 log terakhir |
| — | 📋 Error Log | 5 error terakhir |

Pengguna biasa yang mencoba perintah admin akan ditolak dengan aman.

---

## 17. Scheduler

- Library `node-cron`.
- Ekspresi default: `0 */6 * * *` (tiap 6 jam, zona `Asia/Jakarta`), diatur via
  `SCRAPE_INTERVAL_HOURS`.
- Mencegah sinkronisasi ganda dalam satu proses (lock).
- Kegagalan dicatat di `sync_logs`; fitur baca/cari/PDF tetap jalan dari data
  yang sudah tersimpan.

---

## 18. Deploy di Termux (Android)

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git

git clone <URL_REPOSITORY> ~/Khotbah-Jumat
cd ~/Khotbah-Jumat
npm ci --omit=dev
cp .env.example .env
nano .env                    # isi TELEGRAM_BOT_TOKEN & TELEGRAM_USER_ID

npm run db:init
npm run db:verify
npm run sync:full            # lakukan sekali untuk mengisi seluruh daftar
npm start
```

Agar tetap hidup:

```bash
termux-wake-lock            # cegah perangkat tidur (dipanggil scripts/start-termux.sh)
```

Auto-start setelah reboot: pasang **Termux:Boot**, salin `scripts/termux-boot.sh`
ke `~/.termux/boot/`, sesuaikan `REPO_DIR`.

> **Catatan kompatibilitas:** `node:sqlite` adalah modul **bawaan** Node.js,
> sehingga `npm install` tidak memicu kompilasi native — sangat ramah Termux.
> Uji di perangkat nyata tetap disarankan (`docs/TERMUX_DEPLOYMENT.md`).

Verifikasi perangkat Android secara nyata berstatus **NOT_VERIFIED** sampai
Anda menjalankannya di perangkat.

---

## 19. Backup & restore

File database: `data/khutbah.db` (plus `-wal`/`-shm`).

**Backup (bot sebaiknya dihentikan sebentar):**

```bash
mkdir -p backup
cp data/khutbah.db backup/khutbah-$(date +%F).db
```

**Restore:**

```bash
# hentikan bot dulu (Ctrl+C), lalu:
cp backup/khutbah-2026-09-29.db data/khutbah.db
```

**Backup aman saat bot berjalan** (bila `sqlite3` tersedia):

```bash
sqlite3 data/khutbah.db ".backup 'backup/khutbah-$(date +%F).db'"
```

`data/` dan `backup/` sudah masuk `.gitignore` — **jangan** commit database
production maupun `.env`.

---

## 20. Keamanan

- Token & konfigurasi hanya dari `.env`; tidak ada rahasia hard-coded.
- `.env` masuk `.gitignore`; `.env.example` hanya berisi nama variabel.
- Logger menyamarkan token/`sb_secret`/JWT secara otomatis.
- Long polling (tanpa webhook, tanpa port publik).
- Hanya owner (`TELEGRAM_USER_ID`) yang bisa mengakses fitur admin.
- Query database memakai parameter terikat.
- Database lokal hanya diakses proses bot (tidak ada API publik).

---

## 21. Pengujian & smoke test

```bash
npm test                 # tes otomatis (node:test)
npm run lint             # pemeriksaan sintaks
npm run check:env        # validasi environment tanpa menampilkan nilai
npm run db:init          # inisialisasi database (idempoten)
npm run db:verify        # verifikasi tabel + constraint + CRUD

# butuh kredensial & jaringan (opsional, terbatas):
npm run smoke:telegram   # getMe + long polling + handler, lalu berhenti
npm run smoke:scraper    # 1 halaman listing + 2 artikel + cleanup
npm run smoke:e2e        # search/pagination/viewer/favorit/history/PDF (SQLite)
```

---

## 22. Troubleshooting

| Gejala | Penyebab umum | Penanganan |
|---|---|---|
| `Konfigurasi belum lengkap` | `.env` belum diisi | isi token & ID; `npm run check:env` |
| Bot tidak merespons | token salah / proses mati | cek log; pastikan `npm start` jalan |
| Log `401: Unauthorized` | `TELEGRAM_BOT_TOKEN` salah | perbaiki token dari @BotFather |
| Log `409` | token dipakai instance lain | hentikan instance lain |
| Hanya sedikit artikel muncul | database belum diisi | `npm run sync:full` |
| `Tidak ada materi yang cocok` | kata kunci tidak ada | coba sinonim/tema lain |
| PDF tidak muncul | full content nonaktif | set `FULL_CONTENT_ENABLED=true` + sync ulang |
| Database error / file tidak ada | path salah | cek `SQLITE_DB_PATH`; `npm run db:init` |
| `database is locked` | akses tulis bersamaan | tunggu; `busy_timeout` sudah aktif |
| NU Online down | sumber offline | sync dilewati, data tersimpan tetap bisa dibaca |
| Font PDF Arab kacau | font tidak ditemukan | pastikan `fonts/Amiri-Regular.ttf` ada |
| Proses mati saat layar kunci (Termux) | manajemen daya Android | `termux-wake-lock` + battery unrestricted + Termux:Boot |

---

## 23. FAQ

**T: Apakah bot butuh internet terus-menerus?**
J: Hanya saat sinkronisasi/scraping. Membaca artikel, favorit, riwayat, dan PDF
semuanya dari database lokal.

**T: Apakah bot butuh Supabase/VPS/domain?**
J: Tidak. Cukup Node.js + kredensial Telegram, dijalankan di perangkat Anda.

**T: Di mana data disimpan?**
J: Di file SQLite lokal `data/khutbah.db`. Database production tidak di-commit.

**T: Bagaimana menambah artikel dari tema tertentu?**
J: Tambahkan halaman/artikel via sync. Bot hanya menyimpan apa yang ada di
halaman `/khutbah` NU Online.

**T: Kenapa hanya artikel tertentu yang punya PDF?**
J: PDF butuh `FULL_CONTENT_ENABLED=true` **dan** artikel dengan `content`
tersimpan (artikel lama hasil mode aman hanya punya cuplikan). Lakukan sync
ulang dengan mode penuh.

**T: Apakah aman menjalankan `sync:full` berkali-kali?**
J: Ya — idempoten/resumable. Artikel yang tidak berubah dilewati.

**T: Bagaimana menambah admin lain?**
J: Isi `TELEGRAM_USER_ID=111,222,333`.

---

## 24. Ringkasan perintah npm

| Perintah | Fungsi |
|---|---|
| `npm start` | Jalankan bot (produksi) |
| `npm run dev` | Jalankan dengan auto-restart |
| `npm test` | Tes otomatis |
| `npm run lint` | Pemeriksaan sintaks |
| `npm run check:env` | Validasi environment |
| `npm run db:init` | Buat/siapkan database SQLite (idempoten) |
| `npm run db:verify` | Verifikasi database |
| `npm run sync` | Sinkronisasi rutin (halaman terbaru) |
| `npm run sync:full` | Indeks penuh (semua artikel, resumable) |
| `npm run smoke:telegram` | Smoke test Telegram |
| `npm run smoke:scraper` | Smoke test scraper terbatas |
| `npm run smoke:e2e` | Smoke test end-to-end (SQLite) |

---

## 25. Skema database

Semua tabel memakai `INTEGER PRIMARY KEY AUTOINCREMENT` dan waktu ISO-8601
(TEXT, UTC). File: `src/database/schema.sql`.

### `articles`

`id`, `title`, `slug`, `url` (UNIQUE), `author`, `published_at`, `language`,
`description`, `snippet`, `category`, `content`, `khutbah_1`, `khutbah_2`,
`image_url`, `source`, `content_hash`, `status`
(`active`/`parse_failed`/`archived`), `last_synced_at`, `created_at`,
`updated_at`.

Indeks: `url` (unique), `published_at`, `status`, `content_hash`.

### `users`

`id`, `telegram_id` (UNIQUE, > 0), `username`, `first_name`, `last_name`,
`created_at`, `last_active_at`.

### `favorites`

`id`, `user_id` → `users(id)` CASCADE, `article_id` → `articles(id)` CASCADE,
`created_at`. UNIQUE `(user_id, article_id)`.

### `history`

`id`, `user_id` → `users(id)` CASCADE, `article_id` → `articles(id)` CASCADE,
`opened_at`. Indeks `(user_id, opened_at)`.

### `search_logs`

`id`, `user_id` → `users(id)` SET NULL, `query` (≤ 500), `result_count` (≥ 0),
`created_at`.

### `sync_logs`

`id`, `started_at`, `finished_at`, `articles_found`, `articles_inserted`,
`articles_updated`, `articles_failed`, `status`
(`running`/`success`/`partial`/`failed`), `error_message`.

> `PRAGMA foreign_keys = ON` aktif, sehingga integritas relasi terjaga.

---

## 26. Lisensi & atribusi

- Kode: **MIT** (lihat `package.json`).
- Font Amiri: lisensi **OFL-1.1** (lihat `fonts/README.md`).
- Konten khutbah adalah milik **NU Online**. Bot hanya membantu penemuan,
  pembacaan, dan ekspor untuk keperluan pribadi; selalu cantumkan sumber asli.

---

*Dokumen ini bagian dari repositori Bot Khutbah Jumat. Lihat juga:*
[`README.md`](README.md) ·
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
[`docs/TERMUX_DEPLOYMENT.md`](docs/TERMUX_DEPLOYMENT.md) ·
[`docs/MIGRATION_SUPABASE_TO_SQLITE.md`](docs/MIGRATION_SUPABASE_TO_SQLITE.md)

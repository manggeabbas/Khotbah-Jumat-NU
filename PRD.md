# PRD — Bot Khutbah Jumat Telegram

**Versi:** 1.1  
**Platform:** Android + Termux  
**Runtime:** Node.js  
**Interface:** Telegram Bot  
**Database:** Supabase PostgreSQL  
**Sumber konten:** NU Online — https://islam.nu.or.id/khutbah/

---

## Development dan Production Environment

### Development

Pengembangan dan pengujian awal dilakukan di komputer developer. Seluruh fitur wajib diuji di komputer sebelum deployment ke Android.

- OS: Linux/desktop developer environment
- Runtime: Node.js
- Repository: Git lokal
- Remote repository: GitHub, setelah project stabil
- Database: Supabase
- Telegram: Long Polling

### Production

Deployment akhir dilakukan pada Android menggunakan Termux.

- Source code di-clone dari GitHub ke Termux
- Runtime: Node.js di Termux
- Database tetap menggunakan Supabase
- Telegram tetap menggunakan Long Polling
- Tidak membutuhkan VPS, Replit, webhook, domain, atau server publik

GitHub berfungsi sebagai remote repository dan backup/version control, bukan sebagai runtime bot.

### Alur deployment

```text
Komputer
   ↓
Development + Testing
   ↓
Git commit
   ↓
GitHub
   ↓
Android / Termux
   ↓
git clone / git pull
   ↓
Node.js Bot Production
```

### Prinsip deployment

Source code yang dijalankan di Termux harus berasal dari versi yang telah diuji di komputer. File `.env` tidak boleh di-upload ke GitHub dan harus dibuat secara terpisah pada setiap environment.

---

## 1. Ringkasan Produk

Bot Khutbah Jumat adalah bot Telegram yang membantu pengguna mencari, membaca, dan mengekspor materi khutbah Jumat dari sumber NU Online.

Pengguna cukup memasukkan tema khutbah, misalnya:

- sabar
- kematian
- keluarga
- rezeki
- akhlak
- shalat
- sedekah
- kejujuran

Bot kemudian mencari materi yang relevan dan menampilkan beberapa pilihan.

Setelah pengguna memilih salah satu materi, bot menampilkan isi khutbah secara lengkap dan menyediakan opsi untuk:

- membaca kembali;
- mencari khutbah lain;
- menyimpan ke favorit;
- mengekspor materi menjadi PDF.

Aplikasi dijalankan sepenuhnya melalui **Termux pada Android**. Tidak diperlukan VPS, Replit, atau server aplikasi terpisah.

Supabase digunakan sebagai database cloud untuk menyimpan indeks artikel, data pengguna, favorit, riwayat, dan metadata lainnya.

---

## 2. Tujuan

### 2.1 Tujuan utama

Membuat cara yang sederhana untuk menemukan materi khutbah Jumat berdasarkan tema tanpa pengguna harus mencari artikel secara manual di website.

### 2.2 Tujuan teknis

Sistem harus:

1. Mengambil dan mengindeks artikel khutbah dari NU Online.
2. Menyimpan metadata dan isi artikel ke database.
3. Menyediakan pencarian berdasarkan tema/kata kunci.
4. Menampilkan beberapa hasil yang relevan.
5. Menampilkan naskah khutbah secara lengkap.
6. Membuat PDF dari naskah khutbah.
7. Berjalan menggunakan Telegram Long Polling.
8. Berjalan langsung dari Termux.
9. Tidak membutuhkan webhook atau domain publik.
10. Dapat melakukan sinkronisasi artikel baru secara otomatis.

---

## 3. Batasan Sistem

### 3.1 Yang digunakan

- Android
- Termux
- Node.js
- Telegram Bot API
- Telegraf
- Supabase
- Cheerio
- node-cron
- library PDF dengan dukungan Unicode/Arab

### 3.2 Yang tidak diperlukan

- VPS
- Replit
- Cloudflare Tunnel
- Domain
- HTTPS server
- Webhook Telegram
- Google Apps Script

---

## 4. Arsitektur Sistem

```text
                         INTERNET
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
       ┌──────────────┐            ┌──────────────┐
       │  NU Online   │            │   Telegram   │
       │  Khutbah     │            │     API      │
       └──────┬───────┘            └──────┬───────┘
              │                           │
              │ Scraping                  │ Long Polling
              ▼                           ▼
       ┌─────────────────────────────────────────┐
       │                 TERMUX                  │
       │                                         │
       │  ┌───────────┐   ┌───────────────────┐  │
       │  │  Scraper  │   │   Telegram Bot    │  │
       │  └─────┬─────┘   └─────────┬─────────┘  │
       │        │                   │            │
       │        │          ┌────────┴────────┐   │
       │        │          │ Search / Logic  │   │
       │        │          └────────┬────────┘   │
       │        │                   │            │
       │        │          ┌────────┴────────┐   │
       │        │          │  PDF Generator  │   │
       │        │          └─────────────────┘   │
       │        │                                │
       └────────┼────────────────────────────────┘
                │
                ▼
        ┌─────────────────┐
        │    SUPABASE     │
        │   PostgreSQL    │
        └─────────────────┘
```

---

## 5. Alur Utama Pengguna

### 5.1 Start

Pengguna mengirim:

```text
/start
```

Bot:

```text
🕌 BOT KHUTBAH JUMAT

Assalamu'alaikum.

Saya dapat membantu Anda mencari materi
khutbah Jumat berdasarkan tema.

Silakan pilih menu:
```

Keyboard:

```text
🔎 Cari Khutbah
🆕 Khutbah Terbaru

🔖 Favorit
📚 Riwayat

ℹ️ Tentang Bot
```

---

## 6. Pencarian Khutbah

Pengguna memilih:

```text
🔎 Cari Khutbah
```

Bot:

```text
🔎 CARI KHUTBAH

Ketik tema atau kata kunci khutbah
yang ingin Anda cari.

Contoh:
• sabar
• kematian
• keluarga
• rezeki
• akhlak
• shalat
• sedekah
```

Pengguna:

```text
sabar
```

Sistem melakukan pencarian terhadap database.

---

## 7. Sistem Pencarian

Pencarian dilakukan bertahap.

### Level 1 — Exact / Keyword Search

Sistem mencari kata pada:

- judul;
- deskripsi;
- kategori;
- isi khutbah.

### Level 2 — Normalisasi

Sistem melakukan normalisasi kata.

Contoh:

```text
shalat → salat
rizki → rezeki
ujian → cobaan
```

Normalisasi tidak boleh mengubah isi artikel asli.

### Level 3 — Full Text Search

Database menggunakan PostgreSQL Full Text Search.

Prioritas pencarian:

1. Judul
2. Deskripsi
3. Tag/kategori
4. Isi khutbah

### Level 4 — Semantic Search

Semantic search disiapkan sebagai fitur lanjutan.

Versi pertama tidak wajib menggunakan AI/embedding.

---

## 8. Hasil Pencarian

Contoh:

```text
🔎 HASIL PENCARIAN

Tema: sabar

Ditemukan 8 materi khutbah.

Silakan pilih:

1️⃣ Sabar dalam Menghadapi Ujian
2️⃣ Keutamaan Bersabar dalam Islam
3️⃣ Sabar dan Tawakal
4️⃣ Buah dari Kesabaran
5️⃣ Sabar dalam Menghadapi Musibah
6️⃣ ...
```

Inline keyboard:

```text
[1️⃣] [2️⃣]
[3️⃣] [4️⃣]
[5️⃣] [6️⃣]

[➡️ Halaman Berikutnya]

[🔎 Cari Tema Lain]
[🏠 Menu Utama]
```

Sistem harus menggunakan pagination.

Jumlah hasil yang ditampilkan per halaman: **maksimal 6–8 artikel**.

---

## 9. Pemilihan Artikel

Ketika pengguna memilih nomor, bot mengambil `article_id` dari database.

Bot tidak melakukan scraping ulang apabila data artikel sudah tersedia di database.

---

## 10. Tampilan Artikel

Format:

```text
🕌 KHUTBAH JUMAT

Judul:
Sabar dalam Menghadapi Ujian

✍️ Penulis:
Nama Penulis

📅 Tanggal:
Tanggal publikasi

━━━━━━━━━━━━━━━━━━

KHUTBAH I

[isi khutbah]

━━━━━━━━━━━━━━━━━━

KHUTBAH II

[isi khutbah]

━━━━━━━━━━━━━━━━━━

📚 Sumber:
NU Online

🔗 Artikel asli:
URL artikel
```

Isi artikel harus mempertahankan:

- paragraf;
- heading;
- teks Arab;
- transliterasi jika tersedia;
- ayat;
- hadis;
- bagian khutbah;
- urutan konten.

---

## 11. Penanganan Pesan Panjang

Telegram memiliki batas panjang pesan.

Sistem harus memiliki fungsi:

```text
splitLongMessage()
```

Aturan:

1. Jangan memotong di tengah kata.
2. Prioritaskan pemotongan berdasarkan paragraf.
3. Jika paragraf terlalu panjang, potong berdasarkan kalimat.
4. Jangan memisahkan heading dari kontennya.
5. Berikan penanda bagian.

Contoh:

```text
📖 KHUTBAH I
Bagian 1/3
```

---

## 12. Tombol Setelah Artikel

Setelah seluruh isi selesai dikirim:

```text
━━━━━━━━━━━━━━━━━━

📚 Sumber: NU Online

Pilih tindakan:
```

Keyboard:

```text
📄 Ekspor PDF
🔖 Simpan ke Favorit

🔄 Khutbah Lain
🔎 Cari Tema Baru

🏠 Menu Utama
```

---

## 13. Ekspor PDF

Ketika pengguna menekan:

```text
📄 Ekspor PDF
```

Bot:

```text
⏳ Sedang menyiapkan PDF...
```

PDF dibuat secara lokal di Termux.

Alur:

```text
Supabase
   ↓
Ambil artikel
   ↓
PDF Generator
   ↓
PDF sementara
   ↓
Telegram
   ↓
User
   ↓
File sementara dihapus
```

---

## 14. Format PDF

Ukuran:

```text
A4
```

Isi minimal:

```text
KHUTBAH JUMAT

Sabar dalam Menghadapi Ujian

Penulis: ...
Tanggal: ...

KHUTBAH I

[isi khutbah]

KHUTBAH II

[isi khutbah]

Sumber: NU Online
URL artikel: ...
```

PDF harus menggunakan font Unicode yang mendukung:

- Bahasa Indonesia;
- Bahasa Arab;
- tanda baca Arab;
- harakat;
- simbol Unicode umum.

Font Arab harus disertakan dalam project.

Contoh:

```text
fonts/
└── NotoNaskhArabic-Regular.ttf
```

---

## 15. Penamaan File PDF

Format:

```text
Khutbah_Jumat_<Judul>.pdf
```

Karakter yang tidak valid pada nama file harus dibersihkan.

---

## 16. Sumber Data

Sumber utama:

```text
https://islam.nu.or.id/khutbah/
```

Sistem harus menyimpan URL artikel asli.

Setiap artikel di database harus memiliki:

```text
source = "NU Online"
source_url = "https://..."
```

Bot harus selalu memberikan atribusi sumber ketika menampilkan artikel.

---

## 17. Scraper

Scraper bertugas:

1. Mengambil daftar artikel.
2. Mengambil URL.
3. Memeriksa apakah artikel sudah ada.
4. Mengambil artikel baru.
5. Mengambil metadata.
6. Membersihkan HTML.
7. Memisahkan bagian khutbah jika struktur memungkinkan.
8. Menyimpan data ke Supabase.

Alur:

```text
NU Online
    ↓
Listing Page
    ↓
Article URLs
    ↓
Article Parser
    ↓
Content Cleaner
    ↓
Database
```

---

## 18. Sinkronisasi

Bot tidak boleh melakukan scraping ke NU Online setiap kali user mencari.

Scraper berjalan terjadwal.

Default:

```text
Setiap 6 jam
```

Jika tidak ada artikel baru, tidak ada perubahan.

Jika ada artikel baru:

```text
Artikel baru → parse → validasi → database
```

---

## 19. Deduplication

Artikel tidak boleh tersimpan dua kali.

Identifikasi utama:

```text
source_url
```

Jika URL sudah ada:

```text
UPDATE jika ada perubahan
```

Jika URL belum ada:

```text
INSERT
```

---

## 20. Validasi Scraper

Setiap artikel yang akan dimasukkan harus melewati validasi minimal:

```text
title != null
url != null
content != null
content.length > minimum
```

Jika parsing gagal:

```text
status = "parse_failed"
```

Artikel tidak boleh langsung dianggap valid.

Error dicatat untuk pemeriksaan admin.

---

## 21. Database Supabase

### Table: `articles`

```text
id
title
slug
url
author
published_at
language
description
category
content
khutbah_1
khutbah_2
source
content_hash
status
created_at
updated_at
```

`content_hash` digunakan untuk mengetahui apakah isi artikel berubah.

`status`:

```text
active
parse_failed
archived
```

### Table: `users`

```text
id
telegram_id
username
first_name
last_name
created_at
last_active_at
```

`telegram_id` harus unik.

### Table: `favorites`

```text
id
user_id
article_id
created_at
```

Constraint:

```text
UNIQUE(user_id, article_id)
```

### Table: `history`

```text
id
user_id
article_id
opened_at
```

### Table: `search_logs`

```text
id
user_id
query
result_count
created_at
```

### Table: `sync_logs`

```text
id
started_at
finished_at
articles_found
articles_inserted
articles_updated
articles_failed
status
error_message
```

---

## 22. Favorit

Ketika pengguna memilih:

```text
🔖 Simpan ke Favorit
```

Bot menyimpan `telegram_user + article_id`.

Bot:

```text
✅ Khutbah berhasil disimpan ke favorit.
```

Jika sudah tersimpan:

```text
ℹ️ Khutbah ini sudah ada di favorit Anda.
```

---

## 23. Riwayat

Menu:

```text
📚 Riwayat
```

Menampilkan artikel yang pernah dibuka.

Riwayat dapat dibatasi, misalnya **50 artikel terakhir per user**.

---

## 24. Khutbah Terbaru

Menu:

```text
🆕 Khutbah Terbaru
```

Sistem mengambil artikel berdasarkan:

```text
published_at DESC
```

Bukan berdasarkan waktu crawler.

---

## 25. Menu Tentang

```text
ℹ️ Tentang Bot
```

Isi:

```text
🕌 BOT KHUTBAH JUMAT

Bot ini membantu mencari dan membaca
materi khutbah Jumat berdasarkan tema.

Sumber materi:
NU Online

Bot tidak mengubah substansi materi sumber.

Untuk artikel lengkap dan informasi terbaru,
silakan merujuk ke sumber asli.
```

---

## 26. Admin

Admin ditentukan berdasarkan Telegram ID:

```env
ADMIN_TELEGRAM_ID=
```

User biasa tidak boleh mengakses fungsi admin.

Menu:

```text
⚙️ ADMIN

📊 Statistik
🔄 Sinkronisasi Sekarang
📰 Artikel Terbaru
👥 Pengguna
📋 Log Sinkronisasi
📋 Error Log
```

---

## 27. Statistik Admin

Minimal menampilkan:

```text
Users
Articles
Favorites
History
Searches
Last sync
Sync status
```

---

## 28. Sinkronisasi Manual

Admin dapat memilih:

```text
🔄 Sinkronisasi Sekarang
```

Bot menampilkan status:

```text
⏳ Sinkronisasi sedang berjalan...
```

Kemudian:

```text
✅ Sinkronisasi selesai.

Ditemukan       : 14
Artikel baru    : 9
Diperbarui      : 2
Gagal diproses  : 3
```

---

## 29. Error Handling

### Database gagal

```text
⚠️ Sistem sedang mengalami gangguan.
Silakan coba beberapa saat lagi.
```

### Artikel tidak ditemukan

```text
⚠️ Materi tidak dapat ditemukan.

Silakan coba pencarian lain.
```

### PDF gagal

```text
⚠️ PDF gagal dibuat.

Silakan coba kembali.
```

### NU Online tidak dapat diakses

Bot tetap dapat melayani pencarian terhadap artikel yang sudah tersimpan di database.

Scraper akan mencoba kembali pada jadwal berikutnya.

---

## 30. Partial Availability

Jika NU Online tidak dapat diakses tetapi Supabase tersedia:

- pencarian tetap berjalan;
- artikel yang sudah tersimpan tetap dapat dibaca;
- PDF tetap dapat dibuat.

Yang tidak dapat dilakukan:

- mengambil artikel baru.

---

## 31. Telegram Connection

Bot menggunakan:

```text
Long Polling
```

Tidak menggunakan webhook.

Tidak diperlukan:

- domain;
- HTTPS;
- public IP;
- reverse proxy.

---

## 32. Termux

Project berada misalnya di:

```text
~/khutbah-bot
```

Instalasi awal:

```bash
pkg update
pkg upgrade
pkg install nodejs git
```

Clone:

```bash
git clone <repository>
cd khutbah-bot
```

Install:

```bash
npm install
```

Konfigurasi:

```text
.env
```

Contoh:

```env
BOT_TOKEN=
SUPABASE_URL=
SUPABASE_ANON_KEY=
ADMIN_TELEGRAM_ID=

SCRAPE_INTERVAL_HOURS=6
MAX_SEARCH_RESULTS=8
MAX_HISTORY=50
```

---

## 33. Menjalankan Bot

```bash
npm start
```

atau:

```bash
node src/index.js
```

Log awal minimal:

```text
[BOOT] Starting Khutbah Bot...
[DATABASE] Connected
[TELEGRAM] Bot started
[SCHEDULER] Started
```

---

## 34. Menjaga Bot Tetap Aktif

Termux dapat menggunakan:

```bash
termux-wake-lock
```

Untuk auto-start setelah reboot dapat digunakan Termux:Boot.

Contoh script:

```bash
#!/data/data/com.termux/files/usr/bin/bash

termux-wake-lock

cd ~/khutbah-bot
npm start
```

Pengguna juga perlu mengecualikan Termux dari optimasi baterai Android apabila diperlukan.

---

## 35. Keamanan

`.env` tidak boleh di-commit.

`.gitignore`:

```text
node_modules/
.env
*.log
tmp/
generated/
```

Telegram Bot Token harus diperlakukan sebagai secret.

Supabase key harus mengikuti prinsip least privilege.

---

## 36. Struktur Project

```text
khutbah-bot/
│
├── src/
│   ├── index.js
│   ├── config.js
│   │
│   ├── bot/
│   │   ├── commands/
│   │   │   ├── start.js
│   │   │   ├── search.js
│   │   │   └── admin.js
│   │   │
│   │   ├── handlers/
│   │   │   ├── article.js
│   │   │   ├── favorite.js
│   │   │   └── pdf.js
│   │   │
│   │   └── keyboards/
│   │       └── keyboards.js
│   │
│   ├── scraper/
│   │   ├── nuonline.js
│   │   ├── parser.js
│   │   ├── cleaner.js
│   │   └── sync.js
│   │
│   ├── search/
│   │   └── search.js
│   │
│   ├── database/
│   │   ├── client.js
│   │   ├── articles.js
│   │   ├── users.js
│   │   ├── favorites.js
│   │   └── history.js
│   │
│   ├── pdf/
│   │   └── generator.js
│   │
│   └── scheduler/
│       └── scheduler.js
│
├── fonts/
│   └── NotoNaskhArabic-Regular.ttf
│
├── tmp/
├── tests/
│
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 37. Dependency Awal

Dependency yang direncanakan:

```text
telegraf
@supabase/supabase-js
cheerio
node-cron
pdfkit
dotenv
```

Gunakan `fetch` bawaan Node.js jika versi Node.js yang digunakan sudah mendukungnya.

Versi dependency harus ditentukan saat implementasi berdasarkan versi Node.js yang tersedia di Termux.

---

## 38. MVP

### Wajib

- `/start`
- Menu Telegram
- Cari khutbah
- Hasil pencarian
- Pagination
- Pilih artikel
- Tampilkan artikel lengkap
- Penanganan pesan panjang
- Sumber artikel
- Ekspor PDF
- Khutbah terbaru
- Supabase
- Scraper
- Scheduler
- Error handling
- Termux

### Tahap kedua

- Favorit
- Riwayat
- Admin panel
- Statistik
- Semantic search

---

## 39. Acceptance Criteria

### Bot

- `/start` bekerja.
- Bot dapat menerima tema.
- Bot memberikan beberapa hasil.
- Tombol hasil dapat digunakan.
- Artikel dapat dibaca.

### Scraper

- Artikel baru dapat ditemukan.
- Artikel tidak terduplikasi.
- Metadata tersimpan.
- Isi tersimpan.
- Error tercatat.

### Database

- User tersimpan.
- Artikel tersimpan.
- History dapat dibuat.
- Favorite dapat dibuat.

### PDF

- PDF berhasil dibuat.
- Bahasa Indonesia tampil benar.
- Huruf Arab tampil benar.
- Harakat tidak rusak.
- PDF dapat dikirim melalui Telegram.
- File sementara dibersihkan.

### Termux

- Bot dapat dijalankan dengan satu command.
- Bot menggunakan polling.
- Tidak membutuhkan port publik.
- Scheduler berjalan.
- Bot dapat direstart setelah error.

---

## 40. Urutan Implementasi

### Tahap 1 — Project

Node.js, package.json, `.env`, Git.

### Tahap 2 — Supabase

Buat tabel:

```text
users
articles
favorites
history
search_logs
sync_logs
```

### Tahap 3 — Scraper

Pastikan:

```text
NU Online
↓
URL
↓
Article
↓
Parser
↓
Database
```

berhasil sebelum membuat fitur bot.

### Tahap 4 — Telegram

Implementasi:

```text
/start
/menu
/search
```

### Tahap 5 — Search

Implementasi:

```text
query
↓
PostgreSQL
↓
results
↓
inline keyboard
```

### Tahap 6 — Article Viewer

Implementasi:

```text
article_id
↓
database
↓
formatter
↓
Telegram
```

### Tahap 7 — PDF

Implementasi:

```text
article
↓
PDF generator
↓
Telegram document
```

### Tahap 8 — Scheduler

Implementasi:

```text
node-cron
↓
sync
```

### Tahap 9 — Error Handling

Tambahkan:

```text
logging
retry
validation
fallback
```

### Tahap 10 — Testing

Test:

- pencarian;
- artikel panjang;
- teks Arab;
- PDF;
- database;
- scraper;
- restart;
- internet terputus;
- database error.

### Tahap 11 — Termux Production

Konfigurasi:

- Termux;
- wake-lock;
- battery optimization;
- Termux:Boot.

---

## 41. Prinsip Implementasi

1. Database adalah sumber data bot.
2. NU Online adalah sumber konten.
3. Jangan scraping setiap kali user mencari.
4. Jangan menyimpan token di source code.
5. Jangan menggunakan webhook.
6. PDF dibuat dari teks terstruktur, bukan screenshot.
7. Parser tidak boleh mengubah substansi materi.
8. Selalu tampilkan sumber dan URL artikel asli.
9. Jika sumber tidak tersedia, artikel yang sudah terindeks tetap harus dapat digunakan.
10. Semua proses scraper harus memiliki logging dan validasi.

---

## 42. Roadmap

### V1.0

- Telegram
- Search
- Article
- PDF
- Scraper
- Supabase
- Termux

### V1.1

- Favorit
- Riwayat
- Admin

### V2.0

- Semantic Search
- Tag otomatis
- Rekomendasi tema
- Pencarian lebih cerdas

---

## 43. Target Akhir

Pengalaman pengguna:

```text
User
  │
  │ "Saya ingin khutbah tentang sabar"
  ▼
Bot
  │
  │ menampilkan beberapa pilihan
  ▼
User
  │
  │ pilih nomor 2
  ▼
Bot
  │
  │ menampilkan khutbah lengkap
  ▼
User
  │
  │ 📄 Ekspor PDF
  ▼
Bot
  │
  │ membuat PDF
  ▼
📄 File PDF
```

Seluruh aplikasi berjalan pada:

```text
ANDROID
   │
   └── TERMUX
         │
         └── NODE.JS
```

dengan:

```text
Supabase → database
NU Online → sumber materi
Telegram → interface pengguna
```

---

## 44. Status Dokumen

**PRD versi 1.1 — spesifikasi pembangunan MVP dengan pemisahan Development dan Production Environment.**

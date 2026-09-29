# Architecture — Bot Khutbah Jumat

Dokumen ini merangkum arsitektur teknis, batas sistem, dan keputusan desain
yang diimplementasikan. `PRD.md` tetap menjadi sumber utama untuk fitur dan
pengalaman pengguna. Instruksi keamanan, kepatuhan sumber, dan pengujian pada
master prompt melengkapi PRD.

## 1. Konteks runtime

| Aspek | Keputusan |
|---|---|
| Development | Linux desktop, Node.js (terpasang: v26.8.2) |
| Production | Android + Termux, Node.js |
| Module system | **ESM** (`"type": "module"`), konsisten di seluruh project |
| Telegram | **Long polling** (Telegraf), tanpa webhook/domain/server publik |
| Database | SQLite lokal (`node:sqlite`) — tanpa server/cloud |
| Sumber konten | NU Online `https://islam.nu.or.id/khutbah/` (scraper terjadwal) |
| Scheduler | `node-cron`, default tiap 6 jam |
| PDF | `pdfkit` + shaping/bidi Arab (`arabic-reshaper` + `bidi-js`) |

Tidak menggunakan VPS, Replit, Docker, webhook, domain, frontend, atau layanan
berbayar.

## 2. Pemisahan lapisan (layering)

```
src/
├── index.js            # entrypoint: baca env, boot, shutdown (efek samping)
├── app.js              # composition root: rakit komponen tanpa efek samping
├── config.js           # load + validasi env (tanpa efek samping)
├── logger.js           # logging terstruktur + redaksi rahasia
├── bot/                # transport Telegram (tidak berisi logika bisnis berat)
│   ├── createBot.js
│   ├── commands/       # /start /help /admin
│   ├── handlers/       # search, article, favorite, history, pdf
│   ├── keyboards/      # definisi keyboard
│   └── session.js      # state per-user (in-memory)
├── search/             # normalisasi + query pencarian
├── scraper/            # discovery, fetch client, parser, cleaner, sync
├── database/           # store SQLite + repository + memory store + init/verify
├── pdf/                # generator + helper Arab (shaping/bidi)
├── scheduler/          # node-cron
└── utils/              # splitMessage, html, slug, sanitizeFilename, errors
```

`src/database/schema.sql` = schema kanonik SQLite (reproducible, idempoten).

Prinsip: inisialisasi komponen **dipisah** dari efek samping agar dapat dites
tanpa token/kredensial. `index.js` hanya yang menjalankan efek samping
(`bot.launch()`, cron, koneksi jaringan).

## 3. Mode konten (kepatuhan hak penggunaan)

Karena artikel NU Online adalah karya pihak ketiga, default project berjalan
dalam **mode aman**:

- `FULL_CONTENT_ENABLED=false` (default)
  - Simpan **metadata** + **cuplikan pendek** (snippet) + tautan artikel asli.
  - Tampilkan metadata, cuplikan, atribusi, dan tombol **Baca di NU Online**.
  - PDF turunan **tidak** dibuat; hanya menautkan sumber / PDF resmi bila ada.
- `FULL_CONTENT_ENABLED=true` (harus diaktifkan manual oleh pemilik setelah
  memastikan izin/lisensi penggunaan)
  - Simpan isi penuh, tampilkan naskah lengkap, dan hasilkan PDF turunan.

`robots.txt` NU Online diperiksa pada 2026-09-27: `User-agent: * / Disallow:` —
mengizinkan crawl. Meski demikian, crawler tetap bersikap sopan: rate limit,
User-Agent jelas, timeout, retry terbatas, dan berhenti jika situs melarang.

## 4. Alur data

### Scraper (terjadwal / manual)
```
NU Online listing → discovery URL → dedup by source_url
   → fetch artikel (rate-limited) → parser (metadata + body)
   → cleaner (buang nav/iklan, jaga paragraf & Arab)
   → validasi (title/url/content) → upsert (insert/update by hash)
   → sync_logs
```
Parser **tidak** mengarang bagian Khutbah I/II; hanya dipisah jika penanda
`Khutbah I`/`Khutbah II` benar-benar ada di halaman.

### Bot
```
User pesan → Telegraf middleware → session → handler
   → search (DB query berparameter) → inline keyboard (article_id)
   → article viewer (splitLongMessage) → aksi (PDF/favorit/riwayat/menu)
```

### PDF
```
Artikel (DB) → arabic shaping + bidi → pdfkit A4
   → file sementara di tmp/ → kirim Telegram document → hapus file (sukses/gagal)
```

## 5. Database

Tabel: `articles`, `users`, `favorites`, `history`, `search_logs`, `sync_logs`.
Schema kanonik: `src/database/schema.sql` (idempoten; indeks, unique constraint,
FK, check, kolom `status`/`content_hash`/`image_url`/`last_synced_at`).

Database dibuka lewat driver bawaan Node.js `node:sqlite`. Inisialisasi:
`npm run db:init` (aman dijalankan berulang; juga otomatis saat boot).
Verifikasi: `npm run db:verify`.

Akses database:
- Hanya proses bot di perangkat yang sama; tidak ada API publik.
- File `data/khutbah.db` masuk `.gitignore` dan tidak di-commit.
- `PRAGMA foreign_keys = ON` menjaga integritas FK; UNIQUE/CHECK dipertahankan.

## 6. Risiko utama

| Risiko | Mitigasi |
|---|---|
| Rendering Arab (shaping/bidi/harakat) di PDF | Library shaping + bidi, uji ekstraksi teks & visual halaman |
| Perubahan markup NU Online | Parser berbasis fixture + tes perubahan markup; selector terpusat |
| Reproduksi konten pihak ketiga | Mode aman default, feature flag izin, atribusi + tautan |
| Supabase RLS/least privilege | Tidak lagi berlaku — database lokal hanya diakses proses bot |
| Android membunuh proses | Termux:Boot + wake-lock + panduan pemulihan (diuji perangkat = NOT_VERIFIED) |
| Perbedaan Linux vs Termux | Hindari native dep; audit kompatibilitas; `npm ci` di Termux |

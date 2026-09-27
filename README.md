# Bot Khutbah Jumat (Telegram)

Bot Telegram untuk membantu mencari, membaca, dan (opsional) mengekspor materi
khutbah Jumat dari **NU Online**. Berjalan di Android + Termux dengan Node.js,
database **Supabase PostgreSQL**, Telegram **long polling**.

> **Status:** dibangun bertahap. Lihat `docs/BUILD_PROGRESS.md` untuk status
> terkini dan `docs/TEST_MATRIX.md` untuk daftar pengujian.

## Kepatuhan sumber konten

Artikel NU Online adalah karya pihak ketiga. Secara default bot berjalan dalam
**mode aman** (`FULL_CONTENT_ENABLED=false`): hanya mengindeks **metadata** dan
**cuplikan pendek**, menampilkan tautan ke artikel asli, dan tidak membuat PDF
turunan. Untuk menyimpan/menampilkan isi penuh dan membuat PDF, aktifkan
`FULL_CONTENT_ENABLED=true` **hanya setelah izin/lisensi penggunaan dipastikan**.

## Persyaratan

- Node.js >= 20 (dikembangkan dengan v26)
- Akun Telegram Bot (token dari @BotFather)
- Proyek Supabase (PostgreSQL)

## Instalasi cepat (Linux)

```bash
git clone <repository> khutbah-bot
cd khutbah-bot
npm ci
cp .env.example .env      # lalu isi nilainya
npm test                  # jalankan tes
npm start                 # jalankan bot
```

## Konfigurasi `.env`

Lihat `.env.example`. Variabel penting:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `BOT_TOKEN` | ya | Token bot Telegram (rahasia) |
| `SUPABASE_URL` | ya | URL proyek Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ya* | Kunci server tepercaya (jangan dibagikan) |
| `SUPABASE_ANON_KEY` | alternatif | Dipakai bila service-role tidak tersedia |
| `ADMIN_TELEGRAM_ID` | ya | Telegram ID admin (pisah koma) |
| `FULL_CONTENT_ENABLED` | tidak | `false` (default) mode aman |
| `SCRAPE_INTERVAL_HOURS` | tidak | Default 6 |

**Jangan pernah** meng-commit `.env`. Hanya `.env.example` yang masuk Git.

## Migrasi database

```bash
npm run migrate            # tampilkan SQL migrasi (tinjau dulu)
npm run migrate -- --apply # terapkan ke Supabase (butuh kredensial)
```

## Sinkronisasi manual

```bash
npm run sync
```

## Struktur

Lihat `docs/ARCHITECTURE.md`.

## Deployment Termux

Lihat `docs/TERMUX.md` dan `scripts/setup-termux.sh`.

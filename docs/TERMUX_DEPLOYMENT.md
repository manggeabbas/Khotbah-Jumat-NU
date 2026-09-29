# Termux Deployment — Bot Khutbah Jumat

Panduan men-deploy bot di **Android + Termux** (production). Bot memakai
**long polling** sehingga tidak butuh domain, port publik, webhook, atau VPS.

```
Termux
  └─ Node.js
       └─ SQLite (data/khutbah.db)   ← tanpa Supabase
            └─ Telegram (long polling)
```

> Status verifikasi: skrip & dokumentasi disiapkan; eksekusi di perangkat
> Android nyata berstatus **NOT_VERIFIED** sampai Anda menjalankannya.

---

## 1. Instalasi Termux

1. Pasang **Termux** (disarankan dari **F-Droid**, bukan Play Store yang usang).
2. Pasang **Termux:Boot** (F-Droid) bila ingin auto-start setelah reboot.
3. Buka Termux, perbarui paket:

```bash
pkg update && pkg upgrade -y
```

## 2. Instalasi Node.js & Git

```bash
pkg install -y nodejs git
node --version   # pastikan >= 22.5 (node:sqlite)
npm --version
```

## 3. Transfer project

Opsi A — dari GitHub (setelah push):

```bash
git clone <URL_REPOSITORY> ~/Projects/Khotbah-Jumat
cd ~/Projects/Khotbah-Jumat
```

Opsi B — salin folder dari komputer (mis. via `termux-setup-storage` lalu
`cp`), pastikan `.env` dibuat terpisah (jangan menyalin dari Git).

## 4. Install dependency

```bash
npm ci --omit=dev      # reproducible dari package-lock.json
# atau bila package-lock tidak ada:
npm install --omit=dev
```

Tidak ada native module SQLite: driver memakai `node:sqlite` bawaan Node.js,
jadi instalasi tidak memicu kompilasi (ramah Termux).

## 5. Membuat `.env`

```bash
cp .env.example .env
nano .env
```

## 6. Konfigurasi environment

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_USER_ID=
# opsional (default: data/khutbah.db):
SQLITE_DB_PATH=
# tuning:
SCRAPE_INTERVAL_HOURS=6
FULL_CONTENT_ENABLED=false
```

- `TELEGRAM_USER_ID` = ID Telegram owner/admin (non-rahasia, numerik).
- Tidak ada kredensial database/Supabase yang dibutuhkan.
- **Jangan** menaruh token di Git atau mengirimnya ke siapa pun.
- Verifikasi tanpa menampilkan nilai: `npm run check:env`.

## 7. Database test

```bash
npm run db:init        # buat data/khutbah.db + tabel/indeks (idempoten)
npm run db:verify      # cek tabel + constraint + CRUD + FK
```

Database juga dibuat otomatis saat boot bila belum ada.

### 7b. Memuat seluruh daftar khutbah (indeks penuh)

Database baru dimulai kosong. Untuk mengisi seluruh daftar khutbah dari NU
Online (saat ini ~1.900 artikel):

```bash
npm run sync:full                # seluruh halaman + semua artikel (bisa lama)
npm run sync:full -- --max=200   # contoh: batasi dulu agar cepat
```

Aman diulang dan bisa dilanjutkan; artikel yang sudah tersimpan dilewati.
Sinkronisasi terjadwal (`npm run sync`) tetap hanya memindai halaman terbaru.

## 8. Telegram test

```bash
npm run smoke:telegram   # getMe + long polling + handler (lalu berhenti)
npm run smoke:scraper    # scraper terbatas (1 halaman, 2 artikel) + cleanup
npm run smoke:e2e        # E2E search/viewer/favorit/history/PDF (SQLite)
```

## 9. Jalankan

```bash
npm start
```

Log awal yang diharapkan:

```text
[BOOT] Starting Khutbah Bot...
[DATABASE] Connected
[TELEGRAM] Bot started
[SCHEDULER] Started
```

## 10. termux-wake-lock

Cegah perangkat tidur saat bot berjalan:

```bash
termux-wake-lock
```

Skrip `scripts/start-termux.sh` sudah memanggilnya otomatis.

## 11. Termux:Boot (auto-start)

Salin `scripts/termux-boot.sh` ke `~/.termux/boot/`:

```bash
mkdir -p ~/.termux/boot
cp scripts/termux-boot.sh ~/.termux/boot/khutbah.sh
chmod +x ~/.termux/boot/khutbah.sh
# sesuaikan REPO_DIR di dalam skrip (default ~/khutbah-bot)
```

## 12. Battery optimization

Agar Android tidak membunuh Termux:
**Settings → Apps → Termux → Battery → Unrestricted**.
Beberapa perangkat juga butuh menonaktifkan "adaptive battery" untuk Termux.

## 13. Log monitoring

Jalankan lewat `tmux` agar persisten & mudah memantau:

```bash
pkg install -y tmux
tmux new -s bot 'cd ~/Projects/Khotbah-Jumat && npm start'
# detach: Ctrl-b lalu d
# kembali: tmux attach -t bot
```

Atau catat ke file:

```bash
cd ~/Projects/Khotbah-Jumat && npm start >> tmp/bot.log 2>&1 &
tail -f tmp/bot.log
```

## 14. Restart

```bash
# hentikan proses lama (Ctrl-C bila foreground), lalu:
cd ~/Projects/Khotbah-Jumat && npm start
```

Bot menangani `SIGINT`/`SIGTERM` dengan **graceful shutdown** (stop scheduler →
stop polling → cleanup → exit).

## 15. Update versi

```bash
cd ~/Projects/Khotbah-Jumat
git pull
npm ci --omit=dev
# bila ada pembaruan schema (aman diulang):
npm run db:init
npm start
```

## 16. Backup

- **Rahasia**: simpan `.env` di tempat aman terpisah (mis. backup terenkripsi).
- **Database**: salin file SQLite.
  ```bash
  mkdir -p backup
  cp data/khutbah.db backup/khutbah-$(date +%F).db
  # restore: hentikan bot, lalu
  cp backup/khutbah-2026-09-29.db data/khutbah.db
  ```
- **Source**: GitHub adalah backup kode. **Jangan** commit `.env` maupun
  `data/khutbah.db` (keduanya sudah masuk `.gitignore`).

---

## Troubleshooting

| Gejala | Penanganan |
|---|---|
| `Konfigurasi belum lengkap` | isi `.env`; cek `npm run check:env` |
| `401: Unauthorized` | `TELEGRAM_BOT_TOKEN` salah |
| Log `409` | token sama dipakai instance lain — hentikan yang lain |
| Database error | cek `SQLITE_DB_PATH`; jalankan `npm run db:init` & `npm run db:verify` |
| NU Online down | sinkronisasi dilewati, bot tetap jalan dari data tersimpan |
| Proses mati setelah layar kunci | aktifkan `termux-wake-lock` + battery unrestricted + Termux:Boot |

## Catatan keamanan

- Long polling (tanpa webhook), tanpa server publik, tanpa VPS.
- `.env` tidak masuk Git; `.env.example` hanya berisi nama variabel.
- Jangan pernah menampilkan token/secret di log atau chat.

# Termux Deployment — Bot Khutbah Jumat

Panduan men-deploy bot di **Android + Termux** (production). Bot memakai
**long polling** sehingga tidak butuh domain, port publik, webhook, atau VPS.

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
node --version   # pastikan >= 20
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

## 5. Membuat `.env`

```bash
cp .env.example .env
nano .env
```

## 6. Konfigurasi environment

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_USER_ID=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
# opsional (untuk migrasi DB):
# DATABASE_URL=
# tuning:
SCRAPE_INTERVAL_HOURS=6
FULL_CONTENT_ENABLED=false
```

- `TELEGRAM_USER_ID` = ID Telegram owner/admin (non-rahasia, numerik).
- **Jangan** menaruh token/secret di Git atau mengirimnya ke siapa pun.
- Verifikasi tanpa menampilkan nilai: `npm run check:env`.

## 7. Database test

```bash
npm run db:verify      # cek tabel + CRUD + constraint (butuh Supabase)
```

Bila tabel belum ada (perlu sekali saja, butuh `DATABASE_URL`):

```bash
npm run migrate -- --apply
```

## 8. Telegram test

```bash
npm run smoke:telegram   # getMe + long polling + handler (lalu berhenti)
npm run smoke:scraper    # scraper terbatas (1 halaman, 2 artikel) + cleanup
npm run smoke:e2e        # E2E search/viewer/favorit/history/PDF (Supabase)
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
# bila ada migration baru:
npm run migrate -- --apply
npm start
```

## 16. Backup

- **Rahasia**: simpan `.env` di tempat aman terpisah (mis. backup terenkripsi).
- **Database**: gunakan fitur backup Supabase (Dashboard → Database → Backups)
  dan/atau `pg_dump "$DATABASE_URL" > backup.sql` (butuh `psql`/`pg_dump`).
- **Source**: GitHub adalah backup kode. **Jangan** commit `.env`.

---

## Troubleshooting

| Gejala | Penanganan |
|---|---|
| `Konfigurasi belum lengkap` | isi `.env`; cek `npm run check:env` |
| `401: Unauthorized` | `TELEGRAM_BOT_TOKEN` salah |
| Log `409` | token sama dipakai instance lain — hentikan yang lain |
| Supabase gagal | cek `SUPABASE_URL`/`SUPABASE_SECRET_KEY`; artikel tersimpan tetap bisa dibaca |
| NU Online down | sinkronisasi dilewati, bot tetap jalan dari data tersimpan |
| Proses mati setelah layar kunci | aktifkan `termux-wake-lock` + battery unrestricted + Termux:Boot |

## Catatan keamanan

- Long polling (tanpa webhook), tanpa server publik, tanpa VPS.
- `.env` tidak masuk Git; `.env.example` hanya berisi nama variabel.
- Jangan pernah menampilkan token/secret di log atau chat.

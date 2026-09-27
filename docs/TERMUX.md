# Deploy di Android + Termux

Panduan menjalankan Bot Khutbah Jumat di Termux (production). Bot memakai
**long polling** sehingga tidak butuh domain, port publik, atau webhook.

> Catatan: langkah di perangkat nyata belum diverifikasi oleh agen
> (**NOT_VERIFIED**). Jalankan dan sesuaikan bila perlu.

## 1. Pasang Termux

Pasang Termux dari F-Droid (disarankan), lalu:

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git
node --version   # pastikan >= 20
```

## 2. Clone & install

```bash
git clone <URL_REPOSITORY> ~/khutbah-bot
cd ~/khutbah-bot
npm ci --omit=dev
cp .env.example .env
nano .env        # isi BOT_TOKEN, SUPABASE_URL, kunci, ADMIN_TELEGRAM_ID
```

`npm ci` dipakai agar versi dependency persis seperti `package-lock.json`.

## 3. Migrasi database (sekali)

Terapkan `src/database/schema.sql` ke Supabase (SQL Editor, atau):

```bash
npm run migrate          # tinjau SQL
npm run migrate -- --apply   # bila DATABASE_URL & psql tersedia
```

## 4. Jalankan

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

## 5. Menjaga tetap aktif

### Wake lock (cegah tidur saat layar mati)

```bash
termux-wake-lock
```

### Auto-start setelah reboot (Termux:Boot)

Pasang aplikasi **Termux:Boot** dari F-Droid, lalu buat
`~/.termux/boot/khutbah.sh`:

```bash
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd ~/khutbah-bot
exec npm start >> ~/khutbah-bot/tmp/bot.log 2>&1
```

Beri izin eksekusi: `chmod +x ~/.termux/boot/khutbah.sh`.

Script serupa tersedia di `scripts/termux-boot.sh` (untuk disalin).

### Optimasi baterai

Kecualikan Termux dari optimasi baterai Android:
Settings → Apps → Termux → Battery → **Unrestricted**.

## 6. Pemulihan bila proses dibunuh Android

Android dapat menghentikan proses di latar belakang. Bila bot berhenti:

1. buka Termux,
2. `cd ~/khutbah-bot && npm start`,
3. atau andalkan Termux:Boot setelah reboot.

Untuk pemantauan sederhana, jalankan lewat `nohup`/`tmux` bila ingin sesi
persisten:

```bash
pkg install -y tmux
tmux new -s bot 'cd ~/khutbah-bot && npm start'
```

## 7. Batasan yang perlu diketahui

- Tidak ada jaminan 100% hidup 24/7 di Android (manajemen daya OS).
- Font PDF & `pdfkit` murni JS → aman di Termux (tanpa native build).
- Jangan meng-commit `.env`. Rahasia hanya di perangkat.

## 8. Update versi

```bash
cd ~/khutbah-bot
git pull
npm ci --omit=dev
# (bila ada) npm run migrate -- --apply
npm start
```

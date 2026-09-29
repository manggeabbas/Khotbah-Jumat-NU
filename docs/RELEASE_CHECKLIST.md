# Release Checklist

Dipakai sebelum menandai rilis atau men-`git push` ke GitHub.

## Otomatis (dijalankan agen)

- [x] `npm test` lulus (kecuali yang NOT_VERIFIED yang didokumentasikan)
- [x] `npm run lint` lulus
- [x] `npm audit` tanpa kerentanan
- [x] `.env` tidak terlacak Git
- [x] Tidak ada rahasia nyata di file terlacak
- [x] `tmp/`, `node_modules/`, `*.pdf`, `data/`, `backup/` tidak terlacak
- [x] `docs/BUILD_PROGRESS.md` & `docs/TEST_MATRIX.md` diperbarui

## Manual (pemilik)

- [ ] Database SQLite diinisialisasi & diverifikasi (`npm run db:init && npm run db:verify`)
- [ ] `TELEGRAM_BOT_TOKEN` & `TELEGRAM_USER_ID` diisi di `.env` (tidak dibagikan)
- [ ] Tidak ada kredensial Supabase yang dibutuhkan (sudah dihapus dari runtime)
- [ ] Bot diuji live di Telegram (`npm start`)
- [ ] Izin/lisensi konten NU Online dipastikan (sebelum `FULL_CONTENT_ENABLED=true`)
- [ ] Inspeksi visual PDF (Arab + harakat)
- [ ] Uji `npm ci` + `npm start` di Termux
- [ ] `git push` (hanya setelah meninjau hasil)

## Perintah rilis

```bash
git status
git log --oneline
npm test && npm run lint && npm audit
# tinjau, lalu:
git push origin master
```

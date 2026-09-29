# Test Matrix — Bot Khutbah Jumat

Matriks pengujian. Status: `PASS` (dijalankan & lulus), `FAIL`, `NOT_VERIFIED`
(tidak dapat dijalankan: butuh kredensial/akses/perangkat), `BLOCKED`.

## 1. Unit test (tanpa jaringan/kredensial)

| ID | Area | Skenario | Status |
|---|---|---|---|
| U-CONF-01 | config | env lengkap valid → terparse | PASS |
| U-CONF-02 | config | env kosong → pesan jelas, tidak crash | PASS |
| U-CONF-03 | config | nilai default diterapkan | PASS |
| U-LOG-01 | logger | redaksi token/secret di output | PASS |
| U-SPLIT-01 | splitMessage | pesan panjang dipotong < batas, tidak pecah kata | PASS |
| U-SPLIT-02 | splitMessage | potong pada batas paragraf | PASS |
| U-SPLIT-03 | splitMessage | potong pada batas kalimat | PASS |
| U-SPLIT-04 | splitMessage | heading tidak terpisah dari konten | PASS |
| U-SPLIT-05 | splitMessage | tidak memotong surrogate pair (emoji/Arab) | PASS |
| U-SPLIT-06 | splitMessage | penanda bagian (Bagian x/y) | PASS |
| U-NORM-01 | search/normalize | shalat→salat, rizki→rezeki, ujian→cobaan | PASS |
| U-NORM-02 | search/normalize | isi sumber tidak diubah | PASS |
| U-SLUG-01 | utils | slug dari judul | PASS |
| U-FNAME-01 | utils | sanitasi nama file PDF ilegal | PASS |
| U-HTML-01 | utils | escape MarkdownV2/HTML | PASS |

## 2. Parser & cleaner (fixture, tanpa jaringan)

| ID | Area | Skenario | Status |
|---|---|---|---|
| P-LIST-01 | scraper | ekstraksi URL + judul + tanggal listing | PASS |
| P-ART-01 | scraper | metadata (judul, tanggal, sumber, url) | PASS |
| P-ART-02 | scraper | body `#detail-content` tanpa nav/iklan | PASS |
| P-ART-03 | scraper | preservasi paragraf & teks Arab | PASS |
| P-ART-04 | scraper | pemisahan Khutbah I/II hanya bila ada penanda | PASS |
| P-ART-05 | scraper | halaman tidak lengkap → status parse_failed | PASS |
| P-ART-06 | scraper | perubahan markup → tidak crash, gagal validasi | PASS |
| P-ART-07 | scraper | dedup URL | PASS |
| P-ART-08 | scraper | canonical di luar domain → fallback URL input | PASS |
| P-ART-09 | scraper | kategori & excerpt terparsing | PASS |
| P-LIST-02 | scraper | listing ekstrak kategori, gambar, tanggal | PASS |
| P-LIST-03 | scraper | tautan luar domain NU Online diabaikan | PASS |
| P-URL-01 | scraper | host guard (hanya domain NU Online) | PASS |
| P-INVALID-01 | validator | URL tidak valid → tidak disimpan | PASS |
| P-INVALID-02 | validator | judul kosong (URL valid) → parse_failed | PASS |
| P-ROB-01 | robots | parse & isAllowed | PASS |
| P-FETCH-01 | fetchClient | retry 500, no-retry 403/404 | PASS |
| F-TIMEOUT-01 | fetchClient | timeout membatalkan permintaan | PASS |
| S-SYN-01..05 | sync | idempoten, lock, robots, failed, discover | PASS |
| S-SYN-06 | sync | error per-artikel tercatat di sync_logs | PASS |
| S-SYN-07 | sync | canonical sama → tidak duplikat | PASS |
| P-LIVE-01 | scraper | live NU Online (metadata) | PASS (2026-09-27, 40 item) |
| P-LIVE-02 | scraper | live smoke: listing+2 artikel+upsert+cleanup | PASS (10/10, DB bersih) |

## 3. Database (SQLite)

| ID | Area | Skenario | Status |
|---|---|---|---|
| D-ART-01 | articles | upsert insert baru | PASS |
| D-ART-02 | articles | upsert update by url | PASS |
| D-ART-03 | articles | hash konten mendeteksi perubahan | PASS |
| D-ART-04 | articles | pagination hasil | PASS |
| D-ART-05 | articles | image_url & last_synced_at tersimpan | PASS |
| D-ART-06 | articles | last_synced_at diperbarui walau konten sama | PASS |
| D-USR-01 | users | upsert by telegram_id unik | PASS |
| D-FAV-01 | favorites | unique(user_id, article_id) | PASS |
| D-FAV-02 | favorites | listByUser menyertakan artikel | PASS |
| D-FAV-03 | favorites | isolasi antar user | PASS |
| D-FAV-04 | favorites | FK artikel tidak ada → ditolak | PASS |
| D-HIS-01 | history | batas 50 terakhir | PASS |
| D-HIS-02 | history | urut terbaru dulu | PASS |
| D-LOG-01 | search_logs | catat query + result_count | PASS |
| D-LOG-02 | sync_logs | catat hasil sinkronisasi | PASS |
| D-SQL-01 | schema | schema SQLite: tabel/kolom/unique/FK/check/indeks | PASS |
| D-SQL-02 | init | applySchema idempoten (dua kali aman) | PASS |
| D-SQL-03 | store | CRUD langsung + count + filter array | PASS |
| D-SQL-04 | store | Unicode/Arabic tersimpan utuh | PASS |

## 4. Telegram (mock, tanpa token)

| ID | Area | Skenario | Status |
|---|---|---|---|
| T-CMD-01 | /start | menu tampil | PASS |
| T-CMD-02 | /help | bantuan tampil | PASS |
| T-SRCH-01 | search | input tema → hasil | PASS |
| T-SRCH-02 | search | nol hasil → fallback | PASS |
| T-ART-01 | article | callback article_id valid | PASS |
| T-ART-02 | article | callback kedaluwarsa/tidak valid | PASS |
| T-FAV-01 | favorite | simpan + duplikat | PASS |
| T-ADM-01 | admin | user biasa ditolak | PASS |
| T-ADM-02 | admin | admin diizinkan | PASS |
| T-LATEST-01 | /latest | daftar terbaru + tombol callback | PASS |
| T-LATEST-02 | /latest | kosong → pesan aman | PASS |
| T-UNKNOWN-01 | unknown | perintah tak dikenal direspons | PASS |
| T-CB-ACK-01 | callback | query di-acknowledge | PASS |
| T-OWNER-01 | akses | owner lihat Admin, user biasa tidak | PASS |
| T-ERR-01 | error | handler error + redaksi rahasia | PASS |
| T-ERR-02 | error | database error ditangani | PASS |
| T-CB-01 | callback | data tak dikenal tidak crash | PASS |
| T-ART-05 | viewer | tombol Kembali → hasil/menu | PASS |
| T-FAV-04 | favorite | hapus favorit | PASS |
| T-FAV-05 | favorite | artikel favorit → tombol hapus | PASS |
| T-SRCH-03 | search | pagination callback | PASS |
| T-ADM-05 | admin | /status | PASS |
| T-ADM-06 | admin | /stat | PASS |
| T-ADM-07 | admin | /status user biasa ditolak | PASS |
| T-ADM-08 | admin | /sync user biasa ditolak, admin diizinkan | PASS |
| T-TG-LIVE-01 | live | getMe + no webhook + polling + handler | PASS (11/11, @khotbahjumatbot) |

## 5. PDF

| ID | Area | Skenario | Status |
|---|---|---|---|
| F-PDF-01 | pdf | buat PDF Indonesia | PASS |
| F-PDF-02 | pdf | buat PDF Arab berharakat (ekstraksi teks) | PASS |
| F-PDF-03 | pdf | multi-halaman | PASS |
| F-PDF-04 | pdf | judul panjang + nama file aman | PASS |
| F-PDF-05 | pdf | cleanup file sementara sukses/gagal | PASS |
| F-PDF-06 | pdf | test visual halaman sampel | PASS (diverifikasi via render `pdftoppm`: Arab tersambung, Latin normal) |
| F-PDF-07 | pdf | kategori tampil & artikel kosong tidak crash | PASS |
| F-PDF-08 | pdf | font static Amiri + teks mentah (tanpa reshaper/bidi) | PASS |
| F-PDF-09 | pdf | arah RTL Arab benar (via `features: []`) | PASS (render `pdftoppm`, 2 halaman) |
| F-PDF-10 | pdf | dokumen singkat tetap 1 halaman (footer tidak menambah halaman) | PASS |
| F-PDF-11 | pdf | dokumen panjang tanpa halaman kosong | PASS |
| P-CLEAN-01 | cleaner | blok "Baca Juga"/artikel terkait dibuang | PASS |

## 6. Scheduler

| ID | Area | Skenario | Status |
|---|---|---|---|
| S-SYN-01 | sync | idempoten (dua kali tidak duplikat) | PASS |
| S-SYN-02 | sync | dua sync bersamaan dicegah (lock/mutex) | PASS |
| S-SYN-03 | sync | sumber offline → tidak crash | PASS |
| S-SYN-04 | sync | log jumlah ditemukan/baru/ubah/gagal | PASS |
| S-SCHED-01 | scheduler | buildExpression + start idempoten | PASS |
| S-SCHED-02 | scheduler | tugas menjalankan runSync | PASS |
| S-SCHED-03 | scheduler | error runSync ditangkap | PASS |
| S-SCHED-04 | scheduler | ekspresi invalid ditolak | PASS |

## 7. Integrasi nyata (butuh kredensial)

| ID | Area | Skenario | Status |
|---|---|---|---|
| I-SB-01 | sqlite | db:init + db:verify (tabel + unique + FK + CRUD) | PASS (db:verify 43/43) |
| I-E2E-01 | sqlite | search + pagination + viewer + favorit + history + PDF (live) | PASS (smoke:e2e 16/16) |
| I-TG-01 | telegram | bot live long polling + handler + owner detection | PASS (smoke:telegram 11/11) |
| I-SC-01 | scraper | fetch live NU Online (mode aman) | PASS (2026-09-27, 40 ditemukan/3 disimpan/0 gagal) |
| I-PDF-01 | pdf | kirim dokumen ke Telegram nyata | PASS (operasional, message_id diterima); inspeksi visual NOT_VERIFIED |
| I-OP-01 | operasional | Telegram+DB+sync+latest+search+viewer+favorite+history+admin+PDF | PASS (15/15, 45 artikel production) |
| I-FULL-01 | full content | viewer pakai content, splitting, Arabic, PDF, live Telegram | PASS (13/13, 3 artikel content) |

## 7b. Hardening (Fase 11)

| ID | Area | Skenario | Status |
|---|---|---|---|
| H-HTML-01 | parser | HTML rusak/aneh tidak melempar | PASS |
| H-INPUT-01 | search | query ekstrem/emoji/simbol | PASS |
| H-ENV-01 | config | env tidak valid → ConfigError | PASS |
| H-RATE-01 | fetchClient | rate limiting jeda antar permintaan | PASS |
| H-OFFLINE-01 | fetchClient | offline → retry → ScraperError | PASS |
| H-SYNC-01 | sync | offline → status failed tanpa throw | PASS |
| H-PDF-01 | pdf | konten sangat panjang | PASS |
| H-SECRET-01 | logger | rahasia bertingkat disamarkan | PASS |
| H-CB-01 | bot | callback tidak dikenal/expired | PASS |
| — | audit | `npm audit` | PASS (0 vulnerabilities) |
| — | secret | scan file terlacak | PASS (hanya fixture palsu di tests/) |
| H-DB-01 | db live | `PRAGMA foreign_keys` aktif; FK ditolak bila melanggar | PASS |
| H-DB-02 | db live | UNIQUE url/telegram_id & CHECK status aktif | PASS |
| H-DB-03 | db live | tidak ada sisa data dummy setelah cleanup | PASS |

## 8. Termux / perangkat Android

| ID | Area | Skenario | Status |
|---|---|---|---|
| X-TX-01 | termux | setup script sintaks valid | PENDING |
| X-TX-02 | termux | install dependency kompatibel (`node:sqlite`, tanpa native build) | NOT_VERIFIED |
| X-TX-03 | termux | bot berjalan 24/7 & restart | NOT_VERIFIED |

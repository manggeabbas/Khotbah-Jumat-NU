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
| P-ROB-01 | robots | parse & isAllowed | PASS |
| P-FETCH-01 | fetchClient | retry 500, no-retry 403/404 | PASS |
| S-SYN-01..05 | sync | idempoten, lock, robots, failed, discover | PASS |
| P-LIVE-01 | scraper | live NU Online (metadata saja) | PASS (2026-09-27, 40 item) |

## 3. Database (mock/in-memory)

| ID | Area | Skenario | Status |
|---|---|---|---|
| D-ART-01 | articles | upsert insert baru | PASS |
| D-ART-02 | articles | upsert update by source_url | PASS |
| D-ART-03 | articles | hash konten mendeteksi perubahan | PASS |
| D-ART-04 | articles | pagination hasil | PASS |
| D-USR-01 | users | upsert by telegram_id unik | PASS |
| D-FAV-01 | favorites | unique(user_id, article_id) | PASS |
| D-HIS-01 | history | batas 50 terakhir | PASS |
| D-LOG-01 | search_logs | catat query + result_count | PASS |
| D-LOG-02 | sync_logs | catat hasil sinkronisasi | PASS |
| D-SQL-01 | schema | migrasi idempoten (statis) | PASS |

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

## 5. PDF

| ID | Area | Skenario | Status |
|---|---|---|---|
| F-PDF-01 | pdf | buat PDF Indonesia | PASS |
| F-PDF-02 | pdf | buat PDF Arab berharakat (ekstraksi teks) | PASS |
| F-PDF-03 | pdf | multi-halaman | PASS |
| F-PDF-04 | pdf | judul panjang + nama file aman | PASS |
| F-PDF-05 | pdf | cleanup file sementara sukses/gagal | PASS |
| F-PDF-06 | pdf | test visual halaman sampel | NOT_VERIFIED |

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
| I-SB-01 | supabase | migrasi + CRUD nyata | NOT_VERIFIED |
| I-TG-01 | telegram | bot live long polling | NOT_VERIFIED |
| I-SC-01 | scraper | fetch live NU Online penuh | NOT_VERIFIED |
| I-PDF-01 | pdf | kirim dokumen ke Telegram nyata | NOT_VERIFIED |

## 8. Termux / perangkat Android

| ID | Area | Skenario | Status |
|---|---|---|---|
| X-TX-01 | termux | setup script sintaks valid | PENDING |
| X-TX-02 | termux | install dependency kompatibel | NOT_VERIFIED |
| X-TX-03 | termux | bot berjalan 24/7 & restart | NOT_VERIFIED |

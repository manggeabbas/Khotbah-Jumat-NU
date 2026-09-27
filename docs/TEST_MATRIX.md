# Test Matrix — Bot Khutbah Jumat

Matriks pengujian. Status: `PASS` (dijalankan & lulus), `FAIL`, `NOT_VERIFIED`
(tidak dapat dijalankan: butuh kredensial/akses/perangkat), `BLOCKED`.

## 1. Unit test (tanpa jaringan/kredensial)

| ID | Area | Skenario | Status |
|---|---|---|---|
| U-CONF-01 | config | env lengkap valid → terparse | PENDING |
| U-CONF-02 | config | env kosong → pesan jelas, tidak crash | PENDING |
| U-CONF-03 | config | nilai default diterapkan | PENDING |
| U-LOG-01 | logger | redaksi token/secret di output | PENDING |
| U-SPLIT-01 | splitMessage | pesan panjang dipotong < batas, tidak pecah kata | PENDING |
| U-SPLIT-02 | splitMessage | potong pada batas paragraf | PENDING |
| U-SPLIT-03 | splitMessage | potong pada batas kalimat | PENDING |
| U-SPLIT-04 | splitMessage | heading tidak terpisah dari konten | PENDING |
| U-SPLIT-05 | splitMessage | tidak memotong surrogate pair (emoji/Arab) | PENDING |
| U-SPLIT-06 | splitMessage | penanda bagian (Bagian x/y) | PENDING |
| U-NORM-01 | search/normalize | shalat→salat, rizki→rezeki, ujian→cobaan | PENDING |
| U-NORM-02 | search/normalize | isi sumber tidak diubah | PENDING |
| U-SLUG-01 | utils | slug dari judul | PENDING |
| U-FNAME-01 | utils | sanitasi nama file PDF ilegal | PENDING |
| U-HTML-01 | utils | escape MarkdownV2/HTML | PENDING |

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
| D-ART-01 | articles | upsert insert baru | PENDING |
| D-ART-02 | articles | upsert update by source_url | PENDING |
| D-ART-03 | articles | hash konten mendeteksi perubahan | PENDING |
| D-ART-04 | articles | pagination hasil | PENDING |
| D-USR-01 | users | upsert by telegram_id unik | PENDING |
| D-FAV-01 | favorites | unique(user_id, article_id) | PENDING |
| D-HIS-01 | history | batas 50 terakhir | PENDING |
| D-LOG-01 | search_logs | catat query + result_count | PENDING |
| D-LOG-02 | sync_logs | catat hasil sinkronisasi | PENDING |
| D-SQL-01 | schema | migrasi idempoten (statis) | PENDING |

## 4. Telegram (mock, tanpa token)

| ID | Area | Skenario | Status |
|---|---|---|---|
| T-CMD-01 | /start | menu tampil | PENDING |
| T-CMD-02 | /help | bantuan tampil | PENDING |
| T-SRCH-01 | search | input tema → hasil | PENDING |
| T-SRCH-02 | search | nol hasil → fallback | PENDING |
| T-ART-01 | article | callback article_id valid | PENDING |
| T-ART-02 | article | callback kedaluwarsa/tidak valid | PENDING |
| T-FAV-01 | favorite | simpan + duplikat | PENDING |
| T-ADM-01 | admin | user biasa ditolak | PENDING |
| T-ADM-02 | admin | admin diizinkan | PENDING |

## 5. PDF

| ID | Area | Skenario | Status |
|---|---|---|---|
| F-PDF-01 | pdf | buat PDF Indonesia | PENDING |
| F-PDF-02 | pdf | buat PDF Arab berharakat (ekstraksi teks) | PENDING |
| F-PDF-03 | pdf | multi-halaman | PENDING |
| F-PDF-04 | pdf | judul panjang + nama file aman | PENDING |
| F-PDF-05 | pdf | cleanup file sementara sukses/gagal | PENDING |
| F-PDF-06 | pdf | test visual halaman sampel | NOT_VERIFIED |

## 6. Scheduler

| ID | Area | Skenario | Status |
|---|---|---|---|
| S-SYN-01 | sync | idempoten (dua kali tidak duplikat) | PENDING |
| S-SYN-02 | sync | dua sync bersamaan dicegah (lock/mutex) | PENDING |
| S-SYN-03 | sync | sumber offline → tidak crash | PENDING |
| S-SYN-04 | sync | log jumlah ditemukan/baru/ubah/gagal | PENDING |

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

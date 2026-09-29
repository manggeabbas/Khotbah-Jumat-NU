# Fonts

## Amiri-Regular.ttf (dipakai untuk PDF)

- **Keluarga:** Amiri
- **Sumber:** Google Fonts — <https://github.com/google/fonts/tree/main/ofl/amiri>
- **Lisensi:** SIL Open Font License 1.1 (OFL-1.1)
- **Kenapa dipakai:** satu font **static** yang mencakup **Latin + Arab +
  harakat**, dan stabil di `fontkit`.

> Catatan penting (arah RTL): PDF dirender dengan `doc.text(text, { features: [] })`.
> Opsi `features` membuat `pdfkit` memakai `fontkit.layoutRun` untuk seluruh
> string sehingga fontkit menangani shaping **dan arah RTL**. Tanpa `features`,
> PDFKit memecah teks per-spasi dan menyusun kata dari kiri ke kanan (Arab jadi
> terbaca LTR). JANGAN memakai reshape/bidi manual.

> Catatan penting: font **variabel** `NotoNaskhArabic[wght].ttf` menyebabkan
> `fontkit` crash pada sebagian teks Arab (`Cannot read properties of undefined
> (reading '0')`), dan varian **static**-nya tidak memiliki glyph Latin. Karena
> itu PDF memakai **Amiri**.

## NotoNaskhArabic-Regular.ttf (disertakan sesuai PRD §14)

- **Keluarga:** Noto Naskh Arabic (static)
- **Sumber:** <https://github.com/notofonts/notofonts.github.io>
- **Lisensi:** SIL Open Font License 1.1 (OFL-1.1)
- **Catatan:** mendukung Arab + harakat, **tanpa** glyph Latin. Tidak dipakai
  sebagai font utama PDF (lihat alasan di atas). Dapat dijadikan alternatif
  khusus teks Arab.

Untuk mengganti font PDF, ubah `FONT_PATH` di `src/pdf/generator.js`. Pastikan
font mendukung **Latin + Arab + harakat** dan berupa **static** (bukan variabel).

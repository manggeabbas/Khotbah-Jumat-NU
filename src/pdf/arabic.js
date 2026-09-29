/**
 * Helper teks Arab untuk PDF.
 *
 * PENTING: `pdfkit` + `fontkit` sudah menangani shaping & arah RTL **asalkan**
 * opsi `features` diberikan saat memanggil `doc.text()`. Tanpa `features`,
 * PDFKit memecah teks per-spasi dan menyusun kata dari kiri ke kanan (Arab jadi
 * terbaca LTR). Dengan `features` (mis. `[]`), PDFKit memakai `fontkit.layoutRun`
 * untuk seluruh string, dan fontkit membalik glyph untuk skrip RTL.
 *
 * Jadi: JANGAN reshape/bidi manual. Cukup kirim teks Unicode apa adanya +
 * `features: []`. Helper di sini hanya untuk deteksi skrip (perataan).
 */

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;

export function hasArabic(text) {
  ARABIC_RE.lastIndex = 0;
  return ARABIC_RE.test(String(text || ''));
}

export function arabicRatio(text) {
  const s = String(text || '');
  if (!s) return 0;
  const matches = s.match(ARABIC_RE);
  return (matches ? matches.length : 0) / s.length;
}

/** Menentukan apakah paragraf didominasi Arab (untuk perataan kanan). */
export function isMostlyArabic(text) {
  return arabicRatio(text) > 0.5;
}

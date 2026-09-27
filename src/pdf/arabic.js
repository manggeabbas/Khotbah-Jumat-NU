/**
 * Penanganan teks Arab untuk PDF:
 *  - shaping (menyambung huruf) via arabic-reshaper;
 *  - pengurutan visual (bidi/RTL) via bidi-js.
 *
 * CATATAN: `pdfkit` TIDAK melakukan shaping/bidi sendirian, sehingga langkah
 * ini wajib agar huruf Arab tersambung dan urutannya benar.
 */
import bidiFactory from 'bidi-js';
import reshaper from 'arabic-reshaper';

const { convertArabic } = reshaper;
const bidi = bidiFactory();

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

/**
 * Melakukan shaping + pengurutan bidi. Hanya karakter Arab yang diubah;
 * teks Latin dipertahankan.
 */
export function shapeArabic(text) {
  const input = String(text || '');
  if (!hasArabic(input)) return input;
  const shaped = convertArabic(input);
  const levels = bidi.getEmbeddingLevels(shaped);
  return bidi.getReorderedString(shaped, levels);
}

/** Menentukan apakah paragraf didominasi Arab (untuk perataan kanan). */
export function isMostlyArabic(text) {
  return arabicRatio(text) > 0.5;
}

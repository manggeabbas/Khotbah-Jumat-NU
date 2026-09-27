/**
 * Normalisasi & perluasan query pencarian.
 *
 * PENTING: normalisasi hanya diterapkan pada QUERY pengguna, bukan pada isi
 * artikel. Isi sumber tidak pernah diubah (PRD §7 Level 2).
 *
 * Sinonim diperluas (bukan diganti) agar recall tetap tinggi: query memuat
 * bentuk asli DAN bentuk normal.
 */

export const SYNONYMS = Object.freeze({
  shalat: 'salat',
  sholat: 'salat',
  solat: 'salat',
  salat: 'salat',
  rizki: 'rezeki',
  rizqi: 'rezeki',
  rezeki: 'rezeki',
  ujian: 'cobaan',
  musibah: 'cobaan',
  bencana: 'cobaan',
  cobaan: 'cobaan',
  akhlak: 'akhlak',
  akhlaq: 'akhlak',
  "jum'at": 'jumat',
  jumat: 'jumat',
  nabi: 'nabi',
  rasul: 'rasul',
  sedekah: 'sedekah',
  shadaqah: 'sedekah',
  sadaqah: 'sedekah',
  puasa: 'puasa',
  shaum: 'puasa',
});

export function normalizeTerm(term) {
  const t = String(term || '').toLowerCase().trim();
  return SYNONYMS[t] || t;
}

/**
 * Memecah query menjadi token + bentuk normalnya.
 * @param {string} query
 * @returns {string[]} daftar term unik
 */
export function expandQuery(query) {
  const tokens = String(query || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length >= 2);

  const terms = new Set();
  for (const token of tokens) {
    terms.add(token);
    const norm = normalizeTerm(token);
    if (norm) terms.add(norm);
  }
  return [...terms];
}

/**
 * Cleaner HTML -> blok teks terstruktur.
 *
 * Tujuan:
 *  - membuang navigasi, iklan, script, dan elemen non-konten;
 *  - mempertahankan paragraf, heading, teks Arab, transliterasi, dan urutan;
 *  - TIDAK mengubah substansi materi (hanya teks).
 */
import * as cheerio from 'cheerio';

const STRIP_TAGS = new Set(['script', 'style', 'noscript', 'iframe', 'ins', 'form', 'svg', 'button', 'nav', 'aside']);
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'pre', 'figcaption', 'td']);

const STRIP_CLASS_PATTERNS = [/\bprint:hidden\b/, /\bads?\b/i, /\bbanner\b/i, /\bshare\b/i, /\bsocial\b/i, /\brelated\b/i, /\bpromo\b/i];
const STRIP_ID_PATTERNS = [/^paragraph-news/i, /\brelated\b/i, /\bbaca-juga\b/i];

function isStrippedByAttr($, el) {
  const cls = ($(el).attr('class') || '') + ' ' + ($(el).attr('id') || '');
  if (STRIP_CLASS_PATTERNS.some((re) => re.test(cls))) return true;
  const id = $(el).attr('id') || '';
  if (STRIP_ID_PATTERNS.some((re) => re.test(id))) return true;
  // Blok "Baca Juga" (artikel terkait) di dalam body.
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'div' || tag === 'section') {
    const t = normalizeText($(el).text());
    if (/^baca juga\b/i.test(t)) return true;
  }
  return false;
}

export function normalizeText(input) {
  return String(input ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inlineText($, el) {
  const $clone = $(el).clone();
  $clone.find('br').replaceWith('\n');
  return normalizeText($clone.text());
}

function walk($, node, out) {
  for (const el of $(node).contents().toArray()) {
    if (el.type === 'text') {
      const t = normalizeText($(el).text());
      if (t) out.push({ tag: 'text', text: t });
      continue;
    }
    if (el.type !== 'tag') continue;
    const tag = (el.tagName || '').toLowerCase();
    if (STRIP_TAGS.has(tag)) continue;
    if (isStrippedByAttr($, el)) continue;
    if (BLOCK_TAGS.has(tag)) {
      const text = inlineText($, el);
      if (text) out.push({ tag, text });
    } else {
      walk($, el, out);
    }
  }
}

/**
 * @param {string} html
 * @returns {{ blocks: Array<{tag:string,text:string}>, text: string }}
 */
export function cleanHtmlBody(html) {
  const $ = cheerio.load(html || '', { decodeEntities: true });
  const blocks = [];
  walk($, $.root(), blocks);

  // Buang duplikat berurutan & teks yang hanya tanda baca.
  const cleaned = [];
  for (const b of blocks) {
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.text === b.text) continue;
    if (/^[\s\-–—_=•·.]+$/.test(b.text)) continue;
    cleaned.push(b);
  }

  const text = blocksToText(cleaned);
  return { blocks: cleaned, text };
}

function blocksToText(blocks) {
  return blocks
    .map((b) => {
      if (b.tag === 'li') return `• ${b.text}`;
      return b.text;
    })
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Deteksi blok heading penanda bagian khutbah ("Khutbah I", "Khutbah II").
 */
export function isKhutbahMarker(block) {
  return /^khutbah\s+(i|ii|1|2)\b/i.test(block.text.trim());
}

/**
 * Memisahkan blok menjadi bagian khutbah HANYA jika penanda ada.
 * Tidak mengarang bagian yang tidak ada.
 * @param {Array<{tag:string,text:string}>} blocks
 * @returns {{ khutbah1: string|null, khutbah2: string|null, full: string }}
 */
export function splitKhutbahSections(blocks) {
  const markers = [];
  blocks.forEach((b, i) => {
    if (isKhutbahMarker(b)) {
      const isTwo = /khutbah\s+(ii|2)\b/i.test(b.text);
      markers.push({ index: i, two: isTwo });
    }
  });

  const full = blocksToText(blocks);

  const first = markers.find((m) => !m.two);
  const second = markers.find((m) => m.two);

  if (!first && !second) {
    return { khutbah1: null, khutbah2: null, full };
  }

  let khutbah1 = null;
  let khutbah2 = null;

  if (first) {
    const end = second && second.index > first.index ? second.index : blocks.length;
    khutbah1 = blocksToText(blocks.slice(first.index + 1, end)) || null;
  }
  if (second) {
    khutbah2 = blocksToText(blocks.slice(second.index + 1)) || null;
  }
  return { khutbah1, khutbah2, full };
}

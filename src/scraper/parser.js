/**
 * Parser NU Online: listing + halaman artikel.
 *
 * Selector terverifikasi pada 2026-09-27 (lihat docs/BUILD_PROGRESS.md).
 * Selector terpusat di sini agar mudah diperbarui bila markup berubah.
 */
import * as cheerio from 'cheerio';
import { cleanHtmlBody, splitKhutbahSections, normalizeText } from './cleaner.js';

export const SELECTORS = Object.freeze({
  listingLink: 'a[href]',
  articleTitle: 'h1',
  articleBody: '#detail-content',
  bylineContains: 'WIB',
});

const ID_MONTHS = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
};

const ARTICLE_PATH = /^\/khutbah\/[^/]+\/?$/;

export function normalizeUrl(raw, base = 'https://islam.nu.or.id') {
  try {
    const u = new URL(raw, base);
    u.search = '';
    u.hash = '';
    let path = u.pathname.replace(/\/+$/, '');
    if (!path) path = '/';
    u.pathname = path;
    return u.toString();
  } catch {
    return null;
  }
}

/** Path segmen terakhir (slug) dari URL artikel; null bila bukan artikel. */
export function articleSlug(raw, base) {
  const norm = normalizeUrl(raw, base);
  if (!norm) return null;
  const u = new URL(norm);
  if (!ARTICLE_PATH.test(u.pathname)) return null;
  const seg = u.pathname.split('/').filter(Boolean).pop();
  if (!seg || /^\d+$/.test(seg)) return null; // pagination
  return seg;
}

/**
 * Mem-parse halaman listing.
 * @returns {{ items: Array<{url:string,title:string,dateText:string|null}>, nextPage: string|null }}
 */
export function parseListing(html, base = 'https://islam.nu.or.id') {
  const $ = cheerio.load(html || '');
  const items = [];
  const seen = new Set();

  $(SELECTORS.listingLink).each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const slug = articleSlug(href, base);
    if (!slug) return;
    const url = normalizeUrl(href, base);
    if (seen.has(url)) return;
    seen.add(url);

    let title = normalizeText($(el).find('h2').first().text());
    if (!title) title = normalizeText($(el).find('h3').first().text());
    if (!title) title = normalizeText($(el).find('img').attr('alt') || '');
    if (!title) title = normalizeText($(el).text());

    const container = $(el).closest('div').parent();
    const dateText = normalizeText(container.find('p').filter((__, p) => /WIB/i.test($(p).text())).first().text()) || null;

    items.push({ url, title, dateText });
  });

  return { items, nextPage: findNextPage($, base) };
}

function findNextPage($, base) {
  let next = null;
  $('a[href]').each((_, el) => {
    if (next) return;
    const href = $(el).attr('href');
    const rel = ($(el).attr('rel') || '').toLowerCase();
    const abs = normalizeUrl(href, base);
    if (!abs) return;
    const u = new URL(abs);
    if (!/^\/khutbah\/\d+$/.test(u.pathname)) return;
    const text = normalizeText($(el).text()).toLowerCase();
    if (rel.split(/\s+/).includes('next') || /next|berikut|selanjutnya|›|»/.test(text) || /^\d+$/.test(text)) {
      next = abs;
    }
  });
  return next;
}

/** Parse tanggal Indonesia: "Kamis, 24 September 2026 | 14:00 WIB". */
export function parseIndonesianDate(text) {
  if (!text) return null;
  const m = String(text).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*\|\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = ID_MONTHS[m[2].toLowerCase()];
  const year = Number(m[3]);
  if (!month) return null;
  const hour = m[4] !== undefined ? Number(m[4]) : 0;
  const minute = m[5] !== undefined ? Number(m[5]) : 0;
  // WIB = UTC+7.
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+07:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractAuthor($) {
  const meta = $('meta[name="author"]').attr('content');
  if (meta && normalizeText(meta)) return normalizeText(meta);
  let author = null;
  $('[class*="author"], [rel="author"]').each((_, el) => {
    if (author) return;
    const t = normalizeText($(el).text());
    const m = t.match(/penulis\s*:\s*(.+)/i);
    if (m) author = normalizeText(m[1]);
    else if (t && t.length < 80) author = t;
  });
  return author;
}

function extractByline($) {
  let byline = null;
  $('p, span, div').each((_, el) => {
    if (byline) return;
    const t = normalizeText($(el).text());
    if (t && t.includes(SELECTORS.bylineContains) && t.length < 120) byline = t;
  });
  return byline;
}

/**
 * Mem-parse halaman artikel menjadi objek artikel.
 * @returns {object}
 */
export function parseArticle(html, url, base = 'https://islam.nu.or.id') {
  const $ = cheerio.load(html || '');
  const canonical = normalizeUrl($('link[rel="canonical"]').attr('href') || url, base) || url;

  const title = normalizeText($(SELECTORS.articleTitle).first().text()) || normalizeText($('meta[property="og:title"]').attr('content') || '');
  const description =
    normalizeText($('meta[name="description"]').attr('content') || '') ||
    normalizeText($('meta[property="og:description"]').attr('content') || '') ||
    null;

  const byline = extractByline($);
  const published_at = parseIndonesianDate(byline);

  const bodyHtml = $(SELECTORS.articleBody).html() || '';
  const { blocks, text } = cleanHtmlBody(bodyHtml);
  const { khutbah1, khutbah2, full } = splitKhutbahSections(blocks);

  const category = normalizeText($('a[href*="/khutbah"]').first().text()) || 'Khutbah';

  return {
    title: title || null,
    url: canonical,
    author: extractAuthor($),
    published_at,
    language: 'id',
    description,
    snippet: null,
    category: category || null,
    content: full || null,
    khutbah_1: khutbah1,
    khutbah_2: khutbah2,
    source: 'NU Online',
    blocks,
    _hasMarkers: Boolean(khutbah1 || khutbah2),
  };
}

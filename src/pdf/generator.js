/**
 * Generator PDF lokal (A4) memakai pdfkit + font Unicode (Amiri: Latin + Arab +
 * harakat). pdfkit+fontkit menangani shaping & bidi Arab secara bawaan, jadi
 * teks cukup dikirim apa adanya (tanpa reshaper/bidi manual).
 *
 * Hanya dipakai bila FULL_CONTENT_ENABLED=true dan izin penggunaan dipastikan.
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizePdfFilename } from '../utils/text.js';
import { isMostlyArabic } from './arabic.js';
import { PdfError } from '../utils/errors.js';

const FONT_PATH = fileURLToPath(new URL('../../fonts/Amiri-Regular.ttf', import.meta.url));

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getUTCDate()} ${MONTHS_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * @param {{ config: object, logger?: object, outputDir?: string }} deps
 */
export function createPdfService({ config, logger, outputDir } = {}) {
  const dir = outputDir || path.join(process.cwd(), 'tmp');

  function renderParagraph(doc, text, { fontSize = 12, align } = {}) {
    const raw = String(text || '').trim();
    if (!raw) return;
    const alignment = align || (isMostlyArabic(raw) ? 'right' : 'left');
    // `features: []` memaksa fontkit.layoutRun (menangani shaping + arah RTL).
    doc.fontSize(fontSize).text(raw, { align: alignment, features: [], lineGap: 4, paragraphGap: 6 });
  }

  function generate(article) {
    return new Promise((resolve, reject) => {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        return reject(new PdfError(`Tidak dapat membuat direktori sementara: ${err.message}`, { cause: err }));
      }

      const filename = sanitizePdfFilename(article.title);
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filePath = path.join(dir, `${unique}-${filename}`);

      let doc;
      try {
        doc = new PDFDocument({
          size: 'A4',
          margins: { top: 56, bottom: 56, left: 56, right: 56 },
          bufferPages: true,
          info: { Title: article.title || 'Khutbah Jumat', Author: article.author || 'NU Online' },
        });
      } catch (err) {
        return reject(new PdfError(`Gagal membuat dokumen PDF: ${err.message}`, { cause: err }));
      }

      if (typeof doc.registerFont === 'function') {
        try {
          doc.registerFont('body', FONT_PATH);
          doc.font('body');
        } catch (err) {
          logger?.warn('[PDF] gagal memuat font Arab, memakai font bawaan', { error: err.message });
        }
      }

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Header
      doc.fontSize(16).text('KHUTBAH JUMAT', { align: 'center' });
      doc.moveDown(0.3);
      renderParagraph(doc, article.title || '-', { fontSize: 15, align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10);
      if (article.author) doc.text(`Penulis: ${article.author}`, { align: 'center' });
      doc.text(`Tanggal: ${formatDate(article.published_at)}`, { align: 'center' });
      if (article.category) doc.text(`Kategori: ${article.category}`, { align: 'center' });
      doc.moveDown(0.8);

      const blocks = [];
      if (article.khutbah_1 || article.khutbah_2) {
        if (article.khutbah_1) blocks.push({ heading: 'KHUTBAH I', body: article.khutbah_1 });
        if (article.khutbah_2) blocks.push({ heading: 'KHUTBAH II', body: article.khutbah_2 });
      } else {
        // Mode aman: content null, pakai cuplikan/deskripsi bila ada.
        const body = article.content || article.snippet || article.description || '';
        if (body) blocks.push({ heading: null, body });
      }

      for (const block of blocks) {
        if (block.heading) {
          doc.moveDown(0.5).fontSize(13).text(block.heading, { align: 'left' });
          doc.moveDown(0.3);
        }
        for (const para of String(block.body).split(/\n{2,}/)) {
          renderParagraph(doc, para);
        }
      }

      doc.moveDown(1);
      doc.fontSize(10).text('Sumber: NU Online', { align: 'left' });
      if (article.url) doc.fontSize(9).text(`URL artikel: ${article.url}`, { align: 'left' });

      // Footer nomor halaman.
      // PENTING: tulis di area margin bawah dengan margins.bottom=0 sementara,
      // agar PDFKit TIDAK menambah halaman baru (penyebab halaman ganda/kosong).
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const prevBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.fontSize(8).text(`Halaman ${i + 1} dari ${range.count}`, 56, doc.page.height - 40, {
          align: 'center',
          width: doc.page.width - 112,
          lineBreak: false,
        });
        doc.page.margins.bottom = prevBottom;
      }

      stream.on('finish', () => resolve({ path: filePath, filename }));
      stream.on('error', (err) => reject(new PdfError(`Gagal menulis PDF: ${err.message}`, { cause: err })));
      doc.on('error', (err) => reject(new PdfError(`Gagal membuat PDF: ${err.message}`, { cause: err })));

      doc.end();
    });
  }

  async function cleanup(filePath) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  return { generate, cleanup, fontPath: FONT_PATH, outputDir: dir };
}

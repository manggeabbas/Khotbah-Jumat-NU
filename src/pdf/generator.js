/**
 * Generator PDF lokal (A4) memakai pdfkit + font Unicode (Noto Naskh Arabic
 * yang mendukung Latin, Arab, dan harakat).
 *
 * Hanya dipakai bila FULL_CONTENT_ENABLED=true dan izin penggunaan dipastikan.
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizePdfFilename } from '../utils/text.js';
import { shapeArabic, isMostlyArabic, hasArabic } from './arabic.js';
import { PdfError } from '../utils/errors.js';

const FONT_PATH = fileURLToPath(new URL('../../fonts/NotoNaskhArabic-Regular.ttf', import.meta.url));

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

  function renderParagraph(doc, text, { fontSize = 12, bold = false, align } = {}) {
    const raw = String(text || '').trim();
    if (!raw) return;
    const isArabic = hasArabic(raw);
    const rendered = isArabic ? shapeArabic(raw) : raw;
    const alignment = align || (isMostlyArabic(raw) ? 'right' : 'left');
    doc.fontSize(fontSize).text(rendered, { align: alignment, lineGap: 4, paragraphGap: 6 });
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
      doc.moveDown(0.8);

      const blocks = [];
      if (article.khutbah_1 || article.khutbah_2) {
        if (article.khutbah_1) blocks.push({ heading: 'KHUTBAH I', body: article.khutbah_1 });
        if (article.khutbah_2) blocks.push({ heading: 'KHUTBAH II', body: article.khutbah_2 });
      } else if (article.content) {
        blocks.push({ heading: null, body: article.content });
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

      // Footer nomor halaman
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).text(`Halaman ${i + 1} dari ${range.count}`, 56, doc.page.height - 40, {
          align: 'center',
          width: doc.page.width - 112,
        });
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

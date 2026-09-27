import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createPdfService } from '../src/pdf/generator.js';
import { shapeArabic, hasArabic, isMostlyArabic, arabicRatio } from '../src/pdf/arabic.js';

const OUT = path.join(process.cwd(), 'tmp', 'pdf-test');
const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

after(() => {
  try {
    fs.rmSync(OUT, { recursive: true, force: true });
  } catch {
    /* abaikan */
  }
});

function hasBin(bin) {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAS_PDFTOTEXT = hasBin('pdftotext');
const HAS_PDFINFO = hasBin('pdfinfo');

function extractText(file) {
  return execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' });
}

function pageCount(file) {
  const out = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const m = out.match(/Pages:\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

const service = () => createPdfService({ config: {}, logger: silentLogger, outputDir: OUT });

test('arabic: deteksi & shaping', () => {
  assert.equal(hasArabic('Hello world'), false);
  assert.equal(hasArabic('السلام عليكم'), true);
  assert.equal(shapeArabic('Hello'), 'Hello');
  const shaped = shapeArabic('بِسْمِ اللَّهِ');
  assert.notEqual(shaped, 'بِسْمِ اللَّهِ');
  assert.ok(arabicRatio('السلام عليكم') > 0.5);
  assert.equal(isMostlyArabic('السلام عليكم'), true);
});

test('F-PDF-01: membuat PDF Indonesia yang valid', async () => {
  const svc = service();
  const { path: file } = await svc.generate({
    title: 'Sabar dalam Menghadapi Ujian',
    author: null,
    published_at: '2026-09-24T07:00:00.000Z',
    content: 'Isi khutbah tentang kesabaran menghadapi ujian hidup.',
    khutbah_1: 'Isi khutbah pertama tentang sabar.',
    khutbah_2: 'Isi khutbah kedua berisi doa penutup.',
    url: 'https://islam.nu.or.id/khutbah/x',
    source: 'NU Online',
  });
  assert.ok(fs.existsSync(file));
  assert.ok(fs.statSync(file).size > 500);
  if (HAS_PDFTOTEXT) {
    const text = extractText(file);
    assert.match(text, /KHUTBAH JUMAT/);
    assert.match(text, /Sabar dalam Menghadapi Ujian/);
    assert.match(text, /KHUTBAH I/);
    assert.match(text, /NU Online/);
  }
  await svc.cleanup(file);
});

test('F-PDF-02: PDF memuat teks Arab berharakat', async (t) => {
  if (!HAS_PDFTOTEXT) return t.skip('pdftotext tidak tersedia');
  const svc = service();
  const { path: file } = await svc.generate({
    title: 'Doa',
    content: 'Allah berfirman: بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    khutbah_1: 'اَللّٰهُمَّ صَلِّ عَلَى سَيِّدِنَا مُحَمَّدٍ',
    url: 'https://x',
  });
  const text = extractText(file);
  assert.match(text, /[\u0600-\u06FF\uFE70-\uFEFF]/, 'harus ada karakter Arab');
  await svc.cleanup(file);
});

test('F-PDF-03: dokumen multi-halaman', async (t) => {
  if (!HAS_PDFINFO) return t.skip('pdfinfo tidak tersedia');
  const svc = service();
  const long = Array.from({ length: 120 }, (_, i) => `Paragraf ${i} ` + 'kata '.repeat(30)).join('\n\n');
  const { path: file } = await svc.generate({ title: 'Panjang', content: long, url: 'https://x' });
  const pages = pageCount(file);
  assert.ok(pages >= 2, `harus multi-halaman, dapat ${pages}`);
  await svc.cleanup(file);
});

test('F-PDF-04: nama file aman (tanpa karakter ilegal)', async () => {
  const svc = service();
  const { path: file, filename } = await svc.generate({
    title: 'Sabar: "Ujian" / Hidup?',
    content: 'isi',
    url: 'https://x',
  });
  assert.ok(!/[<>:"/\\|?*]/.test(filename));
  assert.ok(filename.startsWith('Khutbah_Jumat_'));
  await svc.cleanup(file);
});

test('F-PDF-05: cleanup menghapus file sementara', async () => {
  const svc = service();
  const { path: file } = await svc.generate({ title: 'Hapus', content: 'isi', url: 'https://x' });
  assert.ok(fs.existsSync(file));
  await svc.cleanup(file);
  assert.equal(fs.existsSync(file), false);
  // cleanup ganda tidak melempar
  await svc.cleanup(file);
});

test('F-PDF-06: test visual halaman sampel', (t) => {
  t.skip('NOT_VERIFIED: inspeksi visual manual belum dilakukan');
});

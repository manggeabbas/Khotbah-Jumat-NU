import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, escapeMarkdownV2, slugify, sanitizePdfFilename } from '../src/utils/text.js';

test('U-HTML-01: escapeHtml menyamarkan karakter berbahaya', () => {
  assert.equal(escapeHtml('<b>&"x"</b>'), '&lt;b&gt;&amp;"x"&lt;/b&gt;');
});

test('U-HTML-02: escapeMarkdownV2', () => {
  const out = escapeMarkdownV2('a_b*c.d!');
  assert.equal(out, 'a\\_b\\*c\\.d\\!');
});

test('U-SLUG-01: slugify dari judul', () => {
  assert.equal(slugify('Sabar dalam Menghadapi Ujian!'), 'sabar-dalam-menghadapi-ujian');
  assert.equal(slugify('  --Héllo   Wörld-- '), 'hello-world');
});

test('U-FNAME-01: sanitasi nama file PDF ilegal', () => {
  const name = sanitizePdfFilename('Sabar: "Ujian" / Hidup?');
  assert.ok(!/[<>:"/\\|?*]/.test(name));
  assert.ok(name.startsWith('Khutbah_Jumat_'));
  assert.ok(name.endsWith('.pdf'));
});

test('U-FNAME-02: judul kosong -> fallback', () => {
  assert.equal(sanitizePdfFilename('   '), 'Khutbah_Jumat_Tanpa_Judul.pdf');
});

test('U-FNAME-03: nama reserved Windows diberi prefix', () => {
  const name = sanitizePdfFilename('CON');
  assert.equal(name, 'Khutbah_Jumat__CON.pdf');
});

test('U-FNAME-04: membatasi panjang nama file', () => {
  const name = sanitizePdfFilename('x'.repeat(300));
  assert.ok(name.length <= 120);
  assert.ok(name.endsWith('.pdf'));
});

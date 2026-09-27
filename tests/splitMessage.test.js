import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLongMessage, isHeading } from '../src/utils/splitMessage.js';

test('U-SPLIT-00: teks pendek -> satu bagian tanpa marker', () => {
  const out = splitLongMessage('Halo dunia');
  assert.deepEqual(out, ['Halo dunia']);
});

test('U-SPLIT-01: pesan panjang dipecah dan tiap bagian <= limit', () => {
  const paras = Array.from({ length: 40 }, (_, i) => `Paragraf ${i} ` + 'kata '.repeat(20).trim());
  const text = paras.join('\n\n');
  const out = splitLongMessage(text, { limit: 300 });
  assert.ok(out.length > 1);
  for (const chunk of out) assert.ok(chunk.length <= 300, `chunk terlalu panjang: ${chunk.length}`);
});

test('U-SPLIT-02: prioritaskan batas paragraf', () => {
  const text = 'AAA '.repeat(8).trim() + '\n\n' + 'BBB '.repeat(8).trim() + '\n\n' + 'CCC '.repeat(8).trim();
  const out = splitLongMessage(text, { limit: 40 });
  // Setiap bagian harus berakhir pada akhir paragraf jika memungkinkan.
  for (const chunk of out.slice(0, -1)) {
    assert.ok(/(AAA|BBB|CCC)\s*$/.test(chunk.replace(/\n+$/, '')), `tidak berakhir di paragraf: ${chunk}`);
  }
});

test('U-SPLIT-03: tidak memotong di tengah kata', () => {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota'];
  const text = words.join(' ');
  const out = splitLongMessage(text, { limit: 20 });
  const allowed = new Set(words);
  for (const chunk of out) {
    const last = chunk.trim().split(/\s+/).pop();
    assert.ok(allowed.has(last), `kata terpotong: "${last}"`);
  }
});

test('U-SPLIT-04: heading tidak terpisah dari kontennya (bukan baris terakhir)', () => {
  const text = 'KHUTBAH I\n\n' + 'Ini isi khutbah pertama. '.repeat(10).trim();
  const out = splitLongMessage(text, { limit: 60 });
  for (const chunk of out) {
    const lastLine = chunk.trim().split('\n').pop().trim();
    assert.ok(!isHeading(lastLine), `heading menjadi baris terakhir: ${JSON.stringify(chunk)}`);
  }
});

test('U-SPLIT-05: tidak memotong surrogate pair (emoji)', () => {
  const text = '🕌'.repeat(50);
  const out = splitLongMessage(text, { limit: 20 });
  for (const chunk of out) {
    assert.ok(chunk.length <= 20, `chunk melebihi limit: ${chunk.length}`);
    for (const cp of Array.from(chunk)) assert.equal(cp, '🕌');
    // Deteksi lone surrogate (surrogate pair yang terbelah).
    for (let i = 0; i < chunk.length; i++) {
      const code = chunk.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = chunk.charCodeAt(i + 1);
        assert.ok(next >= 0xdc00 && next <= 0xdfff, 'lone high surrogate');
        i++;
      } else {
        assert.ok(!(code >= 0xdc00 && code <= 0xdfff), 'lone low surrogate');
      }
    }
  }
});

test('U-SPLIT-06: penanda bagian Bagian x/y', () => {
  const text = Array.from({ length: 20 }, (_, i) => `Paragraf ${i} ` + 'kata '.repeat(15)).join('\n\n');
  const out = splitLongMessage(text, { limit: 400, partLabel: 'KHUTBAH I' });
  assert.ok(out.length > 1);
  out.forEach((chunk, i) => {
    assert.match(chunk, new RegExp(`Bagian ${i + 1}/${out.length}`));
    assert.match(chunk, /KHUTBAH I/);
  });
});

test('U-SPLIT-07: potong berbasis kalimat untuk paragraf sangat panjang', () => {
  const text = 'Kalimat satu. '.repeat(60).trim();
  const out = splitLongMessage(text, { limit: 100 });
  assert.ok(out.length > 1);
  for (const chunk of out) assert.ok(chunk.length <= 100);
});

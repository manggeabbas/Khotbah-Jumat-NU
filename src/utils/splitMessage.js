/**
 * Pemecah pesan panjang untuk Telegram.
 *
 * Aturan (PRD §11):
 *  1. Jangan memotong di tengah kata.
 *  2. Prioritaskan pemotongan berdasarkan paragraf.
 *  3. Jika paragraf terlalu panjang, potong berdasarkan kalimat.
 *  4. Jangan memisahkan heading dari kontennya.
 *  5. Berikan penanda bagian ("Bagian x/y").
 */

// Batas Telegram 4096; pakai margin aman.
const DEFAULT_LIMIT = 4000;

export function isHeading(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^khutbah\s+(i|ii|1|2)\b/i.test(t)) return true;
  if (/^#{1,6}\s/.test(t)) return true;
  // Baris pendek HURUF BESAR tanpa tanda baca akhir.
  if (t.length <= 40 && t === t.toUpperCase() && /[A-Z]/.test(t) && !/[.!?,;:]$/.test(t)) {
    return true;
  }
  return false;
}

function splitByCodePoints(str, limit) {
  // Menghindari memotong surrogate pair, sekaligus menjaga panjang UTF-16 <= limit.
  const points = Array.from(str);
  const out = [];
  let current = '';
  for (const ch of points) {
    if (current.length + ch.length > limit) {
      if (current) out.push(current);
      current = '';
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

function splitLongBlock(block, limit) {
  // 1) coba per kalimat
  const sentences = block.match(/[^.!?…]+[.!?…]+[\])'"”’]?\s*|[^.!?…]+$/g) || [block];
  const chunks = [];
  let current = '';
  const pushCurrent = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const sentence of sentences) {
    if (sentence.length > limit) {
      pushCurrent();
      // 2) per kata
      const words = sentence.split(/(\s+)/);
      let line = '';
      for (const w of words) {
        if ((line + w).length > limit) {
          if (line) chunks.push(line);
          if (w.length > limit) {
            // 3) pecah per code point (jangan belah surrogate pair)
            const parts = splitByCodePoints(w, limit);
            for (let i = 0; i < parts.length - 1; i++) chunks.push(parts[i]);
            line = parts[parts.length - 1];
          } else {
            line = w;
          }
        } else {
          line += w;
        }
      }
      if (line) chunks.push(line);
    } else if ((current + sentence).length > limit) {
      pushCurrent();
      current = sentence;
    } else {
      current += sentence;
    }
  }
  pushCurrent();
  return chunks;
}

/**
 * Menggabungkan heading yang berdiri sendiri dengan paragraf berikutnya agar
 * heading tidak pernah menjadi bagian terpisah dari isinya.
 */
function mergeHeadings(paragraphs) {
  const out = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (isHeading(p) && i + 1 < paragraphs.length) {
      out.push(`${p}\n${paragraphs[i + 1]}`);
      i++;
    } else {
      out.push(p);
    }
  }
  return out;
}

/**
 * Memecah teks menjadi beberapa bagian <= limit.
 * @param {string} text
 * @param {{ limit?: number, partLabel?: string }} [opts]
 * @returns {string[]}
 */
export function splitLongMessage(text, opts = {}) {
  const limit = Math.max(1, opts.limit || DEFAULT_LIMIT);
  const partLabel = opts.partLabel;
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Ruang untuk penanda "Bagian x/y".
  const reserve = partLabel ? partLabel.length + 24 : 0;
  const bodyLimit = Math.max(1, limit - reserve);

  const rawParagraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const paragraphs = mergeHeadings(rawParagraphs);

  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.replace(/\n+$/, '').trimEnd());
    current = '';
  };

  for (const block of paragraphs) {
    if (block.length > bodyLimit) {
      flush();
      const parts = splitLongBlock(block, bodyLimit);
      for (let i = 0; i < parts.length; i++) {
        if (i === parts.length - 1) current = parts[i];
        else chunks.push(parts[i].trimEnd());
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length > bodyLimit) {
      flush();
      current = block;
    } else {
      current = candidate;
    }
  }
  flush();

  if (chunks.length <= 1) return chunks;

  const total = chunks.length;
  return chunks.map((body, i) => {
    const marker = partLabel ? `📖 ${partLabel}\nBagian ${i + 1}/${total}\n\n` : '';
    return `${marker}${body}`;
  });
}

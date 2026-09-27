#!/usr/bin/env node
/**
 * Lint ringan & portabel (aman di Termux): memeriksa sintaks semua file .js
 * dengan `node --check`, dan menandai pola berisiko sederhana.
 * Tidak memerlukan dependency eksternal.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGETS = ['src', 'scripts', 'tests'];
const IGNORE = new Set(['node_modules', '.git', 'tmp', 'coverage']);

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (IGNORE.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

const files = TARGETS.flatMap((t) => walk(join(ROOT, t)));
let failed = 0;
const risky = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failed++;
    console.error(`✗ Sintaks gagal: ${rel}`);
    console.error(String(err.stderr || err.message).trim());
    continue;
  }
  const src = readFileSync(file, 'utf8');
  if (/console\.log\(/.test(src) && rel.startsWith('src/')) {
    risky.push(`${rel}: memakai console.log (pertimbangkan logger)`);
  }
}

if (risky.length) {
  console.warn('⚠  Catatan:');
  for (const r of risky) console.warn(`  - ${r}`);
}

if (failed > 0) {
  console.error(`\nLint GAGAL: ${failed} file bermasalah dari ${files.length} file.`);
  process.exit(1);
}
console.log(`✓ Lint OK: ${files.length} file diperiksa.`);

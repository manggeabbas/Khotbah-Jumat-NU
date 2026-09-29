/**
 * Backend SQLite (driver bawaan Node.js `node:sqlite`).
 *
 * Tidak ada native module / server database: `node:sqlite` disertakan dalam
 * Node.js (>= 22.5, stabil di >= 24) sehingga `npm install` tetap ringan dan
 * kompatibel dengan Termux tanpa proses build.
 *
 * Primitive di sini identik dengan backend lain, sehingga seluruh repository
 * (`repositories.js`) bekerja tanpa perubahan.
 */
import { DatabaseError } from '../utils/errors.js';
import { initDatabase } from './init.js';

const TABLES_WITH_UPDATED_AT = new Set(['articles']);
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Identitas kolom aman (dibungkus tanda kutip ganda). */
function quoteIdent(name) {
  if (name === '*') return '*';
  if (!IDENT_RE.test(name)) throw new DatabaseError(`Nama kolom tidak valid: "${name}"`);
  return `"${name}"`;
}

/** Null-prototype row dari `node:sqlite` -> objek biasa. */
function plain(row) {
  return row ? { ...row } : row;
}

/** Bangun klausa WHERE dari filter (dukung nilai tunggal, null, dan array IN). */
function buildWhere(filters) {
  const clauses = [];
  const params = [];
  for (const [col, val] of Object.entries(filters || {})) {
    if (val === undefined) continue;
    const q = quoteIdent(col);
    if (Array.isArray(val)) {
      if (val.length === 0) {
        clauses.push('1 = 0');
        continue;
      }
      clauses.push(`${q} IN (${val.map(() => '?').join(', ')})`);
      params.push(...val);
    } else if (val === null) {
      clauses.push(`${q} IS NULL`);
    } else {
      clauses.push(`${q} = ?`);
      params.push(val);
    }
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

/** Enkapsulasi karakter khusus LIKE agar istilah dicari secara literal. */
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Pembobotan bidang pencarian (judul > deskripsi/kategori > cuplikan/isi),
// diselaraskan dengan backend in-memory.
const SEARCH_FIELDS = Object.freeze([
  ['title', 4],
  ['description', 2],
  ['category', 2],
  ['snippet', 1],
  ['content', 1],
]);

/** Ekspresi skor + parameter untuk sekumpulan istilah. */
function buildScore(terms) {
  const parts = [];
  const params = [];
  for (const term of terms) {
    const pattern = `%${escapeLike(String(term).toLowerCase())}%`;
    for (const [col, weight] of SEARCH_FIELDS) {
      parts.push(`(CASE WHEN lower(coalesce(${col}, '')) LIKE ? ESCAPE '\\' THEN ${weight} ELSE 0 END)`);
      params.push(pattern);
    }
  }
  return { expr: parts.join(' + '), params };
}

/**
 * @param {{ path?: string }} opts
 * @param {{ logger?: object }} [deps]
 */
export function createSqliteStore({ path = 'data/khutbah.db' } = {}, { logger } = {}) {
  let db;
  try {
    // `initDatabase` membuka koneksi + menerapkan skema secara idempoten.
    ({ db } = initDatabase({ dbPath: path, logger }));
  } catch (err) {
    if (err instanceof DatabaseError) throw err;
    throw new DatabaseError(`Tidak dapat membuka SQLite: ${err?.message || err}`, { cause: err });
  }

  const run = (sql, params) => db.prepare(sql).run(...params);
  const all = (sql, params) => db.prepare(sql).all(...params).map(plain);

  const store = {
    kind: 'sqlite',
    db,
    path,

    async insert(table, row) {
      if (!row || typeof row !== 'object') throw new DatabaseError('insert: row wajib objek');
      const entries = Object.entries(row).filter(([, v]) => v !== undefined);
      if (entries.length === 0) throw new DatabaseError(`insert ${table}: tidak ada kolom`);
      const cols = entries.map(([c]) => quoteIdent(c)).join(', ');
      const marks = entries.map(() => '?').join(', ');
      const params = entries.map(([, v]) => v);
      try {
        const inserted = db.prepare(`INSERT INTO ${quoteIdent(table)} (${cols}) VALUES (${marks}) RETURNING *`).get(...params);
        return plain(inserted);
      } catch (err) {
        throw new DatabaseError(`insert ${table}: ${err?.message || err}`, { cause: err });
      }
    },

    async update(table, filters, patch) {
      const merged = { ...patch };
      if (TABLES_WITH_UPDATED_AT.has(table) && merged.updated_at === undefined) {
        merged.updated_at = new Date().toISOString();
      }
      const entries = Object.entries(merged).filter(([, v]) => v !== undefined);
      if (entries.length === 0) return [];
      const setSql = entries.map(([c]) => `${quoteIdent(c)} = ?`).join(', ');
      const setParams = entries.map(([, v]) => v);
      const where = buildWhere(filters);
      try {
        return all(
          `UPDATE ${quoteIdent(table)} SET ${setSql}${where.sql} RETURNING *`,
          [...setParams, ...where.params],
        );
      } catch (err) {
        throw new DatabaseError(`update ${table}: ${err?.message || err}`, { cause: err });
      }
    },

    async select(table, { filters, order, limit, offset, columns } = {}) {
      const cols =
        columns && columns !== '*'
          ? String(columns)
              .split(',')
              .map((c) => quoteIdent(c.trim()))
              .join(', ')
          : '*';
      const where = buildWhere(filters);
      let sql = `SELECT ${cols} FROM ${quoteIdent(table)}${where.sql}`;
      const params = [...where.params];
      if (order?.column) {
        const dir = order.ascending === false ? 'DESC' : 'ASC';
        sql += ` ORDER BY ${quoteIdent(order.column)} ${dir} NULLS LAST`;
        if (order.column !== 'id') sql += `, "id" ${dir}`;
      }
      if (typeof limit === 'number') {
        sql += ' LIMIT ? OFFSET ?';
        params.push(limit, typeof offset === 'number' ? offset : 0);
      } else if (typeof offset === 'number' && offset > 0) {
        sql += ' LIMIT -1 OFFSET ?';
        params.push(offset);
      }
      try {
        return all(sql, params);
      } catch (err) {
        throw new DatabaseError(`select ${table}: ${err?.message || err}`, { cause: err });
      }
    },

    async selectOne(table, filters) {
      const rows = await store.select(table, { filters, limit: 1 });
      return rows[0] || null;
    },

    async count(table, filters) {
      const where = buildWhere(filters);
      try {
        const row = db.prepare(`SELECT count(*) AS n FROM ${quoteIdent(table)}${where.sql}`).get(...where.params);
        return Number(row?.n) || 0;
      } catch (err) {
        throw new DatabaseError(`count ${table}: ${err?.message || err}`, { cause: err });
      }
    },

    async delete(table, filters) {
      const where = buildWhere(filters);
      try {
        run(`DELETE FROM ${quoteIdent(table)}${where.sql}`, where.params);
      } catch (err) {
        throw new DatabaseError(`delete ${table}: ${err?.message || err}`, { cause: err });
      }
    },

    async searchArticles({ terms, limit, offset }) {
      const queryTerms = (terms || [])
        .flatMap((t) => String(t).toLowerCase().split(/\s+/))
        .filter(Boolean);
      if (queryTerms.length === 0) return { total: 0, items: [] };

      const { expr, params } = buildScore(queryTerms);
      const base = `SELECT *, (${expr}) AS _score FROM articles WHERE status = 'active'`;
      try {
        const totalRow = db.prepare(`SELECT count(*) AS n FROM (${base}) WHERE _score > 0`).get(...params);
        const total = Number(totalRow?.n) || 0;
        const start = typeof offset === 'number' ? offset : 0;
        const rows = all(
          `SELECT * FROM (${base}) WHERE _score > 0 ORDER BY _score DESC, published_at DESC, id DESC LIMIT ? OFFSET ?`,
          [...params, limit, start],
        );
        return { total, items: rows.map(({ _score, ...rest }) => rest) };
      } catch (err) {
        throw new DatabaseError(`search articles: ${err?.message || err}`, { cause: err });
      }
    },

    async latestArticles({ limit, offset = 0 }) {
      return store.select('articles', {
        filters: { status: 'active' },
        order: { column: 'published_at', ascending: false },
        limit,
        offset,
      });
    },

    /** Cek koneksi ringan (dipakai saat boot/admin). */
    async ping() {
      const row = db.prepare('SELECT 1 AS ok').get();
      return row?.ok === 1;
    },

    /** Tutup koneksi dengan benar (dipakai tes & shutdown). */
    close() {
      try {
        db.close();
      } catch (err) {
        logger?.warn?.('[DATABASE] gagal menutup SQLite', { error: err?.message });
      }
    },
  };

  return store;
}

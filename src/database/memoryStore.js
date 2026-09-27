/**
 * Backend in-memory dengan primitive yang sama seperti SupabaseStore.
 * Dipakai untuk tes dan mode demo tanpa kredensial.
 */
function clone(row) {
  return row ? { ...row } : row;
}

function matchRow(row, filters) {
  for (const [col, val] of Object.entries(filters || {})) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      if (!val.includes(row[col])) return false;
    } else if (row[col] !== val) {
      return false;
    }
  }
  return true;
}

function compare(a, b, column, ascending) {
  const av = a[column];
  const bv = b[column];
  if (av === bv) return 0;
  if (av === null || av === undefined) return 1;
  if (bv === null || bv === undefined) return -1;
  const cmp = av < bv ? -1 : 1;
  return ascending ? cmp : -cmp;
}

export function createMemoryStore({ now = () => new Date().toISOString() } = {}) {
  const tables = new Map();
  const sequences = new Map();

  const table = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };
  const nextId = (name) => {
    const n = (sequences.get(name) || 0) + 1;
    sequences.set(name, n);
    return n;
  };

  const store = {
    kind: 'memory',
    tables,

    async insert(t, row) {
      const record = { ...row };
      if (record.id === undefined) record.id = nextId(t);
      if (record.created_at === undefined) record.created_at = now();
      table(t).push(record);
      return clone(record);
    },

    async update(t, filters, patch) {
      const rows = table(t);
      const updated = [];
      for (let i = 0; i < rows.length; i++) {
        if (matchRow(rows[i], filters)) {
          const merged = { ...rows[i], ...patch };
          if ('updated_at' in merged) merged.updated_at = now();
          rows[i] = merged;
          updated.push(clone(merged));
        }
      }
      return updated;
    },

    async select(t, { filters, order, limit, offset, columns } = {}) {
      let rows = table(t).filter((r) => matchRow(r, filters));
      if (order) {
        const ascending = order.ascending !== false;
        rows = [...rows].sort((a, b) => {
          const c = compare(a, b, order.column, ascending);
          if (c !== 0) return c;
          // Tie-breaker deterministik: id mengikuti arah yang sama.
          if (a.id !== undefined && b.id !== undefined) return compare(a, b, 'id', ascending);
          return 0;
        });
      }
      const start = typeof offset === 'number' ? offset : 0;
      if (typeof limit === 'number') rows = rows.slice(start, start + limit);
      else if (start > 0) rows = rows.slice(start);
      if (columns && columns !== '*') {
        const cols = String(columns).split(',').map((c) => c.trim());
        rows = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
      }
      return rows.map(clone);
    },

    async selectOne(t, filters) {
      const rows = await store.select(t, { filters, limit: 1 });
      return rows[0] || null;
    },

    async count(t, filters) {
      return table(t).filter((r) => matchRow(r, filters)).length;
    },

    async delete(t, filters) {
      const rows = table(t);
      const kept = rows.filter((r) => !matchRow(r, filters));
      tables.set(t, kept);
    },

    async searchArticles({ terms, limit, offset }) {
      const queryTerms = (terms || [])
        .flatMap((t) => String(t).toLowerCase().split(/\s+/))
        .filter(Boolean);
      const scored = [];
      for (const a of table('articles')) {
        if (a.status !== 'active') continue;
        let score = 0;
        const fields = [
          [a.title, 4],
          [a.description, 2],
          [a.category, 2],
          [a.snippet, 1],
          [a.content, 1],
        ];
        for (const term of queryTerms) {
          for (const [value, weight] of fields) {
            if (value && String(value).toLowerCase().includes(term)) score += weight;
          }
        }
        if (score > 0) scored.push({ row: a, score });
      }
      scored.sort((x, y) => {
        if (y.score !== x.score) return y.score - x.score;
        return compare(x.row, y.row, 'published_at', false);
      });
      const items = scored.slice(offset, offset + limit).map((s) => clone(s.row));
      return { total: scored.length, items };
    },

    async latestArticles({ limit, offset }) {
      return store.select('articles', {
        filters: { status: 'active' },
        order: { column: 'published_at', ascending: false },
        limit,
        offset,
      });
    },

    async ping() {
      return true;
    },
  };

  return store;
}

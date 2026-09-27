/**
 * State sesi per pengguna (in-memory) dengan TTL.
 * Dipisah dari transport agar mudah dites.
 */
export function createSessionStore({ ttlMs = 30 * 60 * 1000, now = Date.now } = {}) {
  const map = new Map();

  function get(userId) {
    const entry = map.get(String(userId));
    if (!entry) return null;
    if (now() - entry.updatedAt > ttlMs) {
      map.delete(String(userId));
      return null;
    }
    return entry.data;
  }

  function set(userId, data) {
    map.set(String(userId), { data, updatedAt: now() });
    return data;
  }

  function update(userId, patch) {
    const current = get(userId) || {};
    return set(userId, { ...current, ...patch });
  }

  function clear(userId) {
    return set(userId, {});
  }

  function size() {
    return map.size;
  }

  return { get, set, update, clear, size };
}

export const DEFAULT_SESSION = Object.freeze({
  state: 'idle',
  lastQuery: null,
  lastResults: [],
  page: 0,
  lastArticleId: null,
});

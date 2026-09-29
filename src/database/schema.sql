-- ============================================================================
-- SQLite schema — Bot Khutbah Jumat
--
-- Menggantikan skema Supabase PostgreSQL. Struktur data, relasi, UNIQUE, dan
-- CHECK dipertahankan. Timestamp disimpan sebagai TEXT ISO-8601 (UTC), sama
-- dengan format `new Date().toISOString()` yang dipakai aplikasi.
--
-- Reproducible & idempoten: aman dijalankan berulang kali.
-- Diterapkan lewat `npm run db:init` atau saat boot (`applySchema`).
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- articles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS articles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  slug           TEXT,
  url            TEXT NOT NULL,
  author         TEXT,
  published_at   TEXT,
  language       TEXT DEFAULT 'id',
  description    TEXT,
  snippet        TEXT,
  category       TEXT,
  content        TEXT,
  khutbah_1      TEXT,
  khutbah_2      TEXT,
  image_url      TEXT,
  source         TEXT NOT NULL DEFAULT 'NU Online',
  content_hash   TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  last_synced_at TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT articles_status_check CHECK (status IN ('active', 'parse_failed', 'archived')),
  CONSTRAINT articles_url_not_blank CHECK (length(trim(url)) > 0)
);

-- UNIQUE url => mencegah duplikasi artikel oleh scraper.
CREATE UNIQUE INDEX IF NOT EXISTS articles_url_key ON articles (url);
CREATE INDEX IF NOT EXISTS articles_published_at_idx ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS articles_status_idx ON articles (status);
CREATE INDEX IF NOT EXISTS articles_content_hash_idx ON articles (content_hash);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id    INTEGER NOT NULL,
  username       TEXT,
  first_name     TEXT,
  last_name      TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_active_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT users_telegram_id_positive CHECK (telegram_id > 0)
);
-- Telegram User ID harus UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_key ON users (telegram_id);
CREATE INDEX IF NOT EXISTS users_last_active_idx ON users (last_active_at DESC);

-- ---------------------------------------------------------------------------
-- favorites (anti-duplikat per user+artikel)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT favorites_user_article_key UNIQUE (user_id, article_id)
);
CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  opened_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS history_user_idx ON history (user_id, opened_at DESC);

-- ---------------------------------------------------------------------------
-- search_logs (ringan, tanpa data sensitif yang tak perlu)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users (id) ON DELETE SET NULL,
  query        TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CONSTRAINT search_logs_query_len CHECK (length(query) <= 500),
  CONSTRAINT search_logs_result_count_valid CHECK (result_count >= 0)
);
CREATE INDEX IF NOT EXISTS search_logs_created_idx ON search_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- sync_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at       TEXT,
  articles_found    INTEGER NOT NULL DEFAULT 0,
  articles_inserted INTEGER NOT NULL DEFAULT 0,
  articles_updated  INTEGER NOT NULL DEFAULT 0,
  articles_failed   INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'running',
  error_message     TEXT,
  CONSTRAINT sync_logs_status_check CHECK (status IN ('running', 'success', 'partial', 'failed')),
  CONSTRAINT sync_logs_counts_valid CHECK (
    articles_found >= 0 AND articles_inserted >= 0 AND
    articles_updated >= 0 AND articles_failed >= 0
  )
);
CREATE INDEX IF NOT EXISTS sync_logs_started_idx ON sync_logs (started_at DESC);

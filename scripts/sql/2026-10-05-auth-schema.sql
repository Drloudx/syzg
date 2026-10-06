-- 账号体系迁移 · 第 1 步 / 共 3 步：建表 + 建**不依赖新列的**索引
--
-- ⚠️ 按顺序跑：本文件 → `-columns.sql` → `-indexes.sql`。
--    三步各自的失败模式不同，混在一起会互相掩盖（见各文件顶部的说明）。
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-05-auth-schema.sql
--
-- ===============================================================
-- 本文件**完全幂等**，可反复跑。
-- ===============================================================
--
-- ---------------------------------------------------------------
-- 🔴 为什么建表必须在最前面（这个顺序原来写反过）
--
-- 最初的版本把 `ALTER TABLE users ADD COLUMN pw_salt` 写在
-- `CREATE TABLE users` **之前**。本地一直没暴露，因为本地库早就建过 `users`；
-- 而在**生产库**上它会报 `no such table: users`，而 D1 执行文件时
-- **一条失败就中止后续** —— 于是四张表一张都没建，账号功能整体不可用。
--
-- 这个是"迁移演练"抓出来的：在**旧 schema 的副本**上真跑一遍迁移。
-- 开发库早就迁完了，所以这类问题在开发环境**永远测不到**。
-- ---------------------------------------------------------------

-- 1) 账号四表。定义与 `schema.sql` 保持一致；这里重复一份，是为了让
--    "只想做增量迁移"的人不必连着 `schema.sql` 里那些历史注释一起读。
--
--    注意 `users` **自带 `pw_salt`** —— 所以第 2 步里那条
--    `ALTER TABLE users ADD COLUMN pw_salt` 对生产库是多余的动作。

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  public_no      INTEGER NOT NULL UNIQUE,
  email          TEXT    NOT NULL,
  email_hash     TEXT    NOT NULL UNIQUE,
  nick           TEXT    NOT NULL UNIQUE,
  avatar         TEXT    DEFAULT 'at001_0',
  verifier_hash  TEXT    NOT NULL,
  pw_salt        TEXT    NOT NULL DEFAULT '',
  pw_algo        TEXT    NOT NULL,
  pw_iters       INTEGER NOT NULL,
  pepper_ver     INTEGER NOT NULL DEFAULT 1,
  status         INTEGER NOT NULL DEFAULT 1,
  replies_read_at INTEGER DEFAULT NULL,
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER DEFAULT NULL,
  pw_changed_at  INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT    NOT NULL,
  purpose    TEXT    NOT NULL,
  code_hash  TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS captchas (
  id         TEXT    PRIMARY KEY,
  answer     TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER DEFAULT NULL,
  ua_hash      TEXT    DEFAULT NULL,
  ip_hash      TEXT    DEFAULT NULL
);

-- 2) 只建**不依赖第 2 步新列**的索引。
--    `idx_comments_user` / `idx_comments_parent` 依赖 `comments.user_id`，
--    要等第 2 步加完列才能建 —— 放在 `-indexes.sql` 里。
--    （写在一起过：结果在旧库上直接 `no such column: user_id`，
--      一条失败就把后面三个索引全带走了。）

CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup ON auth_codes(email_hash, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions(user_id);

-- 3) 自检：四张表都该在
SELECT '第 1 步完成：四张表' AS note;
SELECT name FROM sqlite_master
 WHERE type = 'table' AND name IN ('users', 'auth_codes', 'captchas', 'sessions')
 ORDER BY name;

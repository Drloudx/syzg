-- 迁移前的生产库表结构（**冻结的夹具，不要再改**）
--
-- 用途：`tests/migration/rehearse.mjs` 造一个「旧生产库」，验证
-- `scripts/sql/2026-10-05-auth-*.sql` 三步迁移能把它升级成当前 `schema.sql`。
--
-- 为什么把它冻成文件，而不是 `git show <hash>:schema.sql`：
-- 迁移演练必须能在**任何一次 clone** 上跑。原先脚本硬编码提交 `0c745272`，
-- 而 2026-10-07 的历史整理把它并进了按天提交 —— 新克隆里那个 hash 不存在，
-- 演练会直接失败。夹具文件不依赖任何提交，历史怎么整理都不受影响。
--
-- 内容 = 加账号体系**之前**那一版的 schema.sql（仅 comments / rate_limits 两表），
-- 已用 `git show 0c745272:schema.sql` 逐字节核对。

-- 评论功能 D1 表结构
-- 应用：wrangler d1 execute myrzg-comments --file=./schema.sql --remote
-- 设计依据见 docs/technical/COMMENTS_BACKEND.md 第四节。
--
-- 全部使用 IF NOT EXISTS，可重复执行（幂等）。

-- 评论主表
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key   TEXT    NOT NULL,            -- 'item:30047'
  parent_id  INTEGER DEFAULT NULL,        -- 引用式回复：被回复那条评论的 id（NULL = 普通评论）
  nick       TEXT    NOT NULL,
  email_hash TEXT    DEFAULT NULL,        -- SHA-256，绝不留明文邮箱
  body       TEXT    NOT NULL,
  status     INTEGER NOT NULL DEFAULT 1,  -- 1 正常 / 0 待审 / 2 已隐藏（软删除）
  created_at INTEGER NOT NULL,            -- Unix 秒
  ip_hash    TEXT    NOT NULL,            -- SHA-256(ip + 服务端盐)，仅限流与追溯
  ua_hash    TEXT    DEFAULT NULL,
  token_hash TEXT    DEFAULT NULL,        -- 浏览器自删令牌的 SHA-256
  review_reason TEXT DEFAULT NULL,        -- 命中的审核词表类别，干净为 NULL
  avatar     TEXT    DEFAULT NULL,        -- 头像 ID
  page_label TEXT    DEFAULT NULL         -- 评论所在页面的人话名字
);

-- 列表查询：按 page_key + status 过滤、created_at 倒序
CREATE INDEX IF NOT EXISTS idx_comments_page
  ON comments(page_key, status, created_at DESC);

-- 限流按小时桶 UPSERT，避免每次留言新增一行
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket  TEXT    NOT NULL,               -- 'ip:<sha256>:<YYYYMMDDHH>'
  counter INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket)
);

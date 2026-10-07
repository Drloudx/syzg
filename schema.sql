-- 评论功能 D1 表结构
-- 应用：wrangler d1 execute myrzg-comments --file=./schema.sql --remote
-- 设计依据见 docs/technical/COMMENTS_BACKEND.md 第四节。
--
-- 全部使用 IF NOT EXISTS，可重复执行（幂等）。
-- 注意：D1 的写入按「行」计费，索引写入也算行。本文件只建 2 个索引，
-- 新增索引前请先读方案 2.2 节，确认仍在免费额度内。

-- 评论主表
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page_key   TEXT    NOT NULL,            -- 'item:30047'
  parent_id  INTEGER DEFAULT NULL,        -- 引用式回复：被回复那条评论的 id（NULL = 普通评论，一期预留、2026-10-04 启用）
  nick       TEXT    NOT NULL,
  email_hash TEXT    DEFAULT NULL,        -- SHA-256，绝不留明文邮箱
  body       TEXT    NOT NULL,
  status     INTEGER NOT NULL DEFAULT 1,  -- 1 正常 / 0 待审 / 2 已隐藏（软删除）
  created_at INTEGER NOT NULL,            -- Unix 秒
  ip_hash    TEXT    NOT NULL,            -- SHA-256(ip + 服务端盐)，仅限流与追溯
  ua_hash    TEXT    DEFAULT NULL,
  token_hash TEXT    DEFAULT NULL,        -- 浏览器自删令牌的 SHA-256；明文只回给浏览器一次
  review_reason TEXT DEFAULT NULL,        -- 命中的审核词表类别（'外链'/'赌博'…），干净为 NULL
  avatar     TEXT    DEFAULT NULL,        -- 头像 ID（如 avatar_pet_006），路径由 avatarCatalog.json 查
  page_label TEXT    DEFAULT NULL,        -- 评论所在页面的人话名字（如「银币」），发表时随评论存下
  -- 🔴 账号体系（2026-10-05）：评论挂在 users 上。
  --    可空 —— 账号体系**之前**的匿名评论不该被硬塞一个归属。
  --    ⚠️ 这一列**必须写进建表语句**，不能只留下面那条注释形式的 ALTER：
  --    本文件末尾要建 `idx_comments_user ON comments(user_id)`，
  --    全新库上那一列若不存在，索引会直接报 `no such column: user_id`，
  --    整个文件从这里断掉（D1 执行文件时一条失败就中止后续）。
  --    这个是"迁移演练"在旧 schema 副本上跑时顺带发现的。
  user_id    INTEGER DEFAULT NULL
);

-- 增量迁移（建库时已含上面字段则可忽略；D1 不支持 ADD COLUMN IF NOT EXISTS，
-- 重复执行会报 "duplicate column name"，属预期，不影响已有数据）：
--   ALTER TABLE comments ADD COLUMN token_hash TEXT DEFAULT NULL;
--   ALTER TABLE comments ADD COLUMN review_reason TEXT DEFAULT NULL;
--   ALTER TABLE comments ADD COLUMN avatar TEXT DEFAULT NULL;
--   ALTER TABLE comments ADD COLUMN page_label TEXT DEFAULT NULL;
--   ALTER TABLE comments ADD COLUMN user_id INTEGER DEFAULT NULL;   -- 账号体系，见下
--
-- ⚠️ 这几条**只是留给"老库补列"的备忘**，默认注释掉。上面建表语句里已经包含它们，
--    全新库不需要跑。真正要给老库补列时，用按依赖顺序拆好的三步脚本：
--      scripts/sql/2026-10-05-auth-schema.sql    (建表 + 不依赖新列的索引)
--      scripts/sql/2026-10-05-auth-columns.sql   (加列)
--      scripts/sql/2026-10-05-auth-indexes.sql   (建依赖新列的索引)
--
-- 回复（2026-10-04）**不需要迁移**：直接用建表时就预留的 `parent_id`。
-- 引用式回复（不是楼中楼）——被回复的内容通过自连接按主键读出来，
-- 所以**不需要** `parent_id` 上的索引，也不需要新的表。设计见方案第五章「回复」。
--
-- 说明：`email_hash` 列保留但不再使用（2026-10-02 起头像改为选游戏头像，
-- 不再用邮箱哈希拼 Gravatar——那需要把标识发给第三方，与"不存明文邮箱"自相矛盾，
-- 且国内用户基本没有 Gravatar 账号，拿到的是随机几何图）。
-- 保留列而不 DROP：SQLite 删列代价高，且历史数据留着无害。

-- 列表查询：按 page_key + status 过滤、created_at 倒序
CREATE INDEX IF NOT EXISTS idx_comments_page
  ON comments(page_key, status, created_at DESC);

-- 限流按小时桶 UPSERT，避免每次留言新增一行
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket  TEXT    NOT NULL,               -- 'ip:<sha256>:<YYYYMMDDHH>'
  counter INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket)
);

-- ============================================================
-- 账号体系（2026-10-05）
-- 设计依据见 docs/technical/ACCOUNT_SYSTEM.md（22 项决策在 §14.1）
-- ============================================================

-- 用户主表
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  public_no      INTEGER NOT NULL UNIQUE,     -- 对外展示的 5 位编号（10000 起，顺次递增、公开）
  email          TEXT    NOT NULL,            -- 明文：要发信，且用户要能看见/换自己的邮箱
  email_hash     TEXT    NOT NULL UNIQUE,     -- HMAC-SHA256(SALT_SECRET, normalize(email))，查询与去重
  nick           TEXT    NOT NULL UNIQUE,     -- 昵称**全站唯一**
  avatar         TEXT    DEFAULT 'at001_0',   -- 默认「希尔（女主）」；复用评论的头像 ID 体系
  -- 密码：只存 verifier 的派生值，**永远不存密码，也不存 verifier 本身**
  verifier_hash  TEXT    NOT NULL,            -- HMAC-SHA256(AUTH_PEPPER, verifier)
  -- 🔴 密码盐**必须存下来**，不能每次从邮箱现算。
  --    原因：盐是按邮箱派生的（salt = HMAC(SALT_SECRET, 'salt:'+邮箱)），
  --    而"换邮箱"会换掉邮箱 —— 现算的话盐就变了，用户**换完邮箱再也登不上**
  --    （库里存的 verifier_hash 是按旧盐算的）。
  --    这个 bug 是端到端测试跑出来的：单测每个函数都对，连起来才暴露。
  --    盐不是秘密（它本来就随 /api/auth/salt 公开返回），所以明文存没问题。
  pw_salt        TEXT    NOT NULL DEFAULT '', -- 注册时客户端实际用的那个盐
  pw_algo        TEXT    NOT NULL,            -- 'client-pbkdf2-sha256'（将来换服务端 KDF 时改这里）
  pw_iters       INTEGER NOT NULL,            -- 600000，如实记录，便于将来判断是否需要迁移
  pepper_ver     INTEGER NOT NULL DEFAULT 1,  -- AUTH_PEPPER 轮换预留
  status         INTEGER NOT NULL DEFAULT 1,  -- 1 正常 / 2 封禁 / 3 已注销（软删除）
  -- 后台角色。0 普通 / 1 管理员 / 2 超级管理员。
  -- 🔴 默认 0：新库里**没有任何管理员**，超管由手工 SQL 设出（见
  --    scripts/sql/2026-10-07-admin-role.sql 末尾）。绝不做"第一个注册的自动当管理员"
  --    —— 那是竞态漏洞，谁先注册谁当。
  role           INTEGER NOT NULL DEFAULT 0,
  replies_read_at INTEGER DEFAULT NULL,       -- 「回复我的」未读数基准（免去另建已读表）
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER DEFAULT NULL,
  pw_changed_at  INTEGER DEFAULT NULL
);
-- email_hash / nick / public_no 上的 UNIQUE 已隐含索引，不再另建。
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 管理操作审计
--
-- 🔴 为什么必须记：引入"多个管理员"之后没有账本就无法追责 —— 谁能封号、
--    谁能彻底删用户、谁能改角色，出问题时必须能查出"是谁做的"。
--    只记**管理动作**，普通用户发评论等不进这张表。
--
-- `actor_nick` / `actor_role` 是**快照**：操作者事后改名或降级，
-- 历史记录仍应显示"当时是谁、以什么身份做的"。
CREATE TABLE IF NOT EXISTS admin_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER NOT NULL,           -- 操作者的 users.id（内部 id，不外露）
  actor_nick  TEXT    NOT NULL,
  actor_role  INTEGER NOT NULL,
  action      TEXT    NOT NULL,           -- ban | unban | user_delete | comment_hide
                                          -- | comment_show | comment_delete | role_set
  target_type TEXT    NOT NULL,           -- user | comment
  target_id   INTEGER NOT NULL,
  detail      TEXT    DEFAULT NULL,       -- 如角色变更 "1 -> 2"、评论正文摘要
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_time  ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit(actor_id, created_at DESC);

-- 邮箱验证码（短命、可重发）
--
-- 🔴 为什么**不**用 (email_hash, purpose) 做主键 + UPSERT 覆盖：
--   邮件到信时间是 **3 秒 ~ 5 分钟**，重发时两封会**乱序到达**（新码先到、旧码后到）。
--   若"重发即作废旧码"，用户打开先到的那封旧邮件输码会**无辜失败**。
--   所以允许同一 (邮箱, 用途) **最多 3 个有效码并存**，用 id 自增做主键。
CREATE TABLE IF NOT EXISTS auth_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email_hash TEXT    NOT NULL,
  purpose    TEXT    NOT NULL,        -- 'register' | 'password' | 'email_change'
  code_hash  TEXT    NOT NULL,        -- HMAC-SHA256(AUTH_PEPPER, code)；不存明文
  expires_at INTEGER NOT NULL,        -- 10 分钟
  created_at INTEGER NOT NULL
);
-- 校验时取该 (邮箱, 用途) **最近 3 条未过期**记录逐一比对；命中即删除该组合的全部记录。
-- 尝试次数**不存这里**，按**邮箱维度**记到 rate_limits（bucket = 'authfail:<email_hash>'）。
--
-- 🔴 为什么 code_hash 必须带 pepper，不能是裸 SHA-256：
--   验证码只有 6 位数字 = 100 万种可能。拿到库的人把 000000~999999 全算一遍 SHA-256
--   是**毫秒级**的事——对这么小的空间，裸哈希基本等于没哈希。
--   带 pepper 后，pepper 只存在 Worker 环境变量、**不在库里**，光偷到 D1 备份也破不了。
CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup
  ON auth_codes(email_hash, purpose, created_at DESC);

-- 人机验证（蛋点选）。与 auth_codes 同一套模式
CREATE TABLE IF NOT EXISTS captchas (
  id         TEXT    PRIMARY KEY,   -- 随机 token；前端拿到的就是 captchaId
  answer     TEXT    NOT NULL,      -- HMAC-SHA256(AUTH_PEPPER, 正确实例序号序列)
  expires_at INTEGER NOT NULL,      -- 3 分钟
  created_at INTEGER NOT NULL
);
-- 校验后**无论对错都立即删除该行**（一次性）——所以**不需要 attempts 计数**：
-- 「错 1 次即整题作废」，没有"同题内重试"这回事。

-- 会话
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT    PRIMARY KEY,   -- SHA-256(token)；明文只在登录响应里给一次
  user_id      INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,      -- 30 天，滑动过期
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER DEFAULT NULL,
  ua_hash      TEXT    DEFAULT NULL,
  ip_hash      TEXT    DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 评论挂账号
-- `user_id` 已经在**上面的建表语句里**（不能只留注释形式的 ALTER，理由见那一处）。
-- 给老库补列用 `scripts/sql/2026-10-05-auth-columns.sql`。
--
-- ⚠️ 下面两条索引**推翻了本文件早先的结论**。第 34~36 行原写"不需要 parent_id 上的索引"，
--    那是只考虑"按主键读父评论"的方向。现在新增了「我的评论」与「谁回复了我」两个功能，
--    **两个方向都要查**（按 user_id 找评论；按 parent_id 找子回复），所以两个索引都需要。
--    评论量极小，索引写入成本可忽略。
CREATE INDEX IF NOT EXISTS idx_comments_user   ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- ============================================================
-- ⚠️ 以下**不是建表**，是**一次性的测试数据清理**，默认注释掉。
-- 要执行时**单独**跑，别跟着上面的建表语句一起跑：
--   wrangler d1 execute myrzg-comments --file=./scripts/sql/reset-test-comments.sql --remote
--
-- 依据：线上评论表里有 id 17~24 共 8+ 条测试评论（全在 site:general，
-- 内容是 "dawdawd" 之类），是开发期自测留下的。
-- 同时本机身份退役 → 老匿名评论的自删令牌机制（comments.token_hash）一并退役，
-- 删评论改由账号（user_id）承担。token_hash 列**保留不用**（SQLite 删列代价高，留着无害）。
-- ============================================================
-- DELETE FROM comments;
-- DELETE FROM rate_limits;


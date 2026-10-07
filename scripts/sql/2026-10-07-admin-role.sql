-- 后台权限迁移 · 第 4 步：给 `users` 加 `role`，并新建 `admin_audit` 审计表
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-07-admin-role.sql
--
-- ⚠️ **必须先跑本文件、再推代码**（红线第 6 条）：新代码的 `isAdmin` 会读
--    `users.role`，列不存在时**所有管理接口都会 500**，后台直接不可用。
--
-- ===============================================================
-- 本文件的失败模式（都是"已迁过"的预期报错，不是真炸）：
--
--   `duplicate column name: role`  → 这一步跑过了
--   （`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` 幂等，不报错）
-- ===============================================================

-- ---------------------------------------------------------------
-- 1. 角色列
--
--   0 = 普通用户
--   1 = 管理员      —— 现有后台全部操作，但只能操作**角色比自己低**的账号
--   2 = 超级管理员  —— 额外可设/撤管理员；**不可被任何人操作**
--
-- 🔴 默认 0：迁移后**没有任何管理员**，需要手工把超管设出来（见文件末尾）。
--    绝不做"第一个注册的用户自动成为管理员" —— 那是竞态漏洞，谁先注册谁当。
-- ---------------------------------------------------------------
ALTER TABLE users ADD COLUMN role INTEGER NOT NULL DEFAULT 0;

-- 按角色筛用户（管理端"只看管理员"）用；量小但代价为零
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ---------------------------------------------------------------
-- 2. 管理操作审计
--
-- 🔴 为什么必须记：引入"多个管理员"之后，**没有账本就无法追责**。
--    谁能封号、谁能彻底删用户、谁能改角色 —— 出问题时必须能查出"是谁做的"。
--
-- 只记**管理动作**，不记普通用户的日常操作（发评论等不进这张表）。
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER NOT NULL,           -- 操作者的 users.id（内部 id，不外露）
  actor_nick  TEXT    NOT NULL,           -- 快照：操作者当时的昵称（改名后仍可追溯）
  actor_role  INTEGER NOT NULL,           -- 快照：操作时的角色
  action      TEXT    NOT NULL,           -- 'ban' | 'unban' | 'user_delete' | 'comment_hide'
                                          -- | 'comment_show' | 'comment_delete' | 'role_set'
  target_type TEXT    NOT NULL,           -- 'user' | 'comment'
  target_id   INTEGER NOT NULL,           -- 目标的内部 id
  detail      TEXT    DEFAULT NULL,       -- 补充信息（如角色变更 "1 -> 2"、评论正文摘要）
  created_at  INTEGER NOT NULL
);

-- 管理端按时间倒序看审计；按操作者筛也需要
CREATE INDEX IF NOT EXISTS idx_admin_audit_time   ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor  ON admin_audit(actor_id, created_at DESC);

-- ===============================================================
-- 3. 自检
-- ===============================================================
SELECT '第 4 步自检：users.role 应为 1' AS note;
SELECT COUNT(*) AS present FROM pragma_table_info('users') WHERE name = 'role';

SELECT '第 4 步自检：admin_audit 应为 1' AS note;
SELECT COUNT(*) AS present FROM sqlite_master WHERE type = 'table' AND name = 'admin_audit';

-- ===============================================================
-- 4. 🔴 手工设超管（**本文件不执行**，迁移后单独跑一次）
--
--    邮箱换成你自己的。跑之前先确认这一行确实是你：
--      SELECT id, public_no, nick, email FROM users WHERE email = '你的邮箱';
--    确认后：
--      UPDATE users SET role = 2 WHERE email = '你的邮箱';
--
--    紧急恢复（把自己误降级/误封后进不去后台时，在 Cloudflare 控制台或
--    本机执行这条即可，**这是删掉 ADMIN_TOKEN 后唯一的后路**）：
--      UPDATE users SET role = 2, status = 1 WHERE email = '你的邮箱';
-- ===============================================================

-- 封禁理由迁移 · 第 8 步：给 `users` 加 `ban_note`
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-09-user-ban-note.sql
--
-- ⚠️ **必须先跑本文件、再推代码**（红线第 6 条）：新代码的用户列表会读
--    `users.ban_note`，列不存在时**后台用户页直接 500**。
--
-- ===============================================================
-- 为什么加在 `users` 表而不是另建表：
--   一个账号**同时只可能有一个当前封禁状态**，与 `comments.review_note` 同理 ——
--   1:1 的字段放同表最简单，查询也不用 JOIN。
--
-- 语义：描述"这个账号**当前**为什么被停用"。
--   · 封禁（status=2）时写入，可空（有时就是"例行停用"）；
--   · **解封（status=1）时由服务端清空** —— 状态已定论，留着旧理由会误导后来人；
--   · 历史记录由 `admin_audit` 负责（每次封禁都会写一条），不靠这一列留存。
--
-- 🔴 面向管理员**内部**：不随登录错误返回给用户。
--    用户只会看到 `AERR.banned` 那一句「该账号已被停用」——
--    把理由透给刷广告的人等于把审核标准公开出去。
-- ===============================================================
-- 本文件的失败模式（"已迁过"的预期报错，不是真炸）：
--
--   `duplicate column name: ban_note`  → 这一步跑过了
-- ===============================================================

ALTER TABLE users ADD COLUMN ban_note TEXT DEFAULT NULL;

-- ===============================================================
-- 自检
-- ===============================================================
SELECT '第 8 步自检：users.ban_note 应为 1' AS note;
SELECT COUNT(*) AS present FROM pragma_table_info('users') WHERE name = 'ban_note';

SELECT '第 8 步自检：现有已停用账号的理由应为 0 条非空（迁移不回填历史）' AS note;
SELECT COUNT(*) AS filled FROM users WHERE ban_note IS NOT NULL;

-- 账号体系迁移 · 第 3 步 / 共 3 步：建**依赖新列**的索引
--
-- ⚠️ 必须在 `-columns.sql` 之后跑 —— 这两个索引引用 `comments.user_id`，
--    那一列是上一步加的。写在前面会直接 `no such column: user_id`。
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-05-auth-indexes.sql
--
-- ===============================================================
-- 本文件**完全幂等**，可反复跑。
-- ===============================================================
--
-- 这两条索引为什么需要（推翻了 `schema.sql` 早先"不需要 parent_id 索引"的结论）：
-- 当时只考虑"按主键读父评论"这一个方向；后来多了两个**反方向**的查询 ——
--   · 「我的评论」  → `WHERE user_id = ?`         （idx_comments_user）
--   · 「谁回复了我」→ 找某条评论的子回复 `parent_id = ?`（idx_comments_parent）

CREATE INDEX IF NOT EXISTS idx_comments_user   ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- 自检
SELECT '第 3 步完成：两个评论索引' AS note;
SELECT name FROM sqlite_master
 WHERE type = 'index' AND name IN ('idx_comments_user', 'idx_comments_parent')
 ORDER BY name;

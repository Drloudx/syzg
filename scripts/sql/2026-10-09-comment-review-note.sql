-- 评论「转待审原因」迁移 · 第 5 步：给 `comments` 加 `review_note`
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-09-comment-review-note.sql
--
-- ⚠️ **必须先跑本文件、再推代码**（红线第 6 条）：新代码的管理端列表会读
--    `comments.review_note`，列不存在时**后台评论页直接 500**。
--
-- ===============================================================
-- 这个字段与已有的 `review_reason` **不是一回事**（别混用）：
--
--   `review_reason`  系统**自动**判定 —— 命中审核词表时写下的类别（'外链'/'赌博'…）
--   `review_note`    管理员**手动**填写 —— 转待审时说明"为什么把它打回待办"
--
-- 两者可以同时存在（自动命中 + 人工补充），所以是**两列**而不是复用一列。
--
-- 语义：它描述"这条评论**当前为什么在待审队列里**"。
--   放行 / 隐藏后由服务端**清空**（状态已定论，留着旧备注会误导后来人）；
--   历史记录另有 `admin_audit` 表负责，不靠这一列留存。
-- ===============================================================
-- 本文件的失败模式（"已迁过"的预期报错，不是真炸）：
--
--   `duplicate column name: review_note`  → 这一步跑过了
--   （`CREATE INDEX` 是幂等的，不报错）
-- ===============================================================

ALTER TABLE comments ADD COLUMN review_note TEXT DEFAULT NULL;

-- ===============================================================
-- 自检
-- ===============================================================
SELECT '第 5 步自检：comments.review_note 应为 1' AS note;
SELECT COUNT(*) AS present FROM pragma_table_info('comments') WHERE name = 'review_note';

SELECT '第 5 步自检：旧评论的 review_note 应为 0 条非空（迁移不改写历史数据）' AS note;
SELECT COUNT(*) AS filled FROM comments WHERE review_note IS NOT NULL;

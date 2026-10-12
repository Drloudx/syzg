-- 转待审「常用选项」迁移 · 第 6 步：建 `review_note_presets` 表并播种默认项
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-09-review-presets.sql
--
-- 用途：后台「转待审」时给管理员几个**点一下就填**的常用原因，
--       由**超级管理员**维护（普通管理员只读）。自由输入仍然保留。
--
-- ===============================================================
-- 为什么是**独立表**而不是塞进一个 key-value 设置表：
--   这是一份**有序列表**（常用项排前面），还要逐条增删。
--   塞进 KV 就得"读出来改再写回去"，管理员同时编辑会互相覆盖；
--   独立表天然按行存、按 `sort_order` 排序，没有读改写竞态。
--
-- 为什么由**超管**维护：这些文案会出现在所有管理员的转待审界面里，
--   属于"审核口径"的一部分，不该让每个管理员各改一套。
--
-- ⚠️ 与 `comments.review_note` 的关系：那列存**这一条具体写了什么**，
--    本表存**可选的模板**。两者独立。
-- ===============================================================
-- 本文件**完全幂等**，重复执行不报错（与第 2/4/5 步不同）：
--   `CREATE TABLE IF NOT EXISTS` + 播种语句带 `NOT EXISTS` 守卫。
-- ===============================================================

CREATE TABLE IF NOT EXISTS review_note_presets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,   -- 小的排前面（界面按此顺序出 chip）
  created_at INTEGER NOT NULL
);

-- 同一句文案不该出现两次；由数据库兜底，不指望调用方每次都去重
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_note_presets_text ON review_note_presets(text);

-- ===============================================================
-- 播种：只在表**空**时写入默认项（重复执行不会追加第二遍）
-- ===============================================================
INSERT INTO review_note_presets (text, sort_order, created_at)
SELECT text, sort_order, unixepoch() FROM (
            SELECT '重复发帖' AS text, 0 AS sort_order
  UNION ALL SELECT '与主题无关', 1
  UNION ALL SELECT '外链待确认', 2
  UNION ALL SELECT '需要更多上下文', 3
) WHERE NOT EXISTS (SELECT 1 FROM review_note_presets);

-- ===============================================================
-- 自检
-- ===============================================================
SELECT '第 6 步自检：review_note_presets 表应为 1' AS note;
SELECT COUNT(*) AS present FROM sqlite_master WHERE type = 'table' AND name = 'review_note_presets';

SELECT '第 6 步自检：默认项应为 4 条' AS note;
SELECT COUNT(*) AS seeded FROM review_note_presets;

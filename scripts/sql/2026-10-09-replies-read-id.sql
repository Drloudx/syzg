-- 回复通知 · 第 10 步：把「谁回复了我」的未读基准从**时间**改成**评论 id**
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-09-replies-read-id.sql
--
-- ⚠️ **必须先跑本文件、再推代码**（红线第 6 条）：新代码会读 `users.replies_read_id`，
--    列不存在时 `/api/auth/replies` 与 `/api/auth/replies/read` 都会 500。
--
-- ===============================================================
-- 要解决的问题：秒级精度**不足以区分先后**
--
-- 未读判定原本是 `comments.created_at > users.replies_read_at`，两边都是**秒**。
-- 若"标已读"与"收到回复"落在**同一秒**，那条回复满足 `S > S`（假）→
-- **提醒被静默吞掉**：用户永远看不到有人回复了他。
--
-- ## 为什么不用毫秒（那是「评论被处理通知」用的方案，这里不适用）
--
-- 那边两个字段都是新加的、都由我控制，所以可以直接用毫秒。
-- 这边**不行**：`comments.created_at` 是既有的**秒**列，全站都在用
-- （列表排序、按时间显示、限流……）。把它改成毫秒会波及全站，
-- 而**只把基准改成毫秒更糟** —— `S > S_000` 恒真，红点永远清不掉。
--
-- ## 改用 `comments.id`
--
-- `comments.id` 是 `INTEGER PRIMARY KEY AUTOINCREMENT`，**严格单调递增**
-- （已核实：现有数据里 `created_at` 与 `id` 逆序的对数为 0）。
-- 于是"我读过哪些回复"可以精确表达为"我读到的最大 id 是多少"：
--
--   未读数 = COUNT(我的回复 WHERE c.id > 我读到的最大 id)
--
-- 整数比较，**没有精度问题、没有时钟回拨问题**，语义还更准：
-- 它表达的是"这些回复我看过了"，而不是"某个时刻之前的都算看过"。
-- ===============================================================
-- 本文件的失败模式（"已迁过"的预期报错，不是真炸）：
--
--   `duplicate column name: replies_read_id`  → 已加过
-- ===============================================================

ALTER TABLE users ADD COLUMN replies_read_id INTEGER DEFAULT NULL;

-- ===============================================================
-- 回填：把旧的**时间**基准换算成**id** 基准
--
-- 不回填的后果：所有人 `replies_read_id` 为 NULL → 被当成 0 →
-- **全部历史回复瞬间变成未读**，红点从 0 跳到几十。那是明显的故障观感。
--
-- 换算规则：取"该用户所有 `created_at <= replies_read_at` 的回复里最大的 id"。
-- 这与旧语义**等价**（旧语义就是"这一秒之前的算读过"），
-- 只是把边界从"秒"换成"id"，顺带修掉同一秒的丢通知。
--
-- `replies_read_at IS NULL` 的用户**不回填**（保持 NULL）：旧代码里
-- NULL 被当成 0，即"从未标过已读 → 全部算未读"，这里保持同样行为。
-- ===============================================================
UPDATE users
SET replies_read_id = COALESCE(
  (
    SELECT MAX(c.id)
    FROM comments c
    JOIN comments p ON p.id = c.parent_id
    WHERE p.user_id = users.id
      AND (c.user_id IS NULL OR c.user_id <> users.id)
      AND c.status = 1
      AND c.created_at <= users.replies_read_at
  ),
  0
)
WHERE replies_read_at IS NOT NULL;

-- ===============================================================
-- 自检
-- ===============================================================
SELECT '第 10 步自检：users.replies_read_id 应为 1' AS note;
SELECT COUNT(*) AS present FROM pragma_table_info('users') WHERE name = 'replies_read_id';

SELECT '第 10 步自检：回填后不该有人出现"凭空多出未读"（下面应为 0）' AS note;
SELECT COUNT(*) AS would_be_unread FROM (
  SELECT u.id
  FROM users u
  WHERE u.replies_read_id IS NOT NULL
    AND u.replies_read_id < COALESCE((
      SELECT MAX(c.id) FROM comments c JOIN comments p ON p.id = c.parent_id
      WHERE p.user_id = u.id AND (c.user_id IS NULL OR c.user_id <> u.id) AND c.status = 1
        AND c.created_at <= u.replies_read_at
    ), 0)
);

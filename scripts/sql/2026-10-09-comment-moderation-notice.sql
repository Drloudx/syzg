-- 评论处理通知 · 第 9 步：加 `comments.moderated_at` 与 `users.moderation_read_at`
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-09-comment-moderation-notice.sql
--
-- ⚠️ **必须先跑本文件、再推代码**（红线第 6 条）：新代码会读这两列，
--    列不存在时 `/api/auth/comments` 与后台评论页都会 500。
--
-- ===============================================================
-- 要解决的问题
--
-- 作者的评论被隐藏/打回待审后，**他并不知道** —— 「我的评论」里其实一直有
-- 「待审核 / 已隐藏」标签，但他没有理由主动去看。结果就是"我的评论怎么没了"。
--
-- ## 为什么不建通知表
--
-- 与已有的「谁回复了我」未读机制（`users.replies_read_at`）**完全对称**：
--
--   未读数 = COUNT(我的评论 WHERE moderated_at > 我上次读的时间)
--
-- 只用一个时间戳当基准，**省一张表、省每次处理的写入**。
-- 现有那套已在生产跑着，复用同一套心智模型，维护面最小。
--
-- ## `moderated_at` 本身也有独立价值
--
-- 它记录"这条评论最后一次被管理员处理是什么时候"，
-- 排查"这条什么时候被下架的"时不必翻审计表。
--
-- ⚠️ 只在 `status` **真的发生变化**时写，不是每次提交都写
--    （否则重复点"隐藏"会把时间一直往后推，作者会反复收到通知）。
-- ===============================================================
-- 本文件的失败模式（"已迁过"的预期报错，不是真炸）：
--
--   `duplicate column name: moderated_at`        → comments 那列已加过
--   `duplicate column name: moderation_read_at`  → users 那列已加过
--   （两列互相独立，若只报其中一条，说明另一条是新加的，属正常）
-- ===============================================================

-- 何时被管理员处理（**毫秒**时间戳；从未被处理为 NULL）
ALTER TABLE comments ADD COLUMN moderated_at INTEGER DEFAULT NULL;

-- 作者读到哪一刻为止（未读基准；与 replies_read_at 同一套用法）
-- 🔴 同样用**毫秒**，必须与 moderated_at 同一精度。
--    用秒会导致"同一秒内标已读 + 又被处理"落到 `S > S`（假）→ 通知被静默吞掉；
--    若为避开它把基准退 1 秒，又会让红点清不掉（`S > S-1` 恒真）。
--    毫秒把冲突窗口压到 1 毫秒，两个方向的错都不再出现。
ALTER TABLE users ADD COLUMN moderation_read_at INTEGER DEFAULT NULL;

-- 算未读数要按 "user_id + moderated_at" 过滤。
-- 已有 idx_comments_user 能按 user_id 定位，但补一个覆盖 (user_id, moderated_at)
-- 的索引更贴这次查询的形状（用户自己的评论通常不多，收益有限，但代价为零）。
CREATE INDEX IF NOT EXISTS idx_comments_user_moderated ON comments(user_id, moderated_at);

-- ===============================================================
-- 自检
-- ===============================================================
SELECT '第 9 步自检：comments.moderated_at 应为 1' AS note;
SELECT COUNT(*) AS present FROM pragma_table_info('comments') WHERE name = 'moderated_at';

SELECT '第 9 步自检：users.moderation_read_at 应为 1' AS note;
SELECT COUNT(*) AS present FROM pragma_table_info('users') WHERE name = 'moderation_read_at';

SELECT '第 9 步自检：旧评论的 moderated_at 应为 0 条非空（迁移不回填历史）' AS note;
SELECT COUNT(*) AS filled FROM comments WHERE moderated_at IS NOT NULL;

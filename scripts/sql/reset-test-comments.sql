-- ⚠️⚠️ 破坏性操作：清空评论与限流计数 ⚠️⚠️
--
-- **这不是建表脚本，也不会被任何自动流程执行。** 必须手动跑，且只有一次机会。
--
-- 🔴 **2026-10-14 起：本脚本默认只用于本地库（内测重置）。**
--    生产库请勿直接跑 —— 线上有真实用户评论时，"把 id 重置回 1"会让
--    编号出现倒退，且 `users.replies_read_id`（未读基准）会指向不存在的 id。
--    本地/内测库没有历史包袱，重置是安全的。
--
-- 为什么要清：开发期内测留下的测试评论。账号体系上线时这些数据没有保留价值，
-- 且"本机身份 + 匿名评论"整体退役，老的自删令牌机制（`comments.token_hash`）
-- 一并退役，删评论改由账号（`user_id`）承担。
--
-- 执行前请先跑一次**只读**确认（把下面这段单独执行）：
--   SELECT id, page_key, nick, substr(body,1,20) AS body_head, created_at
--   FROM comments ORDER BY id;
--
-- 正式执行（本地）：
--   wrangler d1 execute myrzg-comments --local --file=./scripts/sql/reset-test-comments.sql
--
-- 保留列而不 DROP：`comments.token_hash` / `comments.email_hash` 都**保留不用**，
-- SQLite 删列代价高，且历史列留着无害。

SELECT '【清理前】将删除的评论行数' AS note, COUNT(*) AS rows FROM comments;
SELECT '【清理前】限流桶行数'       AS note, COUNT(*) AS rows FROM rate_limits;

DELETE FROM comments;
DELETE FROM rate_limits;

-- ===============================================================
-- 重置 AUTOINCREMENT 水位，让评论 id 从 **1** 重新开始
--
-- 为什么需要这一步：`comments.id` 是 `INTEGER PRIMARY KEY AUTOINCREMENT`，
-- 而 AUTOINCREMENT 的语义就是**永不复用** —— 只 `DELETE FROM comments`
-- 的话，下一条新评论会从"历史最大 id + 1"继续（如从 5889 开始），
-- 而不是从 1。清库后想有一个干净的编号起点，必须把内部水位一起清掉
-- （SQLite 把它记在 `sqlite_sequence` 表里）。
--
-- 🔴 只在**确实要重置编号**时保留这三行。若想清数据但保留编号连续性，
--    删掉这段即可。
--
-- ⚠️ 副作用：`users.replies_read_id` 是基于评论 id 的未读基准。
--    重置后旧基准会大于任何新评论 id → 已读状态被视为"读到很后面"，
--    老用户可能因此**收不到新回复提醒**。所以这里把所有人的基准一并清零，
--    让它们按"从未读过"重新开始，避免那个静默失效。
-- ===============================================================
DELETE FROM sqlite_sequence WHERE name = 'comments';
UPDATE users SET replies_read_id = NULL WHERE replies_read_id IS NOT NULL;

SELECT '【清理后】评论行数（应为 0）' AS note, COUNT(*) AS rows FROM comments;
SELECT '【清理后】限流桶行数（应为 0）' AS note, COUNT(*) AS rows FROM rate_limits;
SELECT '【清理后】评论 id 水位已重置（应为空或 0）' AS note,
       COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'comments'), 0) AS seq;

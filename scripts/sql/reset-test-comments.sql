-- ⚠️⚠️ 破坏性操作：清空评论与限流计数 ⚠️⚠️
--
-- **这不是建表脚本，也不会被任何自动流程执行。** 必须手动跑，且只有一次机会。
--
-- 为什么要清：线上评论表里现有 id 17~24 共 8+ 条**测试评论**
-- （全在 `site:general`，内容是 "dawdawd" 之类，开发期自测留下的）。
-- 账号体系上线时这些数据没有保留价值，且"本机身份 + 匿名评论"整体退役，
-- 老的自删令牌机制（`comments.token_hash`）一并退役，删评论改由账号（`user_id`）承担。
--
-- 执行前请先跑一次**只读**确认（把下面这段单独执行）：
--   SELECT id, page_key, nick, substr(body,1,20) AS body_head, created_at
--   FROM comments ORDER BY id;
--
-- 正式执行：
--   wrangler d1 execute myrzg-comments --file=./scripts/sql/reset-test-comments.sql --remote
--
-- 保留列而不 DROP：`comments.token_hash` / `comments.email_hash` 都**保留不用**，
-- SQLite 删列代价高，且历史列留着无害。

SELECT '【清理前】将删除的评论行数' AS note, COUNT(*) AS rows FROM comments;
SELECT '【清理前】限流桶行数'       AS note, COUNT(*) AS rows FROM rate_limits;

DELETE FROM comments;
DELETE FROM rate_limits;

SELECT '【清理后】评论行数（应为 0）' AS note, COUNT(*) AS rows FROM comments;
SELECT '【清理后】限流桶行数（应为 0）' AS note, COUNT(*) AS rows FROM rate_limits;

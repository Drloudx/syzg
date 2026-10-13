-- 后台分页与活跃统计索引 · 第 11 步：给 `comments` / `sessions` 补三条索引
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-13-admin-paging-indexes.sql
--
-- ⚠️ 顺序说明：本文件**纯加索引**，不改列、不改语义，因此**没有**"必须早于代码"
--    的硬约束（不像第 8 步那样列不存在会 500）—— 旧代码在新索引下照常工作。
--    但**先跑本文件、再推送**仍然是对的：否则新后台分页先上线、索引后补，
--    中间那段时间每次翻页都在全表扫。
--
-- ===============================================================
-- 为什么要这三条索引
--
-- D1 的免费额度按 **rows read（读行数）** 计，不按查询条数。
-- "读了一行"和"扫了一万行再挑一行"在额度上差三个数量级。
--
-- 后台 2026-10-13 新增了「数字折叠跳页器」，用户管理 / 评论审核 / 审计
-- 三处都改成 `LIMIT ? OFFSET ?` 的页码模式。随之而来的两个热点：
--
--   ① 评论按状态分页 + 每次请求的状态计数聚合
--      此前 comments 上只有 idx_comments_page(page_key, status, created_at DESC)，
--      **首列是 page_key**，而新查询不带 page_key → 该索引用不上 → SCAN comments 全表扫。
--      每次翻页要扫全表（分页本身 + COUNT + GROUP BY status 各一次）。
--
--   ② 概览页的「今日/昨日活跃账号」（DAU）
--      条件为 `last_seen_at >= ?` 或 `created_at >= ?`。
--      sessions 上原本只有 idx_sessions_user(user_id)，两个时间列都无索引
--      → `SCAN sessions USING INDEX idx_sessions_user`，即**扫全部会话**。
--      🔴 这条会持续变贵：sessions **只增不减**（30 天过期只在查询条件里过滤，
--      行不会自动消失），所以累计会话数就是扫描行数。
--
-- ===============================================================
-- 本文件的失败模式（"已迁过"的预期结果，不是真炸）：
--   全部为 `CREATE INDEX IF NOT EXISTS`，重跑**不报错、不改数据**，幂等。
-- ===============================================================

-- ① 评论按状态分页 / 状态计数：让 status 查询从全表扫变为索引定位
CREATE INDEX IF NOT EXISTS idx_comments_status_id
  ON comments(status, id DESC);

-- ② 活跃统计（DAU）：按时间区间定位，替代全量会话扫描
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_sessions_created  ON sessions(created_at);

-- ===============================================================
-- 自检
-- ===============================================================
SELECT '第 11 步自检：三条索引应都存在（下面应为 3）' AS note;
SELECT COUNT(*) AS present FROM sqlite_master
WHERE type = 'index'
  AND name IN ('idx_comments_status_id', 'idx_sessions_last_seen', 'idx_sessions_created');

SELECT '第 11 步自检：评论按状态分页应走索引（期望含 SEARCH ... idx_comments_status_id）' AS note;
EXPLAIN QUERY PLAN
SELECT id FROM comments WHERE status = 0 ORDER BY id DESC LIMIT 50 OFFSET 0;

SELECT '第 11 步自检：DAU 区间查询应走索引（期望含 idx_sessions_last_seen / idx_sessions_created）' AS note;
EXPLAIN QUERY PLAN
SELECT COUNT(DISTINCT user_id) FROM sessions
WHERE (last_seen_at >= 0 AND last_seen_at < 1) OR (created_at >= 0 AND created_at < 1);

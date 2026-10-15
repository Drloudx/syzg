-- 修复：打开任意图鉴页都会全表扫评论 · 第 12 步：新增 `idx_comments_page_id`
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-15-comments-page-id-index.sql
--
-- ⚠️ 顺序：本文件**只加索引**，不改列、不改语义 —— 旧代码在新索引下照常工作。
--    但**先跑本文件、再推送**仍然是对的（与第 11 步同理）：否则代码先上线、
--    索引后补，中间那段时间每次开页还在全表扫。
--
-- ===============================================================
-- 为什么（这是一个**页面数量 × 评论数量**的乘积级缺陷）
--
-- 症状：打开任意一个**没有评论**的图鉴页，数据库要扫完整张 `status = 1` 索引。
--
-- 成因有两半，缺一不可：
--
--   ① 查询形态：`GET /api/comments?page=<pageKey>` 是
--        WHERE page_key = ? AND status = 1 ORDER BY id DESC LIMIT 21
--      现有索引 `idx_comments_page(page_key, status, created_at DESC)` 的
--      **第三列是 created_at，与 `ORDER BY id DESC` 不匹配** —— 于是它虽然
--      能定位到"该页的行"，却无法用来满足排序，规划器认为不如换个走法。
--
--   ② 规划器选择：本地库（与生产同构）**没有 sqlite_stat1**（从未跑过 ANALYZE），
--      在缺少统计信息时规划器选了
--        SEARCH comments USING INDEX idx_comments_status_id (status=?)
--      即沿 (status, id DESC) **从最大 id 往下逐行扫、用 page_key 过滤**，
--      凑够 21 条命中才停。
--
--   → 当一个页面**一条评论都没有**时，它永远凑不够 21 条，
--     必须把整张 status=1 索引扫完才能确定"没有"。
--
-- 实测（30000 条评论的独立实验库，node:sqlite，真实 EXPLAIN QUERY PLAN 计数）：
--     打开热点页（有评论）      33 行
--     打开空页（无评论）    27,000 行   ← 全站 status=1 行数
--     楼中楼（空页）        27,000 行
-- 空页成本 = **全站评论数**，与"这一页有没有评论"无关。
--
-- 🔴 为什么这是严重缺陷而不是"评论多了才要管"：
--    `CommentsPanel` 挂在 9 处图鉴页（物品 / 角色 / 魔物 / 家具 / 任务 /
--    事件 / 副本 / 关卡 / 物品与怪物详情弹窗），且是**挂载即请求**
--    （`CommentsPanel.vue` 的 `if (props.pageKey) load()`）。
--    而全站页面键的数量是**千级**（物品 816 + 任务 315 + 家具 141 +
--    怪物 52 + 角色 34 + 魔物 32 + 事件 20 + …），其中绝大多数页面
--    **一条评论都没有**。
--    于是每次开页都在付"全站评论数"这个代价 ——
--    日消耗 ≈ **日浏览量 × 全站评论数**，是乘积关系，随两个维度同时增长。
--    D1 免费版读额度 5,000,000 行/天，超限**直接报错**（不是限速），
--    讨论区会对所有人挂掉。
--
-- ===============================================================
-- 修法：新增一条把 `id` 放进索引尾列的索引，让排序也能走索引
--
--   CREATE INDEX idx_comments_page_id ON comments(page_key, status, id DESC)
--
-- 尾列是 `id DESC`，与 `ORDER BY id DESC` 完全一致 → 规划器可以**沿索引
-- 倒序取够 LIMIT 条即停**，空页直接 0 行。
--
-- 🔴 为什么是**新增**而不是**改掉** idx_comments_page：
--    `idx_comments_page` 的 `created_at` 列正在被概览的「7 日趋势」查询借道
--    （`SELECT date(created_at,…) … WHERE created_at >= ?` 用它的覆盖索引 +
--    skip-scan）。把它换成 id 会让那条查询从"走覆盖索引"退化成 `SCAN comments`
--    （实测：有 ANALYZE 时 30,000 行，且失去覆盖）。新增则两者都保住。
--
-- 实测对比（30000 条评论，无 ANALYZE = 生产现状）：
--     查询                     现状      新增后
--     打开热点页                33         21
--     打开空页（平铺）       27,000          0   ↓∞
--     打开空页（楼中楼）     27,000          0   ↓∞
--     展开回复串                33         21
--     定位页边界            27,000     18,000   ↓1.5x
--     站内讨论区最新            32         20
--     —— 其余查询（我的评论 / 后台分页 / 状态计数 / 7 日趋势）**全部持平**。
--     回退项：**0**。
--
-- ===============================================================
-- 本文件的失败模式（"已迁过"的预期结果，不是真炸）：
--   为 `CREATE INDEX IF NOT EXISTS`，重跑**不报错、不改数据**，幂等。
-- ===============================================================

-- ① 让"按页取最新 N 条评论"能沿索引倒序取够即停
CREATE INDEX IF NOT EXISTS idx_comments_page_id
  ON comments(page_key, status, id DESC);

-- ===============================================================
-- 自检
-- ===============================================================
SELECT '第 12 步自检：索引应存在（下面应为 1）' AS note;
SELECT COUNT(*) AS present FROM sqlite_master
WHERE type = 'index' AND name = 'idx_comments_page_id';

SELECT '第 12 步自检：按页取评论应走 idx_comments_page_id（期望含 SEARCH ... idx_comments_page_id）' AS note;
EXPLAIN QUERY PLAN
SELECT id, body FROM comments
WHERE page_key = 'item:1001' AND status = 1
ORDER BY id DESC LIMIT 21;

SELECT '第 12 步自检：楼中楼取顶层评论同样应走新索引' AS note;
EXPLAIN QUERY PLAN
SELECT c.id, c.parent_id FROM comments c
WHERE c.page_key = 'item:1001' AND c.status = 1
  AND (c.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM comments q WHERE q.id = c.parent_id AND q.status = 1))
ORDER BY c.id DESC LIMIT 21;

SELECT '第 12 步自检：概览 7 日趋势仍应能借道 idx_comments_page（期望出现 COVERING INDEX idx_comments_page 或 idx_comments_status_id，不得是裸 SCAN comments）' AS note;
EXPLAIN QUERY PLAN
SELECT date(created_at, 'unixepoch') AS d, COUNT(*) AS n FROM comments
WHERE created_at >= 0 GROUP BY d;

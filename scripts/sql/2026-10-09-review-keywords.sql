-- 审核词表超管可维护 · 第 7 步：新增 `review_keywords` 与 `review_category_flags`
--
-- 命令：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-10-09-review-keywords.sql
--
-- ===============================================================
-- ## 为什么是「代码基线 + 数据库叠加」，而不是整表搬进库
--
-- 1. **安全**：不允许超管在网页里编辑**正则**。写错一个字符 → `new RegExp` 抛错
--    → `POST /api/comments` 全站 500；写得回溯爆炸 → Workers CPU 超限，评论发不出去。
--    所以库里存的是**转义后的普通关键词**，不是正则。
-- 2. **可用性**：`src/config/commentBlocklist.js` 那套永远在代码里兜底。
--    库读不到 / 迁移没跑 / 缓存空 —— 基础防护照旧生效，只是少了超管加的词。
--    反过来（全部搬进库）则意味着**库一有问题就等于完全不审核**。
--
-- ## 生效规则（简单可预测）
--
--   有效词表 = 代码基线的各**启用**类别 + 库里各该类别的自定义关键词
--   停用某类别 = 该类别**连同你在里面加的词**一起不生效
--
--   刻意不让"停用类别但自定义词仍生效" —— 那种规则没人能预测得准。
--
-- ⚠️ 本文件**幂等**（`CREATE TABLE IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS`），
--    重复执行不报错（与第 2/4/5 步不同）。
-- ===============================================================

-- 自定义关键词：一条一个词，归属某个类别（类别名即「命中原因」里显示的字样）
CREATE TABLE IF NOT EXISTS review_keywords (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT    NOT NULL,            -- 普通关键词（非正则）；匹配时会被转义
  category   TEXT    NOT NULL,            -- 命中原因（如「赌博」）；可为代码基线没有的新类别
  created_at INTEGER NOT NULL
);

-- 同一个词在同一类别里不该重复（匹配时也会去重，这里由库兜底）
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_keywords_text ON review_keywords(category, text);
-- 按类别取用（拼正则时按类别分组）
CREATE INDEX IF NOT EXISTS idx_review_keywords_category ON review_keywords(category);

-- 类别停用标记：**只存被显式停用的**类别，没记录 = 启用
--
-- 为什么单独一张表而不是在 config 里存个 JSON：避免"读出来改再写回"的并发覆盖
-- （与 `review_note_presets` 同一理由）。
CREATE TABLE IF NOT EXISTS review_category_flags (
  category   TEXT    PRIMARY KEY,         -- 代码基线里的类别名
  created_at INTEGER NOT NULL
);

-- ===============================================================
-- 自检
-- ===============================================================
SELECT '第 7 步自检：review_keywords 表应为 1' AS note;
SELECT COUNT(*) AS present FROM sqlite_master WHERE type = 'table' AND name = 'review_keywords';

SELECT '第 7 步自检：review_category_flags 表应为 1' AS note;
SELECT COUNT(*) AS present FROM sqlite_master WHERE type = 'table' AND name = 'review_category_flags';

SELECT '第 7 步自检：不播种任何词（基线在代码里）应为 0' AS note;
SELECT COUNT(*) AS seeded FROM review_keywords;

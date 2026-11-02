-- ============================================================
-- 第 13 步迁移：公告管理模块（2026-11-01）
-- ============================================================
-- 设计依据：docs/context/technical/HOME_CONTENT.md
--
-- 四件事：
--   ① 新建 home_notice_slots —— 首页公告区 8 个插槽（本站 4 + 官方 4）
--   ② notices 加 show_in_modal —— 标记「这条要自动弹窗」（仅本站用）
--   ③ 老公告 ID 改序号（site-1…、official-1…）
--   ④ 初始插槽与弹窗标记
--
-- 为什么要拆出 home_notice_slots：
--   公告本身是「内容仓库」，首页显示是「展示选择」。混在 notices 的
--   tier/slot 上会导致：想挂一条三个月前的老公告到位置 2，就得改那条
--   公告自己的属性，语义错位。拆开后公告表只管内容。
--
-- 🔴 语句顺序：ALTER TABLE 放**最后**。
--    它在重复执行时会报 "duplicate column name: show_in_modal" 并中断，
--    若放在中间，后面的语句就永远跑不到。放最后则重跑时前面全部幂等通过，
--    只在最后一步报预期错误 —— 与第 2/4/5/8/9 步的做法一致。

-- ------------------------------------------------------------
-- ① 首页公告区插槽
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS home_notice_slots (
  channel    TEXT    NOT NULL,             -- 'site' | 'official'
  slot       INTEGER NOT NULL,             -- 1..4
  notice_id  TEXT,                         -- 指向 notices.id；NULL = 未选择（走动态默认）
  updated_at TEXT,
  PRIMARY KEY (channel, slot)
);

-- ------------------------------------------------------------
-- ② 老 ID 改序号
-- ------------------------------------------------------------
-- 规则：按频道内**日期升序**编号，最早的为 1。
-- 已读记录因此失效（localStorage 里存的是旧 id），升级后每条会重弹一次，
-- 这是一次性代价，不做映射兼容。
UPDATE notices SET id = 'site-1' WHERE id = 'site-disclaimer';
UPDATE notices SET id = 'site-2' WHERE id = 'site-sims-upgrade';
UPDATE notices SET id = 'site-3' WHERE id = 'site-data-sync';
UPDATE notices SET id = 'site-4' WHERE id = 'site-community-rules';

UPDATE notices SET id = 'official-1' WHERE id = 'official-v120';
UPDATE notices SET id = 'official-2' WHERE id = 'official-crashfix';
UPDATE notices SET id = 'official-3' WHERE id = 'official-devletter-2';

-- 🔴 同步更新海报上的公告引用，否则 action_type='notice' 会指向不存在的 id。
--    三处都要覆盖：
--      ① 第 12 步的初始海报 `banner-v120` → official-v120
--      ② 老库里若曾被手工改成 `site-community-rules`（第 13 步之前的老 id）
--      ③ 已是新 id 的不动
UPDATE home_banners SET action_value = 'official-1'
  WHERE action_type = 'notice' AND action_value = 'official-v120';
UPDATE home_banners SET action_value = 'site-4'
  WHERE action_type = 'notice' AND action_value = 'site-community-rules';
UPDATE home_banners SET action_value = 'site-1'
  WHERE action_type = 'notice' AND action_value = 'site-disclaimer';
UPDATE home_banners SET action_value = 'site-2'
  WHERE action_type = 'notice' AND action_value = 'site-sims-upgrade';
UPDATE home_banners SET action_value = 'site-3'
  WHERE action_type = 'notice' AND action_value = 'site-data-sync';
UPDATE home_banners SET action_value = 'official-2'
  WHERE action_type = 'notice' AND action_value = 'official-crashfix';
UPDATE home_banners SET action_value = 'official-3'
  WHERE action_type = 'notice' AND action_value = 'official-devletter-2';

-- ------------------------------------------------------------
-- ③ 初始插槽：首页默认展示
-- ------------------------------------------------------------
-- 站点：位置 1 = 站点声明，位置 4 = 社区准则（两条固定位）
--       位置 2、3 留 NULL → 走「动态取最新」
-- 官方：四个位置全留 NULL → 走「动态取最新第 1~4 条」
-- 用 INSERT OR IGNORE：已存在则不覆盖后台改过的选择。
INSERT OR IGNORE INTO home_notice_slots (channel, slot, notice_id, updated_at)
VALUES
  ('site', 1, 'site-1', '2026-11-01'),
  ('site', 2, NULL,     '2026-11-01'),
  ('site', 3, NULL,     '2026-11-01'),
  ('site', 4, 'site-4', '2026-11-01'),
  ('official', 1, NULL, '2026-11-01'),
  ('official', 2, NULL, '2026-11-01'),
  ('official', 3, NULL, '2026-11-01'),
  ('official', 4, NULL, '2026-11-01');

-- ------------------------------------------------------------
-- ④ 索引：按频道 + 日期取最近 N 条
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notices_recent
  ON notices(channel, is_active, date DESC);

-- ------------------------------------------------------------
-- ⑤ notices 加 show_in_modal（必须放最后，见文件头说明）
-- ------------------------------------------------------------
-- 默认 0 = 不弹。站点公告发布时由后台勾选（默认勾上），官方一律不弹。
ALTER TABLE notices ADD COLUMN show_in_modal INTEGER NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- ⑥ 站点公告默认开启弹窗
-- ------------------------------------------------------------
-- 在 ALTER 之后才能引用新列。
-- 已有的站点公告置 1（它们此前在首页和弹窗都显示过，语义上属于「要通知」）。
UPDATE notices SET show_in_modal = 1 WHERE channel = 'site';

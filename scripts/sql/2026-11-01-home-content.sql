-- ============================================================
-- 第 12 步迁移：首页内容可配置化（2026-11-01）
-- ============================================================
-- 设计依据：docs/context/technical/HOME_CONTENT.md
--
-- 新增 5 张表，把首页 6 个板块从硬编码搬到 D1：
--   ① notices        公告（站点 + 官方合并，channel 区分）
--   ② home_banners   海报轮播（可增减）
--   ③ home_links     核心图鉴 + 实用工具（section 区分，各固定 4 格）
--   ④ home_heroes    核心角色（固定 4 格）
--   ⑤ home_blocks    底部两栏（rows_json 存行）
--
-- 幂等性：
--   建表用 CREATE TABLE IF NOT EXISTS；
--   初始数据用 INSERT ... ON CONFLICT DO NOTHING，
--   重复执行不会覆盖后台改过的内容。
--
-- 🔴 不要在本文件写 DROP TABLE —— SQLite 的 DROP 不可撤销。

-- ------------------------------------------------------------
-- ① 公告：站点 (site) 与官方 (official) 合并一张表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notices (
  id             TEXT PRIMARY KEY,
  channel        TEXT NOT NULL,                    -- 'site' | 'official'
  tier           TEXT NOT NULL DEFAULT 'normal',   -- 'pin'（固定项）| 'normal'（滚动项）
  slot           INTEGER,                          -- tier='pin' 时的固定位置；normal 为 NULL
  title          TEXT NOT NULL,
  content        TEXT,                             -- 受限标记文本（见 HOME_CONTENT.md §四）
  date           TEXT,                             -- YYYY-MM-DD
  tag_text       TEXT,                             -- 置顶 / 功能 / 数据 / 社区 / 版本 / 修复
  tag_class      TEXT,                             -- pinned | patch | event | info | gold
  -- official 专用（site 为 NULL）
  version        TEXT,                             -- 'v1.2.0「深境微光」'
  features_json  TEXT,                             -- ["新 5 星…","主线第 8 章…"]
  source_url     TEXT,                             -- 官方原文链接
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT,
  updated_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_notices_channel
  ON notices(channel, is_active, tier, date DESC);

-- ------------------------------------------------------------
-- ② 海报轮播：数量可增减，用 sort_order 排序
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS home_banners (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  tag_text     TEXT,
  tag_class    TEXT,                                -- gold | red | teal
  sub_tag      TEXT,
  image_url    TEXT,                                -- 外链或 /images/banners/xxx.webp
  bg_color     TEXT,                                -- '#3a2416'
  blend_start  TEXT,                                -- 'rgba(58,36,22,0.95)'
  btn_text     TEXT,
  action_type  TEXT,                                -- 'route' | 'notice' | 'external'
  action_value TEXT,                                -- 路由路径 / 公告 id / 外部 URL
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT,
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_banners_order
  ON home_banners(is_active, sort_order);

-- ------------------------------------------------------------
-- ③ 核心图鉴 (core) + 实用工具 (tool)：字段 95% 相同，合并
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS home_links (
  section      TEXT NOT NULL,                       -- 'core' | 'tool'
  slot         INTEGER NOT NULL,                    -- 1..4
  title        TEXT NOT NULL,
  description  TEXT,
  route        TEXT NOT NULL,                       -- '/heroes'
  query_string TEXT,                                -- 'tab=hidden'（手填，可空）
  icon_source  TEXT DEFAULT 'nav',                  -- 'nav' | 'custom'
  icon_url     TEXT,                                -- icon_source='custom' 时用
  badge_text   TEXT,                                -- 'HOT' / 'NEW'（core 区恒为 NULL）
  badge_color  TEXT,                                -- red | green | gold | teal | gray
  is_active    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (section, slot)
);

-- ------------------------------------------------------------
-- ④ 核心角色：固定 4 格，只存 hero_id，其余运行时 join heroes.json
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS home_heroes (
  slot      INTEGER PRIMARY KEY,                    -- 1..4
  hero_id   TEXT NOT NULL,                          -- 指向 heroes.json 的 id
  tip       TEXT,                                   -- '群体高爆发 / 灼烧伤害'
  is_active INTEGER NOT NULL DEFAULT 1
);

-- ------------------------------------------------------------
-- ⑤ 底部两栏：内容形态未定稿，用 JSON 存行，避免反复迁移
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS home_blocks (
  section   TEXT PRIMARY KEY,                       -- 'guide' | 'help'
  title     TEXT NOT NULL,
  subtitle  TEXT,
  rows_json TEXT,                                   -- [{"tag":"刷新","label":"每日 05:00","text":"..."}]
  is_active INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- 初始数据（从 HomeView.vue 现有硬编码搬入）
-- ============================================================

-- ---- 公告：站点 4 条（2 条固定 + 2 条滚动）----
INSERT INTO notices (id, channel, tier, slot, title, content, date, tag_text, tag_class, is_active, created_at, updated_at)
VALUES
  ('site-disclaimer', 'site', 'pin', 1,
   '深渊大书院站点免责声明与服务协议',
   '深渊大书院为非盈利性质的玩家自发资料库与攻略整理工具，所有素材与文本版权归原游戏制作组所有。
本站所有算法模拟器均为基于客户端拆解数据进行的前端重构，旨在提供便捷的配队与数值参考。',
   '2026-09-19', '置顶', 'pinned', 1, '2026-11-01', '2026-11-01'),

  ('site-sims-upgrade', 'site', 'normal', NULL,
   '相关模拟（魔物配队）移动端与算法全面升级',
   '魔物搭配模拟系统完成重大重构！支持自选队伍、自选角色与魔物被动过滤。
移动端抽屉式选人交互优化完毕，提升手机端排布与浏览体验。',
   '2026-10-29', '功能', 'patch', 1, '2026-11-01', '2026-11-01'),

  ('site-data-sync', 'site', 'normal', NULL,
   '客户端解构数据同步与词条修正',
   '已将最新客户端解析表与 Wiki 数据对齐，修正了部分装备在洗练状态下的暴击显示异常，补全魔物技能缺失字段。',
   '2026-10-28', '数据', 'event', 1, '2026-11-01', '2026-11-01'),

  ('site-community-rules', 'site', 'pin', 4,
   '大书院学者讨论区交流准则',
   '欢迎各位探求者在讨论区交流游戏体验、魔物孵化收益与阵容心得。
请自觉遵守讨论区发言礼仪，共建友善、客观的游戏研究氛围。',
   '2026-10-25', '社区', 'info', 1, '2026-11-01', '2026-11-01')
ON CONFLICT(id) DO NOTHING;

-- ---- 公告：官方 3 条（1 条带版本号与特性列表）----
INSERT INTO notices (id, channel, tier, slot, title, content, date, tag_text, tag_class, version, features_json, is_active, created_at, updated_at)
VALUES
  ('official-v120', 'official', 'pin', NULL,
   'v1.2.0「深境微光」版本正式实装与停服维护',
   '亲爱的探求者：
游戏已于 10 月 28 日完成 v1.2.0 停机维护更新。
【更新内容】
1. 全新 5 星秘术英雄「奇瓦」限定招募开启；
2. 开放主线章节第 8 章「无尽深渊回廊」剧情关卡与相关挑战副本；
3. 优化部分装备洗练词条描述与魔物羁绊加成数值。',
   '2026-10-28', '版本', 'pinned', 'v1.2.0「深境微光」',
   '["新 5 星秘术英雄「奇瓦」限时招募开启","主线第 8 章「无尽深渊回廊」剧情关卡解锁","魔物出战羁绊加成数值平衡性微调","修复部分装备洗练暴击词条显示异常问题"]',
   1, '2026-11-01', '2026-11-01'),

  ('official-crashfix', 'official', 'normal', NULL,
   '关于部分机型闪退与战斗结算延迟的修复通知',
   '技术团队已完成对部分机型内存占用过高导致偶发闪退的紧急补丁更新，请探求者重新启动客户端加载资源包。',
   '2026-10-26', '修复', 'patch', NULL, NULL, 1, '2026-11-01', '2026-11-01'),

  ('official-devletter-2', 'official', 'normal', NULL,
   '【开发组通信】第2期：后续养成系统减负前瞻',
   '开发组正在推进角色升级与技能强化的材料减负优化，预计在下个版本全面实装，同时优化委托任务的扫荡产出。',
   '2026-10-20', '前瞻', 'event', NULL, NULL, 1, '2026-11-01', '2026-11-01')
ON CONFLICT(id) DO NOTHING;

-- ---- 海报：3 条 ----
INSERT INTO home_banners (id, title, description, tag_text, tag_class, sub_tag, image_url, bg_color, blend_start, btn_text, action_type, action_value, sort_order, is_active, created_at, updated_at)
VALUES
  ('banner-v120', '探求深渊秘境的学者殿堂',
   '全新主线第8章「无尽回廊」正式开放！5星火系秘术英雄【奇瓦】限时招募降临，专属符石秘境与限时讨伐活动全面开启。',
   '官方版本焦点', 'gold', 'v1.2.0「深境微光」',
   '/images/banners/home-banner-1.webp', '#1a3832', 'rgba(26, 56, 50, 0.95)',
   '查看版本更新详情', 'notice', 'official-v120', 1, 1, '2026-11-01', '2026-11-01'),

  ('banner-gacha', '限定角色招募 · 双UP概率提升',
   '掌握禁忌火焰秘术的神秘学者与深渊伙伴！全套技能天赋数据、专属符石词条推荐与配队演算模拟器已同步上线。',
   '限定招募进行中', 'red', 'UP 卡池开启',
   '/images/banners/home-banner-2.webp', '#3a2416', 'rgba(58, 36, 22, 0.95)',
   '前往模拟抽卡', 'route', '/gacha', 2, 1, '2026-11-01', '2026-11-01'),

  ('banner-sims', '魔物出战被动搭配模拟系统',
   '全新升级！移动端紧凑自选与四列选择器，实时穷举推导最佳魔物出战组合，助您轻松打通深渊高难关卡。',
   '学者实用工具', 'teal', '配队演算升级',
   '/images/banners/home-banner-3.webp', '#382216', 'rgba(56, 34, 22, 0.95)',
   '立即体验模拟工具', 'route', '/sims', 3, 1, '2026-11-01', '2026-11-01')
ON CONFLICT(id) DO NOTHING;

-- ---- 核心图鉴：4 格 ----
INSERT INTO home_links (section, slot, title, description, route, query_string, icon_source, icon_url, badge_text, badge_color, is_active)
VALUES
  ('core', 1, '角色图鉴', '全英雄属性、技能天赋与升星材料', '/heroes', NULL, 'nav', NULL, NULL, NULL, 1),
  ('core', 2, '装备图鉴', '武器防具属性、专武词条与锻造', '/equip', NULL, 'nav', NULL, NULL, NULL, 1),
  ('core', 3, '魔物图鉴', '魔物羁绊技能、孵化产出与被动', '/pets', NULL, 'nav', NULL, NULL, NULL, 1),
  ('core', 4, '符石图鉴', '符石共鸣套装、词条洗练与评分', '/runes', NULL, 'nav', NULL, NULL, NULL, 1)
ON CONFLICT(section, slot) DO NOTHING;

-- ---- 实用工具：4 格（前两个带角标）----
INSERT INTO home_links (section, slot, title, description, route, query_string, icon_source, icon_url, badge_text, badge_color, is_active)
VALUES
  ('tool', 1, '魔物出战搭配模拟器', '全角色与魔物羁绊加成实时计算，智能推导最优方案', '/sims', NULL, 'nav', NULL, 'HOT', 'red', 1),
  ('tool', 2, '模拟招募抽卡', '真实还原原版抽卡概率、卡池保底机制与立绘动画', '/gacha', NULL, 'nav', NULL, 'NEW', 'green', 1),
  ('tool', 3, '魔物收益速查', '各阶段魔物蛋孵化时间、预计产出与金币收益全览', '/petseggs', NULL, 'nav', NULL, NULL, NULL, 1),
  ('tool', 4, '营地菜谱查询器', '食材最佳搭配组合、饱食度收益与战斗增益 Buff', '/recipes', NULL, 'nav', NULL, NULL, NULL, 1)
ON CONFLICT(section, slot) DO NOTHING;

-- ---- 核心角色：4 格（与 heroes.json 对齐）----
INSERT INTO home_heroes (slot, hero_id, tip, is_active)
VALUES
  (1, 'hero_053', '多段连击 / 范围刈割', 1),
  (2, 'hero_049', '箭雨压制 / 穿甲破防', 1),
  (3, 'hero_027', '散射爆刀 / 穿透清兵', 1),
  (4, 'hero_036', '范围水伤 / 击退控场', 1)
ON CONFLICT(slot) DO NOTHING;

-- ---- 底部两栏：2 组 ----
INSERT INTO home_blocks (section, title, subtitle, rows_json, is_active)
VALUES
  ('guide', '大书院交流', '站内自由发言，交流玩法心得',
   '[{"tag":"交流","label":"大书院讨论区","text":"全站自由发言，交流玩法心得"},{"tag":"勘误","label":"数据校准","text":"遇到数值错误或文本缺失可在讨论区反馈"},{"tag":"群号","label":"大书院群","text":"交流群 963318625，一起探索深渊秘境"}]',
   1),
  ('help', '新人攻略', '占位',
   '[{"tag":"攻略","label":"占位1","text":"占位1"},{"tag":"攻略","label":"占位2","text":"占位2"},{"tag":"攻略","label":"占位3","text":"占位3"}]',
   1)
ON CONFLICT(section) DO NOTHING;

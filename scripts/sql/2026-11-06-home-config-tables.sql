-- ============================================================
-- 首页 4 张配置表数据（2026-11-06）
-- ============================================================
-- 背景：2026-11-05 只给 notices 灌了数据，home_banners / home_links /
--       home_heroes / home_blocks 建了表但一直是空的，导致后台「首页管理」
--       各标签页与前台都只能显示代码里的兜底内容。
--
-- 幂等：INSERT OR REPLACE 按主键覆盖，重复执行结果一致。
-- 数据逐字取自本机库。

-- ---------- 海报轮播（3 张） ----------
INSERT OR REPLACE INTO home_banners (id, title, description, tag_text, tag_class, sub_tag, image_url, bg_color, blend_start, btn_text, action_type, action_value, sort_order, is_active, created_at, updated_at) VALUES
  ('banner-v120', '欢迎来到深渊之歌', '来吧，工匠大人。
深渊的风，已经静候您多时了。', '欢迎', 'teal', '', '/images/banners/home-banner-3.webp', '#1a3832', 'rgba(26, 56, 50, 0.95)', '查看游戏简介', 'notice', 'official-5', 1, 1, '1793609737.0', '1793609737.0'),
  ('banner-gacha', '荒野计费测试现已开始', '「荒野测试」开测在即
全新角色登场、全新魔物上线、 全新角色时装、限时秘境挑战「洛莉安的幽夜古堡」', '荒野计费测试', 'red', '付费测试', '/images/banners/home-banner-1.webp', '#3a2416', 'rgba(58, 36, 22, 0.95)', '前往查看详细', 'external', 'https://www.taptap.cn/moment/864080934587075947?group_id=973894', 2, 1, '1793609737.0', '1793609737.0'),
  ('banner-sims', '深渊大书院交流群现已创建', '深渊大书院交流群现已创建
欢迎各位契约者前往沟通交流', '大书院交流群', 'info', '沟通交流', '/images/banners/home-banner-2.webp', '#382216', 'rgba(56, 34, 22, 0.95)', '前往加群', 'external', 'https://qun.qq.com/universal-share/share?ac=1&authKey=AV%2BTocfcp1TtVCSa1tqSAvCFZDeszAXWB%2B%2Bb3dnsap/5ovn5saulLXMbJM3qCcRD&busi_data=eyJncm91cENvZGUiOiI5NjMzMTg2MjUiLCJ0b2tlbiI6Ik1YNFV3UXpqMDY2a1F2VjdlbkFQNkM3aUZ5dUI0bHJzaTBnOTlqNHNpcWNlTjRyRFllcTQ2WGVVT0pBTHEwM1EiLCJ1aW4iOiIxOTY1MTYxNjQzIn0=&data=8dUiFBVNaonKdN8v0r32UaW8hIXkzXts3GcEcRSaFeobWqA_JlHP7YJuTCJC9cz1iMG-kgMC3bbMKYzVOKf0iO5goSynDZxr3ZsAWKvuS34&svctype=5&tempid=h5_group_info', 3, 1, '1793609737.0', '1793609737.0');

-- ---------- 图鉴与工具（8 格：核心 4 + 工具 4） ----------
INSERT OR REPLACE INTO home_links (section, slot, title, description, route, query_string, icon_source, icon_url, badge_text, badge_color, is_active) VALUES
  ('core', 1, '角色图鉴', '角色属性，技能，星阶
角色互动文本', '/heroes', NULL, 'nav', NULL, NULL, NULL, 1),
  ('core', 2, '怪物图鉴', '怪物基础属性
怪物状态，技能释放条件', '/monsters', NULL, 'nav', NULL, NULL, NULL, 1),
  ('core', 3, '任务图鉴', '全任务流程
全剧情文本，支持关键词搜索', '/tasks', '', 'nav', NULL, NULL, NULL, 1),
  ('core', 4, '副本图鉴', '副本路线
商人，宝箱产出', '/dungeons', NULL, 'nav', NULL, NULL, NULL, 1),
  ('tool', 1, '模拟招募', '欢迎游戏抽卡概率、欧非鉴定器', '/gacha', NULL, 'nav', NULL, 'HOT', 'red', 1),
  ('tool', 2, '魔物出战推荐', '实现属性收益最大化', '/sims', 'tab=monster-team', 'custom', NULL, 'NEW', 'green', 1),
  ('tool', 3, '魔物收益速查', '各魔物蛋孵化时间、银币收益与经验收益全览', '/petseggs', NULL, 'nav', NULL, '111', NULL, 1),
  ('tool', 4, '菜谱查询', '食材组合、战斗增益 Buff', '/recipes', '', 'nav', '', '', '', 1);

-- ---------- 核心角色（4 位） ----------
INSERT OR REPLACE INTO home_heroes (slot, hero_id, tip, is_active) VALUES
  (1, 'hero_053', '范围伤害/残血收割', 1),
  (2, 'hero_049', '范围伤害 /高伤爆发 ', 1),
  (3, 'hero_027', '范围伤害 / 高效清场', 1),
  (4, 'hero_036', '范围水伤 / 易伤，控制', 1);

-- ---------- 底部两栏（2 块） ----------
INSERT OR REPLACE INTO home_blocks (section, title, subtitle, rows_json, is_active) VALUES
  ('guide', '大书院交流', '占位', '[{"tag":"交流","label":"大书院讨论区","text":"全站自由发言，交流玩法心得","actionType":"none","actionValue":""},{"tag":"勘误","label":"数据校准","text":"遇到数值错误或文本缺失可在讨论区反馈","actionType":"none","actionValue":""},{"tag":"群号","label":"大书院群","text":"交流群 963318625，一起探索深渊秘境","actionType":"none","actionValue":""}]', 1),
  ('help', '新人攻略', '占位', '[{"tag":"攻略","label":"占位1","text":"占位1","actionType":"none","actionValue":""},{"tag":"攻略","label":"占位2","text":"占位2","actionType":"none","actionValue":""},{"tag":"攻略","label":"占位3","text":"占位3","actionType":"none","actionValue":""}]', 1);

SELECT (SELECT COUNT(*) FROM home_banners) AS banners,
       (SELECT COUNT(*) FROM home_links)   AS links,
       (SELECT COUNT(*) FROM home_heroes)  AS heroes,
       (SELECT COUNT(*) FROM home_blocks)  AS blocks;
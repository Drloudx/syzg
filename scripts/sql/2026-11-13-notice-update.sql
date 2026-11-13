-- ============================================================
-- 站点更新公告：任务全链推导、关卡大地图与 1.7.15 数据同步（2026-11-13）
-- ============================================================
-- 执行方式（生产 D1）：
--   npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/2026-11-13-notice-update.sql
-- 执行方式（本地 D1）：
--   npx wrangler d1 execute myrzg-comments --local --file=./scripts/sql/2026-11-13-notice-update.sql

INSERT INTO notices (
  id,
  channel,
  tier,
  slot,
  title,
  content,
  date,
  tag_text,
  tag_class,
  version,
  features_json,
  source_url,
  is_active,
  show_in_modal,
  created_at,
  updated_at
) VALUES (
  'site-20261113',
  'site',
  'normal',
  NULL,
  '版本更新：任务全链推导、关卡大地图与 1.7.15 数据同步',
  '<p>各位学者、探求者与工匠大人：</p><p>本站已全面完成与游戏 1.7.15 最新版本的数据对齐，并针对任务图鉴、关卡大地图、魔物收益等核心模块进行了系统性功能扩展与体验优化：</p><p><strong>任务图鉴</strong>　<strong>接取条件与前置任务链全面上线</strong>。彻底修正了此前部分任务接取条件误显为「无」的问题，现已支持战败触发、主线章节终局解锁、伙伴好感度门槛与委托池开启条件的多级智能推导；详情弹窗新增「前置任务」互动板块，支持点击标签同页跳转上游任务，任务链路双向贯通。</p><p><strong>关卡与大地图</strong>　<strong>幽夜古堡与副本地图全线打通</strong>。同步更新 EX1 幽夜古堡与 EX2 史莱姆王国全域路线图、房间配置及亚空回廊入口；关卡房间波次魔物头像全量补全，优化石像鬼、加尔戈萝等魔物详情立绘展示；关卡房间 NPC 覆盖率提升至 100%，并实现过场镜头机位智能去重。</p><p><strong>魔物与收益</strong>　魔物收益页重新梳理奖池归属，明确区分「银币池」与「氪金池」并去除冗余推荐；魔物图鉴「特性表格」重构为标准独立滚动框架，支持 1~7 级特性数值直观对比与移动端窄屏自适应；完善变异形态立绘回退机制。</p><p><strong>图鉴资料同步</strong>　同步游戏 1.7.15 最新热更配置与剧情剧本；角色图鉴解除菲娜、露库希安的展示限制，收录德莉、斯卡莉安、洛莉安等新伙伴完整档案。</p><p>感谢大家长期以来的支持与反馈，若在使用过程中发现任何数据疏漏，欢迎前往学者讨论区或交流群与我们联系。</p>',
  '2026-11-13',
  '更新',
  'patch',
  '1.7.15',
  NULL,
  NULL,
  1,
  1,
  '2026-11-13',
  '2026-11-13'
)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  content = excluded.content,
  date = excluded.date,
  tag_text = excluded.tag_text,
  tag_class = excluded.tag_class,
  version = excluded.version,
  is_active = excluded.is_active,
  show_in_modal = excluded.show_in_modal,
  updated_at = excluded.updated_at;

-- 更新首页公告插槽 2（位列置顶声明之后）
UPDATE home_notice_slots SET
  notice_id = 'site-20261113',
  updated_at = '2026-11-13'
WHERE channel = 'site' AND slot = 2;

SELECT id, channel, slot, title, date, tag_text, is_active, show_in_modal FROM notices WHERE id = 'site-20261113';

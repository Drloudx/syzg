-- ============================================================
-- 生产库：更新 site-5 / site-7 为正式站点更新公告（2026-11-05）
-- ============================================================
-- 内容逐字取自用户改后的本地库，未做任何改写。
-- 只更新这两行，不动其余 4 条公告与插槽。

UPDATE notices SET
  title = '功能更新：神匠之塔图鉴已上线',
  content = '<p>「神匠之塔」图鉴已开放。收录全部 80 层挑战数据，按楼层展示通关目标、限定时间、弱点属性与守关阵容属性。</p><p>每 5 层的首领关卡单独标注挑战机制，包含单次限时、单次进度上限。</p><p>页面入口：导航栏「图鉴资料 → 神匠之塔」，或直接访问 /tower。</p>',
  date = '2026-11-05',
  tag_text = '功能',
  tag_class = 'patch',
  is_active = 1,
  show_in_modal = 1,
  updated_at = '2026-11-05'
WHERE id = 'site-5';

UPDATE notices SET
  title = '体验优化：列表加载与阅读体验改进',
  content = '<p>本轮对全站浏览体验做了如下调整：</p><p><strong>列表加载</strong>　图鉴类页面改为按可视区域分批渲染，滚动时不再一次性加载全部条目，长列表滑动更顺畅，低配设备内存占用明显下降。</p><p><strong>怪物详情</strong>　日常计划、副本图鉴、关卡图鉴与神匠之塔中的魔物名称均可点击查看详情，查看过程不离开当前页面，返回后停留在原位置。</p><p><strong>移动端</strong>　修正了触屏拖动时误选文字的问题。</p>',
  date = '2026-11-05',
  tag_text = '优化',
  tag_class = 'info',
  is_active = 1,
  show_in_modal = 1,
  updated_at = '2026-11-05'
WHERE id = 'site-7';

SELECT id, title, date, tag_text, show_in_modal FROM notices WHERE id IN ('site-5','site-7');

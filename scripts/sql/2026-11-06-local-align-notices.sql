-- ============================================================
-- 本地库对齐生产：公告只留 6 条，id 重排连续（2026-11-06）
-- ============================================================
-- 目标状态 = 生产库现状：
--   site-1  09-19  深渊大书院站点免责声明与服务协议
--   site-2  10-25  大书院学者讨论区交流准则
--   site-3  11-05  体验优化：列表加载与阅读体验改进
--   site-4  11-05  功能更新：神匠之塔图鉴已上线
--   official-1  11-01  游戏简介
--   official-2  11-02  「荒野计费测试」内容一览！…
--
-- 本地现状：site 57 条（含 51 条「UI 测试公告」+ site-2/3/6）、
--           official 6 条（含 official-4「测试：更新的普通通知」）
--
-- 🔴 这是**删除数据**的操作。执行前已导出：
--    backups/backup-local-before-align.sql（5.2 MB）
--    需要恢复时用它重建本地库。
--
-- 顺序说明：先删多余的，再把保留项搬到连续 id，最后修插槽。
--   保留项的旧 id 与新 id 有交叠（site-4 → site-2，而 site-2 本身要被删），
--   所以「先删干净 → 再两段式改名」不会撞主键。

-- ① 删除不在目标清单里的公告
DELETE FROM notices
WHERE id NOT IN ('site-1','site-4','site-5','site-7','official-5','official-6');

-- ② 两段式改名：先全部搬到 old- 前缀，再落地到目标 id
UPDATE notices SET id = 'old-site-4'     WHERE id = 'site-4';
UPDATE notices SET id = 'old-site-5'     WHERE id = 'site-5';
UPDATE notices SET id = 'old-site-7'     WHERE id = 'site-7';
UPDATE notices SET id = 'old-official-5' WHERE id = 'official-5';
UPDATE notices SET id = 'old-official-6' WHERE id = 'official-6';

UPDATE notices SET id = 'site-2'     WHERE id = 'old-site-4';
UPDATE notices SET id = 'site-3'     WHERE id = 'old-site-7';
UPDATE notices SET id = 'site-4'     WHERE id = 'old-site-5';
UPDATE notices SET id = 'official-1' WHERE id = 'old-official-5';
UPDATE notices SET id = 'official-2' WHERE id = 'old-official-6';

-- ③ 重置插槽，与生产完全一致。
--    生产实际是 8 个位置全填：site 依次 site-1/4/3/2，official 依次 official-2/1 + 末两位空。
--    （不要照搬迁移脚本里的「site 只固定 1 和 4」—— 那是初始值，后台已改过。）
DELETE FROM home_notice_slots;
INSERT INTO home_notice_slots (channel, slot, notice_id, updated_at) VALUES
  ('site', 1, 'site-1', '2026-11-01'),
  ('site', 2, 'site-4', '2026-11-01'),
  ('site', 3, 'site-3', '2026-11-01'),
  ('site', 4, 'site-2', '2026-11-01'),
  ('official', 1, 'official-2', '2026-11-01'),
  ('official', 2, 'official-1', '2026-11-01'),
  ('official', 3, NULL, '2026-11-01'),
  ('official', 4, NULL, '2026-11-01');

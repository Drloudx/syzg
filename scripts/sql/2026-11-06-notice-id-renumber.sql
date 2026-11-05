-- ============================================================
-- 公告 ID 重排为连续编号（2026-11-06）
-- ============================================================
-- 现状（**生产库**，共 6 条）：
--   site-1(09-19) site-5(11-05) site-7(11-05) site-4(10-25)
--   official-6(11-02) official-5(11-01)
-- 成因：历史测试数据用过 site-1001~1050，后端取「最大编号 +1」，
--       之后的编号就从 1051 起跳；删掉测试数据后编号仍不连续。
--
-- 目标（按日期升序编号，最早 = 1）：
--   site-1(09-19)      → site-1   （不变）
--   site-4(10-25)      → site-2
--   site-7(11-05 优化)  → site-3
--   site-5(11-05 功能)  → site-4
--   official-5(11-01)  → official-1
--   official-6(11-02)  → official-2
--
-- 🔴 本机库另有 site-2/site-3/site-6 与大量「UI 测试」数据，**不在本脚本范围**。
--    本脚本只针对生产这 6 条；在本机跑会撞主键（site-4 → site-2 时 site-2 已存在）。
--
-- 🔴 三步走，缺一步就撞主键：
--   ① 先把**所有**要改的旧 id 搬到 `old-` 前缀（腾空目标位置）；
--   ② 再把 `old-` 改成新 id；
--   ③ 最后同步 home_notice_slots 的引用（同样两段式）。
--   之前用 tmp- 前缀只搬了一半就改名，被还没搬走的 site-4 挡住 ——
--   必须「全部搬走 → 再全部落地」，不能边搬边落地。
--
-- 🔴 不要写显式事务语句：D1 会拒绝（连注释里出现该关键字都判为「多个事务」）。
--    单个 SQL 文件由 D1 按批次原子执行，失败自动整体回滚。
--
-- 幂等：只更新仍处于旧 id 的行；重复执行时旧 id 已不存在，UPDATE 影响 0 行。

-- ① 全部搬到临时前缀
UPDATE notices SET id = 'old-site-4'      WHERE id = 'site-4';
UPDATE notices SET id = 'old-site-5'      WHERE id = 'site-5';
UPDATE notices SET id = 'old-site-7'      WHERE id = 'site-7';
UPDATE notices SET id = 'old-official-5'  WHERE id = 'official-5';
UPDATE notices SET id = 'old-official-6'  WHERE id = 'official-6';

-- ② 落地到新 id
UPDATE notices SET id = 'site-2'     WHERE id = 'old-site-4';
UPDATE notices SET id = 'site-3'     WHERE id = 'old-site-7';
UPDATE notices SET id = 'site-4'     WHERE id = 'old-site-5';
UPDATE notices SET id = 'official-1' WHERE id = 'old-official-5';
UPDATE notices SET id = 'official-2' WHERE id = 'old-official-6';

-- ③ 同步插槽引用。
--    先处理「会被后续步骤当作源」的项会冲突：例如先把 site-4 → site-2，
--    后面的 site-5 → site-4 就会误改刚落地的那条。所以同样分两段：
--    先把旧引用搬到 old- 前缀，再统一落地。
UPDATE home_notice_slots SET notice_id = 'old-site-4'     WHERE notice_id = 'site-4';
UPDATE home_notice_slots SET notice_id = 'old-site-5'     WHERE notice_id = 'site-5';
UPDATE home_notice_slots SET notice_id = 'old-site-7'     WHERE notice_id = 'site-7';
UPDATE home_notice_slots SET notice_id = 'old-official-5' WHERE notice_id = 'official-5';
UPDATE home_notice_slots SET notice_id = 'old-official-6' WHERE notice_id = 'official-6';

UPDATE home_notice_slots SET notice_id = 'site-2'     WHERE notice_id = 'old-site-4';
UPDATE home_notice_slots SET notice_id = 'site-3'     WHERE notice_id = 'old-site-7';
UPDATE home_notice_slots SET notice_id = 'site-4'     WHERE notice_id = 'old-site-5';
UPDATE home_notice_slots SET notice_id = 'official-1' WHERE notice_id = 'old-official-5';
UPDATE home_notice_slots SET notice_id = 'official-2' WHERE notice_id = 'old-official-6';

# HOME_CONTENT —— 首页内容可配置化（方案与现状）

> **状态**：**方案已定，未实施**（0 行业务代码、0 张表）。
> **何时读**：要动手实现首页后台编辑（公告 / 海报 / 图鉴入口 / 角色 / 底栏）时；或评估"改首页要不要改代码"时。
> **何时更新**：表结构、字段口径、后台交互定案或变化时；实施完成后改为"已实施"并补核对时间。

**核对时间**：2026-10-31（方案评审完成，未落库）

---

## 一、要解决什么

首页 `/`（`HomeView.vue`）目前 **6 个板块全部硬编码**，改一条公告要改代码 + 提交 + 等部署。

| # | 板块 | 当前实现位置 | 数据 | 可配置化后 |
| --- | --- | --- | --- | --- |
| ① | 海报轮播 | `HomeView.vue` `bannerList` | 3 条硬编码 | 后台增删改 + 排序 |
| ② | 站点公告 | `noticesData.site` | 4 条硬编码 | 后台 CRUD |
| ③ | 官方公告 | `noticesData.official` | 3 条硬编码 | 后台 CRUD |
| ④ | 官方速览卡 | `HomeView.vue` HTML | 版本号 + 4 条特性硬编码 | 随官方公告字段 |
| ⑤ | 核心图鉴 | `HomeView.vue` HTML | 4 个硬编码 | 后台编辑 4 格 |
| ⑥ | 实用工具 | `HomeView.vue` HTML | 4 个硬编码 | 后台编辑 4 格 |
| ⑦ | 核心角色 | `featuredHeroes` | 4 个硬编码 | 后台选角色 |
| ⑧ | 底部两栏 | `HomeView.vue` HTML | 硬编码 | 后台编辑（结构待定） |

另有一处：`public/data/notice.json`（3 条）供 `NoticeModal.vue` 弹窗使用，改造时同样接新数据源（保留文件兜底）。

---

## 二、数据模型（定案：新增 5 张表）

现有 D1 10 张表 → 改造后 15 张。

| 表 | 用途 | 数量策略 | 主键 |
| --- | --- | --- | --- |
| `notices` | 公告（站点 + 官方合并） | 可增减 | `id` |
| `home_banners` | 海报轮播 | **可增减** | `id` + `sort_order` |
| `home_links` | 核心图鉴 + 实用工具 | 各固定 4 格 | `(section, slot)` |
| `home_heroes` | 核心角色 | 固定 4 格 | `slot` |
| `home_blocks` | 底部两栏 | 固定 2 组 | `section` |

### 为什么站点公告与官方公告合并

- `title` / `content` / `date` / `tag_text` / `tag_class` / 排序 / 软删除 —— **90% 字段相同**。
- 官方额外只需 3 个可空字段：`version`（版本号）、`features_json`（特性列表）、`source_url`。
- 「查看完整卷轴」未来要**跨频道混排**，一张表一条 `ORDER BY date` 即可。
- 后台 UI 仍按 `channel` 分两个 Tab，用户侧看不出差别。
- 拆分成本很低（见 §六），所以先合并。

### 为什么核心图鉴与实用工具合并

字段对照：

| 字段 | 核心图鉴 | 实用工具 |
| --- | --- | --- |
| `title` / `description` | ✅ | ✅ |
| `route` / `query_string` | ✅ | ✅ |
| `icon_source` / `icon_url` | ✅ | ✅ |
| `slot` | ✅ | ✅ |
| `badge_text` / `badge_color` | ❌ | ✅（多这两个，核心区留 NULL） |

用 `section`（`'core'` / `'tool'`）+ `slot`（1..4）联合主键。

---

## 三、字段设计

### 3.1 `notices`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT PK | 稳定标识，前端已读去重键用它 |
| `channel` | TEXT | `'site'` / `'official'` |
| `tier` | TEXT | `'pin'`（固定项）/ `'normal'`（滚动项） |
| `slot` | INTEGER | `tier='pin'` 时指定固定位置；normal 为 NULL |
| `title` | TEXT | 标题 |
| `content` | TEXT | 受限标记文本（见 §四） |
| `date` | TEXT | `YYYY-MM-DD` |
| `tag_text` | TEXT | `置顶` / `功能` / `数据` / `社区` / `版本` / `修复` |
| `tag_class` | TEXT | `pinned` / `patch` / `event` / `info` / `gold` |
| `version` | TEXT | **official 专用**：`v1.2.0「深境微光」` |
| `features_json` | TEXT | **official 专用**：`["新 5 星…","主线第 8 章…"]` |
| `source_url` | TEXT | 官方原文链接（可选） |
| `is_active` | INTEGER | 软删除 / 停用 |
| `created_at` / `updated_at` | TEXT | 审计 |

**显示规则**：`pin` 项按 `slot` 固定位置常驻；`normal` 项按 `date` 倒序取最新 N 条。
例：站点公告现显示 4 条 = 第 1 条 `pin slot=1`（免责）+ 2 条 `normal` + 第 4 条 `pin slot=4`（社区规则）。

### 3.2 `home_banners`（可增减）

`id` / `title` / `description` / `tag_text` / `tag_class` / `sub_tag` / `image_url` / `bg_color` / `blend_start` / `btn_text` / `action_type`（`route`|`notice`）/ `action_value` / `sort_order` / `is_active` / `created_at` / `updated_at`

- 轮播逻辑已用 `% bannerList.length`，天然支持任意数量。
- **边界处理**：仅 1 张时需隐藏左右箭头与圆点指示器（模板加 `v-if="banners.length > 1"`）。

### 3.3 `home_links`

`section` / `slot` / `title` / `description` / `route` / `query_string` / `icon_source`（`nav`|`custom`）/ `icon_url` / `badge_text` / `badge_color` / `is_active`

### 3.4 `home_heroes`

`slot` / `hero_id` / `tip` / `is_active`

- **只存 `hero_id`**，名字 / 星级 / 职业 / 属性 / 立绘运行时从 `heroes.json` join。
- `tip`（如「群体高爆发 / 灼烧伤害」）不在 `heroes.json` 里，必须单独存。

### 3.5 `home_blocks`

`section`（`guide`|`help`）/ `title` / `subtitle` / `rows_json` / `is_active`

`rows_json` 形如 `[{"tag":"刷新","label":"每日 05:00","text":"免费招募、公会签到与扫荡次数"}]`
用 JSON 而非独立表：该区块内容形态**尚未定稿**，JSON 便于后续调整而不必迁移。

---

## 四、富文本方案

**受限标记 + 工具栏 + 双栏预览**，不引第三方编辑器，不用 `v-html`。

| 语法 | 效果 | 工具栏 |
| --- | --- | --- |
| `**文字**` | 加粗 | B |
| `*文字*` | 斜体 | I |
| `{red}文字{/red}` | 预设色 | 颜色▾ |
| `- 文字` | 列表项 | 列表 |
| `[文字](链接)` | 链接 | 链接 |

颜色预设（写死，不允许自定义 hex）：

| key | 色值 | 语义 |
| --- | --- | --- |
| `red` | `#c0392b` | 重要 / 警告 |
| `gold` | `#b8860b` | 强调 |
| `teal` | `#16a085` | 提示 |
| `muted` | `#8a6d4d` | 次要 |

**安全**：解析成 VNode 数组渲染，从机制上杜绝 XSS；禁止 `v-html`。

---

## 五、后台交互口径

| 项 | 结论 |
| --- | --- |
| 区块数量 | 海报可增减；图鉴 / 工具 / 角色固定 4 格；底栏固定 2 组 |
| 图鉴路由名 | 读 `NavigationMenu.vue` 的 `name`（与 `App.vue` 的 `PAGE_TITLES` 实测 21 个路由完全一致） |
| 图鉴图标 | `icon_source='nav'` 时自动取该路由在导航里的 `icon` |
| 二级参数 | **手填** `query_string`（如 `tab=hidden`）；各页参数名不统一（`tab` / `facility+mode` / `cat+sub`），不做参数选择器 |
| 角标 | `badge_text` 自由文本（HOT / NEW / 热门）；`badge_color` 五选一：red / green / gold / teal / gray |
| 角色标签 | `tip` 自由文本 |
| 删除 | 优先「停用」`is_active=0`，保留数据可恢复 |

---

## 六、迁移与上线

### 6.1 为什么本地库和线上库不同步是正常的

| 项 | 本地 | 线上 |
| --- | --- | --- |
| 命令 | `npm run dev:api` | GitHub 推送后自动构建 |
| 位置 | `.wrangler/state/v3/d1/*.sqlite` | Cloudflare 边缘 |
| 参数 | `--local`（默认） | `--remote` |

**只同步结构（SQL 脚本），不同步数据。** 本地测试数据不搬到线上；线上数据由后台录入。

### 6.2 顺序（红线第 6 条：先迁移、后推送）

```powershell
# 1) 备份
npx wrangler d1 export myrzg-comments --remote --output backup-before.sql
# 2) 建表（幂等：CREATE TABLE IF NOT EXISTS + INSERT ... ON CONFLICT DO NOTHING）
npx wrangler d1 execute myrzg-comments --remote --file=./scripts/sql/<新脚本>.sql
# 3) 验证表已建
npx wrangler d1 execute myrzg-comments --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
# 4) 此时才 git push（推送即上线）
```

**顺序反了会整站白屏**：代码查不存在的表。

🔴 **不带 `--remote` 默认操作本地库** —— 本地测完忘加，上线才会发现表不存在。

### 6.3 初始数据

把 `HomeView.vue` 现有硬编码内容搬进迁移脚本的 `INSERT`，并加 `ON CONFLICT(id) DO NOTHING` 保证幂等（重复执行不覆盖后台已改内容）。

### 6.4 拆表成本（未来若要拆分 channel）

新增一个 SQL 文件 + `tests/migration/rehearse.mjs` 的 `STEPS` 加一行即可：

```sql
CREATE TABLE official_notices (...);
INSERT INTO official_notices SELECT ... FROM notices WHERE channel='official';
DELETE FROM notices WHERE channel='official';
```

改造面：迁移 5 分钟 / API 20 分钟 / 后台组件 30 分钟 / 前端 10 分钟，半天以内。
**唯一风险**：拆分属改 schema，必须先 `d1 export` 备份。

---

## 七、实施顺序

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| **P1** | 5 张表 DDL + 初始数据 INSERT + 跑通 `npm run test:migration` | 无 |
| **P2** | `GET /api/home-config` 聚合读 + 前端改造（**保留硬编码兜底**） | P1 |
| **P3** | 后台公告管理（最痛的点） | P2 |
| **P4** | 后台海报 / 图鉴 / 工具 / 角色 / 底栏 | P3 |
| **P5** | 富文本编辑器组件 | P3 |

**当前建议顺序**：先做 P1（建表，网站行为不变），再改 UI，最后接 API。理由：UI 改动不改变数据结构，但数据结构会限制 UI 可能性；先建表可在改 UI 时确认字段是否够用，此时加列零成本。

---

## 八、API 端点设计

```
公开
GET  /api/home-config              一次性返回全部首页配置

管理（role >= 1）
GET    /api/admin/notices          列表（?channel=）
POST   /api/admin/notices          新建
PATCH  /api/admin/notices          修改
DELETE /api/admin/notices          软删（is_active=0）
PUT    /api/admin/home-banners     整组保存（可增减）
PUT    /api/admin/home-links       整组保存（?section=core|tool）
PUT    /api/admin/home-heroes      整组保存（固定 4 格）
PUT    /api/admin/home-blocks      整组保存（?section=guide|help）
```

- `home_*` 用 PUT 整组保存：数量固定、无单条增删，整组提交最简单，也能一次完成排序。
- 所有写操作记 `admin_audit`。
- `GET /api/home-config` 一次请求取全部（不是 6 个），减少往返。

---

## 九、额度与风险

### 9.1 额度实测（2026-10-30，近 7 天）

| 项 | 免费额度 | 峰值 | 占用 |
| --- | --- | --- | --- |
| D1 存储 | 5 GB | 152 KB | 0.003% |
| D1 读行 | 500 万/天 | 4,795 | 0.1% |
| D1 写行 | 10 万/天 | 30 | 0.03% |
| Pages Functions | 100 万/天 | 701 | 0.07% |
| Pages 带宽 | 无限 | — | — |

新增 5 张表约 +30~50 KB、约 100 行数据，额度完全够用。

### 9.2 风险清单

| 风险 | 应对 |
| --- | --- |
| 生产 D1 执行迁移 | 先 `d1 export` 备份；先迁移后推送 |
| API 挂掉导致首页空白 | 前端保留硬编码兜底常量 |
| CSP 拦截外链图 | `public/_headers` 的 `img-src` 加**指定域名**白名单，不用 `img-src *` |
| 富文本 XSS | 解析成 VNode 渲染，禁 `v-html` |
| 公告弹窗重复弹 | 已解决：`noticeKey()` 用 `id` 去重，已读存**集合**（`lastNoticeKey`）而非单条 |
| 海报仅 1 张 | 隐藏箭头与指示点 |

---

## 十、已完成的关联修复（非本方案，但同批）

| 项 | 内容 |
| --- | --- |
| `is-boot-loading` 永不移除 | `App.vue` 的首屏就绪判定只认 `.page-view-container`，而 `/` 的 `HomeView.vue` 根节点是 `.home-view` → 该类永不移除 → 其 `overflow: hidden` 一直生效。已改为兜底认 `.app-main > *`。**影响：整页长截图只能截一屏。** |
| 公告弹窗一天多条 | 去重键由天粒度 `date` 改为 `id`；已读记录由单条改为集合。校验了首次弹出 / 已读不重弹 / 同日新增能弹 / 旧记录兼容四种场景。 |
| 公告列表顺序 | 置顶项固定在前，其余按 `date` 倒序（最新在上）；同日保持 JSON 书写顺序。 |

---

## 十一、相关文档

| 内容 | 位置 |
| --- | --- |
| 首页实现与设计 | `src/views/HomeView.vue` |
| 导航与分类 | `src/components/NavigationMenu.vue` |
| 公告弹窗 | `src/components/NoticeModal.vue` |
| 实时公告（当前数据源） | `public/data/notice.json` |
| 后端单文件 | `functions/api/[[path]].js` |
| 表结构 | `schema.sql` |
| 迁移演练 | `tests/migration/rehearse.mjs` |
| 迁移脚本目录 | `scripts/sql/` |
| 发布流程 | [RUNBOOK.md](../RUNBOOK.md) §6.2 |

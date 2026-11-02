# HOME_CONTENT —— 首页内容可配置化（方案与现状）

> **状态**：**已实施**（表 / API / 后端管理面板 / 前端接入 全部完成，本地验证通过；**生产库未迁移、未上线**）。
> **何时读**：要改首页后台编辑能力（公告 / 海报 / 图鉴入口 / 角色 / 底栏）时；或排查「首页内容为什么不更新」时。
> **何时更新**：表结构、字段口径、后台交互、权限变化时。

**核对时间**：2026-11-02（新增公告插槽按 ID 填写 + 标题回显；弹窗改由后端按频道强制；D1 迁移共 13 步）

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
- 若将来做「历史公告总览」（跨频道混排），一张表一条 `ORDER BY date` 即可。
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

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT PK | 稳定标识 |
| `title` | TEXT | 主标题 |
| `description` | TEXT | 描述 |
| `tag_text` / `tag_class` | TEXT | 角标文案与配色（`gold`/`red`/`teal`） |
| `sub_tag` | TEXT | 角标副文（如「UP 卡池开启」） |
| `image_url` | TEXT | 海报图（外链或站内路径） |
| `bg_color` / `blend_start` | TEXT | 左侧底色与融合渐变起色 |
| `btn_text` | TEXT | 按钮文案 |
| **`action_type`** | TEXT | **`route` / `notice` / `external`** —— 见下 |
| **`action_value`** | TEXT | 随 `action_type` 解释：路由路径 / 公告 id / 外部 URL |
| `sort_order` | INTEGER | 排序 |
| `is_active` | INTEGER | 启用 / 停用 |
| `created_at` / `updated_at` | TEXT | 审计 |

#### 按钮行动类型（三种）

| `action_type` | `action_value` 示例 | 点击行为 | 后台表单 |
| --- | --- | --- | --- |
| `route` | `/gacha` 或 `/heroes?id=hero_053` | `router.push()` 站内跳转 | 路由下拉（读 `router/index.js`）+ 可选 `query_string` |
| `notice` | `official-v120` | 打开该条公告的详情弹窗（**不跳页**） | 公告下拉（按 `channel` 分组，显示标题） |
| `external` | `https://example.com/xxx` | 新标签打开外链 | URL 输入框 + 域名白名单校验 |

**实施要点**：

1. **`notice` 类型要求公告先有稳定 `id`**。
   当前 `HomeView.vue` 的 `noticesData` **全部没有 `id` 字段**，只有 `title`/`date`/`tagText`/`tagClass`/`content`。
   落地时必须给每条公告加 `id`（与 `notices` 表主键一致），海报才能按 id 定位。

2. **`notice` 从「固定打开同一张卡」改为「按 id 查」**。
   现在 `handleBannerAction` 是 `openNoticeDetail(officialPatchNotice)` —— 硬编码只打开那张速览卡。
   改造后：`openNoticeDetail(noticesByName.get(action_value))`，查不到时回落到默认公告。

3. **`external` 需要改 CSP**。
   `public/_headers` 的 `default-src 'self'` 与 `connect-src 'self'` 会拦住跨域跳转吗？——**跳转（`<a>`/`window.open`）不受 CSP 限制**，只有 `fetch`/`img`/`frame` 才受控。
   所以外链按钮本身无需改 CSP；但若外链是图片或 iframe，需要加 `img-src` / `frame-src` 白名单。

4. **外链安全**：
   - 一律 `rel="noopener noreferrer"`
   - 后台校验必须是 `https://` 开头（拒绝 `javascript:` / `data:`）
   - 可选：维护允许域名白名单，防止误填

5. **可访问性**：按钮已用 `<button>`，键盘可达；外链按钮应加 `aria-label` 说明会跳出站外。

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

`rows_json` 是**行的数组**，每行 5 个字段：

| 字段 | 说明 |
| --- | --- |
| `tag` | 左侧角标（交流 / 勘误 / 群号） |
| `label` | 条目名称 |
| `text` | 说明文字 |
| `actionType` | `none`（默认，纯文本）/ `route` / `notice` / `external` |
| `actionValue` | 随 `actionType` 解释：路径 / 公告 id / https 外链 |

形如：
```json
[{"tag":"交流","label":"大书院讨论区","text":"全站自由发言","actionType":"route","actionValue":"/discussions"}]
```

**后端逐行校验**（`normalizeBlockRow`）：
- `actionType` 不在白名单 → 归一为 `none`（不报错，避免旧数据卡住）
- `route` 有值时必须 `/` 开头
- `external` 有值时必须 `https://`，且拒绝 `javascript:` / `data:` / `vbscript:`
- `notice` 有值时不接受协议或斜杠

不透传原始对象 —— 只写入上述 5 个字段，防止夹带未声明的键。

**前端渲染**：`actionType` 非 `none` 时该行加 `.is-clickable`、`role="link"`、`tabindex="0"`、`@keydown.enter/space` 与 `›` 箭头。

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
| **海报按钮** | 三种行动：`route`（站内跳）/ `notice`（开公告弹窗）/ `external`（新标签外链） |

---

## 五·补、落地前必须解决的问题（实施时逐条核对）

### 问题 1 🔴 **两套公告数据源并存，必须合并**

| 数据源 | 位置 | 用在哪 | 内容 |
| --- | --- | --- | --- |
| A | `public/data/notice.json` | `NoticeModal.vue`（自动弹窗） | 站点声明 + 2 条测试 |
| B | `HomeView.vue` 的 `noticesData` | 首页「本站公告 / 官方更新公告」双 Tab | 站点 4 条 + 官方 3 条 |

**同一件事（站内公告）有两个互不相通的数据源。** 现在内容不同是因为还没统一，一旦后台可编辑，改 A 不会动 B、改 B 不会动 A —— 用户会看到首页和弹窗说法不一致。

**处理**：统一到 `notices` 表 +
- `NoticeModal` 与 `HomeView` 都读 `GET /api/notices`
- 「自动弹窗」只用 `tier='normal'` 的最新一条判定已读（`noticeKey` 用 `id`）
- 保留 `notice.json` 作为 **API 不可用时的兜底**

### 问题 2 🔴 **公告没有稳定 `id`**

现状：`noticesData.site[]` 与 `official[]` 的每一项只有 `title` / `date` / `tagText` / `tagClass` / `content`，**没有 id**。

影响：
- 海报 `action_type='notice'` 无法按 id 定位目标公告
- 弹窗「已读去重」现在靠 `date#title` 兜底（`NoticeModal` 已实现），但改标题就会重新弹

**处理**：迁移时给每条公告补 `id`（建议语义化：`site-disclaimer`、`official-v120`）。

### 问题 3 ⚠️ **公告详情弹窗不可通过 URL 直达**

现在 `openNoticeDetail()` 只设置本地 `activeModalNotice`，不写 URL。所以：
- 海报跳公告没问题（同一页内）
- 但**无法分享「某条公告」的链接**，刷新后弹窗消失

**处理**（可选）：弹窗打开时 `router.replace({ query: { notice: id } })`，关闭时清除；`onMounted` 读 `?notice=` 自动打开。与 `/heroes?id=`、`/misc?tab=` 口径一致。

### 问题 4 ⚠️ **首页 6 个板块全部依赖单一 API，需分级兜底**

若 `GET /api/home-config` 失败，首页会整块空白。建议：
- 每个板块（海报/公告/图鉴/工具/角色/底栏）**各自独立兜底**
- 兜底值就是当前 `HomeView.vue` 的硬编码内容（迁移时保留为 `DEFAULT_*` 常量）
- 单个板块失败只影响该板块，不整页白屏

### 问题 5 ⚠️ **「大书院交流 / 新人攻略」里是占位内容**

当前「新人攻略」三行都是「占位1/2/3」（用户确认暂时保留）。
`home_blocks` 建表时 `rows_json` 按现有结构（`{tag, label, text}`）落，内容留空即可，不必为占位符设计特殊字段。

### 问题 6 ⚠️ **海报外链的 CSP 边界**

| 场景 | 是否受 CSP 限制 |
| --- | --- |
| `<a href="https://外链">` / `window.open` **跳转** | ❌ 不受限（CSP 管资源加载，不管导航） |
| 外链作为 `<img src>` | ✅ 受 `img-src` 限制，需加域名白名单 |
| 外链作为 `<iframe>` | ✅ 受 `frame-src` 限制，需加白名单 |

当前需求只有「按钮跳转」，所以 **`_headers` 无需改动**。若将来海报图直接用外链，才需要加 `img-src`。

### 问题 7 ✅ **「查看完整卷轴」已下线（死代码已清理，2026-11-01）**

该入口已从首页移除，不存在「按钮承诺能看到全部公告、实际看不到」的问题。

清理内容：

| 项 | 处理 |
| --- | --- |
| `openAllNotices()` 函数 | 已删除（无调用点） |
| `.notices-more-link` 样式（含 dark-mode 两处） | 已删除 |

当前公告区只有两个入口，语义清晰：
- 左侧列表条目 → `openNoticeDetail(item)` 打开该条详情
- 右侧速览卡「查看完整公告」→ 打开 `officialPatchNotice`（官方版本完整日志）

> 若将来要提供「历史公告总览」，需要新做列表页或弹窗，不能复用已删的这段。

### 问题 8 ⚠️ **首页没有加载态 / 错误态**

首页目前是纯静态渲染（`noticesData` 硬编码），**没有任何 `loading` / `error` UI**。
接入 API 后互联网延迟会暴露空窗期，必须补：

| 状态 | 处理 |
| --- | --- |
| 加载中 | 各板块显示骨架（不要整页 spinner，避免布局跳动） |
| 部分失败 | 该板块显示兜底内容，不整页报错 |
| 全部失败 | 全用 `DEFAULT_*` 常量，页面照常可用 |

前端已有可复用的 `UiEmptyState`（`type="loading"` / `type="error"`），不必新造。

### 问题 9 ⚠️ **区块标题全部硬编码，不可配置**

```html
<span>核心图鉴</span>  <span>实用工具</span>  <span>契约者展示</span>
<span>大书院交流</span>  <span>新人攻略</span>
```

5 个 section 标题 + 若干副标题（如「热门角色」「当前版本热门养成角色」）都写死在模板里。

**两种处理**：
- 若认为标题不需要后台改 → 保持硬编码，但**在文档里写明「标题不可配」**，避免以后误以为能改
- 若要能改 → 加一张极简的 `home_sections(section, title, subtitle)` 表（第 6 张表）

**建议前者**：标题是站点结构的一部分，改动频率极低，硬编码更简单。

### 问题 10 ✅ **公告 / 海报空态：采用「显示占位」**（2026-11-01 定）

`notice-list-column` 里只有 `v-for`，没有空态分支。若某频道公告全部停用（`is_active=0`），会显示空白列表区。

**已定方案（A）**：

| 场景 | 处理 |
| --- | --- |
| 某频道公告全部停用 | **该 Tab 保留**，内容区显示 `UiEmptyState`「暂无公告」 |
| 两个频道都为空 | Tab 栏仍保留，两个 Tab 各自显示空态 |
| 海报全部停用 | 轮播区保留，显示「暂无海报」占位 |

**理由**：Tab 与海报区是页面固定结构，消失会让布局塌陷，也会让用户以为页面出错。占位文案明确说明「暂无」比「整块消失」更可预期。

### 问题 11 ✅ **SEO / 分享预览：接受静态现状**（2026-11-01 定）

`index.html` 的 `og:*` 写死为「深渊大书院 / 《深渊之歌》资料库」，不随公告或版本更新。

**已定：接受现状，标记为已知限制。**

原因：`og:*` 必须由服务端返回 HTML 才能被爬虫读到，而本站是纯静态 SPA、公告通过客户端异步加载 —— 爬虫抓不到。要做到动态更新只能走构建期生成或预渲染，会与「后台随时改公告」的目标直接冲突，成本与收益不成比例。

分享到 QQ 群 / 论坛时，预览卡片固定显示站点名与简介，**不体现当前公告内容**。这是可接受的。


---

## 五·补二、已确认的决策（2026-11-01）

| 项 | 决策 |
| --- | --- |
| 两套公告数据源 | **合并**（`NoticeModal` 与 `HomeView` 都读 `notices` 表） |
| 公告弹窗 URL 直达 | **需要**（`?notice=id`，与 `/heroes?id=`、`/misc?tab=` 口径一致） |
| 海报外链域名白名单 | **不要**（只做 `https://` 前缀校验 + 拒绝 `javascript:` / `data:`） |
| 区块标题可配置 | 保持硬编码（见问题 9 建议） |
| 空态处理 | **A：保留区块，显示「暂无公告 / 暂无海报」**（见问题 10） |
| SEO / og 分享预览 | **A：接受静态现状，标记已知限制**（见问题 11） |
| 加载态 | 按问题 8 方案执行：分板块骨架 + 分板块兜底，不整页 spinner |
| **公告模块拆分** | 公告**内容**在「公告管理」维护；**首页显示哪 4 条**由「首页管理」挑选 |
| **公告 ID 格式** | 序号式 `site-1`…、`official-1`…，新建时后端取同频道最大序号 +1 |
| **首页公告位置** | 站点 4 位、官方 4 位，各自独立选择；留空 = 动态取该频道最新 |
| **弹窗排序** | 置顶在最前，其余按日期倒序（选项 A） |
| **弹窗内容** | 只显示**站点**公告，官方公告不弹、不在弹窗里出现 |
| **自动弹窗开关** | `show_in_modal` 字段；站点默认开、官方恒关（后端强约束） |
| **富文本** | 公告正文统一可用；标题保持纯文本 |
| **选择器候选** | 默认最近 10 条 + 搜索框（搜索时后端放宽到 50 条） |
| **公告列表分页** | 每页 20 条，后端分页 |

---

## 五·补三、公告模块（2026-11-01，已实施）

### 职责划分

```
「公告管理」模块（/admin/notices）        「首页管理 · 公告」（/admin/home）
   ─────────────────────────              ─────────────────────────────
   公告内容仓库                              首页显示哪 4 条
   新建 / 编辑 / 删除                         8 个插槽选择器
   富文本正文（加粗 / 斜体 / 颜色 / 列表 / 链接）   位置 1、4 常挂声明
   一公告一页                                位置 2、3 留空 = 动态最新
```

### 数据库

| 项 | 内容 |
| --- | --- |
| 新表 | `home_notice_slots(channel, slot, notice_id, updated_at)` PK `(channel, slot)` |
| 新列 | `notices.show_in_modal INTEGER NOT NULL DEFAULT 0` |
| 迁移 | `scripts/sql/2026-11-01-notice-admin.sql`（第 13 步） |
| ID 迁移 | 第 12 步的初始数据已直接使用 `site-1`…；第 13 步的 `UPDATE` 供老库迁移用 |

**插槽语义**：`notice_id` 为 NULL 表示该位置留空 → 后端 `composeNoticeSlots()` 按日期倒序取该频道最新一条，**跳过已被其它位置占用的**（否则四个位置会重复同一条）。

### API

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/api/admin/notices` | GET | 列表：`channel` / `q` / `page` / `size`（≤50，默认 20），返回 `total` |
| `/api/admin/notices` | POST / PATCH / DELETE | 单条 CRUD；POST 的 `id` 由后端生成 |
| `/api/admin/notices/pick` | GET | 选择器用：`channel` / `q` / `limit`（默认 10，有 `q` 时放宽 50） |
| `/api/admin/home/notice-slots` | PUT | 整组保存 8 个位置；校验频道、位置、引用存在性 |
| `/api/home-config` | GET | 公开读，新增 `noticeSlots: { site: [4], official: [4] }` |

**权限**：全部要求 `role >= 2`（超管），与「系统设置」「首页管理」同级。

### 前端组件

| 文件 | 作用 |
| --- | --- |
| `src/utils/richText.js` | 受限标记解析器 + **12 个颜色预设** |
| `src/components/ui/RichTextView.vue` | 标记 → VNode 渲染（禁 `v-html`） |
| `src/components/ui/RichTextEditor.vue` | 工具栏 + 编辑区 + 实时预览 |
| `src/components/admin/AdminNoticesPanel.vue` | 公告列表（一行一条 / 频道 Tab / 搜索 / 分页） |
| `src/components/admin/AdminNoticeEditPanel.vue` | 公告编辑页（一公告一页） |
| `src/utils/adminNoticesApi.js` | 公告模块的接口封装 |

### 颜色预设（12 个）

8 个标准色相（参考 `vue-hxsngh` 的 Tailwind 方案，按羊皮纸浅底压深一档）+ 4 个项目专用：

| 标准 | 值 | | 项目专用 | 值 |
| --- | --- | --- | --- | --- |
| 重要 red | `#c0392b` | | 正文 ink | `#3a2717` |
| 提醒 orange | `#c2660a` | | 次要文字 brown | `#6b5134` |
| 通过 green | `#2d7a3e` | | 深警示 darkred | `#8b0000` |
| 信息 blue | `#2563eb` | | 青灰 teal | `#2f6f6b` |
| 特殊 purple | `#7c3aed` | | | |
| 活动 pink | `#c2185b` | | | |
| 次要 gray | `#5c6b7a` | | | |
| 荣誉 gold | `#b8860b` | | | |

### 富文本语法

```
**加粗**   *倾斜*   ~~删除线~~
{red}彩字{/red}    ← key 取自上面 12 个
- 列表项
[文字](链接)        ← 只允许 / 站内路径与 https:// 外链
```

**不支持嵌套**：`{red}**粗**{/red}` 内部按纯文本渲染。非法语法降级为纯文本，不抛错。

### 弹窗（`NoticeModal.vue`）

| 项 | 行为 |
| --- | --- |
| 数据源 | `GET /api/home-config`，失败回落 `data/notice.json` |
| 内容范围 | **只显示站点公告**（`channel === 'site'`） |
| 排序 | 置顶在最前，其余按日期倒序 |
| 自动弹出条件 | 存在未读、非置顶、`show_in_modal = 1` 的公告 |
| 已读记录 | `localStorage.lastNoticeKey`（集合，最多 50）；已读后再发新公告仍会弹 |
| 正文渲染 | `RichTextView`（VNode，禁 `v-html`） |



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

## 十一、实施记录（2026-11-01）

### 已完成的文件

| 文件 | 作用 |
| --- | --- |
| `scripts/sql/2026-11-01-home-content.sql` | 迁移第 12 步：5 张表 + 22 条初始数据，幂等 |
| `schema.sql` | 追加 5 张表建表语句（与迁移脚本逐列一致，演练会比对） |
| `functions/api/[[path]].js` | 新增 `/api/home-config` + `/api/admin/home*` 共 9 个端点 |
| `src/utils/homeConfig.js` | 前端数据层：拉 API + `DEFAULT_*` 兜底 + `buildRouteTarget` |
| `src/utils/adminHomeApi.js` | 后台写接口封装（Bearer 会话） |
| `src/config/navRoutes.js` | 路由 → 名称 / 图标，后台下拉与「跟随导航」图标的唯一来源 |
| `src/components/admin/AdminHomePanel.vue` | 后台 5 个 Tab（海报 / 公告 / 图鉴工具 / 角色 / 底栏） |
| `src/views/HomeView.vue` | 6 个板块改为读配置，硬编码保留为兜底 |
| `src/views/AdminView.vue` | 侧栏新增「首页管理」（超管可见） |
| `src/router/index.js` | `/admin/home` 路由 |
| `tests/migration/rehearse.mjs` | STEPS 加第 12 步 + 22 条断言（总 90 条） |

### 关键实现决策

| 项 | 做法 | 理由 |
| --- | --- | --- |
| 公告排序 | 应用层 `orderNotices()`：固定项按 slot 插回原位，滚动项按日期倒序填空位 | 纯 SQL `ORDER BY` 会把两条 pin 都挤到最前，破坏「第 1 条 + 第 4 条」的既定布局 |
| 公告写入 | 单条 POST/PATCH/DELETE（软删） | 公告是可增减的流式内容，单条操作并发安全 |
| 其余四块写入 | `PUT` 整组替换，`DB.batch()` 先删后插 | 槽位固定，整组提交天然完成排序 |
| 读缓存 | isolate 内存 60 秒；写操作 `invalidateHomeConfigCache()` | 实测命中 4.9 ms vs 回源 13.6 ms（2.8 倍） |
| 角色数据 | 只存 `hero_id` + `tip`，运行时 join `heroes.json` | 避免「改了图鉴没改首页」的不一致 |
| 外链安全 | 强制 `https://`，拒绝 `javascript:` / `data:`；前端二次校验 | 后台校验 + 前端兜底，防直接改库绕过 |
| 兜底 | `loadHomeConfig()` 任何失败都回落 `DEFAULT_*`，永不抛异常 | 首页是入口，API 抖动不能整页白屏 |

### 验收结果（2026-11-01，本地）

| 项 | 结果 |
| --- | --- |
| 迁移演练 | **90 / 90 通过**（原 68 + 新增 22） |
| 建表 + 初始数据 | 公告 7 / 海报 3 / 链接 8 / 角色 4 / 底栏 2，重复执行幂等 |
| 公开接口 | `GET /api/home-config` 200，5 块数据齐全，坏图 0 |
| 公告 CRUD | 新建 / 修改 / 软删 / 后台仍可见（isActive=0）全部通过 |
| 表单校验 | 空标题、非法日期、`javascript:`、非 https、路由不以 `/` 开头 —— 全部 400 |
| 权限分级 | 超管 200；普通管理员 `role=1` 读/写均 403；无效令牌 401 |
| 缓存 | 命中 4.9 ms，强制回源 13.6 ms |
| 后台面板 | 5 个 Tab 全部加载正确，改动保存后首页立即生效 |
| 前端兜底 | 拦截 `/api/home-config` 后首页仍渲染 4 图鉴 / 4 角色 / 4 公告 |
| 构建 | `vite build` 通过，运行时 0 错误 |

### 2026-11-02 增补

**公告插槽改「填 ID + 回显标题」**

- 去掉候选下拉与搜索框，改为直接填公告 ID（`site-1` / `official-2`）。
- 填入即本地校验：有效显示 `✓ 标题`（绿），无效显示 `⚠ 找不到该 ID`（红 + 输入框标红）。
- 保存前统一校验，存在无效 ID 时拦下并列出「频道 位置 N：ID」。
- 留空 = 动态默认，右侧预测「会取到哪条」（按日期倒序、跳过已占用）。

**弹窗开关移除**

- 编辑页不再提供 `show_in_modal` 勾选框，改为只读提示（仅站点频道显示）。
- 后端 `normalizeNotice` 按频道强制：`site` → 1，`official` → 0，**忽略 `body.showInModal`**。
- 实测：官方公告传 `showInModal=1` 仍存 0；站点公告传 0 仍存 1。

**速览卡取值口径**

- 右侧「官方更新」卡锚定**带 `version` 的那条**官方公告，而非最新一条。
- 理由：带版本号的才是版本日志（版本号 + 特性要点）；普通修复通知没有要点，放上去只剩标题。

**已知取舍：公告列表缓存**

- `/api/home-config` 有 60 秒 isolate 内存缓存，后台保存后调用 `invalidateHomeConfigCache()`，但多实例部署时不保证所有实例同时失效。改完公告前台最多 1 分钟才可见。

### 上线前的必做项

1. `npx wrangler d1 export myrzg-comments --remote --output backup-before.sql`
2. 依次执行 `scripts/sql/` 下的迁移（共 13 步，`2026-11-01-home-content.sql` 与 `2026-11-01-notice-admin.sql` 在最后）
3. 验证表已建（`SELECT name FROM sqlite_master WHERE type='table'` 应含 5 张 home 表 + `notices` + `home_notice_slots`）
4. **此时才 `git push`**（推送即上线）
5. 上线后登录超管账号，在 `/admin/home` 录入真实内容

⚠️ 忘加 `--remote` 会只改本地库，上线后表不存在 → 首页走兜底（不白屏，但后台打不开）。

---

## 十二、相关文档

| 内容 | 位置 |
| --- | --- |
| 首页实现与设计 | `src/views/HomeView.vue` |
| 首页数据层 | `src/utils/homeConfig.js` |
| 后台首页管理面板 | `src/components/admin/AdminHomePanel.vue` |
| 导航与分类 | `src/components/NavigationMenu.vue` |
| 路由元数据（名称/图标） | `src/config/navRoutes.js` |
| 公告弹窗 | `src/components/NoticeModal.vue` |
| 公告数据源（弹窗兜底） | `public/data/notice.json` |
| 后端单文件 | `functions/api/[[path]].js` |
| 表结构 | `schema.sql` |
| 迁移演练 | `tests/migration/rehearse.mjs` |
| 迁移脚本目录 | `scripts/sql/` |
| 发布流程 | [RUNBOOK.md](../RUNBOOK.md) §6.2 |

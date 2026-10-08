# ARCHITECTURE —— 目录职责、分层、数据流与构建机制

> 定位修改对象或理解数据流时读本文件。
> 页面业务规则按领域在 [specs/](specs/)（共享约定与索引见 [DOMAIN.md](DOMAIN.md)）；运行与发布步骤在 [RUNBOOK.md](RUNBOOK.md)；长期规则在 [AGENTS.md](../../AGENTS.md)。
>
> **何时读**：需要理解分层、依赖方向、数据流、构建机制时。
> **何时更新**：分层、目录职责或构建机制变化时。**位置映射改 [MAP.md](MAP.md)，不写这里。**

**核对时间**：2026-10-08

---

## 一、技术栈与形态

| | |
| --- | --- |
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 构建 | Vite 8 |
| 状态 | Pinia 4 + persistedstate |
| 路由 | Vue Router 4，**Hash 模式**，全部懒加载 |
| 原生壳 | Capacitor 8 + Capgo Updater |
| 后端 | Cloudflare Pages Functions + D1（**仅评论与账号**） |
| 形态 | Web SPA + Android App |

依赖版本以 `package.json` 为准。

---

## 二、目录结构

```
vue-myrzg/
├── index.html                  入口 HTML（挂载 #app）
├── vite.config.js
├── playwright.config.js        交互回归配置（独立端口，workers: 2）
├── capacitor.config.json       原生壳配置
├── schema.sql                  D1 表结构
├── wrangler.toml               本地手动跑 wrangler 时才生效
│
├── public/
│   ├── data/
│   │   ├── notice.json         公告（少数 App 内容，不纳入版本锁）
│   │   └── parsed/             构建期生成的运行时数据（37 个产物）
│   ├── images/                 游戏图片资源
│   ├── ui/                     UI 图标、logo、地图背景
│   ├── fonts/                  本地字体（子集版 woff2）
│   ├── update/hotupdate.json   热更清单
│   ├── _headers                缓存与安全响应头
│   └── _redirects
│
├── raw/                        构建期原始游戏表（根层 144 个，含别名子目录共 164 个，不进 dist）
├── scripts/
│   ├── parse/                  数据预处理（30 个脚本，入口 index.mjs）
│   └── dev/                    维护脚本、原表同步、验收
├── tests/                      单元 / 端到端 / 迁移演练 / 真机套件
├── functions/api/[[path]].js   评论 + 账号后端（单文件）
├── docs/                       文档
│   ├── context/                当前有效（NOW/MAP/RUNBOOK/DECISIONS/RISKS/ARCHITECTURE/DOMAIN
│   │                           + specs/ + technical/ + CONTRIBUTING + UI 组件库）
│   └── history/                历史归档（含 dev-logs/，**不是当前规范**）
│
└── src/
    ├── main.js                 应用入口：挂载 Pinia/Router/theme.css
    ├── App.vue                 应用外壳：顶栏/侧边导航/路由出口/全局弹窗
    ├── assets/
    │   ├── theme.css           ★ 羊皮纸设计系统（CSS 变量/品质色/全局类）
    │   └── gacha.css           招募专属皮肤样式
    ├── router/index.js         路由表 + 分包预取
    ├── stores/appState.js      Pinia：成就与隐藏物品收集标记
    ├── config/                 blacklist、emoticons、discussions、auth、combatRules…
    ├── composables/            app/ 外壳职责（搜索、原生生命周期、备份）
    ├── utils/                  业务工具层（纯逻辑，与 UI 无关）
    ├── types/                  构建生成的类型定义
    ├── components/
    │   ├── ui/                 ★ UI 组件库（28 个 .vue，27 个经 index.js 统一出口）
    │   ├── gacha/              招募业务皮肤（不进通用 UI 出口）
    │   ├── chapters/           世界地图 + 地区路线图
    │   ├── dungeons/           副本路线图
    │   ├── facilities/         营地建筑与研究树
    │   ├── heroes/             角色档案与互动页签
    │   ├── mascot/             右栏吉祥物
    │   ├── admin/              后台四块（概览 / 评论 / 用户 / 审计）
    │   └── 各详情弹窗与业务组件
    └── views/                  页面视图（23 个路由组件）
```

---

## 三、分层与依赖方向

```
┌──────────────────────────────────────────────┐
│ App.vue（外壳）                                │
│  顶栏 / 导航 / <router-view> / 全局弹窗         │
├──────────────────────────────────────────────┤
│ views/（页面层）                               │
│  数据加载、过滤、路由跳转                       │
├──────────────────────────────────────────────┤
│ components/ui/（UI 组件库）← 所有视觉从这里引用  │
├──────────────────────────────────────────────┤
│ assets/theme.css（设计系统）                    │
├──────────────────────────────────────────────┤
│ utils/（业务工具，纯逻辑）                      │
├──────────────────────────────────────────────┤
│ public/data + scripts/parse/（数据层）          │
└──────────────────────────────────────────────┘
```

**依赖方向（单向）**：`views → components/ui → theme.css`；`views → utils → public/data`。
**禁止反向依赖**；`utils` 不得 import 组件。

---

## 四、数据流

### 4.1 构建期 → 运行时

1. **构建**：`scripts/parse/index.mjs` 调用 `scripts/parse/*`，优先读 `raw/`，生成 `public/data/parsed/`。
   业务纯函数位于 `src/utils/*Parser.js` / `*Data.js`。
2. **运行时**：视图通过 `fetchWithFallback` 读取同版本产物。副本/关卡按关卡请求详情，怪物详情另取等级系数小表。
   **页面不重新关联原表**；解析失败显示错误态，不回退浏览器端重建。
3. **来源**：`searchData` 合并正式玩法入口与补充模块，实际产物筛选复用 `acquisitionRules`。

### 4.2 构建顺序约束

`items` **必须先构建**，其他解析模块依赖 `itemData`。

### 4.3 主要产物

| 产物 | 内容与消费者 |
| --- | --- |
| `items.json` / `furniture.json` | 物品、分类、家具外观、图纸与开放条件 |
| `heroes.json` / `pets.json` | 角色、皮肤、邮件与魔物模型 |
| `monsters.json` / `monLevelStrength.json` | 怪物形态、技能摘要；等级系数**按需加载** |
| `facilities.json` / `runes.json` | 设施配方、营地建筑与研究、符石效果 |
| `achievements.json` / `pet-eggs.json` | 成就与奖励、魔物蛋收益 |
| `parsed-pvp.json` / `parsed-hidden.json` | 挑战赛、隐藏点位 |
| `recipes.json` / `tasks.json` | 菜谱材料、Buff、任务步骤与后续关系 |
| `events.json` / `parsed-exchange.json` | 随机事件、探索、兑换入口 |
| `dungeons.json` + `dungeons/{battleId}.json` | 副本摘要与关卡详情，**按关卡懒加载** |
| `chapters.json` + `stages/{stageId}.json` | 章节索引与关卡详情；索引另含世界地图底图、拼块矩形、命中归属图、地区路线图 |
| `gacha.json` / `gacha-presentation.json` | 招募规则与展示资源 |
| `glossary.json` | 词条百科（约 147 KB / gzip 35.6 KB，58 条词条，`meta.entries`） |
| `search-index.json` / `item-sources.json` | 全局搜索与物品来源反查 |

---

## 五、关键机制

### 5.1 路由与详情唤起

- Hash 路由：`/#/items?itemId=xxx`。query 放在 `#` 之后。
- 物品详情由 `App.vue` watch `route.query.itemId` 全局拉起，**跨页面可用**。
- 各页面详情用各自的参数（`id` / `task` / `event` / `battle`…），打开/关闭只清理自身参数，不覆盖其他筛选。
- 根路径 `/` 重定向 `/items`。未匹配的 hash **统一回首页**（不留白屏）。

**跨领域路由**（不走领域划分，见 [DOMAIN.md](DOMAIN.md) 第一节末尾）：

| 路由 | 视图 | 说明 |
| --- | --- | --- |
| `/discussions` | `DiscussionsView` | 站内讨论区。归属键固定 `site:general`，与各图鉴页面的讨论**完全分开**；`?c=<评论 id>` 定位评论 |
| `/privacy` | `PrivacyView` | 隐私说明。注册表单的必勾项链接指向这里；移动端跳转时会**暂存并恢复账号弹窗** |
| `/admin` | `AdminView` | 后台外壳（`position: fixed` 覆盖层，`z-index: 11000`，卡在站点顶栏 10000 与全局弹窗 12000 之间） |
| `/admin/comments`、`/admin/users`、`/admin/audit` | `AdminView` 的子路由 | 概览 / 评论 / 用户 / 审计。**审计仅超管可见** |

> 后台的鉴权、角色分级与审计见 [technical/ACCOUNT_SYSTEM.md](./technical/ACCOUNT_SYSTEM.md) §九；
> 评论接口与定位卡片见 [technical/COMMENTS_BACKEND.md](./technical/COMMENTS_BACKEND.md)。

### 5.2 弹窗栈与滚动协调

- `utils/itemModalState.js` 维护物品详情栈（`pushItemDetail`/`popItemDetail`），支持详情里点详情层层打开。
- `modalScrollCoordinator` 多 owner 管理：首个 owner 存基线，**仅最后一层关闭时恢复**；路由切换先 reset。
- `overlayStack` / `useOverlay` 登记可关闭覆盖层及优先级，`UiModal` 自动接入。
- `globalModalLock` 以多 owner 锁背景滚动与交互，最后一个全局弹窗关闭才释放。
- 桌面 `.app-container` 是**唯一页面级滚动根**；详情绝对覆盖主视图区，正文内部滚动。

已知故障与边界见 [RISKS.md](RISKS.md) 第二节；组件接口见 [UI 组件库](./UI_COMPONENT_LIBRARY.md)。

### 5.3 资源版本与容错

- 构建按运行时 JSON 生成**按目录分组、文件名带 hash** 的清单，位于 `dist/assets/data-manifests/`。
- **首屏那组数据哈希直接内联进 bundle**（`vite.config.js` 的 `INLINE_HASH_DIRECTORIES`，当前只有 `data/parsed/`）：
  原先必须先读 manifest 才知道 `?v=<sha256>`，关键路径是"壳 → manifest → 数据"；内联后落地页数据请求立刻发出。
- 其余目录（`dungeons`/`stages`/`dialogs`/`taskDialogs`）走 manifest，**按页面意图预热**而非启动时全量预取。
- 原生 JSON 请求先核对清单（或内联哈希），再校验 CDN 内容 hash；失败回退**同版本包内路径**并再次校验。
- 同一路径的进行中请求**合并**，成功数据按会话复用，失败条目移除以便重试。
- 图片使用构建版本参数及有限的"CDN → 包内 → 默认图"回退，**不无限重试**坏链接。

### 5.4 图片版本表

`__IMAGE_VERSIONS__` **按目录分组**（键为相对 `public` 的完整目录路径，如 `/images/Common_Atlas`、`/ui`）。这张表内联进首屏 `ui-*.js`；扁平写法会把目录前缀重复 3000 多次。

- 版本号取 8 位十六进制；`vite.config.js` 用**完整 SHA-256** 判定真碰撞，撞了直接构建期报错。
- 版本化覆盖 `public/images` 与 `public/ui` 两个根。
- **两个刻意的例外**：全局背景与 logo 是 CSS `url()` / 模板字面量，过不了 `getImageUrl`，**不带 `?v=`**——替换时网页端需手刷 EdgeOne 缓存。

### 5.5 字体

- 标题与正文用本地 HarmonyOS 常规/粗体，**必须用子集版**（`public/fonts/*.subset.woff2`）。
- 子集由 `scripts/dev/subset-fonts.mjs` 从**随包数据产物 + 源码 + HTML** 现算字符集生成。
- `verify` 有**三条**断言：字符集是否过期、产物里每条 `@font-face` 是否指向子集、字体 URL 是否带 `?v=<内容哈希>`。
- 后两条必需——漏带子集或漏带版本号都**不会报错**，只会静默降级。
- 字体 URL 版本号由 `vite.config.js` 的 `fontUrlVersionPlugin` 构建期补上（CSS 读不到 `define`）。

### 5.6 长列表与图片加载

- 物品、家具、任务、关卡列表用 `UiVirtualGrid`（TanStack Virtual 按行虚拟），保留总高度占位，仅挂载可见行及前后预渲染行。
- 桌面以 `.app-container` 为滚动 owner；手机用页面内部容器。
- 定位用异步 `scrollToItem`，**不能对未挂载项直接 `querySelector`**。
- 副本封面用 `IntersectionObserver` 近视口才赋 `src`，配合 `loading="lazy"` 与固定尺寸占位。
- 快滑感知与图片请求防挤占调度见 [RISKS.md](RISKS.md) 第 16 条。

### 5.7 移动端 / 原生适配

- 安全区变量 `--safe-top/bottom/left/right`；`--safe-top` 默认 `0px`，只在页面真占满屏幕时取值（判定做在**变量这一层**）。
- `useNativeShell` 仅在覆盖层/菜单/搜索打开时临时注册原生 `backButton`，只消费最上层关闭动作。
- 菜单模式三态：`side` / `bottom` / `top`，存 `localStorage`。
- 视口高度一律用 `var(--vh100)`。

### 5.8 主题

亮色 = 羊皮纸；暗色 = 暗木羊皮卷。`document.documentElement.classList.toggle('dark-mode')`，所有颜色走 `theme.css` 变量，组件无需感知。

> ⚠️ 深色模式自身仍有已知问题；当前只隐藏了切换按钮（`showThemeToggle = false`），**代码保留**。见 [RISKS.md](RISKS.md) 第四节。

---

## 六、视图职责边界

| 视图 | 职责 | 不得做 |
| --- | --- | --- |
| `App.vue` | 外壳、路由出口、全局弹窗装配 | 不承载页面业务 |
| `HeroesView` | 列表、详情状态、技能与属性计算 | 档案/互动页签归 `HeroStoryPanels` |
| `DungeonsView` | 筛选、关卡详情、房间与掉落 | 路线图投影/缩放/拖动归 `DungeonRouteMap` |
| `ChaptersView` | 章节筛选、关卡列表与详情 | 地图归 `ChapterMapCanvas` / `RegionRouteMap` |
| `FacilitiesView` | 设施配方与营地页签、URL 状态 | 建筑/研究展示归 `CampFacilitiesPanel` |
| `GachaView` | 卡池、模拟状态、演出阶段协调 | 规则归 `gachaSim`，持久化归 `gachaState` |
| `PartnerMailsView` | 筛选与选择 | 阅读器归 `PartnerMailReader` |
| `FurnitureView` | 筛选、详情、`id`/`itemId` 联动 | `FurnitureCard` 只负责视觉 |
| `GlossaryView` | 板块筛选、搜索与词条详情 | 词条模型与聚合归 `glossaryData`，原「名词解释」页签已移除 |
| `DiscussionsView` | 讨论区容器：滚动位置、自动跟随、`?c=` 定位 | 列表与发表归 `CommentsPanel` / `CommentComposer`；定位卡片只展示、不改分页 |
| `AdminView` | 后台外壳：权限闸门、页签、子路由出口 | 各面板归 `components/admin/*`；**准入判定在服务端**，前端只决定显隐 |
| `PrivacyView` | 隐私政策正文 | 不承载表单逻辑（注册勾选项只是链接到这里） |

---

## 七、共享模块（禁止重复实现）

新增逻辑前**先检索现有实现**。以下模块是**唯一实现**：

| 能力 | 唯一入口 |
| --- | --- |
| 奖励 / 消耗 / 概率 / 批量计算 | `src/utils/acquisitionRules.js`（无网络、无组件依赖） |
| 状态（buff）`para → 中文数值` | `src/utils/buffParser.js`（`describeBuff`/`describeBuffPara`/`resolveBuffEffect`） |
| 职业、元素、品质、任务、分类、地图、属性名 | `src/utils/gameMappings.js` |
| 对话、邮件与技能文案清洗 | `gameMappings` 的 `cleanDialogueBase/Line`、`cleanMailContent`、`getCleanSkillName` |
| 物品模型、分类、图标、排序、装备计算 | `src/utils/itemParser.js` |
| 食材、通用材料、菜谱预览 | `src/utils/recipeUtils.js` |
| 角色 / 魔物 / 怪物 / 任务解析 | `heroParser`、`petParser`、`monsterParser`、`taskParser` |
| 家具 / 设施 / 符石 | `furnitureData`、`facilityData`/`campFacilityData`、`runeData` |
| 配方可见性判据 | `src/config/blacklist.js` 的 `isFacilityRecipeHidden` |
| 房间波次、奖励池展示 | `src/utils/roomDisplay.js` |
| 图片路径 / 运行时 JSON 请求 | `src/utils/env.js` 的 `getImageUrl`、`src/utils/request.js` 的 `fetchWithFallback` |
| 滚动根解析 | `src/utils/scrollTarget.js`（热路径/动作路径分离） |
| 覆盖层与原生返回 | `overlayStack` / `useOverlay` / `nativeBackHandler` / `globalModalLock` |
| 本地收集标记 | `src/stores/appState.js` |
| 词条来源与技能等级索引 | `buffSourceIndex.js`、`skillLevelIndex.js` |
| 聊天表情 | `src/config/emoticons.js`（零依赖纯函数，**服务端复用同一份**） |

> 纯规则模块在构建期完成多表计算；带请求、缓存或播放生命周期的运行时工具负责各自环境。
> **不能因为它们同在 `utils/` 就把所有工具都当作无副作用纯函数。**

---

## 八、安全响应头

`public/_headers` 定义全站 CSP、HSTS、`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`。

CSP 各指令的取值理由（为什么 `script-src` 不带 `unsafe-inline`、`style-src` 必须带、`img-src` 为什么需要 `data:` 与 `blob:`）见 [DECISIONS.md](DECISIONS.md) 第四节。

> ⚠️ 开发环境（`npm run dev`）**不受 `_headers` 影响**，看不到 CSP 行为。
> ⚠️ Android 原生壳加载 `https://localhost` 的包内文件，同样**不受影响**——即"原生端没有 CSP 保护"，这是事实，不是配置错误。

---

## 九、构建与发布

机制说明见本节；**具体命令与前置条件见 [RUNBOOK.md](RUNBOOK.md)**。

- 完整数据再生成需要本机原表、派生输入与剧情资源，**这些都不入库**。
- 发布顺序：完整输入环境跑 `verify` → 检查 `dist/data`、`dist/images`、`assets/data-manifests` 齐全 → 上传完整产物。
- **`git push` 就是上线**（Cloudflare Pages GitHub 集成）。
- Android 用 `npx cap sync android`；热更将完整 dist 打成 zip，**`index.html` 在 zip 根层**。
- 代码、数据清单和资源版本必须来自**同一次构建**。

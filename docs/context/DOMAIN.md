# DOMAIN —— 业务契约总览与跨领域共享约定

> 本文件是业务契约的**索引与共享层**。各页面的完整规则在 [specs/](specs/) 下的领域文件里，按领域独立成文。
> **不包含**：构建产物与数据链（见 [ARCHITECTURE.md](./ARCHITECTURE.md)）；运行与发布（见 [RUNBOOK.md](RUNBOOK.md)）；长期行为规则（见 [AGENTS.md](../../AGENTS.md)）。
>
> **何时读**：需要跨领域共享约定（共享模块、奖励语义、URL 参数）或定位某个领域文件时。
> **何时更新**：共享约定变化、新增领域文件、或页面路由表变化时。**单页面的业务规则写进 [specs/](specs/)，不写这里。**
>
> **读法**：先用下表定位领域文件，再 `grep` 该文件里的页名或字段名。**不要通读本目录。**

**核对时间**：2026-10-08

---

## 一、领域文件索引

| 领域文件 | 覆盖页面 | 体积 | 主要数据源 |
| --- | --- | --- | --- |
| [specs/ITEMS_AND_EQUIPMENT.md](specs/ITEMS_AND_EQUIPMENT.md) | 物品图鉴、装备图鉴、符石图鉴、兑换、其他奖励 | ~13 KB | `items.json`、`runes.json`、`parsed-exchange.json` |
| [specs/HEROES_AND_COMBAT.md](specs/HEROES_AND_COMBAT.md) | 角色图鉴、伙伴邮件、魔物图鉴、怪物图鉴、词条 | ~20 KB | `heroes.json`、`pets.json`、`monsters.json`、`glossary.json` |
| [specs/DUNGEONS_AND_CHAPTERS.md](specs/DUNGEONS_AND_CHAPTERS.md) | 副本图鉴、关卡图鉴、章节地图 | ~16 KB | `dungeons.json`、`chapters.json`、`stages/{stageId}.json` |
| [specs/QUESTS_AND_EVENTS.md](specs/QUESTS_AND_EVENTS.md) | 任务图鉴、事件图鉴、其他奖励 | ~5 KB | `tasks.json`、`events.json`、`parsed-pvp.json` |
| [specs/CAMP_AND_LIFE.md](specs/CAMP_AND_LIFE.md) | 设施功能（含营地）、家具图鉴、菜谱查询、魔物收益、成就查询 | ~8 KB | `facilities.json`、`furniture.json`、`recipes.json`、`pet-eggs.json`、`achievements.json` |
| [specs/GACHA_SIMULATOR.md](specs/GACHA_SIMULATOR.md) | 模拟招募 | ~2 KB | `gacha.json`、`gacha-presentation.json` |
| [specs/UI_DESIGN_SYSTEM.md](specs/UI_DESIGN_SYSTEM.md) | 主题、组件引用规则、长列表、右栏吉祥物 | ~3 KB | `src/assets/theme.css`、`src/components/ui/` |

**跨领域页面**（讨论区、账号、隐私、后台）的规则归 [ARCHITECTURE.md](./ARCHITECTURE.md) 与 [technical/](./technical)；它们不是静态图鉴，不走上述领域划分。

---

## 二、页面 → 路由 → 组件 → 数据

| 页面 | 路由 | 组件 | 主要数据 |
| --- | --- | --- | --- |
| 物品图鉴 | `/items` | `ItemsView.vue` | `items.json` |
| 家具图鉴 | `/furniture` | `FurnitureView.vue` | `furniture.json` |
| 设施功能 | `/facilities` | `FacilitiesView.vue` | `facilities.json` |
| 角色图鉴 | `/heroes` | `HeroesView.vue` | `heroes.json` |
| 伙伴邮件 | `/partner-mails` | `PartnerMailsView.vue` | `heroes.json.mailboxes` |
| 魔物图鉴 | `/pets` | `PetsView.vue` | `pets.json` |
| 装备图鉴 | `/equip` | `EquipsView.vue` | `items.json` |
| 符石图鉴 | `/runes` | `RunesView.vue` | `runes.json` |
| 菜谱查询 | `/recipes` | `RecipesView.vue` | `recipes.json` |
| 魔物收益 | `/petseggs` | `PetsEggsView.vue` | `pet-eggs.json` |
| 成就查询 | `/achievement` | `AchievementView.vue` | `achievements.json` |
| 怪物图鉴 | `/monsters` | `MonstersView.vue` | `monsters.json` |
| 任务图鉴 | `/tasks` | `TasksView.vue` | `tasks.json` |
| 事件图鉴 | `/events` | `EventsView.vue` | `events.json` |
| 副本图鉴 | `/dungeons` | `DungeonsView.vue` | `dungeons.json`、`dungeons/{battleId}.json` |
| 关卡图鉴 | `/chapters` | `ChaptersView.vue` | `chapters.json`、`stages/{stageId}.json` |
| 兑换 | `/exchange` | `ExchangeView.vue` | `parsed-exchange.json` |
| 模拟招募 | `/gacha` | `GachaView.vue` | `gacha.json`、`gacha-presentation.json` |
| 词条 | `/glossary` | `GlossaryView.vue` | `glossary.json`（百科骨架另含静态 `config/glossaryEncyclopedia.js`） |
| 其他奖励 | `/rewards` | `RewardsView.vue` | `parsed-pvp.json`、`parsed-hidden.json` |

数据文件均相对 `public/data/parsed/`；这不是原表加载清单。

- 项目入口 `src/main.js`，应用壳 `src/App.vue`，页面在 `src/views/`，共享逻辑在 `src/utils/`，构建入口 `scripts/parse/index.mjs`。
- 源码目录不等同于运行时请求路径；定位模块沿「路由 → 页面 → parser/产物 → 构建器」。
- 导航顺序、名称与图标由 `NavigationMenu.vue` 维护，三种菜单模式共用同一数据。`NavigationMenuLite.vue` 是备用精简入口。
- `/` 重定向 `/items`；未匹配的 hash 统一回首页。

---

## 三、应用壳与页面分工

- `App.vue` 装配顶栏、全局搜索、设置菜单、导航、路由出口与全局弹窗。
- 搜索、原生生命周期和备份导入导出分别由 `composables/app/useGlobalSearch.js`、`useNativeShell.js`、`useBackupData.js` 管理。
- 页面负责加载自己的预解析数据、筛选、详情状态与 URL；**公共工具不能反向依赖页面或组件**。
- 普通桌面页面以 `.app-container` 为页面级滚动根，手机使用页面内部列表。伙伴邮件的 `is-mail-reader` 使用固定阅读器，招募的 `is-gacha-stage` 隐藏普通 Wiki 外壳并使用独立舞台。**不要把其中一种布局套用到所有页面。**

---

## 四、共享模块索引（禁止重复实现）

新增逻辑先检索现有实现，禁止在页面重复维护映射、概率、图标、解析和基础样式。路径均相对 `src/`：

| 能力 | 维护入口 |
| --- | --- |
| 职业、元素、品质、任务、分类、地图与属性名称 | `utils/gameMappings.js`：`JOB_*`、`ELEMENT_*`、`getRarityName`、`getCategoryName`、`getMapName`、`translateStatName` |
| 对话、邮件与技能文案 | `gameMappings` 的 `cleanDialogueBase/Line`、`cleanMailContent`、`getCleanSkillName`、`formatHighlightedText` |
| 货币、奖励组、消耗、批量计算 | `utils/acquisitionRules.js`（旧摘要接口由 `gameMappings` 重导出） |
| 物品模型、分类、图标、排序与装备计算 | `utils/itemParser.js` |
| 食材、通用材料与菜谱预览 | `utils/recipeUtils.js`，材料组装用 `buildRecipeIngredients` |
| 角色、魔物、怪物、任务 | `heroParser`、`petParser`、`monsterParser`、`taskParser`；等级边界共用 `levelConfig` |
| 家具、设施、符石 | `furnitureData`、`facilityData`/`campFacilityData`、`runeData` |
| 隐藏策略 | `config/blacklist.js` 的 `isBlacklisted`；按地区名匹配必须传 `mapName`（`黑森林`）而不是 `chapter` 代号（`c4`）——代号匹配不到，会出现「筛选按钮隐藏了、来源或卡片还在」 |
| 图片与静态 JSON | `utils/env.js` 的 `getImageUrl`、`utils/request.js` 的 `fetchWithFallback` |
| 页面与详情滚动 | `scrollTarget`、`modalScrollCoordinator` |
| 覆盖层与原生返回 | `globalModalLock`、`overlayStack`/`useOverlay`、`nativeBackHandler` |
| 本地收集标记 | `stores/appState.js`：成就与隐藏物品 |
| 招募规则、状态与舞台 | `gachaSim`、`gachaState`、`gachaLayout`、`gachaCurrency`、`gachaSpinePlayer`、`gachaAudio` |
| 房间内容与奖励池展示 | `utils/roomDisplay.js`；`RewardPools.vue` / `RoomContentList.vue` 由副本与关卡图鉴共用 |
| 状态（buff）数值说明 | `utils/buffParser.js`：**唯一**的 `para → 中文数值` 渲染实现 |
| 评论与回复 | `utils/commentApi.js`：页面归属键 `<前缀>:<实体ID>`、`parent_id` **引用式回复**（不建楼中楼，父评论被删不级联） |
| 聊天表情 | `config/emoticons.js`：token 语法 `[e:包:名]`、显示字数统计与分段（纯函数、零依赖，**服务端复用同一份**） |
| 章节地图 | `components/chapters/ChapterMapCanvas.vue`、`RegionRouteMap.vue` |

> 纯规则模块在构建期完成多表计算；带请求、缓存或播放生命周期的运行时工具负责各自环境。
> **不能因为它们同在 `utils/` 就把所有工具都当作无副作用纯函数。**

---

## 五、数据、奖励与文本语义

- 静态图鉴**不连接游戏账号**，不伪造库存、已解锁、已读、领取、售罄或任务完成。成就/隐藏点位的本地收集标记与招募模拟要与游戏状态明确区分。
- 品质名称统一为普通、稀少、珍贵、罕见、传说，取 `RARITY_NAMES`/`getRarityName`；分类和地图名使用共享归一化，不在每页另写字典。
- 货币与经验使用 `BASE_REWARD_*` / `REWARD_MODE_INFO` 的名称和图标；真实物品使用关联后的图标，**不直接拿奖励组 ID 拼图片路径**。
- `group.num` 是抽取次数，`rule.min/max` 是单次抽中的数量范围。**零触发率不能默认成一**，自选候选不是逐项必得，随机装备展示项不能当作固定产物。
- 物品构建器生成 `item.acquisition`，物品、装备、符石复用同构奖励规则；批量使用 `scaleAcquisition`，不在组件中另算概率或复制费用。
- 对话清洗统一处理游戏富文本、等待标记和称呼占位，邮件复用 `cleanMailContent` 并保留换行；技能数值高亮只用共享格式化函数。
- 黑名单影响可见列表、搜索与直接物品入口，**不删除原表**。隐藏可玩角色不等于应该删除其有效邮箱；纯关系解析也不能因展示过滤而丢失真实外键。

---

## 六、资源访问与容错

- `env.js` 的 `CLOUD_URL` 为 `https://syzg.yxzmy.top`（2026-10-03 由 `myrzg.yxzmy.top` 迁入，见 [改名迁移](../history/rename-myrzg-to-syzg.md)）。Web 使用同域路径，Android 在线优先 CDN，离线使用包内资源。
- `getImageUrl` 对 `/ui/` 保持本地路径，对其他图片补齐 `/images/`；图片附 `RESOURCE_BUILD_ID` 版本参数。失败回退由共享工具限次处理，**不能无限重试或猜另一张相似图片**。
- 运行时静态游戏 JSON 统一通过 `fetchWithFallback`，同路径请求合并、成功结果复用、失败可重试。
- CDN 失败或 hash 不匹配只回退同版本包内数据；两边都不合法时显示错误态，**不在浏览器重建原表**。

---

## 七、本地状态与备份

- `appState` 持久化 `collectedAchievementIds` 和 `collectedHiddenRewardIds`，分别用于成就与隐藏点位筛选。
- 导航模式、主题等设置由应用壳维护；招募的模拟钱包/保底/记录由 `gachaState` 单独管理。**临时选择、弹窗历史和结果演出不能混入收集集合。**
- 新增持久化字段时兼容旧存储及已有备份导入导出；筛选重置和路由切换不应清空收集标记。
- 具体存储键、迁移实现与导出字段由对应模块维护，**不能按页面名字猜测备份范围**。

---

## 八、详情与 URL

| 参数 | 用途与维护方 |
| --- | --- |
| `itemId` | 全站物品详情，`App.vue` 监听，使用真实物品 `typeId` |
| `id` | 家具、角色、魔物、怪物、魔物蛋详情；在成就/菜谱/其他页是定位，不统一当成弹窗 |
| `task` | 任务详情 |
| `event` / `explore` | 事件 / 探索详情 |
| `battle` | 副本详情，掉落定位参数见 [DUNGEONS.md](./specs/DUNGEONS_AND_CHAPTERS.md) |
| `chapter` / `stage` / `diff` / `view` | 关卡图鉴：章节筛选、关卡详情、难度选择、地图/列表视图（`view=list` 用于无章节时的列表视图） |
| `buff` | 词条页状态词条详情，值为归并后的词条名（如 `buff=燃烧`） |

- 列表点击通过 query 打开详情，**保留当前路由和其他筛选**；全局物品入口不强跳 `/items`。关闭仅清理自身参数，父详情和筛选保持。
- `openItemDetail(item, categoryTree, savedScrollTop=null)` 全新打开时清空历史；详情内 `pushItemDetail(item, bodyScrollTop)` / `popItemDetail()` 保存上一件物品与正文位置，新物品置顶，返回恢复。
- 页面详情与全局物品嵌套时由共享协调器保存外层位置，最后一层关闭后恢复；切页先清理旧操作。覆盖层层级、原生返回和滚动生命周期统一见 [UI 使用规则](./UI_COMPONENT_LIBRARY.md#3-使用规则强制)，**不在页面复制实现**。

### 定位参数与历史行为

本项目使用 Hash 路由，例如 `/#/tasks?task=<任务ID>&itemId=<物品ID>` 表示任务详情上再打开一个物品。**query 应放在 Hash 路由内**，而不是部署地址的普通路径参数中。

| 场景 | 参数含义 |
| --- | --- |
| 家具/角色/魔物/怪物/魔物蛋详情 | `id` 是各自业务 ID；页面不能把别的分类 ID 当成当前详情 |
| 成就/菜谱/其他奖励 | `id` 主要用于卡片/区块定位高亮，不要求都打开弹窗 |
| 设施营地建筑/研究 | 建筑 `level` 是**当前级**，研究 `level` 是**目标级**；其余参数见 [specs/CAMP_AND_LIFE.md](specs/CAMP_AND_LIFE.md) |
| 符石 | `focus` 是列表物品，鉴定 `id` 是物品，合成 `id` 是兑换方案，**不能混用** |
| 副本来源 | `battle/drop/dropTab/dropEntry` 保留关卡、物品和实际房间/奖励区定位 |
| 招募 | `kind/pool` 选择卡池，`view=pool` 或 `view=record` 区分概率与记录 |

- 页面首次加载应在数据可用后再解析详情目标；虚拟列表使用**异步** `scrollToItem` 定位并等待测量/挂载完成，不等待未可见目标自行出现在 DOM。
- 前进/后退沿当前 URL 恢复业务选择；无效参数按页面已有校验处理，**不按相似名称猜目标**。筛选只对各页明确支持的 query 同步，邮件等本地状态不擅自新增协议。
- 物品详情的「返回上一件」和「关闭物品层」是**不同操作**。正文滚动与外层页面滚动分别保存，不能用一个 `scrollTop` 覆盖两层。
- 页面详情与全局物品叠加时，关闭内层只移除 `itemId`，保留 `task/battle/id` 和筛选；跨页面导航则清理旧操作与覆盖层状态。
- Android 返回交给共享覆盖层栈，只处理最上层；无覆盖层时保留 WebView 历史返回，**不添加「回到默认页即退出」的页面判断**。

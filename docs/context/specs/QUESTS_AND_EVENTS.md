# 任务、事件与活动奖励

> 本文件是任务图鉴、事件图鉴与其他奖励页（`/rewards`）的业务契约。
> 三者共用地图筛选与奖励展示规则；剧情清洗与奖励解析复用公共模块。
>
> **何时读**：改动任务、事件、探索、挑战赛或隐藏点位时。
> **何时更新**：该领域规则变化时。**只改这一个领域文件，不要把别的领域内容搬进来。**

---

## 一、任务图鉴

**入口** `/tasks` · **页面** `TasksView.vue` · **数据** `parsed/tasks.json`（`loadTaskData()` 读取） · **剧情** `data/taskDialogs/{dialogId}.json`（按需）

任务结构、正式怪物判定与剧情索引在**构建期**关联。

| 项 | 规则 |
| --- | --- |
| 一级类型 | `TASK_TYPE_LABELS` |
| 二级分类 | 数据驱动 |
| 委托 C0～C5 | 转为共享地图名称 |
| 搜索 / 分类 / 计数 | 只针对**实际可见**任务；当前配置隐藏已下架任务 |
| 列表 | 单列虚拟网格，动态行高 |
| 冷链接 | 先定位任务再开详情 |
| 关闭 / 嵌套物品返回 | **不重置列表** |

### 详情内容

接取 NPC / 条件 / 对话、后续任务、解锁关系、奖励、逐步目标。
步骤可展开 NPC、怪物、道具与剧情；**非正式怪物只显示名称/头像，不生成错误怪物详情链接**。

#### 接取 NPC 与交互对话

两类 `getTask.npc` 的 `getTask.title` **语义不同**，两行必须分开取值：

| 类别 | `title` 是 | 名字来源 | 「交互对话」 |
| --- | --- | --- | --- |
| 贸易小车 `cart_at_npc_*` | **NPC 名字** | `title` | **不显示**（再显示就与上一行重复） |
| 场景 NPC | **搭话台词/旁白** | `room.battleData.npcList[].npcName` | `title` |

- 依据源码 `DailyTaskPanel.cs:244-249`：`taskNpcName.text = getTask.title`，而 `getTask.npc` **只用于加载立绘**（`Texture/UIPanel/FreightPanel/<npc>`），**不是数据 id** —— 拿它当 id 去查名字只会得到「未知」。
- 场景 NPC 的 `title` 多为旁白（如「（蕈人在向你们招手。）」），照实展示。
- 「交互对话」这个标签在**任务步骤**里也有一处（回报 NPC 时的那句话），两者是不同来源，不要混。

#### 解析不出名字时省略该行

- 查不到名字的 NPC **不产出该行**，不显示「未知（内部 id）」。
- 判据：`name` 为 `null` 或 `'未知'`；页面 `npcText()` 返回空串，`v-if` 不渲染。
- 实测 45 处（25 个 uid，如 `baduer_yzdq_7`、`ke_sldsd_21`、`NPC031`）在任何表里都无名字：`room.npcList` 无该 uid、其所在房间不在 `room.json`、`npc.json` 只有立绘字段（无 name）。
- 成因是**旧版内容引用了已移除的资源**：45 处里 43 处属 `main_*`/`sub_*` 旧系列（39 个 `main_*` 全部 `close=true`，页面不显示），2 处属早期遗留任务 `task_100100`。
- 依据源码 `TaskPanel.cs:385-386`：任务界面只显示 `stepName` + `stepDes`，**步骤级没有 NPC 行** —— 省略与游戏行为一致。
- 「交互对话」`line` **独立于名字**：名字解析不出但 `title` 有内容时，台词照常显示。
- 核查口径：以「在架任务」为准（`close=false`），当前 **0 处缺失**。

回归：`tests/unit/task-display.test.mjs`、`tests/ui/task-npc-name.spec.js`。

#### 步骤类型的中文名

判据取自源码 `TaskData.cs` 各 `CheckTaskStep*` 的**完成条件**，不是字段名（字段名会骗人）。

| stepType | 中文名 | 完成条件（源码） |
| --- | --- | --- |
| `talk` | 与NPC对话 | 与指定 npc 对话 |
| `npcTalkBattle` | 与NPC对话进入副本 | 对话后进入 `battleId` |
| `passInstance` | **通关战斗** | `battleId == battleId` —— 打通某场战斗 |
| `passStage` | **通过区域** | `CheckPassStage(stageId)` —— 需有通过记录 |
| `gotoStage` | 前往指定场景 | `stageId == levelRoomId` —— **进入**房间即完成 |
| `hunter` | 狩猎怪物 | `monTypeIds` 按怪物**种类**计数 |
| `hunterUid` | 狩猎指定目标 | `uid` 指向场景里的**特定个体** |
| `getItemNpc` | 提交道具给NPC | 提交 `items` 给 npc |
| `getItem` | 获取物品 | 持有 `itemTypeId` 达 `num` |
| `collect` | 地图采集 | 采集 `collectIds` 达 `num` |
| `tag` | 完成指定行为 | `eventRecord` 记录键 |
| `openAreaShow` | 解锁区域 | 解锁 `areaTypeId` |
| `gotoCamp` | 返回营地 | 回到营地 |
| `level` | 达到等级 | 达到 `level` |
| `sellPet` | 卖出魔物 | 卖出 `num` 只 |

- 🔴 `passInstance` **不能叫「通关副本」**：124 个 `battleId` 里 78 个的 `battle.category` 是 `['存档','章节关卡']`（如 `c4_5_a`「4-5 庄园保卫战」），副本只有 42 个。
- 🔴 `passStage` 与 `gotoStage` **字段完全相同**（`stageId` + `dialog`），区别只在完成条件：前者要「通过记录」，后者「进入即可」。两者都指向 `levelRoom`（场景房间），不是关卡。
- 🔴 `passStage` **显示位置**（与 `gotoStage` 相同）：源码 `TaskPanel.cs:505-521` 的 `ShowCurrentTaskGo` 对所有 stepType 通用，按 `stepPosition[0]` 分 `room`/`stage`/`battle` 三支。
- `tag` 的目标文案**官方优先**：`eventRecord.eventRecords[tag].desc`（如 `rolelv5` → 「任意角色升到5级」），`TAG_LABELS` 兜底（22 个在用 tag 里 9 个官方无 desc）。

不展示的原表字段（核实后无展示价值）：

| 字段 | 理由 |
| --- | --- |
| `autoFinish` / `autoTrack` | 客户端行为开关，对玩家无意义（303 个 `autoFinish=true`） |
| `nextTask` / `editTime` | 原表无有效数据（全空 / 全为 0） |
| `getItem` 的物品名 | 已走 `submitItems` 展示（带图标与数量），不在 `detail` 里重复 |

#### 剧情「未收录」的标记

- 原表引用了但 `public/data/taskDialogs/` 无对应文件时，构建期在 `meta.missing` 打标（实测 25 个 id）。
- 页面据此显示「（该剧情未收录）」并**不渲染展开按钮**，不暴露内部 id。
- `dialogIds` 传入为空时**不做判断** —— 宁可显示展开按钮也不要误报。

回归：`tests/unit/task-display.test.mjs`。

### 两种"后续"必须分开

| 字段 | 含义 |
| --- | --- |
| `addTask` | 完成后**追加**的后续任务；按客户端逻辑排除下架目标 |
| `unlockTask` | 只开放**接取资格** |

### 解锁字段

| 字段 | 规则 |
| --- | --- |
| 顶层 `unlockStage` | **有值才显示** |
| `stepUnlockStage` | 属于实际生效步骤；**不能汇总**成任务完成奖励或顶层解锁 |

### URL

`type/sub/q` 双向同步；`task` 打开详情。
奖励和目标物品使用 `itemId`；剧情内容保留共享清洗，**不将配置中的内部标记直接作为玩家对白**。

---

## 二、事件图鉴

**入口** `/events` · **页面** `EventsView.vue` · **数据** `parsed/events.json`

随机事件与探索区域**共用**数据、地图筛选、图片网格与奖励规则，分别使用 `tab=random/explore`。

### 两个页签

| 页签 | 关联链 | 详情展示 |
| --- | --- | --- |
| 随机事件 | 事件 + 地图 + 分组 + 概率 + 奖励 | 描述、交互、出现地图、**刷新概率**、冷却、奖励 |
| 探索 | `exploreArea/mon/consume/reward` | 地图、探索等级、耗时、队伍人数、消耗、探索点位、遭遇敌人、奖励 |

- **禁止**把刷新概率和奖励池概率混为一项。
- 不要求浏览器读取这些原表。
- 地图名称由预解析映射提供；品质使用全站名称/颜色。
- 两个页签的计数**分别**取当前地图与搜索过滤后的结果。

### 隐藏地区（黑名单）

地区可见性由 `config/blacklist.js` 的 `isBlacklisted` 统一决定，**三处口径必须一致**：

| # | 位置 | 判据 |
| --- | --- | --- |
| 1 | 地图筛选按钮 | `isBlacklisted(label)`，隐藏地区不出现在按钮里 |
| 2 | 列表条目 | `isHiddenRegionEvent(item)`，所属地区**全部**命中才整条隐藏 |
| 3 | 详情「出现地图」标签 | `visibleEventMapNames(item)`，不列出隐藏地区名 |

- 地区字段是**数组**：随机事件用 `mapNames`、探索区域用 `mapName`（`eventRegionLabels` 统一取值）。
- 🔴 **不能只传 `{ id, name }`**：`isBlacklisted` 只读 `name`/`desc`/`tip`/`source`/`label`/`keywords`
  与数组型 `category`/`categories`/`place`/`mark`，传 `maps`/`mapKey` 会被**静默忽略**；
  而事件名（如「废弃的宝箱」）不含地区名 → 筛选按钮隐藏了、卡片却还在。
- 只命中**部分**隐藏地区时保留条目：跨地区事件在可见地区也能遇到，按"提到即隐藏"会误伤（同 ADR 116）。
- 判据实现是 `utils/eventData.js` 的 `isHiddenRegionEvent` / `visibleEventMapNames`（**唯一实现**，页面与单测共用）。
- 回归：`tests/unit/event-blacklist.test.mjs`、`tests/ui/events-blacklist.spec.js`。

### URL

| 参数 | 含义 |
| --- | --- |
| `map/q` | 筛选 |
| `event` | 打开随机事件 |
| `explore` | 打开探索 |

**来源直达探索必须同步探索页签**，不能只设置 ID 而停留在随机事件列表。

奖励复用 `parseRewardEntries` 兼容摘要接口及公共奖励卡；点击只追加 `itemId`，保留当前事件/探索和筛选。

---

## 三、其他奖励

**入口** `/rewards` · **页面** `RewardsView.vue` · **数据** `parsed/parsed-pvp.json`、`parsed/parsed-hidden.json`

含挑战赛奖励、隐藏物品点位和育室槽位。育室槽位消耗取配置。

### 战斗规则已并入词条百科

`?tab=combat_rules` 与旧的 `tab=ph3` **不再渲染战斗规则视图**，改由 `src/router/index.js` 的 `/rewards` `beforeEnter` 跳转到 `/glossary`，并**保留 `?q=` 搜索词**。

- 原 `CombatRules.vue` 与 `.combat-rules` 容器、`[data-rule-section]`、专属搜索框**已从 `src/` 移除**。
- 内容（属性上限、冷却缩减、先扣护盾再扣生命、基础攻速 4 倍）在 [词条](HEROES_AND_COMBAT.md) 页的「核心机制」与「战斗属性」板块可读。
- 跳转**必须放在路由 `beforeEnter`**：放组件内会被 `onMounted` 的 `syncTabsToRoute()` 覆盖，用户会停在 `/rewards?tab=pvp`。
- 维护公式依据仍集中在[战斗公式专题](../technical/COMBAT_FORMULAS.md)；**不把源码字段、审计过程或未经确认的装备效果当成玩家规则**。
- 回归入口 `tests/ui/combat-rules.spec.js`（守着跳转契约与内容可达，不再断言旧视图）。

### 挑战赛

展示兑换、段位、排名、战斗结算和赛事说明。

| 项 | 规则 |
| --- | --- |
| 段位 | 保留积分门槛与对应羽翼图标（45px） |
| 结算 | 保留胜负积分与结果标签 |
| 呈现规范 | 排名、段位、战斗结算统一采用 `UiListPanel flat` + `UiListRow flush` 一体化羊皮卷列表 |
| 规则来源 | 正式 `sessionDes/pvpArea[].des` |
| 排除 | 测试文案、内部模式 ID、可能过期的赛季时间 |

### 隐藏点位

| 项 | 规则 |
| --- | --- |
| 筛选 | 地图、名称、本地收集状态 |
| 状态存储 | `collectedHiddenRewardIds` —— **不反映账号领取** |
| 点位预览 | 由 `HIDDEN_PREV_MAP` 维护，**有图才显示**，重建不丢映射 |

### 育室槽位

按原配置展示银币/氪金扩建费用，图标复用奖励映射，**不模拟账号已开槽位**。

### URL

`tab/sub/season/map/status/q` 根据当前分类同步；`id` 定位并高亮奖励区块。
物品只追加 `itemId`；预览使用全局 `UiModal`，**不恢复旧的手写低层级遮罩**。

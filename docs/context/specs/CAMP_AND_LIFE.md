# 营地、家具、菜谱与收集

> 本文件是设施功能（含营地建筑与研究）、家具图鉴、菜谱查询、魔物收益与成就查询的业务契约。
> 营地数值差异与研究连线的深入规则见本文件第六节。
>
> **何时读**：改动设施、营地、家具、菜谱、魔物收益或成就时。
> **何时更新**：该领域规则变化时。**只改这一个领域文件，不要把别的领域内容搬进来。**

---

## 一、设施功能

**入口** `/facilities` · **页面** `FacilitiesView.vue` · **数据** `parsed/facilities.json`

保留设施配方，并提供营地升级、属性研究。运行时读取**同一份**产物，配方结构与追加的 `key:camp` 对象**分别校验**。

### 配方展示

- 展示材料、产物、开放档位及对应方案。
- 普通产出与锻造随机装备候选**均复用公共奖励底层**。
- 配方图标沿构建期 `recipe.output.img` 传入，**不为显示图标另请求全部物品表**。

### 配方可见性（只有一个判据）

`config/blacklist.js` 的 `isFacilityRecipeHidden`。命中条件：产出物或任一材料命中黑名单，或装备打造命中 `HIDDEN_EQUIP_TIERS`（当前 4/5 阶）。

**三处消费方必须共用它：**

| # | 消费方 | 规则 |
| --- | --- | --- |
| 1 | 设施页列表 | 用它过滤 |
| 2 | **等级筛选行** | 从**实际可见配方反推**等级，**不照抄** `mode.levels` |
| 3 | 物品详情的「查看设施 / 查看锻造台」 | 配方被隐藏时**仍展示说明**（真实配置），但**不给出「前往」** |

**为什么不能照抄 `mode.levels`**：黑名单会把某些级整级滤空（工作台 6/7 级、制药台 6 级、磨坊 4 级），照抄会留下「点了是空列表」的空按钮。

回归见 `tests/unit/facility-recipe-links.test.mjs`。

### 营地建筑

| 项 | 规则 |
| --- | --- |
| 当前 N 级的消耗、玩家等级/中心等级门槛 | 属于 **N 升 N+1** |
| 升级后效果 | 取 **N+1** |
| 末级（没有下一等级） | **不展示**残留费用 |
| 建筑 `att` | 是当前级**总加成**，**不能逐级相加** |
| 建筑 `playerAbility` | 按源码**累计** |

### 属性研究

| 项 | 规则 |
| --- | --- |
| 分组 | 采集、生产、冒险 |
| 绘树 | 按**真实前置关系** |
| 前置要求 | 有已完成记录即可，**不默认要求满级** |
| 同一研究 | 仅取**已完成等级**效果 |
| 不同研究 | 再合计 |
| **禁止** | 将每级研究效果叠加 |
| 搜索 | 保留命中节点的祖先并弱化；**计数只算命中** |
| **禁止** | 伪造账号完成状态 |
| 消耗/时间/门槛 | 取**目标级** |
| `action=formula` | 依**精确配方 ID** 关联 |
| 配置文字与数值不一致 | 按已核对源码处理，保留专题中的差异解释；**不擅自修原表或补造缺失等级** |

### URL

| 内容 | query |
| --- | --- |
| 营地（建筑或研究） | `facility=camp&mode=building|research` |
| 建筑 | 用 `building/level`，其中 `level` 是**当前级** |
| 研究 | 用 `group/research/level`，其中 `level` 是**目标级** |
| 原设施配方 | `facility/mode/level/tier/item` 保持兼容 |
| 共用 | `q` 搜索，支持 `level=all` |

材料只追加 `itemId`。

建筑数值差异与研究连线见本文件[第六节](#六营地数值差异与研究连线)。

---

## 二、家具图鉴

**入口** `/furniture` · **页面** `FurnitureView.vue` · **数据** `parsed/furniture.json`

构建期由 `furnitureData` 联结 `homeItem/item/gameSetting/consume/playerInit/condition/task`。
展示按图鉴规则筛出的**静态家具**，**不读取服务器解锁和库存**。

| 项 | 规则 |
| --- | --- |
| 一级/二级分类 | 取 `homeItem.objType` |
| `homeItem.category` | 原样保存在 `sourceTags`，表示**来源**而不是分类 |
| 搜索 | 名称、描述、外观、图纸、材料 |
| 筛选 | 品质、放置区域、有无图纸 |
| 列表 | 虚拟网格；卡片和外观图消费构建期字段 |
| 详情 | 分类、放置范围、装饰值、基础库存上限、制作消耗、默认/额外外观、图纸 |
| `playerInit` | 只是**初始配置量** |
| 默认外观 | 依据 `FurnitureData.GetDefaltHomeItemSkin` |

源码显式排除项与本站按「废稿」语义过滤的条目**要区分**；**不能宣称**静态全集等同客户端账号已解锁列表。

### 图纸关联

只沿 `useAction=unlockHomeItem/unlockHomeItemSkin → useActionPara.homeItems[].typeId/skin[]` 建立关系。

- 纯关系层**保留原始关联**；黑名单在组装可见图鉴时应用。
- **不凭同名或皮肤编号猜关系**。

### 开放条件

读取 `rules[].type/para/need`，各项**全部 AND 后再应用 `reverse`**；任务条件补可读名称和步骤。
`condition.desc` **只存为 `configNote`**，不冒充真实条件。

### 图标

| 类型 | 取图 |
| --- | --- |
| 普通图纸 | 基础家具 UI 图 |
| 皮肤图纸 | 指定皮肤 UI 图 |
| 缺图 | **统一占位** |

**禁止**回退基础家具、**禁止**用 `roomObj.viewData[].img` 场景立绘替代 —— 以免把缺失外观展示成另一件家具。

### 来源文案的展示层伪装

`furnitureData.SOURCE_DISPLAY_ALIAS` 将个别来源关键词替换为中性词（当前 `通行证 → 未知`），**只作用于**「来源标记」与「获取方式」的展示文本。

- 原始 `homeItem.tip`、`sourceTags` 与来源链路**完整保留**；清空该表即可恢复。
- **这是刻意的展示层行为，不是缺数据。**
- `tests/ui/furniture.spec.js` 断言伪装生效，**改动该表会使用例失败**。

### 交互

`id` 打开家具详情；其中图纸/材料只追加 `itemId`。
物品图纸也能按**精确外键**跳回家具；关闭内层物品仍保留家具详情与位置。

---

## 三、菜谱查询

**入口** `/recipes` · **页面** `RecipesView.vue` · **数据** `parsed/recipes.json`

构建期关联 `menu/item/buff/gameSetting`。**不在缺产物时回退原表重建。**
（根路由 `/` 重定向的是 `/items`，不是这里。）

| 项 | 规则 |
| --- | --- |
| 展示 | 标签、搜索、料理卡片；食材、料理效果及获取方式 |
| 图标 | 优先用已关联 `item.img` |
| 材料组装 | 通用食材和具体材料**一律**由 `buildRecipeIngredients` 组装；物品详情复用同样结果 |
| 料理预览 | **只在 `PREVIEW_AVAILABLE_IDS` 登记时出现**，使用对应 `menu_prev` 图片；未登记**不猜测**文件存在 |
| Buff 说明 | 用清洗后的纯文本 |

### 来源

依据 `RECIPE_SOURCE_CONFIG` 的实际类型：

| 类型 | 定位 |
| --- | --- |
| 成就 | `id/q` |
| 任务 | `task` |

任务名称与[任务图鉴](QUESTS_AND_EVENTS.md)保持一致；**不能只用模糊文本搜索冒充具体任务关系**。

### URL

`tag/q` 双向筛选，`id/q` 可定位高亮。成品详情使用 `itemId`，图片预览使用公共全局弹窗；关闭后**保留筛选和列表位置**。

---

## 四、魔物收益

**入口** `/petseggs` · **页面** `PetsEggsView.vue` · **数据** `parsed/pet-eggs.json`

构建期由 `petEggsData` 从魔物配置提取基础售价、喂养经验、孵化时间等指标。

| 项 | 规则 |
| --- | --- |
| 筛选 | 金币/氪金池、星级、「卖/喂/按需选择」 |
| 可选显示列 | 时间、银币、经验、单位时间收益、比值、建议 |
| 列顺序 | 由 `allFields` **固定**；点击表头切换升降序 |
| `R=sellPrice/exp` | 为了取得**一点基础喂养经验**所放弃的银币 |
| 建议阈值 | 由 `PetsEggsView` 维护 |
| 比较范围 | 默认只比较**新孵化个体基础指标** |
| 孵化时间 | 在同一个体卖/喂比较中会**约掉**，只用于比较孵化优先级 |
| **不在本页计算** | 变异、突破、培养后的价值 |

> `R` **不是**官方兑换率，也**不是**对所有玩家都最优的处置策略。

URL 支持 `pool/tag/q`，`id` 打开详情。
筛选与收益列**不要误写成**魔物图鉴的培养状态。

---

## 五、成就查询

**入口** `/achievement` · **页面** `AchievementView.vue` · **数据** `parsed/achievements.json`

成就条件、奖励、物品名称及前后置关系**均在构建期关联**。

| 项 | 规则 |
| --- | --- |
| 筛选 | 分类、搜索、本地收集状态 |
| 搜索范围 | 名称、描述、奖励名 |
| 货币图标 | 使用共享奖励映射 |
| 条件生成 | 由客户端实际读取的 `achiAction + para` 生成 |
| 复杂目标 | 剧情、指定副本、魔物类别、战斗事件**保留完整配置文案**；**不能退化**为「完成指定任务」而丢掉目标 |
| `unlock/next` | 转成「解锁前置/完成后解锁」的成就名称；**不暴露**内部任务、战斗或奖励编号 |
| `alwaysHide` | 章节宝箱、检查项**不进入**展示产物 |
| 收集开关 | 更新 `collectedAchievementIds`，**只表示本地标记**；**不能**据此显示游戏账号完成或领取 |

### URL

`status/category/q` 双向同步；`id/q` 定位并高亮卡片，**不统一解释为详情弹窗**。奖励通过 `itemId` 打开。

---

## 六、营地数值差异与研究连线

> 本节是[营地数值差异与研究连线]的深入规则；主规范见本文件前面的领域小节。

`/facilities` 保留原设施配方，并提供营地升级和属性研究；这是配置图鉴，不模拟账号升级、研究队列或已完成状态。

### 数据与职责

`scripts/parse/facilities.mjs → facilityData/campFacilityData → parsed/facilities.json`。原配方数组末尾追加 `key:camp` 对象，`resourceSchemas` 校验两种结构，浏览器不重读原表。固定奖励复用公共解析，配方图标沿构建期 `recipe.output.img` 传入，不另加载物品全表。

`FacilitiesView` 管页签与路由，`CampFacilitiesPanel` 管建筑/研究，`CampResearchTree` 与 `campResearchLayout` 管节点和连线。图片来自 `UI_Atlases/CampCenterPanel_Atlas`，使用项目 `public/images/CampCenterPanel/`。

### 路由协议

| 内容 | query |
| --- | --- |
| 营地建筑 | `facility=camp&mode=building&building=<建筑>&level=<当前级>` |
| 研究树/详情 | `facility=camp&mode=research&group=<分类>&research=<项目>&level=<目标级>` |
| 原设施配方 | `facility/mode/level/item`，保留旧 `tier` |
| 共用 | `q` 搜索，`level=all` 全部等级，奖励/材料只追加 `itemId` |

建筑来源用当前级，`upgrade.toLevel` 才是目标级；研究用目标级。有效 `research` 显示详情，返回树清除项目/等级并保留分类。营地未指定有效等级显示第一级，无建筑时取过滤首项；配方定位优先，不覆盖已有目标。筛选 replace，跨建筑/配方/家具 push；只有目标等级实际存在才生成跳转。

### 数据规则与依据

原始输入：`homeLevel`、`campResearch`、`roomBuild`、`consume`、`condition`、`task`、`reward`、`item`、`homeItem`，以及现有设施配方所需表。更新原表前按同步工具预览核对版本。

1. `CampBuildUpGradeUI.Refresh` 和 `FurnitureData.GetSysCampLevel`：当前等级 N 的 `consume/playerLevel/centerLevel` 对应 N 升 N+1；效果读取 N+1。末级即便仍有费用字段，也不生成下一次升级。
2. `homeLevel_center1` 的配置备注明确为营地中心 1 升 2 奖励，挂在当前 1 级；`homeLevel_center2` 挂在当前 3 级，对应升 4 级。奖励字段和升级消耗一起归入 `upgrade`。
3. `FurnitureData.SetHomeLevelAttr`：建筑 `att` 是当前等级的总加成，不能逐级相加。
4. `CampResearchData.RefreshPlayerAbilityInitData`：建筑 `playerAbility` 从 1 级累计到当前级；同一研究只取当前已完成等级的 `actionPara`，不同研究再相加。
5. `CampResearchItemUI.RefreshState`：前置研究要求存在已完成记录，并非要求前置满级；页面显示前置 1 级。
6. `CampResearchUpGradeUI`：研究消耗、时间、玩家等级和设施等级都取目标等级；效果展示沿用 `des + addDes`。
7. 研究 `action=formula` 沿精确配方 ID 关联现有设施配方，不用物品名猜测。`action=none` 的采集产量研究仍保留原表说明，不伪造 `playerAbility`。
8. 建筑开放条件复用家具条件解析器，读取实际条件规则与任务名称，不展示 `condition.desc` 内部备注。
9. 建筑 `roomBuild.camp.decMax + campDecMaxChange` 为该级装饰上限；不累计各级 `campDecMaxChange`。

### 内部配置差异

这些是维护核对信息，不作为页面提示、测试标记或来源状态显示：

| 项目 | 差异与处理 |
| --- | --- |
| 营地中心 5 级 | 文案写 175→200，但 `campDecMaxChange=200`，基础上限 100，源码实际读取结果是 300；6 级则为 225。页面使用数值字段，不擅自修原表。 |
| 货运站 3 级 | 文案写加成 5→10，但 2 级 `orderWeight=5`、3 级 `orderWeight=10` 按源码逐级累加，实际总加成为 15。页面显示累计加成。 |
| 伤口处理、快速搭建 | `addDes` 是 4%/8%/12%，`actionPara` 是 0.4/0.8/1.2，倍率单位与文案不能直接等同。页面保留游戏研究说明，不把原始数字另乘 100 显示。 |
| 破甲战术、元素克制 | 两项研究的 9/10 级要求中心 8 级，而建筑表最高中心 7 级。保留研究条件，但不生成中心 8 级链接，也不补造等级数据。 |
| 最高级残留费用 | 中心 7、锻造台 9 等末级仍有 consume/门槛字段，源码在不存在下一等级时屏蔽升级。本页同样不显示这些费用。 |

### 配方可见性（单一判据）

原设施配方的可见性由 `config/blacklist.js` 的 `isFacilityRecipeHidden` 统一决定，判据两条：产出物或任一材料命中黑名单；装备打造模式下命中 `HIDDEN_EQUIP_TIERS`（当前 4/5 阶）。三处消费方必须共用它，不能各写一份：

1. `FacilitiesView` 的配方列表；
2. **等级筛选行**——从实际可见配方反推可见等级，不照抄 `mode.levels`。黑名单会把某些级整级滤空（工作台 6/7 级、制药台 6 级、磨坊 4 级），照抄会留下「点了是空列表」的空按钮；
3. 物品详情的「查看设施 / 查看锻造台」与「获取途径」的设施来源——配方被隐藏时**仍展示配方说明**（它是真实配置），但**不渲染「前往」**，否则会跳到空列表。

回归：`tests/unit/facility-recipe-links.test.mjs` 直接用 `public/data/parsed/` 的随包产物断言「凡被隐藏的配方都不被当成可达目标」，判据与设施页分叉时立即报错。

### 展示与交互

- 筛选顺序为搜索、三类页签、筛选、计数；`section-tabs` 保持筛选与正文同级，纸色只放正文，加载/错误时仍保留入口。切页签使用 `resolveScrollTarget`，材料详情返回保留状态。
- 建筑卡选择当前建筑，等级下展示当前/升级后外观、效果、条件、材料、奖励和开放配方；满级只显示当前效果。多档桌面两列、手机单列。
- 桌面营地正文纸面自动填满筛选区下方的剩余高度，展开/收起后短内容仍与两侧栏底边齐平；长内容沿页面滚动，不使用固定筛选高度补偿。手机继续使用正文内部滚动。
- 研究按采集/生产/冒险分组，仅沿真实 prerequisite 连线。搜索保留命中节点的祖先并淡化祖先，计数只算命中；空图安全处理，循环依赖报错，不伪造节点账号状态。布局由关系计算，不冒称原 prefab 坐标复刻。
- 节点与连线尺寸共用 `CAMP_RESEARCH_NODE`，原底板与图标保持比例。研究树从左向右展开，手机只在树内横滑，首次定位起点；桌面拖动超过阈值才捕获指针，拖动松开不误点节点，键盘仍可操作。

### 验证与发布

专项入口：`tests/unit/camp-facilities.test.mjs`、`tests/unit/camp-research-layout.test.mjs`、`tests/ui/camp-facilities.spec.js`。检查当前/目标级、前置研究、末级费用、原配方及来源、物品详情返回、明暗主题和手机树起点。发布同步设施产物与新增素材，构建写产物时不并发跑读取同目录的回归；实际结果写当日日志。

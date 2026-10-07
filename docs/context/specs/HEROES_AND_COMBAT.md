# 角色、魔物、怪物与词条

> 本文件是角色图鉴、伙伴邮件、魔物图鉴、怪物图鉴与词条页的业务契约。
> 状态数值渲染的**唯一实现**是 `utils/buffParser.js`；单位语义与笔误归一化的完整依据见 [COMBAT_FORMULAS.md](../technical/COMBAT_FORMULAS.md)。
>
> **何时读**：改动角色、邮件、魔物、怪物或词条时。
> **何时更新**：该领域规则变化时。**只改这一个领域文件，不要把别的领域内容搬进来。**

---

## 一、角色图鉴

**入口** `/heroes` · **页面** `HeroesView.vue` · **数据** `parsed/heroes.json`

通过 `heroParser.fetchHeroData()` 读取；角色、消耗、职业特性、正式皮肤等在**构建期**关联，剧情分段**按需加载**。

| 项 | 规则 |
| --- | --- |
| 搜索范围 | 角色资料、技能、档案、互动文本 |
| 多词语义 | 空格 = 「且」，顿号 = 「或」 |
| 配合筛选 | 星级、职业 |

### 卡片

- 使用角色卡面、品质边框与职业/元素图标；图标 slug 从共享映射获取。
- 职业徽标**只展开当前职业特性**，数据沿 `general.jobPaBuffConfDes → buff`。
- 条数**按配置渲染**，不硬编码六职业都有相同数量。

### 详情页签

| 页签 | 内容 |
| --- | --- |
| 技能星阶 | 主动技能、天赋、升级计划费用、星阶与碎片消耗 |
| 基础属性 | 等级、升星次数及突破模拟、基础/成长/静态属性、累计升级突破费用 |
| 档案 | 好感档案及关联剧情 |
| 互动 | 按触发场景分组 |

主动技能详情标题旁显示当前技能等级对应的**冷却时间（CD）**和资源消耗；数值来自 `skill.levelData`，切换等级时同步变化。
**普攻和被动天赋不显示不适用的字段。**

### 战斗属性公式

以源码 `UnitAttribute`、`HeroBattleAttributeGroup` 和 `CombatPanel` 为准。

| 项 | 公式 / 规则 |
| --- | --- |
| `atkSpeed` | 是**基础**攻速 |
| 最终攻速 | `基础攻速 × (1 + min(攻速加成,300) / 100)` |
| 攻击间隔 | `1 / 最终攻速` |
| 技能冷却 | `基础技能冷却 × (1 - min(冷却缩减,50) / 100)` |
| 加成与冷却字段 | 均按**百分数**输入 |
| 防御系数 | 随**攻击者等级**变化 |
| 暴击 / 浮动 | 由每次伤害入口开启 |
| 抗性分 | 配置加减区与动态乘区 |

通用结算、两次取整、Buff/护盾/回复及模式差异见 [战斗机制与公式](../technical/COMBAT_FORMULAS.md)。
该文档标明本地源码与配置依据，以及装备特殊属性、穿透赋值等待验证问题，**不代表**已还原所有专属技能或线上服务端结算。

### 等级与突破

| 项 | 规则 |
| --- | --- |
| 等级上限 | `playerLevel` 正式可达边界 **∩** `heroRank.heroMaxLevel` |
| 超过门槛的突破 | **自动计入** |
| 恰好达到门槛 | 可勾选「已完成本级突破」（**默认勾选**）比较突破前后 |
| **不提供** | 任意品阶选择 |
| 命名 | 页面称「等级突破」；配置「品阶」只是**内部状态** |
| 一致性 | 属性与消耗使用**同一**突破状态 |

### 五项成长属性

按 `原始值 × (1 + (等级−1)×heroLevel.attUp + 升星次数×general.starAttAddData + 已完成突破attUp累计)` 计算。

| 增幅项 | 当前值 |
| --- | --- |
| 每级 | 原始值的 **5%** |
| 每次升星 | **1%** |
| 每次突破 | **15%** |

- 增幅**相加**；最终舍入遵循 **C# 中点取偶数**。
- 升星次数 = **四组星阶技能等级之和**，不是稀有度。
- 上限从对应稀有度的 `heroStarLevel` 取得，当前为 **13 次**；打开角色时**默认零次**。
- 界面展示升星/突破累计比例和当前代入公式。
- 星阶技能本身及装备等额外属性**不计入**基础成长。
- `calculateStats/calculateUpgradeCosts` 分别计算属性及升级突破消耗；**费用不含升星碎片**。
- 等级、突破、费用**不能**使用不一致的上限。

### 双立绘

**希尔 `hero_001`** 才使用男女双立绘：桌面并排，手机切换，**重新打开重置**。
切换不影响角色资料、数值和路由；其他角色保持单立绘。

### 皮肤页签

**正式额外皮肤**满足显示、绑定和立绘条件才出现「皮肤」页签。

| 项 | 规则 |
| --- | --- |
| 展示 | 名称、来源、加成、立绘 |
| 模型图 | 必须对应 `skeletonName/skinName` 的待机导出并经**清单核对** |
| 无模型时 | **保留立绘**，不猜用基础角色模型 |

### 对白归类

| 触发场景 | 归类 |
| --- | --- |
| `start/fight/win/exploreTalk/loopEnd/readyGoHome/over` | 野外探索 |
| `roomFinishLeader/roomFinishMember` | 战斗 |
| 赠礼 / 招募对白 | **分开** |

随机候选**没有固定先后**，不添加人为编号；营地标题含「测试」的事件**仅在展示层过滤**。

### URL 与职责

`id` 打开详情，`tab=skins` 可定位皮肤，礼物等物品只追加 `itemId`。

| 归属 | 内容 |
| --- | --- |
| 主页面 | 列表、详情状态、培养计算 |
| `HeroStoryPanels` | 档案/互动子页签、缓存、对话加载 |

皮肤静态模型的输入、导出与缺图处理见 [模型导出](../technical/SKIN_MODEL_EXPORT.md)。

---

## 二、伙伴邮件

**入口** `/partner-mails` · **页面** `PartnerMailsView.vue` · **数据** `parsed/heroes.json.mailboxes`

使用原信纸素材的**静态**伙伴邮箱，与角色档案**共用解析**，不另加载原表。

| 项 | 规则 |
| --- | --- |
| 遍历范围 | 完整 `heroMail` |
| 档案邮件过滤 | 按**真实角色档案关联**过滤 |
| 发件人不在可玩角色列表 | **不意味着**其邮箱无效 |
| 无 `heroTypeId` 的活动/问卷邮件 | **不猜测**归属 |
| 搜索 | 覆盖邮箱标题 |
| 选中发件人 | 展示其**全部有效邮件**，顺序沿原表 |
| 正文 | 使用 `cleanMailContent`，**保留换行和称呼替换** |
| **不模拟** | 收件时间、已读、领取、任务完成 |

### 类型判断

以 `heroMail.mailType` 判断，**不能替换**为 `heroArchives.type`。

| 类型 | 图标 | 奖励 |
| --- | --- | --- |
| 档案邮件 | `com_item_archive` | 取关联档案 |
| 附带任务 | `com_item_task` | — |
| 附件奖励 | `com_item_encl` | — |
| 普通无任务无奖励 | — | **不显示**奖励区 |

后续来信的**解锁条件不等同于**附带任务。

### 奖励

复用公共物品卡；真实 `typeId` **包括货币**，品质查物品表。
**没有附件的普通邮件不显示空奖励区**；**不能**把邮件解锁条件造为奖励。

### 阅读器

`PartnerMailReader` 管固定阅读区域：头像、选信与正文**各自滚动**；窄屏改**横向选信**，长正文仍占剩余高度。
仅该路由启用 `is-mail-reader`，离开后恢复普通页面滚动。

### 交互

筛选和选信是**本地状态**，没有独立选信 query。奖励只追加 `itemId`，关闭后**保留当前邮件和正文位置**。

类型判断顺序、信纸资源与响应式细节见本文件[第六节](#六邮件类型与信纸资源)；**长正文限制未复测**。

---

## 三、魔物图鉴

**入口** `/pets` · **页面** `PetsView.vue` · **数据** `parsed/pets.json`

通过 `fetchPetData()` 读取。支持搜索、星级和变异形态筛选；头像/卡框使用对应**普通或变异**资源。
页面**不把怪物图鉴单位混入**可培养魔物。

| 页签 | 内容 |
| --- | --- |
| 技能特性 | 普攻、特性、主动技能及等级；突破要求使用 `petSetting.petTpExp/petTjExp` |
| 基础属性 | 基础值、成长区间、等级、累计经验、好感配置 |

### 成长评级

按各属性**区间的分段**计算，C/B/A/S 对应区间档位；**不用**全站统一百分比代替具体成长值。
等级上限来自玩家等级配置；累计经验来自魔物等级表。

### 属性计算

按 `floor(基础值 + 成长值 × 当前等级)`；**1 级已经计入一份成长**。
滑块变更后属性与成长提示同步；**不能错用**角色的「等级减一」公式。

### 交互

`id` 打开魔物详情。变异、突破与培养**在本页维护**；卖出和喂养的经济比较在[魔物收益](CAMP_AND_LIFE.md)页说明。

---

## 四、怪物图鉴

**入口** `/monsters` · **页面** `MonstersView.vue` · **详情** `MonsterDetailModal`

| 数据 | 加载时机 |
| --- | --- |
| `parsed/monsters.json` | 页面加载 |
| `monLevelStrength.json` | 打开详情**按需**加载 |

### 收录范围

- `fileMon.monTypeId` 定义**正式本体锚点**。
- **只收录**正式图鉴和有证据的关联形态。
- **不提供** `mon.json` 全量 NPC、友方、剧情临时单位或孤立测试单位入口。
- 按 `label` 分类、`keywords` 搜索。

### 形态判定

| 项 | 规则 |
| --- | --- |
| 骨骼名 | 只提供**家族候选** |
| 收录条件 | 需有探索/战斗引用、有效 AI 变身或明确召唤证据 |
| **禁止** | 按 ID 后缀猜用途 |
| **禁止** | 把同骨骼其他本体混入 |

### 技能与变身

技能沿 `mon.aiId → aiModel(type=1).para.int_para → mon.skillList[index] → skill`。
有明确 AI 引用时**不展示**未调用的历史技能。
变身沿 `type=6` 和入口触发器反查；**不凭名称排列阶段**。

### 详情内容

只显示**可证实**的伤害、倍率、范围、位移、击退、附加状态、解除条件、召唤与陷阱。

| 项 | 规则 |
| --- | --- |
| 零倍率且零基础伤害 | **不标成**伤害段 |
| 无正式技能名 | 用**顺序名称**；内部 ID **不进入**正文 |
| 携带单项效果 | 为**固定** |
| 多项 | 按配置**权重随机** |
| 二级 Buff | 继续解析持续、周期与解除效果 |
| 独立召唤实体 | 展示**自己的**属性；技能中保留候选、数量、上限和继承摘要 |

### 塔层

沿完整 `tower → battle → room.monRounds` 构建，**只给正式 Boss 写楼层**。
同组通用形态可显示 `towerBossAppearances` 摘要，但**不因此改为 Boss**。
产物**不包含**全量单位 handbook 或全部房间来源明细。

### 等级与奖励命名

- 等级滑块使用**当前系数表**更新属性。
- `fileMon.reward` 称「**图鉴战利品**」；当前形态奖励称「**怪物配置奖励**」。
- **不能**混成该怪物在所有地图的掉落结论。

### 交互

`id` 打开形态详情；头像/立绘消费构建期路径。
晶石、尖刺等预览与图集头像**分清用途**；页面**不重新拼接**来源链。

---

## 五、词条

**入口** `/glossary` · **页面** `GlossaryView.vue` · **数据** `parsed/glossary.json`

单一百科列表（**没有页签**），由 `glossaryData.buildGlossaryData` 在构建期生成。
原「名词解释 + 状态词条库」双页签已并入三个板块。

### 三大板块

`GLOSSARY_SECTIONS` 分三组，共 **58 条**（`meta.entries`，随原表变动）：

| 板块 | 条数 | 说明 |
| --- | --- | --- |
| 异常与状态 | 36 | **默认视图**；标准状态 29 条按 `STATUS_RULES` 自动聚合，怪物异变 7 条按名字自动捕捉 |
| 战斗属性 | 10 | 静态百科骨架 `STATS_ENCYCLOPEDIA`，含硬性上限（攻速 +300%、冷却缩减 50%） |
| 核心机制 | 12 | 静态百科骨架 `MECHANICS_ENCYCLOPEDIA`，含伤害结算、等级压制、仇恨与霸体 |

- 分类维度按**当前板块内**统计（`facetCountsForGroup`），与列表展示同一口径。
- **搜索是跨板块的**：命中项在卡片上**标出所属板块**。
- 百科人话定义与机制规则来自 `config/glossaryEncyclopedia.js`；底层数值（持续时间区间、跳字频率、伤害类型、施加来源）由构建脚本从原表自动填充。
- `config/glossaryTerms.js` 已无引用（旧「名词解释」页签的遗留）。

### 与旧「技能专属」的关系

**不再收录技能花名**（「利息」「冰爆」「禅武不二」这类不再成为词条）。
细分不出来的 DOT 与未被标准状态规则命中的 buff **直接不进入**产物；1649 条 buff 中命中标准状态 512 条、精英异变 8 条。

### 标准状态判定

**完全基于数据字段，不使用 `buffName`**（`STATUS_RULES`）。判定按**信号强度分层**，而不是按规则书写顺序：

| # | 信号 | 说明 |
| --- | --- | --- |
| 1 | `buffTypes` | 配置的语义类型（`poison` / `bleeding` / `burning` / `vertigo` / `fixed` / `taunt` / `shield` / `critUp` / `damageReduce`…） |
| 2 | `buffEffects` | 源码唯一的效果派发键（`Thick` / `HOT` / `Shield` / `confusion` / `dotHalo`…） |
| 3 | `elements` | `para.damage.elementType`（火属性 DOT 即燃烧） |
| 4 | `attrPositive` / `attrNegative` | `para.attr` 改了哪个属性、往哪个方向 |
| 5 | `desPattern` | **游戏自己的效果描述** `buffDes`（如「进入中毒状态」）。这是配置对效果的权威说明，不是展示名 |

#### 没有兜底规则

规则表里**不允许**存在不带任何数据信号的条目：以 `buffEffect=DOT` 兜底会产出通用「持续伤害」，掩盖专属 DOT 的名字。

#### 展示名不参与判定

名字判不出效果，而且会判错。

| 反例 | 实际情况 |
| --- | --- |
| `圣愈` | `buffDes` 写「暴击增加」、`buffType=critUp`，但 `buffEffect` 是 `HOT`；按名字会归进治疗类，按 `buffType` 才正确落到「暴击提升」 |
| `炒鲜姑` | `effect=1201` 与治疗同号，实际却是「增加生命上限 500 点」 |

因此 **`effect` 数字编号（表现层特效号）也不参与判定**。

#### 两条作用域限制

否则越界：

| 信号 | 限制 |
| --- | --- |
| `desPattern` | **只对通用机制**的 buff 生效（`isGenericEffect`）—— 英雄被动的描述里常提到「燃烧」「流血」，因为它会施加该状态，但它本身不是那个状态 |
| `elements` | **只对 `buffEffect=DOT`** 生效 —— 否则任何造成火属性伤害的技能都会被算成燃烧 |

#### 料理排除

按 `buffType === 'cook'` 排除（**38 条**），**不用名字前缀** —— 「属性附加」「炒鲜姑」并不叫「料理：xxx」，但都是吃料理产生的临时增益。
`/recipes` 已按菜谱展示效果。

#### 自动归位

新 buff 只要带上述任一字段就会**自动归位**，不需要改清单。

> **测试覆盖边界**：`tests/unit/glossary.test.mjs`（8 条）守的是板块计数、词条名唯一、摘要与规则非空、来源与黑名单联动、料理与内部代号排除、属性上限文案。
> 「每条规则至少有一个数据信号」与「两条作用域限制」**当前没有对应断言** —— 它们只有 `STATUS_RULES` 的定义与代码注释为据，改动时需人工核对。

### 词条模型

每条词条固定为 `{id, name, group, category, icon, tags, summary, rules, sources, buffCount}`。

| 字段 | 来源 |
| --- | --- |
| `summary` / `rules` | 百科骨架（`glossaryEncyclopedia.js`）+ 构建期自动提取 |
| `rules` 的持续时间 / 结算频率 / 伤害类型 | 由 `extractDurationText` / `extractIntervalText` / `extractDamageTypeText` 从原表聚合 |
| `sources` | `buildBuffSourceIndex` 在构建期反查角色/魔物/怪物/物品，且**按黑名单过滤** |
| `buffCount` | 该词条吸收了归并前的多少条 buff（如中毒 12、燃烧 14） |

**不再按 buff 变体归并**：旧实现的「两个池子 + 变体去重 + 数值版本胶囊 + `emptyPayload`」整条链路已随「技能专属」板块一同退役，产物里**没有 `variants` / `levelBased` / `emptyPayload` 字段**。
`buffParser` 的 `buildGlossaryEntries` / `buildBuffEntries` / `toEntry` 已不在词条路径上。

#### 技能等级上限只进 meta

`meta.skillLevelCap`（当前 **12**）仍由 `utils/skillLevelIndex.js` 计算，依据是 `heroSkillUpgrade.json` 每个稀有度只有 12 行、源码 `HeroSkillUI.cs:245` 拿行数当上限。

- `skill.json` 给主动技能配了 **21 级**，Lv.13–21 是客户端升不到的预留等级。
- **新词条管线不再据此过滤条目**：词条由规则与百科骨架定义，不再是「按技能等级列版本」的形态。

#### 缺图标的处理

**异变与光环类在源数据里没有 `buffIcon`**（游戏用粒子表现、不走状态栏图标），图集里也没有对应素材。

- 这类用**首字占位徽标**，**不借相似状态的图标冒充**。
- 当前产物 58 条中 26 条有图标，其余走首字徽标。

#### 筛选计数口径

**必须按「当前板块内 + 归并后的词条」统计**，与列表展示**同一口径**，由 `facetCountsForGroup` 统一实现。
`tests/unit/glossary.test.mjs` 逐板块逐个断言「计数 == 该筛选实际筛出的条数」，并断言板块 `count` 之和等于 `meta.entries`。

#### 分类标注

`category` 来自**规则表与百科骨架**（`STATUS_RULES[].category`、`enc.category`），怪物异变固定为「怪物异变」。

| 字段 | 用途 |
| --- | --- |
| `buffEffect` | 只用于 `desPattern` 的**门禁**（`isGenericEffect`，判断是否「通用机制」） |
| `buffType` | 状态判定的首要信号 |

#### 不生效的 buffEffect

**6 个 `buffEffect` 在 switch 里没有分支**（`enchant_1001_1`、`enchant_2001_1`、`强化普攻`、`力量药剂（小）`、`miTuoLaPassive`、`tempValue`）。
由 `BROKEN_BUFF_EFFECTS` 排除，**不进入** buff 图标清单（`scripts/dev/import-buff-icons.mjs` 经 `isCommonBuff` 消费该表）。

> 新词条管线**不再用这张表过滤词条**；上述 6 项对应的 buff 名（普攻附加、暴击抵抗提升等）当前未出现在产物的 58 条里，但这是规则匹配的结果，不是该表拦截的结果。

### 数值单位与配置差异

#### 单位按源码而非按字段名猜

`AttrAdd.cs` 的 `baseValue`/`percent` 两个字段**在不同属性上单位不同**：

| 属性类别 | 单位 |
| --- | --- |
| 物理/魔法攻击防御、生命法力 | 「固定值 + 比例（×100）」 |
| 暴击、暴伤、攻速、冷却缩减 | `baseValue` **本身已是百分数** |
| 受击/元素增伤、各抗性 | 比例（×100） |
| 移速加成 | **只有 `percent`**，且是比例 |

官方对照见 `UnitDataShowPanel.cs:162-221`（`GetPercent(v) = round(v*100,2)+"%"`）与 `ExtentionMethod.cs:1726-1770`。

#### 配置笔误在渲染时归一化

**不改写原表**：`attr.restoreHp/restoreSp.percent` 与顶层 `atkSpeed` 有少量漏乘 100 的值（0.05、-0.1 等）。
判定依据是该字段**整体取值分布**加 `buffDes` 原文自证，逐条记录在 `buffParser.js` 的 `PERCENT_TYPO_KEYS`。

属性名拼接同理：`runSpeed` 的官方名就叫「移速加成」，`percent` 行**不再叠一层**「加成」（否则渲染成「移速加成加成」），而「生命恢复」仍要拼成「生命恢复加成」。

#### 字段语义

| 字段 | 说明 |
| --- | --- |
| `damage.repelForce` | 是**击退力度系数**不是距离 |
| `damage.repelSpeed` | 源码无读取点，**不展示** |
| `attr.cirtDam` | 疑似死键，但**保留原值** |

#### 配置内部数值不一致之处如实呈现

**不替游戏下结论，也不在页面上「修正」。**

已记录：`穿甲箭`（`hero049Skill2Buff1_*`）的 `para.damage.muPower` 恒为技能说明文本百分比的 **1.1 倍**（Lv.18：buff 3.05 → 页面 305%，`skill.json` 说明写 277%；21 级全部如此）。
而 `胜军之加护`、`重锤眩晕` 的说明与 buff **完全一致**。

页面显示的是**引擎实际使用**的 buff 值；说明文本疑似某次平衡调整后未同步重生成。

#### 回填范围

`monsterParser` 的怪物 buff 与技能附加状态、`heroParser` 的职业特性都写入**同一个** `values`（`describeBuff` 产物）。

怪物详情**不再手写** `damageReduction/speedChange/triggerInterval/triggerType/stackable/maxStacks/triggerLabel/rectRange` —— 这些字段由 `values.status` 与 `values.groups` 覆盖，**不重复输出**。

#### 图标

取自图集 `CombatPanel_Atlas` 的 28×28 sprite，导入为**无损 WebP**（`scripts/dev/import-buff-icons.mjs`，**默认预览、`--apply` 才写**）。
图标清单由**精选判定推导**，不另维护一份清单，避免与产物脱节。

### URL

| 参数 | 含义 |
| --- | --- |
| `section` | 选板块（`status` / `stats` / `mechanics`），缺省 `all` |
| `q` | 跨板块搜索 |
| `category` | 选分类（按当前板块） |
| `id` 或 `buff` | 打开详情，值为词条 `id` 或**词条名** |

- `tab` 与 `group` 是 `section` 的**旧别名**，仍可读取；页面自身只写 `section`。
- 换板块会**清掉分类与详情**（分类是按板块统计的）。
- **没有 `tag` 筛选与 `tab=terms` 页签**：标签只在卡片与详情上展示，搜索命中不受板块限制。

详情内的角色 / 怪物 / 魔物 / 物品来源可跳转到对应图鉴，并按黑名单过滤。

---

## 六、邮件类型与信纸资源

> 本节是[邮件类型与信纸资源]的深入规则；主规范见本文件前面的领域小节。

静态伙伴邮箱与原素材阅读器。页面契约见 [第二节](#二伙伴邮件)，历史资源核对与像素调整见 [2026-09-10](../../history/dev-logs/2026-09/2026-09-10.md) 和 [2026-09-11](../../history/dev-logs/2026-09/2026-09-11.md)。

### 数据与覆盖范围

- `scripts/parse/heroes.mjs → heroParser → partnerMailData` 在构建期生成 `parsed/heroes.json.mailboxes`；`fetchHeroData` 缓存、`resourceSchemas` 校验，缺少邮箱字段的旧产物应报错。浏览器不另加载原表。
- 遍历完整 `heroMail`，按源码过滤没有同角色档案关联的档案邮件；不因发件人在可玩角色图鉴中标记 `hide` 而裁掉邮箱。角色档案复用同一解析函数。`eventMail/questionnaireMail` 无 `heroTypeId`，不猜测角色归属。
- 正文复用 `cleanMailContent`、通用对白清洗及 `CALL_NAME_REPLACE`，保留换行。两种 `callName4` 标记统一显示“大哥哥（大姐姐）”。邮件按原表顺序展示；搜索覆盖全部邮箱标题，选中发件人后显示其全部有效邮件。
- 静态图鉴不模拟发送时间、已读、领取或任务完成状态。后续来信的 `condition` 是解锁条件，不等同于邮件附带可接取任务。

### 类型与奖励

以原始 `heroMail.mailType` 判断，禁止替换成 `heroArchives.type`。按以下顺序匹配：

| 条件 | EmailPanel 彩色图标 | Common 奖励标签 |
| --- | --- | --- |
| `mailType=2` | `mail_list_new_task` | `com_item_archive`，奖励取关联档案 |
| `mailType=1` 且有 `taskTypeId` | `mail_list_new_task_pt` | `com_item_task` |
| `mailType=1` 且有附件奖励 | `mail_list_new_item` | `com_item_encl` |
| 普通无任务、无奖励 | `mail_list_new` | 不显示奖励区 |

奖励复用 `UiItemCard`（`showName=false`、数量走 `extra`）；真实物品 ID 保存在共享解析的 `typeId`，包括货币。点击或 Enter/空格打开全局物品详情，关闭后保留邮件选择和正文位置。货币品质查物品表，不写死。筛选与选信为页面本地状态，打开物品只追加 `itemId`，不声明未实现的选信 URL 参数。

### 阅读器布局

- `PartnerMailsView` 管筛选与选择，`PartnerMailReader` 管阅读器。`App.vue` 的 `is-mail-reader` 仅在邮件路由锁定外层视口；筛选占固定高度，其余空间交给阅读器，离开后恢复普通图鉴滚动。
- 头像、选信和正文独立滚动，使用 `minmax(0,1fr)`、`min-height:0` 和 `overscroll-behavior:contain`。隐藏原生滚动条，以方向提示表示剩余内容；正文提示位于文字下方、奖励上方，到末端隐藏，尺寸变化时重算。
- 桌面选信卡等高，标题单行按可用宽度拟合，空间恢复允许放大；窄屏改头像横栏、横向吸附选信卡与剩余高度正文。滑停选最近邮件，前后按钮首尾不循环，仅一封时隐藏；最小高度不能撑破横屏视口。
- 标题测量响应字体加载、选择和尺寸变化；监听合并到动画帧，卸载清理监听与定时器。

### 原素材与文字

| 资源 | 项目目录 |
| --- | --- |
| EmailPanel 图集 | `public/images/EmailPanel_Atlas/` |
| 头像框、选中框和奖励标签 | 共享 `public/images/Common_Atlas/` |
| 完整信纸与邮件附图 | `public/images/uipanel/emailpanel/mail_botm.png`、`heromailimg/01.png` |

原图从 `UI_Atlases` 对应图集与 `4.24路资源包/assets/res/texture/uipanel/emailpanel` 获取，保留原字节。切片依据图集 `mSprites` 与 prefab 的 `mBorder`，使用 CSS `border-image`；营地场景不是邮件背景贴图，不额外复制截图背景。

网页统一使用 `--font-ui` 的 HarmonyOS 400/700 字重：标题常规、正文与发件人粗体，正文行高 1.4。标题 `#CFBA96`，正文/发件人 `#533E26`（发件人 alpha≈0.698），强调 `#A36F0A`；副文字 `#F8EEDC`、alpha≈0.502，奖励数量 `#F8EEDC`。NGUI 字号不直接等同 CSS px，不引入游戏字库。

### 验证与追溯

检查全部类型图标、隐藏角色邮箱、称呼换行、奖励详情返回，以及明暗主题、窄屏选信和长正文滚动。2026-09-11 日志记有 844×390 长邮件正文不可见的自动化失败；**此后未复测**，不能据历史其他通过项宣称此项已修复。

皮肤改造前快照位于项目同级 `vue-myrzg备份-资源/partner-mail-before-game-skin-2026-09-10`；图片去重前快照位于项目同级 `backups/image-consolidation-2026-09-11/EmailPanel`。恢复旧目录时需配套旧代码引用。

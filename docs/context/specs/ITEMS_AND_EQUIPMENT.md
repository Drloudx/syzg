# 物品、装备、符石与兑换

> 本文件是物品图鉴、装备图鉴、符石图鉴与兑换页的业务契约。
> 奖励组、概率与消耗的公共语义见 [DOMAIN.md](../DOMAIN.md#五数据奖励与文本语义)。
> 其他奖励页（`/rewards`）**不在本文件**，见 [QUESTS_AND_EVENTS.md](QUESTS_AND_EVENTS.md)。
>
> **何时读**：改动物品、装备、符石或兑换时。
> **何时更新**：该领域规则变化时。**只改这一个领域文件，不要把别的领域内容搬进来。**

---

## 一、物品图鉴

**入口** `/items` · **页面** `ItemsView.vue` · **数据** `parsed/items.json`

`fetchItemData()` 读取物品与分类树；奖励、装备、符石、套装和用途关联**在构建期完成**。
物品详情是**全站共用入口**，其他页面不重复实现一套道具信息。

| 项 | 规则 |
| --- | --- |
| 搜索范围 | 名称、描述、ID |
| 分类筛选 | 按 `category[0/1/2]` 逐级 |
| 品质名 | 使用共享映射 |
| 默认排序 | 大类 → 中类 → 小类 → 品质降序 → ID → 中文名 |
| 收集大类排序 | 因原表分类不全，按指名契约、角色碎片、配方、家具图纸、日志文本、外观皮肤、其他分组；组内再按用途和品质 |
| 长列表 | `UiVirtualGrid`，以 `typeId` 为稳定键 |

### 分类与收录判据

- 好感礼物有专门分类；废弃的「旧版符石」**不再作为有效中类入口**。
- 「配方」兼容 `category[1]=51`、`unlockMenu`、`unlockFormula`；食谱与制作配方**分别聚合**。
- 家具图纸**必须**经 `unlockHomeItem/unlockHomeItemSkin` 关联至少一件静态家具，**不能仅凭名称带「图纸」收录**。
- 指名契约保留契约书图标；**只有角色碎片替换成头像**。
- 特殊记忆碎片 `item_5900103` 保留原描述，**不套用**普通碎片文案；契约解锁、碎片消耗均沿真实外键。

### 交互

- 点击卡片在当前路由追加 `itemId`，由 App 打开全局物品详情。
- 礼包、钥匙宝箱、鉴定等「包含内容」使用 `item.acquisition`。
- 来源条目**只在有真实目标时**提供跳转。
- 正常关闭详情恢复原位置，冷链接再定位目标；**不能因追加 `itemId` 重建列表或强制回顶部**。

---

## 二、装备图鉴

**入口** `/equip` · **页面** `EquipsView.vue`

与物品页**共用** `fetchItemData()` 和 `ItemDetailModal`，**不独立维护一份装备基础数据**。

| 项 | 规则 |
| --- | --- |
| 过滤条件 | `category[0]=4` + 未隐藏 + `equip.equipLevel>0` |
| 排除 | `show_*` 奖励展示占位 |
| 部位来源 | 装备分类树 |
| 品阶 / 稀有度 | **分别**筛选 |
| 默认排序 | 共用 `compareItemsByCategoryQuality`：大类 → 部位 → 小类 → 品质降序 → ID → 中文名 |
| 品阶的作用 | 只筛选，**不改变**默认分类顺序 |

### 详情

支持品质切换、强化等级与实时属性。

| 项 | 规则 |
| --- | --- |
| 强化作用范围 | **只作用于五项基础属性** |
| 强化上限 | 开放锻造台与 `smithyCfg` 的交集 |
| 不算正式档位 | 990～995 测试档 |
| 入口隐藏 | 仅服务奖励组的「包含内容」；**保留**词条、套装和获取途径等实际信息 |
| 固定副本装备 | 能跳转具体关卡 |
| 随机装备池预览 | **不能反向生成**固定来源 |

点击追加 `itemId`，与物品图鉴、任务奖励及其他来源入口**共用同一详情历史**。

---

## 三、符石图鉴

**入口** `/runes` · **页面** `RunesView.vue` · **数据** `parsed/runes.json`

包含符石列表、鉴定、合成。效果、部位、镶嵌费用和正式兑换关系由 `runeData` **在构建期校验**。

### 关联链

| 内容 | 关联链 |
| --- | --- |
| 效果 | `item → equipEnchant → skillTrigger.levelData` |
| 镶嵌费用 | `equipEnchant.consume` |
| 鉴定 | `item.useAction=appraisal → useActionPara.reward/consume` |
| 合成 | `fushi_itemExchangeMapping → itemExchange → reward/consume` |

- `buildRuneEffect` 是**唯一**效果实现，物品详情通过适配接口复用。
- **不能**按相邻 ID、同名或页面排序猜测下一级；**最高级不补后继方案**。

### 鉴定（本地模拟）

| 项 | 规则 |
| --- | --- |
| 消耗 | **不消耗账号材料** |
| 次数 | 1～999 |
| 结果展示 | 显示最近一批结果 |
| 修改次数 | **不改**旧结果标题 |
| 重新鉴定 | 替换结果 |
| 换方案 / 页签 | 清空 |
| 打开物品再返回 | 保留 |
| 抽样 | 按已核对结构**独立有放回**抽取 |
| **禁止** | 添加隐藏保底 |

当前客户端资料**不足以证明服务器的随机数和批量算法**，不宣称完整复刻服务端。

### 合成

- 只展示**单次**正式材料与产物；按产物进行名称、等级、部位筛选。
- 来源指定的方案**排前并高亮**。
- 合成中的旧 `count` **不生效**。

### URL

| 参数 | 含义 |
| --- | --- |
| `tab=runes|appraisal|synthesis` | 页签 |
| `focus` | 列表定位符石 |
| `id` | 鉴定 = 未鉴定物品；合成 = 兑换方案 |
| `q/level/position` | 筛选 |
| `count` | **仅鉴定有效** |

材料只追加 `itemId`。符石搜索沿用物品索引；鉴定/合成来源合入来源表；兑换页**不重复展示 `gem`**，原始兑换配置仍保留。

概率、方案切换与来源去重见本文件[第五节](#五符石概率与来源去重)。

---

## 四、兑换

**入口** `/exchange` · **页面** `ExchangeView.vue` · **数据** `parsed/parsed-exchange.json`

内容来自 `itemExchange/reward/consume/item`；入口判断关联 `shop/general/packDisplay/activityList/condition/task`。

> **兑换表有记录不代表实装。** 地区、种子、兔子、积分、时装和补给**必须与当前正式入口求交集**。

| 项 | 规则 |
| --- | --- |
| 可见性索引 | 页面、全局搜索、物品来源**共用** |
| 组织方式 | 委托、地区商店、兔子、活跃、商店积分、种子、每日补给、爬塔、PVP、通用兑换按**正式入口** |
| 不展示 | 停用工资、测试组、无入口商店与礼包 |
| 地区共用商店 | **不复制** |
| 商城排列 | 依 `packDisplay` 可见配置 |
| 时装关联 | `shop.skins.heroSkin → skin.heroTypeId → hero.name` |
| 时装封面 | **严格**用 `shop.skins[].img` 商店原图，**不猜**角色立绘 |

### 商品视觉

复用 `UiExchangeTrade`：普通、商城、礼包、时装选择对应变体。
材料与价格来自消耗表；**限购只表达配置上限**，不显示账号剩余、售罄或已拥有。

### 种子与兔子

| 项 | 规则 |
| --- | --- |
| 种子 | 区分固定/随机候选；解锁条件沿 `showCondition → condition → task` |
| 兔子 | 按品质筛选 |
| 刷新规则 | 取**完整候选池**，不受当前筛选裁剪 |
| **注意** | 候选池全部商品**不意味着**每次同时售卖 |
| 规则页 | 种子/兔子规则集中在此，保留抽选、购买数量与解锁条件 |
| 其他兑换 | 保留各自限购/开放时段 |

符石合成在[符石页](#三符石图鉴)，锻造随机配方在[设施页](CAMP_AND_LIFE.md)，**均不作为普通兑换重复展示**。

### URL

| 参数 | 含义 |
| --- | --- |
| `cat/sub/q` | 筛选 |
| `rarity` | 主要用于兔子 |
| `view=rules` | 用于种子/兔子 |
| `cat=fashion` | 旧值 → 迁入 `shop/fuZhuang` 并保留其他参数 |
| `cat=gem` | 回落有效分类 |
| `sub=all/s1` | 兼容 |

商品使用 `itemId` 打开详情。
兑换与其他奖励页**并存 PVP 兑换入口**，属于尚未统一的产品入口。

---

## 五、符石概率与来源去重

> 本节是[符石概率与来源去重]的深入规则；主规范见本文件前面的领域小节。

入口 `/runes`，包含列表、鉴定、合成；静态图鉴与本地鉴定模拟不连接账号、不实际消耗材料。图片复用 `Common_ItemIcon`。

### 数据与职责

| 内容 | 正式关系 | 游戏依据 |
| --- | --- | --- |
| 效果和部位 | `item → equipEnchant → skillTrigger.levelData` | `EquipFuMoUI` |
| 镶嵌费用 | `equipEnchant.consume → consume` | `EquipFuMoUI.FumoBack` |
| 鉴定 | `item.useAction=appraisal → useActionPara.reward/consume` | `ItemUseTip`、`BackpackServerData` |
| 合成 | `fushi_itemExchangeMapping → itemExchange → reward/consume` | `FumoItemInfo`、`EquipFuMoExchangeUI` |

`scripts/parse/runes.mjs → runeData → parsed/runes.json` 构建与校验；浏览器不加载 raw。缺少效果、费用、奖励引用或非同系升一级映射应报错，不能按相邻 ID 猜。可见性复用 hide、黑名单和正式兑换映射；最高级无后继方案，未使用符石不进入页面。

- `buildRuneEffect` 是唯一效果实现，物品详情经 `itemParser.parseRuneEffect` 适配；部位名和高亮使用共享工具。
- 鉴定与合成使用 [统一奖励规则](../technical/ACQUISITION_RULES.md)，鉴定展示复用 `AcquisitionRewards`，合成卡消费 `plan.acquisition/input/output.effect`。
- 搜索合并 `buildRuneData.sources` 的 `runeAppraisal/runeSynthesis`，只替换同输出、同兑换 ID 的重复 Gem 来源。符石沿用物品搜索索引，兑换页不重复展示 Gem；旧 `cat=gem` 回落有效分类，原始合成表仍保留。

### 定位协议

| 入口 | query |
| --- | --- |
| 符石列表 | `tab=runes&focus=<物品ID>` |
| 鉴定 | `tab=appraisal&id=<未鉴定物品ID>&count=1..999` |
| 合成 | `tab=synthesis&id=<兑换ID>`，不能假定等于产物 ID |
| 列表/合成筛选 | `q/level/position`，合成按产物筛选 |
| 物品详情 | 保留 query，追加 `itemId` |

来源用 `getRuneSourceTarget` 定位，`getRuneItemTarget` 保留为工具，不恢复物品详情内重复导航按钮。前进后退以 URL 为准，切页签清理不适用筛选，详情返回保留筛选和方案。

### 鉴定与合成

- 鉴定次数为 1～999；“选择其他”展开其他方案，选中后收起。显示最近一批结果并合并同名符石；修改次数不改旧结果标题，重新鉴定替换结果，换方案/页签清空，详情返回保留。
- `runeAppraisal.appraiseRunes` 逐次独立、有放回地按配置权重抽取，不添加保底。只支持已核对的单组必触发、单次单件结构，其他结构报错。客户端 `ItemBagMsg → ItemRouterUseItem` 请求服务器并接收奖励，现有证据不能证明服务器随机数、批量处理或隐藏保底，不能声称复刻服务器算法。
- 概率格式统一由 `formatRewardProbability` 控制，展示近似值不参与抽样；批量只放大费用和抽取次数，不生成未经确认的累计概率。历史逐项权重核对见 [2026-09-09 日志](../../history/dev-logs/2026-09/2026-09-09.md)。
- 合成只展示单次正式材料与费用，旧 `count` 不生效；输入/输出沿映射校验同系升一级，不手抄费用或以物品名推测。来源指定方案排首位并高亮，避免分页后不可定位。

### 布局与回归

搜索、页签、筛选、计数按顺序排列；筛选作为页面根直接子元素，纸色只放正文。切换用 `resolveScrollTarget` 重置真实滚动根。鉴定的操作栏手机独占一行、靠左；概率/结果/选择区手机两列，合成桌面两列、手机一列。图标与材料可打开详情，不重复放置多余操作按钮。

验证入口：`tests/unit/runes.test.mjs`、`tests/unit/rune-appraisal.test.mjs`、`tests/unit/acquisition-rules.test.mjs`、`tests/ui/runes.spec.js`。检查映射、顶级边界、批量/概率、来源去重、筛选、鉴定结果返回与加载失败；实际结果写当日日志，历史通过项不代替当前回归。

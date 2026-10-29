# 配队模拟（`/sims`）交接文档

> **状态**：已实施，**未提交**（工作区改动）。页面可直接运行，但还没进 git。
>
> **何时读**：接手「相关模拟 / 魔物出战」这块、要改推荐算法、要加新模拟、或排查布局问题时。
> **何时更新**：评分模型、数据口径、点亮规则、布局约束任一变化时。

**核对时间**：2026-10-28

---

## 一、这是什么

选 4 名角色，按魔物的**队伍被动**推荐 3 只出战组合，追求「队伍吃到的被动最多」。

入口：导航「相关模拟」→ 页面板块「魔物出战」。后续加别的模拟时，在同一页并列板块即可。

## 一·补、板块寻址（`?tab=`）

**`/sims` 是容器页**，本身不代表任何单个模拟；每个模拟是一个板块，用 `?tab=` 寻址
（与 `/misc?tab=pvp` 同构）。

| 板块 id | 名称 | 地址 |
| --- | --- | --- |
| `monster-team` | 魔物出战 | `/sims?tab=monster-team` |

规则：

| 规则 | 说明 |
| --- | --- |
| 板块状态由 URL 决定 | `board` 初值取 `route.query.tab`，不存组件私有状态 |
| 非法/缺失的 `?tab=` 会被规范化 | 进入页面时 `normalizeBoardQuery()` 写回首个板块 id |
| 切换板块用 `router.replace` | 不在历史里堆层，否则后退要一个个退板块、退不出本页 |
| 新增模拟只改 `BOARDS` 常量 | 筛选行的 pill 由该数组渲染，不写死在模板里 |

> 🔴 不要在 `resolveBoard()` 里做跳转：那是在「解析函数」里做路由副作用，
> 会被随后的 `replace` 覆盖（`RewardsView` 踩过这个坑，见其 `resolveMainCategory` 注释）。
> 跳转集中在 `selectBoard()` 与 `normalizeBoardQuery()` 两处。

| 项 | 值 |
| --- | --- |
| 路由 | `/sims`（`src/router/index.js`） |
| 组件 | `src/views/SimsView.vue` |
| 数据层 | `src/utils/simsData.js` |
| 求解器 | `src/utils/simsSolver.js` |
| 数据产物 | `public/data/parsed/sims.json`（13 KB，**构建期生成**） |
| 生成脚本 | `scripts/dev/build-sims-data.mjs` |

---

## 二、数据口径（最容易踩的地方）

### 2.1 队伍被动 = `skills[3]`，不是 trait

游戏配置表 `pet.json` 里宠物有 `normalAttack / skill1 / skill2 / skillSp` 四个技能字段。

| 字段 | 含义 | 对应 `pets.json` 的 skills 索引 |
| --- | --- | --- |
| `normalAttack` | 普攻 | `[0]` type=normal |
| `skillSp` | 特性（trait） | `[1]` type=trait |
| `skill1` | 主动技能 | `[2]` type=active |
| **`skill2`** | **队伍被动** | **`[3]` type=active** |

依据：`HeroTeamUI.cs:110` 的 `RefreshHeroPetBuff()` 用 `petInfo.petConf.skill2` 判定点亮。

🔴 **不能取 trait**。有 3 个魔物（草原黏团 / 魔水粘团 / 熔火喷炎者）的 `trait` 描述里也写了「队伍中…」，但**特性是角色携带生效的，不是出战魔物给的**，混进来会算错受益人数。

### 2.2 限定条件靠解析中文

源码用结构化字段 `skillTrigger.json` 的 `limitJob` / `limitElement`，但**这张表没进前端产物**，所以只能解析描述文字。

验证过一致性：`pet_07703` 在 `skillTrigger.json` 里是 `limitJob=[]`、`limitElement=[2]`（火），与解析结果「火属性、不限职业」吻合。

原文写法极不统一，因此用**词表匹配**而非正则推导：

| 真实原文 | 难在哪 |
| --- | --- |
| `队伍中 {火属性} 伙伴物理攻击增加 {6%}` | 标准式 |
| `队伍中伙伴魔法防御增加 {4%}` | 无空格、无限定 |
| `队伍中法师辅助魔法防御 {6%}` | 无「增加」二字，且有口语别名 |
| `队伍中每有一个【秘术】伙伴，可获得 {5%} 魔法攻击力 提升` | 用【】不用 {} |

对策：
- `STAT_WORDS` 按长度降序匹配，「物理攻击力」优先于「物理攻击」
- `JOB_ALIAS` 处理 法师→秘术、辅助→支援

### 2.3 图标路径要自己拼

数据里只存**文件名**，不含目录：

```
hero.img  = "chara019_0"       → /images/HeroBagPanel/chara019_0_ka.webp
hero.icon = "at019_0"          → /images/HeadIconAtals/at019_0.webp
pet.monImg = "colect_mon_007"  → /images/PicHandBookPanel_Atlas/colect_mon_007.webp
```

直接把裸文件名传给 `getImageUrl` 会 404（踩过）。

### 2.4 预处理不要排序

`heroes.json` 的顺序本身就是「按稀有度降序、组内按内部次序」，角色图鉴 `/heroes` 直接沿用。

🔴 生成脚本里**不要加 `sort`**。早先按 id 排过序，结果选人弹窗顺序与角色图鉴完全对不上（图鉴开头是 奇瓦/阿娜洛洁/菲莉娜，弹窗变成 希尔/茜塔/拉碧丝）。保序本身即幂等。

---

## 三、点亮标记规则（已核对源码）

`HeroTeamUI.cs` 的 `RefreshHeroPetBuff()`：

```csharp
for (i = 0; i < pets.Count; i++) {
    flag = CheckUnitJobAndElement(heroConf, passiveSkill.limitJob, passiveSkill.limitElement)
    buffTags[i].SetActive(true)
    spriteName = flag ? "team_buff_on" : "team_buff"
}
```

| 结论 | 值 |
| --- | --- |
| 点亮单位 | **每个出战位独立判断，各点亮一颗** |
| 上限 | `pets.Count` = **3** |
| 匹配逻辑 | 职业 AND 属性；空列表 = 不限（`BattleManager.CheckUnitJobAndElement`） |

图标：`PetPanel_Atlas/team_buff.webp`（未亮）/ `team_buff_on.webp`（已亮），32×28。

---

## 四、推荐算法

穷举 `C(32,3) = 4960` 种组合，**拿到真最优解**，不用贪心近似（这个规模下贪心只会更慢且可能错）。

### 4.1 评分公式

```
score = Σ(角色权重 × 该角色吃到的数量) + 偏好加成命中 × 0.15
```

| 权重 | 值 | 说明 |
| --- | --- | --- |
| 默认（所有角色） | **1** | 此时 score 等于总点亮数，即「平均每人吃到的数量最多」 |
| 点选加权 | **2.5** | 优先照顾，但**不强制** |

### 4.2 🔴 不能按「吃满人数」排序

早先版本按 `fullCount` 主序，会选出 `[3,0,0,3]`（2 人满 / 2 人空手，总 6）而不是 `[1,2,2,3]`（4 人都有收益，总 8）。

实测遍历 46376 种 4 人队伍，**512 种（1.1%）会踩这个坑**。

### 4.3 「排除通用被动」默认开启

通用 = 不带任何属性/职业限定（实测 7 个：角布林 / 臭臭蕈 / 游离灯火 / 繁茂杜吉芽 / 囊袋恐兽 / 石像鬼 / 布丁史莱姆）。

不排除时这 7 个会把 3 个位全占满，显示「12/12 满分」却等于没做针对性搭配。开启后同一队伍的最优解完全不同。

加权 2.5 倍下最大牺牲 3 点（例：等权 `[0,3,3,3]` 总 9 → 加权后 `[3,3,0,0]` 总 6）。

---

## 五、页面布局与踩坑

### 5.1 结构

```
UiFilterPanel（搜索 + 板块行 + 角色加权/优先词条/其他）
UiCardGrid#simsScroll          ← 正文滚动容器，必须带 data-main-scroll
  └ .sim-board-body               ← 一张羊皮纸面板
      ├ UiSection「出战队伍」      ← 可折叠，标题右侧含 n/4 计数
      └ .sim-pets-section「魔物搭配」
UiModal                            ← 选人弹窗
```

### 5.2 🔴 高度策略：min-height 托底，不能锁死

```css
.sim-content {
  flex: 1 1 auto !important;
  min-height: calc(100% - 262px) !important;  /* 262 = 筛选250 + gap12 */
  margin-bottom: -12px;                        /* 抵消页面底部 gap */
}
```

**目标两条同时成立**：

| 场景 | 需要 | 行为 |
| --- | --- | --- |
| 内容少（空槽/2人） | 533 | min-height 托底 → 撑满，三栏底边齐平 |
| 内容多（4人+推荐） | 646 | 自然变高 → 整页滚动（桌面端设计） |

🔴 **不要用 `flex: 1 1 0`**：会把高度锁死在剩余空间（实测 510px），而 4 人时需要 644px，多出的部分被挤出可视区，整页被撑到 1014px，出现"内容没显示完却能滚"的怪象。

🔴 **不要用 `height: 100%`**：`.app-main` 桌面端是 `height: auto`，会形成循环（曾涨到 10982px）。

### 5.3 UiCardGrid 的三层阻碍

面板要长高，得同时打通三层，缺一层都长不高：

| # | 阻碍 | 修法 |
| --- | --- | --- |
| ① | `.sim-content` 挂在滚动容器上，被 `UiCardGrid` 的 scoped 样式压过 | `!important` |
| ② | `flex: 1 1 auto` 的 basis 按内容算 | 确保不被写成 `1 1 0` |
| ③ | `UiCardGrid` 默认 `align-content: start`，网格行按内容贴顶 | `grid-template-rows: 1fr` + `align-content: stretch` |

### 5.4 行间距由父容器决定

`UiFilterRow` 只管行内布局（label + 选项），**行与行之间靠父容器的 gap**：

- `UiFilterPanel` 里是 `.ui-filter-content { gap: inherit }`，从 `.filter-panel` 继承 **10px**
- 自己新建容器时若用默认 `display: block`，行间距就是 **0**（踩过两次：`.sim-section` 和弹窗）

弹窗里要复用这套，用 `<UiFilterPanel :collapsible="false">` 包起来，别手写 gap。

### 5.5 其他布局细节

| 项 | 做法 |
| --- | --- |
| 槽位最小高度 | `min-height: 188px`，避免选人前后跳动（曾差 186px） |
| 名字 | 只由 `HeroPickCard` 画在立绘底部，槽位**不要**再重复一次 |
| 清空按钮 | `UiButton size="sm" variant="secondary"`，与魔物收益页「重置」同款 |
| 卡片 | 只渲染立绘（`HeroBagPanel/<img>_ka.webp`），不带卡框/底图/属性图标 |
| 点选图标尺寸 | `.sim-slot > img` 要限定直接子级，否则会命中标记图标把它撑成 64px |

### 5.6 弹窗重复 id

`UiModal` 的 `scroll-id` 会挂在 `ui-modal-body` 上。**不能**再套一个同 id 的 div —— 重复 id 会让点击被上层元素拦截。

---

## 六、常见改动怎么做

| 需求 | 改哪里 |
| --- | --- |
| 调加权强度 | `simsSolver.js` 的 `BOOSTED_HERO_WEIGHT` |
| 改偏好加成权重 | 同文件 `STAT_HIT_WEIGHT`（默认 0.15，只做同分微调） |
| 加新模拟板块 | `SimsView.vue` 顶部 `board` 常量 + 板块行 pill |
| 改数据字段 | `simsData.js` 的 `toHeroRecord` / `toPetRecord`，**同时**改生成脚本 |
| 数据更新后 | `npm run data:build`（已串联生成 `sims.json`） |

### 数据相关命令

```bash
npm run data:sims         # 单独生成 sims.json
npm run data:sims:check   # 校验与源数据是否一致（可用于 CI）
npm run data:build            # 完整数据重建（内含上面这条）
```

---

## 七、验证方式

| 项 | 命令 / 方法 |
| --- | --- |
| 单测 | `npm run test:unit`（400 条） |
| 全量 | `npm run verify`（含构建） |
| 图片缺失 | `npm run audit:images:missing`（会跑真实页面收 404） |
| 布局 | 1600×900 视口下量三栏 `getBoundingClientRect().bottom` 应相等 |

### 验证要点

- 空槽与满员两种状态都要看：`scrollHeight == clientHeight` 才算内容没被裁
- 选人弹窗顺序应与 `/heroes` 完全一致（34 个逐个比对）
- 点亮标记：勾「排除通用」后，同一队伍的最优解应与非排除时不同

---

## 八、已知遗留

| 项 | 状态 |
| --- | --- |
| 未提交 | 全部改动在工作区，没进 git |
| 占位空态 | 「请先选择角色」用 `padding: 10px 16px` 收窄（全局是 40px），仅为控制本页高度，未改全局组件 |
| `!important` 与负 margin | 为压过 `UiCardGrid` 的内联样式，属权宜手段，注释已写明原因 |
| 无 UI 回归测试 | 页面未接入 `tests/ui/`，布局靠人工量尺寸 |

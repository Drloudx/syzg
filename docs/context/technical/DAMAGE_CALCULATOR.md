# 角色伤害计算器（`/#/sims?tab=damage`）交接文档

> **状态**：已上线（含八步直伤、160 星阶、22 魔物/套装/词条特效、通用 DPS 循环、DoT 与召唤物联动、DC2 短码分享及乌尔勒/阿娜洛洁源码口径校准，随本次提交推至 `main`）。
>
> **何时读**：Agron 或后续开发者接手「伤害计算器 / 伤害公式校准 / 战斗机制补全」模块时。
> **核心公式权威依据**：[COMBAT_FORMULAS.md](COMBAT_FORMULAS.md)（特别是 §2 字段单位、§3 属性叠加、§4.1–§4.6 八步流水线、§9.1 房间怪物属性、§13 源码异常）。

**核对时间**：2026-11-22

---

## 一、模块定位与设计原则

- **入口**：`/#/sims?tab=damage`（[SimsView.vue](../../../src/views/SimsView.vue) `BOARDS` 第二板块「伤害计算」，与「魔物出战」并列，通过 `defineAsyncComponent` 懒加载）。
- **手填面板优先，不做全量养成模拟器**：玩家直接抄入游戏内进图/角色面板的攻击、暴击、暴伤、穿透与增伤，计算器只按 **1.7.15 八步公式** 结算目标伤害与期望，避免因装备随机词条、营地研究、潜能、料理、法盘联动缺失导致前期算不准。
- **独立预解析精简包**：构建期抽取 40 名角色（含普攻、技能、核心被动 `talentSkills`、4 枚星阶技能 `starSkills`、基础攻速 `baseAtkSpeed`、DoT 跳数规格 `dotProfile`、召唤物攻击模型 `summons`、立绘 `img`）、121 个可见怪物形态、`monLevelStrength`（1~101 级）及 `effects` 战斗特效目录（22 种魔物特性 Lv.1~7、8 项可见套装战斗特效、5 项可见装备特技词条，已按 `!isBlacklisted && !isEquipTierHidden` 过滤隐藏与未实装装备），生成 `578.5 KB` 的 `public/data/parsed/damage-calc.json`；切换板块时才按需下载，不拉取全量 `heroes.json` / `monsters.json`，也不拖慢原配队模拟。

---

## 二、文件清单与职责

| 文件 | 职责 | 关键导出 / 说明 |
| --- | --- | --- |
| [damageCalcData.js](../../../src/utils/damageCalcData.js) | 数据压缩提取与怪物弱点解析 | `toDamageHeroRecord`（复用 `toDamageSkillRecord` 提取 `skills`/`talentSkills`，保留 `img`/`baseAtkSpeed`/`baseCritDam`/`floatMin/Max`）、`toDamageMonsterForms`、`parseMonsterWeakness`、`extractLevelStrengthMap` |
| [heroStarsDamage.js](../../../src/utils/heroStarsDamage.js) | 全角色 160 枚星阶技能提取与聚合 | `buildHeroStarRecords`（区分战斗向含召唤加成 / `panelStatic` / 机制向）、`calculateHeroStarEffects`（含 `summonMods` 召唤增伤/物攻/攻速/继承/延时/加量/退场自爆）、`applyStarTransformsToSkill` |
| [damageEffects.js](../../../src/utils/damageEffects.js) | 魔物特性与装备/套装特效引擎 | `buildDamageEffectsCatalog`（从原表提取 22 魔物特性 + 8 可见套装 + 5 可见装备词条，按可见装备 `suitTypeId`/词条池过滤）、`isEffectApplicable`（按形态/类型/元素判定生效）、`aggregateDamageEffects`（含圣骑士史莱姆 `summonUnitAtkDamAdd` 同步作用于召唤师与友方召唤物） |
| [damageDps.js](../../../src/utils/damageDps.js) | 通用 DPS 循环、词条收益、对比与短码分享引擎 | `calcEffectiveAtkSpeed`（300% 上限）、`calcEffectiveCooldown`（50% 上限）、`evaluateHeroAbility`（单发与循环共用，含 DoT 与召唤物联动星阶/圣骑士汇总）、`calculateHeroDpsRotation`、`calculateDpsStatWeights`、`compareAgainstBaseline`、`encodeCompactShareCode` / `decodeSharePayload`（`DC2:` 无服务端差量短码） |
| [damageDoTAndSummons.js](../../../src/utils/damageDoTAndSummons.js) | 持续伤害 DoT 与召唤物独立结算 | `SKILL_DOT_SPECS` / `evaluateSkillDotSummary`（覆写通道/地面多跳与 `Buff_Burning` / `DOT` 总跳数；乌尔勒 `06503` 扫射按 `7u` 对单静止重叠校准为 `7` 跳）、`extractSkillSummonsFromRaw` / `evaluateSkillSummons`（继承攻防与穿透比例、使用召唤物自身攻速/暴击/爆伤，并接入 `summonMods`） |
| [heroMechanics.js](../../../src/utils/heroMechanics.js) | 全角色技能/被动源码校准覆写表 | `HERO_SKILL_MECHANICS_OVERRIDES` 经 `1.7.15` `Assembly-CSharp` 核对后，已将 40 名角色核心被动 `talentSkills` 清零 `pending`（18 个伤害被动全部校准 `form`/`crit`/`elements`/`segments`） |
| [build-damage-calc-data.mjs](../../../scripts/dev/build-damage-calc-data.mjs) | 构建期精简表生成器（`schemaVersion: 2`） | 复用 [blacklist.js](../../../src/config/blacklist.js) 剔除黑森林/隐藏等阶/未实装条目并写入 `starSkills`、`dotProfile`、`summons` 与 `effects` 目录；支持 `--check`；已接入 `package.json` |
| `public/data/parsed/damage-calc.json` | 运行时精简数据产物（`579.7 KB`） | `40` 角色 / `160` 星阶技能 / `121` 怪物形态 / `1~101` 级 `levelStrength` / `35` 条战斗特效 |
| [resourceSchemas.js](../../../src/utils/resourceSchemas.js) | 运行时 Schema 校验 | `schemas['data/parsed/damage-calc.json']` 校验 `heroes`（含 `starSkills`、`baseAtkSpeed`）、`monsters`、`levelStrength` 与 `effects`（`pets`/`suits`/`equips`） |
| [damageCalculator.js](../../../src/utils/damageCalculator.js) | 1.7.15 八步纯函数结算引擎 | `truncInt`、`calcDefenseK`、`calcLevelSuppression`、`calcNetCritChance`、`calculateSegmentDamage`（已支持分段的 `ignoreDef`/`allowCrit`/`realCrit` 及 `tagDamAdd`/`extraEventMult`）、`calculateSkillDamage` |
| [DamageCalculatorPanel.vue](../../../src/components/sims/DamageCalculatorPanel.vue) | 懒加载交互面板 | 选角/选怪/选魔物弹窗（`teleport-to="body"`）、技能与直出星阶属性说明栏、纯召唤技能置顶召唤输出卡片 + 单发/DoT/综合 DPS 看板与基准 A 对比、多段八步白盒分段 Tab 切换、DPS 循环与词条收益分析、本地预设与 `DC2:` URL 短码还原、浅/深色适配 |
| [SimsView.vue](../../../src/views/SimsView.vue) | 容器板块路由与懒加载挂载 | `BOARDS` 增加 `damage`；在 `damage` 板块跳过 `sims.json` 拉取并隐藏魔物筛选栏 |
| [RoomContentList.vue](../../../src/components/RoomContentList.vue) | 配套改动：关卡房间直出非 `100%` 修正 | 直接复用 `levelScaleHp` / `levelScale`（零额外数据体积），同房一致标在变体标题栏（`关卡修正 ×40%`），混编标在怪物胶囊后 |
| [damage-calculator.test.mjs](../../../tests/unit/damage-calculator.test.mjs) | 单元测试（14 项） | `truncInt`、物理/魔法 `K(L)`、等级压制、一区加法、`realDam`+`scaling='auto'`、暴击/浮动截断、保底 1 伤、Schema/黑名单校验、全角色被动校准、魔物/套装/装备乘区聚合、全角色 160 星阶校准、DPS 循环与词条收益、DoT 跳数/召唤物/DC2 短码、圣骑士与召唤星阶及 06503 扫射校准 |
| [damage-calculator.spec.js](../../../tests/ui/damage-calculator.spec.js) | Playwright UI 测试（desktop + mobile） | 验证直达 URL 与 `c=` 短码还原、默认值、星阶属性直出、纯召唤置顶输出与圣骑士召唤联动、基准 A 对比、多段白盒切换、DoT/召唤结算、攻速/爆发轴/词条收益/预设存档、选角与选怪弹窗、浅/深色与零横向溢出 |
| [dark-mode-layout.spec.js](../../../tests/ui/dark-mode-layout.spec.js) | 深浅切页盒模型回归守护 | 已加入 `['伤害计算', '/#/sims?tab=damage']` |

> ⚠️ 工作区另有未跟踪文件 `docs/feedback/全角色技能描述与实际配置代码差异排查报告.md`（历史预留），不要误改或误删。

---

## 三、已确认的实现机制与避坑记录

1. **公式严格口径（[damageCalculator.js](../../../src/utils/damageCalculator.js)）**：
   - **两次向零截断**：`truncInt`（`Math.trunc`）分别发生在 **第 5 步 `D0`**（`truncInt(X3 * F)`）与 **第 8 步 `D`**（`max(1, truncInt(D2 * spRelicMult))`），不能合成最后一次取整。
   - **第一增减伤区同区相加**：`zone1Mult = 1 + A + T - R`（例：火增伤 20% + 火弱点 -20% 合成 `×1.40`，非 `1.2 × 1.2 = 1.44`）。
   - **防御常数 `K(L)` 看攻击者等级**：`calcDefenseK` 取攻击者等级 $L$，不是怪物等级（角色升级但面板攻击不变时，打同防御怪物也会因为 $K(L)$ 增大而略微增伤）。
   - **`form === 'buff'` 与 `form === 'normalAtk'` / `'skill'` 隔离**：例如奇瓦被动「火种引燃」的 `form` 为 `'buff'`，不吃普攻增伤、技能增伤与遗器技能增伤；`unitBeHitSkillDamAdd` 与 `spRelicSkillDmgAdd` 仅 `form === 'skill'` 生效。
   - **1.7.15 特判**：支持 `realDam`（跳过 Step 3 双曲线防御）、`realCrit`（强制暴击）、`scaling === 'auto'`（取 `max(phyAtk, magicAtk)`）。
2. **数据字段与 UI 易踩坑点**：
   - `heroes.json` 中普攻 `skill.type` 为字符串 `'normal'`，且 `skill.icon` 在图鉴目录无对应图标，渲染层必须加 `v-if="sk.icon && sk.type !== 'normal'"`（与 `HeroesView.vue` 一致），否则触发兜底显示白眼占位图标。
   - `HeroPickCard.vue` 的立绘读取 `hero.img`（`charaXXX_0`），不是 `hero.icon`（`atXXX_0`）。
   - 在 `<UiCardGrid id="simsScroll">` 内部打开的 `<UiModal>` **必须传 `teleport-to="body"`、`max-width` 与 `:close-on-overlay="true"`**，否则非 teleport 的内嵌弹窗不匹配 `.page-view-container > .ui-modal-host`，会被 `.app-main:has(.ui-modal-host.ui-modal-open)` 锁高裁剪在视口底部不可见。
   - 选中怪物预设后，`套用等级` 滑条（上限动态取 `levelStrength` 最大等级 `101`）与右侧 `目标等级` 输入框**双向同步**并实时重算 `phyDef` / `magicDef`。

---

## 四、实机对账现状与【重点待查清单（Agron 重点接手点）】

### 4.1 已完全对上的实机用例（1.7.15 源码 + 实机交叉证伪）

1. **艾薇杜尔 Lv.1（`phyAtk=476`，无穿防装备，仅被动天赋 `ignoreDef=0.06`）打 `密林深处` Lv.1 角猪**：
   - `UnitAttribute.cs:615-618` 实锤源码：**`phyDef = data.unitData.phyDef * coeff`**（与 `phyAtk` / `maxHp` 不同，**怪物双防不乘房间 `levelScale 0.4`，且不提前取整**，`132 × 1.36 = 179.52`）；
   - 代入 `179.52` 物防、`6%` 无视防御计算：
     - 1 技能：`334.24 → 334`、`768.74 → 768`（实机截图：`334`、`768`，**0 误差**）；
     - 2 技能：`66.85 → 66`、`701.90 → 701`（实机截图：`701`，**0 误差**）。
2. **缇莎 Lv.43（`magicAtk=3284`、武器带 `2` 点魔法穿透、头盔 `equip_sp0102_1` `+15%` 火伤）与安娜 Lv.43（`magicAtk=2754`）打 `密林深处` Lv.1 角猪**：
   - 缇莎 1 技能（`200%`）实机 `9,064`，2 技能（`100%`）实机 `4,532`；在 `0` 魔防下 `3284 × 2 × 1.2 × 1.15 = 9,063.84`、`3284 × 1 × 1.2 × 1.15 = 4,531.92`（差不足 1 点来自战斗面板 `UnitAttribute.magicAtk` 实际保留 `float` 小数）。
   - **为什么艾薇杜尔吃到 `100%` 角猪物防，而缇莎/安娜等同 `0` 魔防？已在 1.7.15 C# 源码定位为官方单位未换算 Bug**：
     - 装备/营地等来源的 `phyAtkPen` / `magicAtkPen` 在配置与 UI 中均以**百分数**存储（例如湖晶法杖 `magicAtkPen = 2`，`UnitDataShowPanel.cs:216` 直接拼接 `"%"` 显示为 `2%`，`Buff_AttributeAdd.cs:132` 与 `RelicDetailPanel.cs:50` 均正确 `/ 100f`）；
     - 但 `UnitAttribute.cs:436-437`（1.7.15 新补回的英雄初始化赋值）直接写成 `magicAtkPen = heroBattleData.attributeGroup.MagicAtkPen;` **漏了 `/ 100f`**；
     - `DamageResolver.cs:134,151` 又直接按小数消费：`num8 = Mathf.Min(num8 + damageInfo.ignoreDef, 1f)`。结果**只要角色身上装备/营地/潜能有任意 `≥ 1` 点的 `phyAtkPen` 或 `magicAtkPen`（哪怕仅 `2%`），进图即被钳位成 `1.0` = `100%` 无视防御**！
     - 艾薇杜尔只靠被动 `damageInfo.ignoreDef = 0.06f`（本来就是小数），没有装备/营地 `phyAtkPen`，因此未触发该 Bug，正常按 `6%` 破防计算。

### 4.2 收口事项状态

1. **怪物预设防御口径与页面文案纠偏（已完成）**：
   - `DamageCalculatorPanel.vue`、`MonsterDetailModal.vue`、`RoomContentList.vue`、`ActivityDungeonsView.vue`、`TowerView.vue`、`monsterModalState.js` 已统一去掉怪物双防对房间 `levelScale` 的错误乘法，并将房间修正文案从「攻防」改为「攻击」；计算器保留 `rawDef * coeff` 浮点精度。
2. **全角色被动天赋（`talentSkills`）机制校准（已完成）**：
   - 已核对 `1.7.15` `Assembly-CSharp` 与 `raw/buff.json` / `raw/skillTrigger.json`，在 `heroMechanics.js` 中清零全 40 名角色核心被动的 `pending`（18 个伤害被动全部校准 `form`/`crit`/`elements`/`segments`，移除 `03204` 诺姿、`01404` 皮塔假伤害段及 `04104`/`00804`/`06604` 重复假段，补全 `03004`/`03104`/`04504`/`04704`/`06904`/`06404`/`02504`/`03304` 口径）。
3. **游戏官方「穿透漏除 100」Bug 的处理策略**：
   - 核实该 Bug 属于官方 1.7.15 线上 Bug 还是仅部分端生效，并决定网页计算器是保持理论公式（`2% → 0.02`）另加一个「模拟 1.7.15 穿透未除100 Bug」开关，还是先向游戏官方提交反馈待其热更修复。
4. **魔物特性与装备/套装特效（已完成）**：
   - 已在 `damageEffects.js` / `damage-calc.json` 接入 22 种魔物特性（支持 Lv.1~7 与叠层/协同）、8 项可见套装战斗特效与 5 项可见装备特技词条（已按 `!isBlacklisted && !isEquipTierHidden` 自动剔除 4/5 阶等隐藏装备），严格区分一区 `damAddTypes`、二区独立相加、`tagDamAdd` 与事件独立连乘 `extraEventMult`；面板初始/重置默认值统一为角色与目标等级 `50`、双攻 `4500`、暴击率 `10%`、暴击伤害 `155%`。
5. **全角色星阶技能 `starSkills`（待第三阶段接入）**：
   - 按「主动技能与普攻强化 / 额外伤害段 / 独立乘区与暴击改写（含 40 名角色 × 4 枚共 160 个星阶效果）」分阶段接入计算器。

### 4.3 后续功能扩展待办（视实机校准稳定后按需推进）

- **法力值（SP）续航上限约束**：按角色 `maxSp`、自然回蓝与技能 `cost` 检查极端高冷缩循环下的蓝量可持续性。
- **一键从图鉴代入裸面板参考**：提供可选辅助按钮，直接按当前角色等级/突破成长估算裸白字供快速试算。

---

## 五、常用开发与验证命令

```cmd
:: 1. 改完 damageCalcData.js 或数据源后重建精简表并校验一致性
cmd.exe /c "npm run data:damage && npm run data:damage:check"

:: 2. 伤害计算器核心单测 + 链接完整性 + 资源校验（36 项）
cmd.exe /c "node --test tests/unit/damage-calculator.test.mjs tests/unit/link-integrity.test.mjs tests/unit/resource-client.test.mjs"

:: 3. 伤害计算器 Playwright 桌面+手机 UI 验证（需等待 8788 / vite 启动，勿与其他 playwright 并发）
cmd.exe /c "npx playwright test tests/ui/damage-calculator.spec.js --reporter=line"

:: 4. 生产构建（会自动执行 data:build -> data:damage）
cmd.exe /c "npx vite build"
```

# 【已废弃】角色与装备反伤机制异常补充排查（`Buff_AttributeAdd` 反伤倒扣等）

> **文档状态**：**已废弃（已被取代）** —— `cdnVer 38` 已修复 `Buff_AttributeAdd` `rebDam` 双倍倒扣、`CombatPanel` `rebDam > 0f`、`BattleManager` `"gate"` 分支及 `PetCheckTriggerBuff.EndAction()`；最新复核结论请见现行跟进文档：[角色反伤机制修复跟进_城防反伤缩水与仅反普攻异常排查.md](../角色反伤机制修复跟进_城防反伤缩水与仅反普攻异常排查.md)。  
> **原核对版本**：**1.7.15**（`Assembly-CSharp` 客户端源码 + `游戏数据/配置表/`）  
> **原核对日期**：2026-11-22  
> **核对范围**：全角色、套装、装备词缀、战斗道具与塔防建筑中**反伤（`rebDam`）**相关代码 Bug 与文案差异（非反伤类角色问题见 [【已废弃】角色技能描述与实际配置代码差异排查.md](./【已废弃】角色技能描述与实际配置代码差异排查.md)）

---

## 一、 问题总览

| 序号 | 涉及角色 / 道具 / 建筑 | 游戏内实际表现 | 严重程度 |
| --- | --- | --- | --- |
| 1 | **茜塔 4 星、荆棘守护者 3 件套、武器词缀「荆棘」、刺蛇盾、熔火盾** | 限时反伤 Buff 每结束一轮，**反伤率就会被永久倒扣 1 层**，多次触发后直接跌成负数（面板显示负百分比，实际只反 1 点伤害） | **极高** |
| 2 | **塔防建筑「基础栅栏」「木栏门」** | 基础栅栏写反弹 30% 实际只有 **0.3%**；木栏门写反弹 100% 且升级涨血，实际固定停在 **600 血、15% 反伤** | **高** |
| 3 | **迈妮娅 2 技能假人、全局所有反伤效果** | 描述写“任何攻击”的反伤**只反普通攻击、完全不反技能伤害**；且反弹伤害会被攻击者的魔防、魔抗再次减免 | **中** |
| 4 | **荆棘守护者 3 件套、即抛型蛇鳞刺盾** | 套装文案写的受击次数/倍率/冷却与实际配置不符；刺盾技能文案写的护盾量/反伤率与实际物品不符 | **低~中** |

---

## 二、 极高危 Bug：限时反伤 Buff 到期双倍扣减，永久倒扣成负数

### 1. 游戏内表现

只要反伤效果是通过“限时属性 Buff”（`attrAddTime`）加上去的，**每一次持续时间结束，都会把“这次原本加的反伤率”扣掉之后再多扣一次**：
- 触发 **1 轮** 结束后：角色反伤直接跌成**负值**，属性面板里的「反伤百分比」也会跟着显示负数；
- 下一轮再次触发时：加回来的反伤必须先填平上轮倒扣的负数窟窿，导致**越打反伤越低，甚至触发期间依然是负数**。

### 2. 原因定位

通用属性限时 Buff 类 `Buff_AttributeAdd.cs` 对 `rebDam`（反伤率）加与减写了三处不一致的逻辑：

```csharp
// ① 叠加时（AddAttr 第 161~164 行）：正常，每叠 1 层就加 1 份 baseValue
if (data.ContainsKey("rebDam"))
{
    target.unitData.rebDam += data["rebDam"].baseValue * (float)numTemp;
}

// ② 到期移除时（ResetAttr）：同一个函数里写了两次扣减，一共扣掉 (num + 1) 份！
// 第 331~334 行（第一次：先多扣 1 份）
if (data.ContainsKey("rebDam"))
{
    target.unitData.rebDam -= data["rebDam"].baseValue;         // ← 第一次扣 1 份
}
...
// 第 365~368 行（第二次：按当前层数再扣 num 份）
if (data.ContainsKey("rebDam"))
{
    target.unitData.rebDam -= data["rebDam"].baseValue * (float)num; // ← 第二次再扣 num 份！
}

// ③ 初始多层/刷新时（StartAddAttr 第 510~513 行）：漏乘层数 num
if (data.ContainsKey("rebDam"))
{
    target.unitData.rebDam += data["rebDam"].baseValue;         // ← 无论几层都只加 1 份
}
```
```
Buff 叠了 1 层（+80） → 到期进入 ResetAttr() → 第 333 行先减 80 → 第 367 行再减 80
                                                                         ↓
                                                           net = +80 - 160 = -80%（永久倒扣 1 层）
```

> 补充说明：`CombatPanel.cs`（第 6737~6750 行）判断反伤的条件是 `rebDam != 0f`（没有拦截负数），所以负数时也会进反伤结算并算出负伤害，最后被 `Mathf.Max(1, ...)` 压成每次普攻只反 1 点伤害；而 `UnitDataShowPanel.cs`（第 193 行）会直接把负数打印在面板上。

### 3. 受影响对象与实战损失

| 受影响对象 | 关联 Buff（单层反伤） | 实战失效与倒扣表现 |
| --- | --- | --- |
| **茜塔 (`hero_005`) 4 星 `00508`「侍者的反客为主」** | `00508AddBuff`（每层 `+20%`，最多 8 层，持续 15 秒） | 只要 15 秒断档 1 次，无论此前叠了几层，结束后都会**永久多扣 `20%`**。断档 1 次变成 `-20%`，断档 3 次跌成 **`-60%`**，直接把装备/宠物给的反伤一起吃掉 |
| **「荆棘守护者」3 件套 (`suit_110` / `suit_113`)** | `suit_113_1Add`（单次 `+80%`，持续 8 秒，CD 11 秒） | 因为持续 8 秒、冷却 11 秒，**每轮必有 3 秒真空期到期结算**。第 1 轮结束跌成 **`-80%`**；第 2 轮触发期间只等于 **`0%`**、结束后跌成 **`-160%`**；第 3 轮触发期间都只剩 **`-80%`** |
| **武器词缀「荆棘」(`equip_301`)** | `equip_301Add2Buff`（每层 `+5%`，最多 3 层，持续 10 秒） | 每断档到期 1 次，永久倒扣 **`-5%`** 反伤率 |
| **即抛型蛇鳞刺盾 (`item_31009`)** | `cishedun002`（`+100%`，持续 10 秒） | 10 秒到期后扣掉 `200%`，永久倒扣 **`-100%`** |
| **熔火护盾 (`item_31012`)** | `ronghuo002`（`+70%`，持续 10 秒） | 10 秒到期后扣掉 `140%`，永久倒扣 **`-70%`** |

### 4. 修改建议

1. 删掉 `Buff_AttributeAdd.ResetAttr()` 中第 331~334 行的多余扣减，只保留第 365~368 行的 `* (float)num` 扣减；
2. 将 `StartAddAttr()` 第 510~513 行补上 `* (float)num`；
3. 为 `CombatPanel.cs`（第 6737 行）反伤触发条件补上 `target.unitData.rebDam > 0f` 防护。

---

## 三、 塔防防御建筑：反伤缩水 100 倍 与 `"gate"` 类型漏处理

### 1. 游戏内表现

* **基础栅栏 (`s1_wall_1`)**：描述写“反弹 `{30%}` 伤害”，实战只反弹 **0.3%**（普攻通常只跳 1 点）。
* **木栏门 (`s1_finalDoor`)**：描述写“反弹 `{100%}` 伤害”且 1~3 级血量为 `500 / 1000 / 1500`，实战无论升到几级都固定只有 **600 血、15% 反伤**。

### 2. 原因定位

客户端 `CombatPanel.cs`（第 6739 行）结算反伤时固定除以 `100f`（即配置 `30` 才代表 `30%`），但 `defense.json` 与 `BattleManager.cs` 两处都出了偏差：

```csharp
// BattleManager.cs 第 13290~13309 行
string attrType = unitConf.attrType;
if (!(attrType == "wall"))
{
    if (attrType == "tower") { ... }   // ← 只有 "wall" 和 "tower" 两个分支，漏掉了 "gate"！
}
else
{
    unit.unitData.MaxHp = unitConf.levelAttrConf.hp;
    unit.unitData.curHp = unit.unitData.maxHp;
    unit.unitData.rebDam = unitConf.levelAttrConf.rebDam; // ← s1_wall_1 写成了 0.3，进公式 / 100f = 0.3%
}
```
```
s1_wall_1 ("wall")   → 写入 rebDam = 0.3  → 结算 0.3 / 100f  = 0.3%（缩水 100 倍）
s1_finalDoor ("gate")→ 跳过所有 if/else   → 沿用底层模板 scfx_hiddenMon 的 600 血与 15% 反伤
```

### 3. 修改建议

1. `BattleManager.cs`（第 13290 行）的城防赋值逻辑补充 `attrType == "gate"` 分支（与 `"wall"` 一致，注入升级血量与 `rebDam`）；
2. `defense.json` 中 `s1_wall_1` 的 `rebDam` 改为 `30`，`s1_finalDoor` 的 `rebDam` 改为 `100`。

---

## 四、 全局反伤机制限制与其余配置差异

### 1. 全局反伤只反普通攻击，且会被敌人魔防再次减免

```csharp
// CombatPanel.cs 第 6737~6751 行
if ((Object)(object)self != (Object)null && damageInfo.formType == DamageFormType.normalAtk && target.unitData.rebDam != 0f)
{                                          // ↑ 只对「普通攻击」触发反伤，技能与持续伤害完全不触发
    int baseDamage = (int)((float)finalDamage * target.unitData.rebDam / 100f); // ↑ 基数是自己减伤/护盾后的 finalDamage
    DamageInfo damageInfo2 = new DamageInfo();
    damageInfo2.baseDamage = baseDamage;
    damageInfo2.damageType = "magicAtk";   // ← 反弹按魔法伤害走完整减伤流程，再吃一次敌人的魔防和魔抗！
    ...
}
```

### 2. 受上述机制或配表不一致影响的对象

| 对象 | 文案写了什么 | 实际生效情况 | 修改建议 |
| --- | --- | --- | --- |
| **迈妮娅 (`hero_046`) 2 技能反击假人 (`04603`)** | “**任何攻击**稻草人的敌人都会遭到其反击，造成等同于该次攻击 `100%` 的伤害” | 受全局反伤公式限制：**敌人放技能打假人 0 反伤**；普攻触发的反弹也是扣除假人自身减伤后，再被敌人魔防、魔抗减免的魔法伤害 | 补充文案注明“普通攻击”，或为假人实现专用真实反伤逻辑 |
| **「荆棘守护者」3 件套 (`suit_110` / `suit_113`)** | `equipSuit.json[suit_110]` 写：每受 `{4}` 次攻击造成 `{100%}` 物攻伤害（未提冷却） | 实际触发逻辑（`skillTrigger.json[suit_113]` / `buff.json[suit_113_1]`）是：**每受 `3` 次攻击、造成 `200%` 物攻伤害、有 `11` 秒冷却** | 同步 `suit_110` 文案与 `suit_113_1` 实际数值 |
| **即抛型蛇鳞刺盾 (`item_31009`)** | `skill.json` 写护盾 `{50 * 营地等级}`、反伤 `{50%}` | 物品描述 `item.json` 与实际 Buff `cishedun001`/`002` 均为 **`200 + 80 * 营地等级` 护盾** 与 **`100%` 反伤** | 修改 `skill.json[battleItem_addBuff_cishedun]` 的过时描述 |
| **黄金史莱姆 (`pet_10703`) 队伍被动「坚韧祝福」** | 全队物理/全属性等防御配合反伤 `14%~42%` | `PetCheckTriggerBuff.cs`（第 59~62 行）`StartAction()` 正常写入 `rebDam`，但 **`EndAction()` 未做移除**（因队伍被动整场常驻通常不主动过期，仅作代码规范隐患备注） | 在 `PetCheckTriggerBuff.EndAction()` 补齐属性归还逻辑 |

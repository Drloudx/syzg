/**
 * 魔物被动特性文案漏写/偏差的源码实机机制补充卡片映射（不改原表描述，展示在特性说明卡片下方）。
 *
 * 均核对自 `raw/buff.json` 与 `Assembly-CSharp`：
 * - 石像鬼 `pet_09304`（石化皮肤）：[PetBuff09304.cs] 添加 `pet_09304AddNewBuffBase`「硬壳」，`buffTime: 10`，`canOverlay: true`，`maxLayPara: 10`；
 *   [BuffControl.cs] 叠加同名可叠层 buff 时先重置 `conTime = 0f`，再由 [Buff_AttributeAdd.cs] 判断是否未达上限加层，故每次受击均刷新为 10 秒。
 * - 射水杜吉芽 `pet_06204`（衍生枝条）：[PetBuff_06204.cs] 添加 `pet_06204_1AddBuff`（[BuffNextNorAtkDamAdd.cs]），`buffTime: 20`，`canOverlay: false`；
 *   下一次普通攻击命中目标后即调用 `BuffOver` 移除；超时前再次施放技能先移除旧 buff 再重新附加 20 秒。
 * - 东天之青龙 `pet_07904`（玉珑加护）：[PetBuff_07904.cs] 为全体友方单位（不含召唤物）附加 `pet079AddBuff`（[PetBuff079AddBuff.cs]），`buffTime: 20`，`startLayNum: 6`；
 *   `canOverlay: true` 且 `overLayAction = RestoreLayers`，超时前再次施放【治愈魔法】会重置为 6 层并刷新 20 秒。
 * - 白银迷迷可 `pet_09604`（魔力护盾）：[PetBuff_09604.cs] 添加 `pet_09604ShieldBaseBuff`（[Buff_Shield.cs]），`buffTime: 8`，`canOverlay: false`；
 *   `RemoveOldBuff` 会在同类型替换时触发 `BuffOver` -> `RemoveShiled`，移除旧护盾后替换为新护盾并重新计时 8 秒。
 * - 幽灵史莱姆 `pet_10004`（胆小鬼）：`pet_10004_1..7`（`addBuffWhenBeHit`）全等级 `para.cd: 15`，官方文案已写明持续 6 秒，未写 15 秒内置冷却。
 */
const PET_TRAIT_MECHANICS_NOTE_MAP = {
  pet_09304: {
    1: [
      {
        key: 'duration',
        label: '持续时间',
        value: '「硬壳」持续 10 秒；每次受击叠层或满层后再次受击均会刷新为 10 秒（最高 10 层）'
      }
    ]
  },
  pet_06204: {
    1: [
      {
        key: 'duration',
        label: '持续时间',
        value: '增伤状态持续 20 秒，下一次普通攻击命中后立即消耗；超时前再次施放技能会刷新为 20 秒'
      }
    ]
  },
  pet_07904: {
    1: [
      {
        key: 'duration',
        label: '持续时间',
        value: '全队「玉珑」状态持续 20 秒（初始 6 层）；超时前再次施放【治愈魔法】会重置为 6 层并刷新 20 秒'
      }
    ]
  },
  pet_09604: {
    1: [
      {
        key: 'duration',
        label: '持续时间',
        value: '护盾持续 8 秒；不可叠加，再次触发会先移除旧护盾再替换为新护盾并刷新 8 秒'
      }
    ]
  },
  pet_10004: {
    1: [
      {
        key: 'cooldown',
        label: '冷却时间',
        value: '全等级（Lv.1 ~ Lv.7）内置冷却时间 15 秒'
      }
    ]
  }
}

/**
 * 根据魔物特性 skillTrigger ID 与等级获取需要补充展示的源码机制说明行。
 * @param {string} traitId 特性触发器 ID（如 pet_09304）
 * @param {number|string} [level=1] 特性等级（1 ~ 7）
 * @returns {Array<{key: string, label: string, value: string}>|null}
 */
export function resolvePetTraitNotes(traitId, level = 1) {
  if (!traitId) return null
  const entry = PET_TRAIT_MECHANICS_NOTE_MAP[traitId]
  if (!entry) return null

  const lvlKey = String(level)
  return entry[lvlKey] || entry['1'] || null
}

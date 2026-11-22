/**
 * 装备词缀召唤物属性口径与机制映射。
 *
 * ## 业务背景
 * 部分装备词缀（如蜘蛛统御头冠 item_442001 的「育母」equip_006、或「传承的威严」equip_sp0201）
 * 会在战斗中召唤随从/机关或释放召唤单位。
 * 现存角色图鉴已具备一套标准的召唤物数值结构（继承属性、固定属性、自带技能、机制说明等），
 * 本模块为装备词缀提供相同的口径映射，供装备详情弹窗解析并展示。
 *
 * ## 源码判据（Assembly-CSharp）
 * - 育母 equip_006:
 *   - Buff: Equip_00601Buff.cs
 *   - 第一阶段释放蛛卵 013_egg: 持续 1 秒孵化，生命继承穿戴者 10%，物防 157，魔防 120，不会主动攻击
 *   - 第二阶段孵化砂蜘蛛幼体 013_baby: 持续 5 秒，extendSummoner=false（独立属性），基础攻速 0.4，暴击 20%，爆伤 125%，物防 82，魔防 32，自带「砂蜘蛛仔自爆」
 *   - 实机数量差异: 文本写 2 只，但在 Equip_00601Buff.cs L138 中 monCount 被判定截断为 1，实机每次孵化 1 只幼体
 * - 传承的威严 equip_sp0201:
 *   - 1~4 档分别召唤 109澄黄 / 108粉红 / 103幽夜之影·洛莉安 / 114黑骑士 史莱姆，持续 15 秒，上限 2 只，生命 100%，物防 100%
 */

/**
 * 装备召唤物字典映射
 */
const EQUIP_SUMMON_MAP = {
  // 育母（蜘蛛统御头冠 item_442001 等）
  equip_006: {
    1: [
      {
        name: '砂蜘蛛的蛋',
        monTypeId: '013_egg',
        duration: 1,
        maxCount: 1,
        inherit: [
          { key: 'maxHp', label: '生命', value: '10%' }
        ],
        fixed: [
          { key: 'phyDef', label: '物理防御', value: '157' },
          { key: 'magicDef', label: '魔法防御', value: '120' }
        ],
        attackNote: {
          noAtk: true,
          text: '不会主动攻击（1秒后孵化）'
        },
        bonusNotes: [
          { key: 'weakness', label: '弱点属性', value: '受火属性伤害 +20%' }
        ]
      },
      {
        name: '砂蜘蛛幼体',
        monTypeId: '013_baby',
        duration: 5,
        maxCount: 1,
        damageTypes: ['物理'],
        inherit: [
          { key: 'noExtend', label: '独立属性', value: '不继承穿戴者攻防血' }
        ],
        fixed: [
          { key: 'baseAtk', label: '基础攻击', value: '1' },
          { key: 'baseHp', label: '基础生命', value: '1000' },
          { key: 'phyDef', label: '物理防御', value: '82' },
          { key: 'magicDef', label: '魔法防御', value: '32' },
          { key: 'atkSpeed', label: '基础攻速', value: '0.4' },
          { key: 'crit', label: '暴击率', value: '20%' },
          { key: 'critDam', label: '暴击伤害', value: '125%' },
          { key: 'runSpeed', label: '移动速度', value: '3.6' }
        ],
        skills: ['砂蜘蛛仔自爆（40% 攻击力物理伤害，范围 2）'],
        bonusNotes: [
          { key: 'role', label: '实战定位', value: '主要作受击炮灰与全队增益触发器' },
          { key: 'teamBuff', label: '全体加成', value: '生效（计入友方单位列表）' },
          { key: 'weakness', label: '弱点属性', value: '受火属性伤害 +20%' }
        ]
      }
    ]
  },

  // 传承的威严（史莱姆召唤）
  equip_sp0201: {
    1: [
      {
        name: '澄黄史莱姆',
        monTypeId: '109',
        duration: 15,
        maxCount: 2,
        damageTypes: ['物理'],
        inherit: [
          { key: 'maxHp', label: '生命', value: '100%' },
          { key: 'atk', label: '攻击', value: '30%' },
          { key: 'def', label: '防御', value: '100%' }
        ],
        fixed: [
          { key: 'atkSpeed', label: '基础攻速', value: '0.4' },
          { key: 'crit', label: '暴击率', value: '20%' },
          { key: 'critDam', label: '暴击伤害', value: '125%' }
        ],
        bonusNotes: [
          { key: 'teamBuff', label: '全体加成', value: '生效（计入友方单位列表）' }
        ]
      }
    ],
    2: [
      {
        name: '粉红史莱姆',
        monTypeId: '108',
        duration: 15,
        maxCount: 2,
        damageTypes: ['物理'],
        inherit: [
          { key: 'maxHp', label: '生命', value: '100%' },
          { key: 'atk', label: '攻击', value: '40%' },
          { key: 'def', label: '防御', value: '100%' }
        ],
        fixed: [
          { key: 'atkSpeed', label: '基础攻速', value: '0.4' },
          { key: 'crit', label: '暴击率', value: '20%' },
          { key: 'critDam', label: '暴击伤害', value: '125%' }
        ],
        bonusNotes: [
          { key: 'teamBuff', label: '全体加成', value: '生效（计入友方单位列表）' }
        ]
      }
    ],
    3: [
      {
        name: '幽夜之影·洛莉安',
        monTypeId: '103',
        duration: 15,
        maxCount: 2,
        damageTypes: ['物理'],
        inherit: [
          { key: 'maxHp', label: '生命', value: '100%' },
          { key: 'atk', label: '攻击', value: '50%' },
          { key: 'def', label: '防御', value: '100%' }
        ],
        fixed: [
          { key: 'atkSpeed', label: '基础攻速', value: '0.35' },
          { key: 'crit', label: '暴击率', value: '35%' },
          { key: 'critDam', label: '暴击伤害', value: '125%' }
        ],
        bonusNotes: [
          { key: 'teamBuff', label: '全体加成', value: '生效（计入友方单位列表）' }
        ]
      }
    ],
    4: [
      {
        name: '黑骑士史莱姆',
        monTypeId: '114',
        duration: 15,
        maxCount: 2,
        damageTypes: ['物理'],
        inherit: [
          { key: 'maxHp', label: '生命', value: '100%' },
          { key: 'atk', label: '攻击', value: '60%' },
          { key: 'def', label: '防御', value: '100%' }
        ],
        fixed: [
          { key: 'atkSpeed', label: '基础攻速', value: '0.4' },
          { key: 'crit', label: '暴击率', value: '25%' },
          { key: 'critDam', label: '暴击伤害', value: '125%' }
        ],
        bonusNotes: [
          { key: 'teamBuff', label: '全体加成', value: '生效（计入友方单位列表）' }
        ]
      }
    ]
  }
}

/**
 * 根据词条 triggerId 与等级获取对应的装备召唤物信息。
 * @param {string} triggerId 词条技能触发器 ID（如 equip_006）
 * @param {number|string} [level=1] 词条档位/等级
 * @returns {Array<object>|null} 召唤物对象列表，若无召唤物则返回 null
 */
export function resolveEquipSummons(triggerId, level = 1) {
  if (!triggerId) return null
  const entry = EQUIP_SUMMON_MAP[triggerId]
  if (!entry) return null

  const lvlKey = String(level)
  return entry[lvlKey] || entry['1'] || null
}

/**
 * 装备词缀文案漏写/偏差的源码实机机制补充卡片映射（不改原表描述，展示在词缀说明卡片下方）。
 * - 魔爪 equip_305:
 *   - 常量/Buff：`equip305AddBuff1_1`（物理攻击 +10%，`buffTime: 0` 常驻）；
 *     `equip305AddBuff2_1`（[Equip305AddBuff.cs]，`hpRate: 0.4`，`cd: 200`）触发 `equip305AddBuff2_AddBuff1`（吸血 +20%，`buffTime: 10`）。
 */
const EQUIP_MECHANICS_NOTE_MAP = {
  equip_305: {
    1: [
      { key: 'duration', label: '持续时间', value: '低血量触发的 20% 吸血持续 10 秒；物理攻击 +10% 整场常驻' },
      { key: 'trigger', label: '触发口径', value: '源码判定为当前生命值 ≤ 40% 时触发，冷却时间 200 秒' }
    ]
  }
}

/**
 * 根据词条 triggerId 与等级获取需要补充展示的源码机制说明行。
 * @param {string} triggerId 词条技能触发器 ID（如 equip_305）
 * @param {number|string} [level=1] 词条档位/等级
 * @returns {Array<{key: string, label: string, value: string}>|null}
 */
export function resolveEquipMechanicsNotes(triggerId, level = 1) {
  if (!triggerId) return null
  const entry = EQUIP_MECHANICS_NOTE_MAP[triggerId]
  if (!entry) return null

  const lvlKey = String(level)
  return entry[lvlKey] || entry['1'] || null
}

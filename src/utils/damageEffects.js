/**
 * 魔物特性（22 种影响伤害结算的战斗加成）与装备/套装战斗特效的提取、条件过滤与乘区聚合。
 *
 * 所有数值均按 1.7.15 Assembly-CSharp 源码调用链与 raw/buff.json 字段口径分类：
 * - phyAtkPct / magicAtkPct        -> 战斗内临时加攻（乘在养成面板攻上）
 * - crit / critDam / realCrit      -> 战斗内暴击增益 / 必暴（如山岩3件）
 * - damAddPhy / damAddMagic / damAddElement -> Step 2 第一增减伤区（damAddTypes）
 * - tgtPhyDefPct / tgtMagicDefPct  -> 目标战斗降防（乘在目标防御上）
 * - tagDamAdd                      -> Step 5a 普攻对指定 Buff 标签增伤（如霜寒对急冻）
 * - unitAtkDamAdd / unitPhyDamAdd / unitMagicDamAdd / unitNormalDamAdd / unitSkillDamAdd / unitElemDamAdd
 *                                  -> Step 5b 后半段独立累加乘区（CombatPanel:6875-6919）
 * - eventMult                      -> Step 6 攻击事件独立连乘（target.unitDamage *= 1 + rate）
 */

function stripRichBraces(text) {
  return String(text || '').replace(/\{([^}]*)\}/g, '$1').trim()
}

function num(val, fallback = 0) {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

function round4(val) {
  return Math.round(num(val) * 10000) / 10000
}

/** 从 pet_xxx04 的某一等级 buff 数据提取战斗加成字典 */
function extractPetTraitLevelMods(petId, para, buffDatas) {
  switch (petId) {
    case 'pet_007':
      return { phyAtkPct: round4(para?.addNewBuff?.newBuffPara?.attr?.phyAtk?.percent) }
    case 'pet_016': {
      const list = para?.addNewBuffList || []
      return {
        unitNormalDamAdd: round4(list[1]?.newBuffPara?.damAdd?.normalAtk),
        synergyMods: { critDam: num(list[0]?.newBuffPara?.attr?.critDam?.baseValue) },
      }
    }
    case 'pet_017': {
      const list = para?.addNewBuffList || []
      return {
        unitSkillDamAdd: round4(list[0]?.newBuffPara?.damAdd?.skill),
        synergyMods: { crit: num(list[1]?.newBuffPara?.attr?.crit?.baseValue) },
      }
    }
    case 'pet_036':
      return { phyAtkPct: round4(para?.attr?.phyAtk?.percent) }
    case 'pet_037':
      return { unitElemDamAdd: { earth: round4(para?.damAdd?.earth) } }
    case 'pet_038':
      return { magicAtkPct: round4(para?.magicAtkAddRate) }
    case 'pet_043':
      return { unitSkillDamAdd: round4(para?.addNewBuff?.newBuffPara?.damAdd?.skill) }
    case 'pet_046':
      return { critDam: num(para?.addNewBuff?.newBuffPara?.attr?.critDam?.baseValue) }
    case 'pet_058':
      return { magicAtkPct: round4(para?.attr?.magicAtk?.percent) }
    case 'pet_062':
      return { eventMult: round4(para?.addNewBuff?.newBuffPara?.damAddRate) }
    case 'pet_063':
      return { unitElemDamAdd: { water: round4(para?.waterDamAdd) } }
    case 'pet_065':
      return { phyAtkPct: round4(para?.addNewBuff?.newBuffPara?.attr?.phyAtk?.percent) }
    case 'pet_071':
      return { unitPhyDamAdd: round4(para?.addNewBuff?.newBuffPara?.damAdd?.phy) }
    case 'pet_074':
      return {
        crit: num(para?.attr?.crit?.baseValue),
        critDam: num(para?.attr?.critDam?.baseValue),
      }
    case 'pet_077':
      return { unitElemDamAdd: { fire: round4(para?.addNewBuff?.newBuffPara?.damAdd?.fire) } }
    case 'pet_078': {
      const targetBuff = buffDatas[para?.atkAddBuffId]?.para
      return { tgtMagicDefPct: round4(targetBuff?.attr?.magicDef?.percent ?? -0.1) }
    }
    case 'pet_088':
      return { magicAtkPct: round4(para?.attr?.magicAtk?.percent) }
    case 'pet_093':
      return { phyAtkPct: round4(para?.addNewBuff?.newBuffPara?.attr?.phyAtk?.percent) }
    case 'pet_104':
      return { unitAtkDamAdd: round4(para?.addNewBuffList?.[0]?.newBuffPara?.attr?.unitDamAdd?.baseValue) }
    case 'pet_106': {
      const rate = round4(para?.addNewBuff?.newBuffPara?.damageAddRate)
      return { unitAtkDamAdd: rate, summonUnitAtkDamAdd: rate }
    }
    case 'pet_117':
      return { eventMult: round4(para?.addNewBuff?.newBuffPara?.damageAddRate) }
    case 'pet_118':
      return { eventMult: round4(para?.addNewBuff?.newBuffPara?.damageAddRate) }
    default:
      return null
  }
}

const PET_TRAIT_META = {
  pet_007: { when: { always: true }, effectLabel: '3次普攻后物攻加成', note: '' },
  pet_016: {
    when: { form: 'normalAtk' },
    effectLabel: '普攻独立增伤（可与臭臭蕈联动）',
    synergyLabel: '队友装备【臭臭蕈】(+30% 暴伤)',
    note: '',
  },
  pet_017: {
    when: { form: 'skill' },
    effectLabel: '技能独立增伤（可与吵吵蕈联动）',
    synergyLabel: '队友装备【吵吵蕈】(+15% 暴击率)',
    note: '',
  },
  pet_036: {
    when: { always: true },
    maxStacks: 4,
    defaultStacks: 1,
    stackLabel: '风属性队友数',
    effectLabel: '按风队人数提高物理攻击',
    note: '',
  },
  pet_037: {
    when: { elementType: 'earth' },
    maxStacks: 4,
    defaultStacks: 1,
    stackLabel: '地属性队友数',
    effectLabel: '按地队人数提高地伤',
    note: '',
  },
  pet_038: { when: { always: true }, effectLabel: '生命高于80%时魔攻加成', note: '' },
  pet_043: { when: { form: 'skill' }, effectLabel: '充能期间技能增伤', note: '' },
  pet_046: {
    when: { always: true },
    maxStacks: 9,
    defaultStacks: 9,
    stackLabel: '连击层数',
    effectLabel: '每层提供暴击伤害',
    note: '',
  },
  pet_058: {
    when: { always: true },
    maxStacks: 4,
    defaultStacks: 1,
    stackLabel: '水属性队友数',
    effectLabel: '按水队人数提高魔法攻击',
    note: '',
  },
  pet_062: { when: { form: 'normalAtk' }, effectLabel: '放技能后下次普攻独立倍率', note: '按事件连乘区(BuffNextNorAtkDamAdd)结算' },
  pet_063: {
    when: { elementType: 'water' },
    maxStacks: 4,
    defaultStacks: 1,
    stackLabel: '持盾友方数',
    effectLabel: '按持盾友方提高水伤',
    note: '',
  },
  pet_065: {
    when: { always: true },
    maxStacks: 3,
    defaultStacks: 3,
    stackLabel: '叠加层数',
    effectLabel: '暴击叠层提高物理攻击',
    note: '',
  },
  pet_071: { when: { damageType: 'phyAtk' }, effectLabel: '受治疗后物理增伤', note: '' },
  pet_074: {
    when: { always: true },
    maxStacks: 4,
    defaultStacks: 1,
    stackLabel: '近卫队友数',
    effectLabel: '按近卫人数加暴击与暴伤',
    note: '',
  },
  pet_077: {
    when: { elementType: 'fire' },
    maxStacks: 50,
    defaultStacks: 10,
    stackLabel: '灼热层数',
    effectLabel: '造成火伤叠层提高火属性伤害',
    note: '4~7级配置实值每层为 2%（描述写为 2.2%）',
  },
  pet_078: {
    when: { always: true },
    effectLabel: '星陨命中降低目标 10% 魔法防御',
    note: '另含每轮冷却一次的 500%~1100% 魔法陨石独立轰击',
  },
  pet_088: {
    when: { always: true },
    maxStacks: 4,
    defaultStacks: 1,
    stackLabel: '秘术队友数',
    effectLabel: '按秘术人数提高魔法攻击',
    note: '',
  },
  pet_093: {
    when: { always: true },
    maxStacks: 10,
    defaultStacks: 10,
    stackLabel: '硬壳层数',
    effectLabel: '受击叠层提高物理攻击',
    note: '',
  },
  pet_104: { when: { always: true }, effectLabel: '满血状态(≥70%HP)放技能后全伤加成', note: '中/低血量分支仅加防御或吸血，不影响本次伤害' },
  pet_106: {
    when: { always: true },
    maxStacks: 4,
    defaultStacks: 1,
    stackLabel: '友方召唤物数',
    effectLabel: '按召唤物数量提高召唤师与友方召唤物全伤',
    note: '按 PetBuff_10604 源码同步作用于角色本体及所有友方召唤物',
  },
  pet_117: { when: { damageType: 'magicAtk' }, effectLabel: '对【纯白标记】目标魔法独立连乘', note: '按事件区(unitDamage *= 1 + rate)结算' },
  pet_118: { when: { form: ['normalAtk', 'skill'] }, effectLabel: '对【虹彩标记】目标普攻/技能独立连乘', note: '按事件区(unitDamage *= 1 + rate)结算' },
}

const SUIT_EFFECT_SPECS = [
  { triggerId: 'suit_111', suitNum: 1, effectLabel: '技能伤害 +7%（独立连乘）', when: { form: 'skill' }, extract: (b) => ({ eventMult: round4(b?.rate) }) },
  { triggerId: 'suit_122', suitNum: 2, effectLabel: '技能伤害 +13%（独立连乘）', when: { form: 'skill' }, extract: (b) => ({ eventMult: round4(b?.rate) }) },
  { triggerId: 'suit_133', suitNum: 3, effectLabel: '下次普攻 +40%（独立连乘）', when: { form: 'normalAtk' }, extract: (b, buffs) => ({ eventMult: round4(buffs[b?.addBuffId]?.para?.damAddRate) }) },
  { triggerId: 'suit_221', suitNum: 1, effectLabel: '技能伤害 +7%（独立连乘）', when: { form: 'skill' }, extract: (b) => ({ eventMult: round4(b?.rate) }) },
  { triggerId: 'suit_223', suitNum: 3, effectLabel: '下次普通攻击必定暴击', when: { form: 'normalAtk' }, extract: () => ({ realCrit: true }) },
  { triggerId: 'suit_232', suitNum: 2, effectLabel: '技能伤害 +13%（独立连乘）', when: { form: 'skill' }, extract: (b) => ({ eventMult: round4(b?.rate) }) },
  { triggerId: 'suit_313', suitNum: 3, effectLabel: 'HP<65% 普攻增伤 +30%', when: { form: 'normalAtk' }, extract: (b) => ({ unitNormalDamAdd: round4(b?.normalAtkDamAddRate) }) },
  { triggerId: 'suit_333', suitNum: 3, effectLabel: '恢复后第一区魔法伤害 +20%', when: { damageType: 'magicAtk' }, extract: (b, buffs) => ({ damAddMagic: round4(buffs[b?.addBuffId]?.para?.addRate) }) },
  { triggerId: 'suit_413', suitNum: 3, maxStacks: 5, defaultStacks: 5, stackLabel: '魔花层数', effectLabel: '技能增伤 +10%/层（1~5层）', when: { form: 'skill' }, extract: (b, buffs) => ({ unitSkillDamAdd: round4(buffs[b?.addBuffId]?.para?.damAdd?.skill) }) },
  { triggerId: 'suit_423', suitNum: 3, maxStacks: 5, defaultStacks: 5, stackLabel: '鼓舞层数', effectLabel: '普攻增伤 +10%/层（1~5层）', when: { form: 'normalAtk' }, extract: (b, buffs) => ({ unitNormalDamAdd: round4(buffs[b?.addBuffId]?.para?.damAdd?.normalAtk) }) },
  { triggerId: 'suit_433', suitNum: 3, effectLabel: 'HP≥80% 技能增伤 +20%', when: { form: 'skill' }, extract: (b) => ({ unitSkillDamAdd: round4(b?.skillDamAddRate) }) },
  { triggerId: 'suit_523', suitNum: 3, maxStacks: 9, defaultStacks: 5, stackLabel: '失血10%段数', effectLabel: '每失10%HP 技能增伤 +3%', when: { form: 'skill' }, extract: (b) => ({ unitSkillDamAdd: round4(b?.skillDamAddRate) }) },
]

const EQUIP_EFFECT_SPECS = [
  { prefixId: 'equip_sp0102_1', effectLabel: '火属性伤害 +15%', when: { elementType: 'fire' }, extract: (b) => ({ unitElemDamAdd: { fire: round4(b?.attr?.fire?.baseValue) } }) },
  { prefixId: 'equip_sp0103_1', effectLabel: '对眩晕目标普攻/技能 +20%（独立连乘）', when: { form: ['normalAtk', 'skill'] }, extract: (b) => ({ eventMult: round4(b?.damageAddRate) }) },
  { prefixId: 'equip_sp0203_1', maxStacks: 4, defaultStacks: 4, stackLabel: '召唤物数', effectLabel: '魔法攻击 +8%/召唤物（至多4层）', when: { always: true }, extract: (b) => ({ magicAtkPct: round4(b?.magicAttackAddRate) }) },
  { prefixId: 'equip_014', effectLabel: '第一区地属性伤害 +18%', when: { elementType: 'earth' }, extract: (b) => ({ damAddElement: { earth: round4(b?.damAddItems?.[0]?.value) } }) },
  { prefixId: 'equip_301', maxStacks: 3, defaultStacks: 3, stackLabel: '层数', effectLabel: '普攻叠层技能伤害 +3%/层（独立连乘）', when: { form: 'skill' }, extract: (b, buffs) => ({ eventMult: round4(buffs[(b?.addBuff || [])[0]]?.para?.rate) }) },
  { prefixId: 'equip_403', effectLabel: '附近敌人≤2名 技能增伤 +10%', when: { form: 'skill' }, extract: (b) => ({ unitSkillDamAdd: round4(b?.skillDamAddRate) }) },
  { prefixId: 'equip_404', maxStacks: 5, defaultStacks: 5, stackLabel: '层数', effectLabel: '普攻窃取目标物防 -2%/层（至多5层）', when: { always: true }, extract: (b, buffs) => ({ tgtPhyDefPct: round4(buffs[b?.targetBuffId]?.para?.attr?.phyDef?.percent) }) },
  { prefixId: 'equip_405', effectLabel: '技能增伤 +27%', when: { form: 'skill' }, extract: (b) => ({ unitSkillDamAdd: round4(b?.skillDamAddRate) }) },
  { prefixId: 'equip_501', effectLabel: '对急冻目标普攻标签增伤 +13%', when: { form: 'normalAtk' }, extract: (b) => ({ tagDamAdd: round4(b?.checkBuffDamAddRate) }) },
  { prefixId: 'equip_502', effectLabel: '获盾后技能增伤 +10%', when: { form: 'skill' }, extract: (b, buffs) => ({ unitSkillDamAdd: round4(buffs[b?.addBuffId]?.para?.damAdd?.skill) }) },
  { prefixId: 'equip_504', effectLabel: '施放技能后战斗魔攻 +10%', when: { always: true }, extract: (b, buffs) => ({ magicAtkPct: round4(buffs[(b?.addBuff || [])[1]]?.para?.attr?.magicAtk?.percent) }) },
  { prefixId: 'equip_305', effectLabel: '进图物理攻击 +10%', when: { always: true }, extract: (b, buffs) => ({ phyAtkPct: round4(buffs[(b?.addBuff || [])[0]]?.para?.attr?.phyAtk?.percent) }) },
]

/**
 * 构建供 damage-calc.json 使用的精简特效目录（零手写倍率，直接读取原表）。
 */
export function buildDamageEffectsCatalog({
  petsData = {},
  skillTriggersData = {},
  buffDatas = {},
  equipSuitsData = {},
  equipGlobalConfigData = {},
  visibleSuitIds = null,
  visibleEquipPrefixIds = null,
} = {}) {
  const petList = Array.isArray(petsData?.pets) ? petsData.pets : []
  const pets = []

  for (const pet of petList) {
    const meta = PET_TRAIT_META[pet.id]
    if (!meta) continue
    const traitSkill = (pet.skills || []).find((s) => s.type === 'trait')
    const triggerConf = skillTriggersData?.[traitSkill?.id]
    if (!traitSkill || !triggerConf?.levelData) continue

    const levelEntries = Object.keys(triggerConf.levelData)
      .sort((a, b) => Number(a) - Number(b))
      .map((lvKey) => {
        const lvTrigger = triggerConf.levelData[lvKey]
        const buff = buffDatas[lvTrigger?.buffId]
        const mods = extractPetTraitLevelMods(pet.id, buff?.para || {}, buffDatas)
        return {
          level: Number(lvTrigger?.skillLevel || lvKey),
          des: stripRichBraces(lvTrigger?.des),
          mods: mods || {},
        }
      })

    if (!levelEntries.length) continue
    pets.push({
      id: pet.id,
      name: pet.name,
      icon: pet.monImg || '',
      elementName: pet.elementName || '',
      traitName: traitSkill.name || '',
      effectLabel: meta.effectLabel,
      synergyLabel: meta.synergyLabel || '',
      note: meta.note || '',
      maxStacks: meta.maxStacks || 1,
      defaultStacks: meta.defaultStacks || 1,
      stackLabel: meta.stackLabel || '',
      when: meta.when,
      levels: levelEntries,
    })
  }

  // 套装特效按 equipSuit 映射关联套装名
  const suitByTrigger = new Map()
  for (const suit of Object.values(equipSuitsData || {})) {
    for (const sd of suit?.suitData || []) {
      if (sd?.skillTriggerId) {
        suitByTrigger.set(sd.skillTriggerId, { suitId: suit.typeId, suitName: suit.suitName, suitDes: stripRichBraces(sd.suitDes) })
      }
    }
  }

  const suits = []
  for (const spec of SUIT_EFFECT_SPECS) {
    const trigger = skillTriggersData?.[spec.triggerId]?.levelData?.['1']
    const suitInfo = suitByTrigger.get(spec.triggerId)
    if (!trigger || !suitInfo) continue
    if (visibleSuitIds && !visibleSuitIds.has(suitInfo.suitId)) continue
    const buffPara = buffDatas?.[trigger.buffId]?.para || {}
    const mods = spec.extract(buffPara, buffDatas)
    suits.push({
      id: spec.triggerId,
      suitId: suitInfo.suitId,
      suitName: suitInfo.suitName,
      suitNum: spec.suitNum,
      name: `${suitInfo.suitName} (${spec.suitNum}件)`,
      effectLabel: spec.effectLabel,
      des: suitInfo.suitDes || stripRichBraces(trigger.des),
      maxStacks: spec.maxStacks || 1,
      defaultStacks: spec.defaultStacks || 1,
      stackLabel: spec.stackLabel || '',
      when: spec.when,
      mods,
    })
  }

  // 装备词条按 prefixPool 提取真实名字与描述
  const prefixPool = equipGlobalConfigData?.prefixPool || {}
  const equips = []
  for (const spec of EQUIP_EFFECT_SPECS) {
    if (visibleEquipPrefixIds && !visibleEquipPrefixIds.has(spec.prefixId)) continue
    const pool = prefixPool[spec.prefixId]
    const triggerId = pool?.skillTriggerId || spec.prefixId
    const levelKey = String(pool?.level || '1')
    const trigger = skillTriggersData?.[triggerId]?.levelData?.[levelKey] || skillTriggersData?.[triggerId]?.levelData?.['1']
    if (!trigger) continue
    const buffPara = buffDatas?.[trigger.buffId]?.para || {}
    const mods = spec.extract(buffPara, buffDatas)
    equips.push({
      id: spec.prefixId,
      name: pool?.name || trigger.skillName || spec.prefixId,
      effectLabel: spec.effectLabel,
      des: stripRichBraces(trigger.des),
      maxStacks: spec.maxStacks || 1,
      defaultStacks: spec.defaultStacks || 1,
      stackLabel: spec.stackLabel || '',
      when: spec.when,
      mods,
    })
  }

  return { pets, suits, equips }
}

/**
 * 判断某个特效在当前释放的技能形态 / 伤害类型 / 元素属性下是否生效。
 */
export function isEffectApplicable(effect, context = {}) {
  const when = effect?.when
  if (!when || when.always) return true
  const form = context.form || 'skill'
  const damageType = context.damageType || 'phyAtk'
  const elementType = context.elementType || 'none'

  if (when.form) {
    const allowed = Array.isArray(when.form) ? when.form : [when.form]
    if (!allowed.includes(form)) return false
  }
  if (when.damageType && when.damageType !== damageType) return false
  if (when.elementType && when.elementType !== elementType) return false
  return true
}

function addMods(acc, mods, scale = 1) {
  if (!mods || scale <= 0) return
  if (mods.phyAtkPct) acc.phyAtkPct += num(mods.phyAtkPct) * scale
  if (mods.magicAtkPct) acc.magicAtkPct += num(mods.magicAtkPct) * scale
  if (mods.crit) acc.crit += num(mods.crit) * scale
  if (mods.critDam) acc.critDam += num(mods.critDam) * scale
  if (mods.realCrit) acc.realCrit = true
  if (mods.damAddPhy) acc.damAddPhy += num(mods.damAddPhy) * scale
  if (mods.damAddMagic) acc.damAddMagic += num(mods.damAddMagic) * scale
  if (mods.tagDamAdd) acc.tagDamAdd += num(mods.tagDamAdd) * scale
  if (mods.tgtPhyDefPct) acc.tgtPhyDefPct += num(mods.tgtPhyDefPct) * scale
  if (mods.tgtMagicDefPct) acc.tgtMagicDefPct += num(mods.tgtMagicDefPct) * scale
  if (mods.unitAtkDamAdd) acc.unitAtkDamAdd += num(mods.unitAtkDamAdd) * scale
  if (mods.unitPhyDamAdd) acc.unitPhyDamAdd += num(mods.unitPhyDamAdd) * scale
  if (mods.unitMagicDamAdd) acc.unitMagicDamAdd += num(mods.unitMagicDamAdd) * scale
  if (mods.unitNormalDamAdd) acc.unitNormalDamAdd += num(mods.unitNormalDamAdd) * scale
  if (mods.unitSkillDamAdd) acc.unitSkillDamAdd += num(mods.unitSkillDamAdd) * scale
  if (mods.summonUnitAtkDamAdd) acc.summonUnitAtkDamAdd += num(mods.summonUnitAtkDamAdd) * scale

  for (const el of ['fire', 'water', 'wind', 'earth']) {
    if (mods.damAddElement?.[el]) acc.damAddElement[el] += num(mods.damAddElement[el]) * scale
    if (mods.unitElemDamAdd?.[el]) acc.unitElemDamAdd[el] += num(mods.unitElemDamAdd[el]) * scale
  }
}

/**
 * 汇总当前勾选的魔物特性、套装效果与装备特技词条，返回各公式区的净修正值。
 */
export function aggregateDamageEffects(catalog = {}, selection = {}, context = {}) {
  const acc = {
    phyAtkPct: 0,
    magicAtkPct: 0,
    crit: 0,
    critDam: 0,
    realCrit: false,
    damAddPhy: 0,
    damAddMagic: 0,
    damAddElement: { fire: 0, water: 0, wind: 0, earth: 0 },
    tagDamAdd: 0,
    tgtPhyDefPct: 0,
    tgtMagicDefPct: 0,
    unitAtkDamAdd: 0,
    unitPhyDamAdd: 0,
    unitMagicDamAdd: 0,
    unitNormalDamAdd: 0,
    unitSkillDamAdd: 0,
    summonUnitAtkDamAdd: 0,
    unitElemDamAdd: { fire: 0, water: 0, wind: 0, earth: 0 },
    extraEventMult: 1,
    activeItems: [],
  }

  const pets = Array.isArray(catalog?.pets) ? catalog.pets : []
  const suits = Array.isArray(catalog?.suits) ? catalog.suits : []
  const equips = Array.isArray(catalog?.equips) ? catalog.equips : []

  // 1. 魔物特性（单选槽位）
  if (selection.petId) {
    const pet = pets.find((p) => p.id === selection.petId)
    if (pet) {
      const lvIdx = Math.max(0, Math.min(pet.levels.length - 1, (Number(selection.petLevel || 7) - 1)))
      const lvEntry = pet.levels[lvIdx] || pet.levels[pet.levels.length - 1]
      const stacks = Math.max(1, Math.min(pet.maxStacks || 1, Number(selection.petStacks || pet.defaultStacks || 1)))
      const applied = isEffectApplicable(pet, context)
      const mods = lvEntry?.mods || {}

      // 吵吵蕈 / 臭臭蕈队友联动暴击暴伤为常驻属性
      if (selection.petSynergy && mods.synergyMods) {
        addMods(acc, mods.synergyMods, 1)
      }
      if (applied) {
        addMods(acc, mods, stacks)
        if (mods.eventMult) {
          const factor = 1 + num(mods.eventMult) * stacks
          acc.extraEventMult *= factor
        }
      }
      acc.activeItems.push({
        id: pet.id,
        label: `${pet.name}·${pet.traitName} Lv.${lvEntry?.level || 7}`,
        applied: applied || Boolean(selection.petSynergy && mods.synergyMods),
      })
    }
  }

  // 2. 套装特效（多选）
  const suitStacks = selection.suitStacks || {}
  for (const suitId of selection.suitIds || []) {
    const suit = suits.find((s) => s.id === suitId)
    if (!suit) continue
    const stacks = Math.max(1, Math.min(suit.maxStacks || 1, Number(suitStacks[suitId] || suit.defaultStacks || 1)))
    const applied = isEffectApplicable(suit, context)
    if (applied) {
      addMods(acc, suit.mods, stacks)
      if (suit.mods?.eventMult) {
        acc.extraEventMult *= (1 + num(suit.mods.eventMult) * stacks)
      }
    }
    acc.activeItems.push({
      id: suit.id,
      label: suit.maxStacks > 1 ? `${suit.name}×${stacks}` : suit.name,
      applied,
    })
  }

  // 3. 装备词条（多选）
  const equipStacks = selection.equipStacks || {}
  for (const equipId of selection.equipIds || []) {
    const eq = equips.find((e) => e.id === equipId)
    if (!eq) continue
    const stacks = Math.max(1, Math.min(eq.maxStacks || 1, Number(equipStacks[equipId] || eq.defaultStacks || 1)))
    const applied = isEffectApplicable(eq, context)
    if (applied) {
      addMods(acc, eq.mods, stacks)
      if (eq.mods?.eventMult) {
        acc.extraEventMult *= (1 + num(eq.mods.eventMult) * stacks)
      }
    }
    acc.activeItems.push({
      id: eq.id,
      label: eq.maxStacks > 1 ? `${eq.name}×${stacks}` : eq.name,
      applied,
    })
  }

  return acc
}

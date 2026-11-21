/**
 * 1.7.15 战斗伤害结算纯函数引擎（严格对齐 `docs/context/technical/COMBAT_FORMULAS.md` §4.1~§4.6）。
 *
 * 与游戏 `DamageResolver.cs` / `CombatPanel.cs` 保持一致的八步串联：
 *   X → X1 → X2 → X3 → D0（第一次向零截断）→ 动态乘区（X_dyn）→ D1（等级压制+第二组抗性）→ D2 → D（第二次向零截断）
 */

export const ELEMENT_KEYS = ['fire', 'water', 'wind', 'earth']

/** 向零截断取整（C# float -> int 强制转换语义，非 Math.floor / 四舍五入） */
export function truncInt(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.trunc(n)
}

/** 物理/魔法防御常数 K(L)，L 为攻击者等级 */
export function calcDefenseK(damageType, attackerLevel) {
  const L = Math.max(1, Number(attackerLevel) || 1)
  if (damageType === 'magicAtk') {
    return 0.5011 * L * L + 37.039 * L + 287.98
  }
  return 0.6125 * L * L + 45.269 * L + 351.98
}

/** 全局等级压制倍率（仅在目标等级高于攻击者时生效，差 >=16 级固定 0.5） */
export function calcLevelSuppression(attackerLevel, targetLevel) {
  const delta = Math.max((Number(targetLevel) || 1) - (Number(attackerLevel) || 1), 0)
  return 1 - Math.min(0.5, 0.008 * Math.pow(delta, 1.5))
}

/** 计算净暴击率 p ∈ [0, 1]（1.7.15 CheckCirt 口径） */
export function calcNetCritChance({ allowCrit, realCrit, crit, critRes }) {
  if (realCrit) return 1
  const c = Number(crit) || 0
  if (!allowCrit || c <= 0) return 0
  const r = Number(critRes) || 0
  return Math.min(Math.max((c - r) / 100, 0), 1)
}

const readElem = (map, key) => {
  if (!map || !key || key === 'none') return 0
  return Number(map[key]) || 0
}

/**
 * 计算单段伤害的全八步结果（同时给出不暴击 / 暴击、含浮动 [min, mid, max] 与期望）。
 *
 * @param {object} params
 * @param {object} params.attacker 攻击者数值（比例项均已为小数，如 0.2 表示 20%；crit / critDam 为百分数，如 15 / 150）
 * @param {object} params.target   受击者数值（比例项均已为小数）
 * @param {object} params.segment  { damageType, elementType, scaling, multiplier, baseDamage }
 * @param {'normalAtk'|'skill'|'buff'} params.form
 * @param {boolean} params.allowCrit
 * @param {boolean} params.needFloat
 */
export function calculateSegmentDamage({
  attacker = {},
  target = {},
  segment = {},
  form = 'skill',
  allowCrit = false,
  needFloat = false,
} = {}) {
  const atkLevel = Math.max(1, Number(attacker.level) || 1)
  const tgtLevel = Math.max(1, Number(target.level) || 1)
  const damageType = segment.damageType === 'magicAtk' ? 'magicAtk' : 'phyAtk'
  const elementType = ELEMENT_KEYS.includes(segment.elementType) ? segment.elementType : 'none'
  const scaling = segment.scaling || damageType
  const multiplier = Number(segment.multiplier) || 0
  const baseDamage = Number(segment.baseDamage) || 0

  const phyAtk = Number(attacker.phyAtk) || 0
  const magicAtk = Number(attacker.magicAtk) || 0
  const maxHp = Number(attacker.maxHp) || 0

  // Step 1: 原始伤害 X
  let scalingStat = 0
  if (scaling === 'auto') scalingStat = Math.max(phyAtk, magicAtk)
  else if (scaling === 'phyAtk') scalingStat = phyAtk
  else if (scaling === 'magicAtk') scalingStat = magicAtk
  else if (scaling === 'maxHp') scalingStat = maxHp

  const X = baseDamage + multiplier * scalingStat

  // Step 2: 第一增减伤区 X1 = X * (1 + A + T - R)
  const addType = damageType === 'magicAtk' ? (Number(attacker.damAddMagic) || 0) : (Number(attacker.damAddPhy) || 0)
  const addElem = readElem(attacker.damAddElement, elementType)
  const A = addType + addElem
  const T = Number(attacker.damKeyAdd) || 0
  const resType = damageType === 'magicAtk' ? (Number(target.damResMagic) || 0) : (Number(target.damResPhy) || 0)
  const resElem = readElem(target.damResElement, elementType)
  const R = resType + resElem
  const zone1Mult = 1 + A + T - R
  const X1 = X * zone1Mult

  // Step 3: 双曲线防御与穿透（realDam 时跳过）
  const realDam = Boolean(attacker.realDam)
  const K = calcDefenseK(damageType, atkLevel)
  const defVal = damageType === 'magicAtk' ? (Number(target.magicDef) || 0) : (Number(target.phyDef) || 0)
  const basePen = damageType === 'magicAtk' ? (Number(attacker.magicAtkPen) || 0) : (Number(attacker.phyAtkPen) || 0)
  const extraNormalPen = form === 'normalAtk'
    ? (damageType === 'magicAtk' ? (Number(attacker.normalAtkMagPen) || 0) : (Number(attacker.normalAtkPhyPen) || 0))
    : 0
  const ignoreDef = (Number(attacker.ignoreDef) || 0) + (Number(segment.ignoreDef) || 0)
  const P = realDam ? 0 : Math.min(basePen + extraNormalPen + ignoreDef, 1)
  const effectiveDef = defVal * (1 - P)
  const defMult = realDam ? 1 : ((K + effectiveDef) > 0 ? K / (K + effectiveDef) : 1)
  const X2 = X1 * defMult

  // Step 4: 暴击倍率 X3
  const segAllowCrit = typeof segment.allowCrit === 'boolean' ? segment.allowCrit : allowCrit
  const segRealCrit = Boolean(attacker.realCrit || segment.realCrit)
  const critChance = calcNetCritChance({
    allowCrit: segAllowCrit,
    realCrit: segRealCrit,
    crit: attacker.crit,
    critRes: target.critRes,
  })
  const critDamPct = Number(attacker.critDam ?? 150)
  const critMult = critDamPct / 100
  const X3NoCrit = X2
  const X3Crit = X2 * critMult

  // 浮动区间（未开浮动时统一取 1）
  const fMin = needFloat ? (Number(attacker.floatMin) || 1) : 1
  const fMax = needFloat ? (Number(attacker.floatMax) || 1) : 1
  const fMid = (fMin + fMax) / 2

  // Step 5-8 后半段乘区共用闭环
  const atkDamAdd = 1 + (Number(attacker.unitAtkDamAdd) || 0)
  const tgtDamAdd = 1 + (Number(target.unitDamageAdd) || 0)
  const beHitSkillAdd = form === 'skill' ? (1 + (Number(target.unitBeHitSkillDamAdd) || 0)) : 1
  const unitTypeAdd = 1 + (damageType === 'magicAtk' ? (Number(attacker.unitMagicDamAdd) || 0) : (Number(attacker.unitPhyDamAdd) || 0))
  const unitElemAdd = 1 + readElem(attacker.unitElemDamAdd, elementType)
  const unitFormAdd = form === 'normalAtk'
    ? (1 + (Number(attacker.unitNormalDamAdd) || 0))
    : (form === 'skill' ? (1 + (Number(attacker.unitSkillDamAdd) || 0)) : 1)
  const extraEventMult = Number(attacker.extraEventMult) > 0 ? Number(attacker.extraEventMult) : 1

  const dynMult = atkDamAdd * tgtDamAdd * beHitSkillAdd * unitTypeAdd * unitElemAdd * unitFormAdd * extraEventMult

  const tagMult = form === 'normalAtk' ? (1 + (Number(attacker.tagDamAdd) || 0)) : 1
  const levelMult = calcLevelSuppression(atkLevel, tgtLevel)
  const dynTypeRes = 1 - Math.min(1, damageType === 'magicAtk' ? (Number(target.unitMagicRes) || 0) : (Number(target.unitPhyRes) || 0))
  const dynElemRes = 1 - Math.min(1, readElem(target.unitElemRes, elementType))
  const lateMult = levelMult * dynTypeRes * dynElemRes
  const spRelicMult = form === 'skill' ? (1 + (Number(attacker.spRelicSkillDmgAdd) || 0)) : 1

  const finishFromX3 = (x3Val, floatRate) => {
    const D0 = truncInt(x3Val * floatRate)
    const D1 = D0 * tagMult * dynMult * lateMult
    const D2 = Math.max(1, D1)
    const D = Math.max(1, truncInt(D2 * spRelicMult))
    return { D0, D1, D2, D }
  }

  const noCritMin = finishFromX3(X3NoCrit, fMin)
  const noCritMid = finishFromX3(X3NoCrit, fMid)
  const noCritMax = finishFromX3(X3NoCrit, fMax)

  const critMin = finishFromX3(X3Crit, fMin)
  const critMid = finishFromX3(X3Crit, fMid)
  const critMax = finishFromX3(X3Crit, fMax)

  const expected = Math.round(noCritMid.D * (1 - critChance) + critMid.D * critChance)

  return {
    damageType,
    elementType,
    scaling,
    multiplier,
    baseDamage,
    noCrit: { min: noCritMin.D, mid: noCritMid.D, max: noCritMax.D },
    crit: { min: critMin.D, mid: critMid.D, max: critMax.D },
    expected,
    critChance,
    steps: {
      scalingStat,
      X,
      zone1Mult,
      X1,
      K,
      defVal,
      penetration: P,
      defMult,
      X2,
      critMult,
      X3NoCrit,
      X3Crit,
      floatMin: fMin,
      floatMax: fMax,
      D0NoCrit: noCritMid.D0,
      D0Crit: critMid.D0,
      dynMult,
      levelMult,
      dynTypeRes,
      dynElemRes,
      lateMult,
      spRelicMult,
      D2NoCrit: noCritMid.D2,
      D2Crit: critMid.D2,
    },
  }
}

/**
 * 计算整招技能（可含多段）的总伤害与逐段拆解。
 */
export function calculateSkillDamage({ attacker, target, skill, levelIndex = 0, allowCritOverride, needFloatOverride }) {
  const levels = Array.isArray(skill?.levels) ? skill.levels : []
  const lvData = levels[levelIndex] || levels[0]
  const segDefs = Array.isArray(skill?.segments) ? skill.segments : []
  const lvSegVals = Array.isArray(lvData?.segments) ? lvData.segments : []
  const form = skill?.form || 'skill'
  const allowCrit = typeof allowCritOverride === 'boolean' ? allowCritOverride : (skill?.crit === 'yes')
  const needFloat = typeof needFloatOverride === 'boolean' ? needFloatOverride : (form === 'normalAtk')

  const segmentResults = segDefs.map((seg, idx) => {
    const vals = lvSegVals[idx] || [0, 0]
    return calculateSegmentDamage({
      attacker,
      target,
      form,
      allowCrit,
      needFloat,
      segment: {
        damageType: seg.damageType,
        elementType: seg.elementType,
        scaling: seg.scaling,
        multiplier: Number(vals[0] || 0),
        baseDamage: Number(vals[1] || 0),
        ignoreDef: Number(seg.ignoreDef || 0),
        realCrit: Boolean(seg.realCrit),
        allowCrit: typeof seg.allowCrit === 'boolean' ? seg.allowCrit : undefined,
      },
    })
  })

  const sumField = (pick) => segmentResults.reduce((acc, item) => acc + pick(item), 0)
  const anyRealCrit = segmentResults.some((s, idx) => Boolean(segDefs[idx]?.realCrit))
  const effectiveCritChance = segmentResults.find((s) => s.critChance > 0)?.critChance ?? (segmentResults[0]?.critChance ?? 0)

  return {
    form,
    allowCrit: allowCrit || anyRealCrit,
    needFloat,
    critChance: effectiveCritChance,
    noCrit: {
      min: sumField((s) => s.noCrit.min),
      mid: sumField((s) => s.noCrit.mid),
      max: sumField((s) => s.noCrit.max),
    },
    crit: {
      min: sumField((s) => s.crit.min),
      mid: sumField((s) => s.crit.mid),
      max: sumField((s) => s.crit.max),
    },
    expected: sumField((s) => s.expected),
    segments: segmentResults,
  }
}

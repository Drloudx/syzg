/**
 * 通用 DPS 循环、属性边际收益权重与 A/B 方案对比引擎。
 *
 * 复用 `damageCalculator.js`（1.7.15 八步伤害结算）、`damageEffects.js`（魔物/套装/词条特效）
 * 与 `heroStarsDamage.js`（全角色星阶技能）逐技能独立判定生效乘区后按攻速与有效冷却合成 DPS。
 */

import { calculateSkillDamage } from './damageCalculator.js'
import { aggregateDamageEffects } from './damageEffects.js'
import { evaluateSkillDotSummary, evaluateSkillSummons } from './damageDoTAndSummons.js'
import { applyStarTransformsToSkill, calculateHeroStarEffects } from './heroStarsDamage.js'

const VALID_ELEMENTS = ['fire', 'water', 'wind', 'earth']
const ELEMENT_NAMES = { fire: '火', water: '水', wind: '风', earth: '地' }

export const DEFAULT_ROTATION_DURATION_SEC = 30
export const DEFAULT_SKILL_CAST_LOSS_SEC = 0.5
export const DEFAULT_PASSIVE_INTERVAL_SEC = 4
export const ATK_SPEED_ADD_CAP_PCT = 300
export const COOLDOWN_CAP_PCT = 50

/**
 * 按 UnitAttribute.AtkSpeed (326-345) 计算有效攻速与普攻间隔。
 * 游戏内 AtkSpeedAdd 封顶 +300%（最多基础攻速的 4 倍）。
 */
export function calcEffectiveAtkSpeed(baseAtkSpeed = 0.7, atkSpeedAddPct = 0) {
  const base = Math.max(0.05, Number(baseAtkSpeed) || 0.7)
  const rawAddPct = Number(atkSpeedAddPct) || 0
  const cappedAddPct = Math.min(ATK_SPEED_ADD_CAP_PCT, rawAddPct)
  const effectiveAtkSpeed = Math.max(0.05, base * (1 + cappedAddPct / 100))
  return {
    baseAtkSpeed: base,
    rawAddPct,
    cappedAddPct,
    isCapped: rawAddPct > ATK_SPEED_ADD_CAP_PCT,
    effectiveAtkSpeed,
    attackInterval: 1 / effectiveAtkSpeed,
  }
}

/**
 * 按 CombatPanel.cs:6303 与 UnitAttribute.coolDown (358-367) 计算技能有效冷却。
 * 游戏内 coolDown 上限 50%。
 */
export function calcEffectiveCooldown(baseCd = 0, coolDownPct = 0) {
  const rawCd = Math.max(0, Number(baseCd) || 0)
  const rawCoolDownPct = Number(coolDownPct) || 0
  const cappedCoolDownPct = Math.min(COOLDOWN_CAP_PCT, rawCoolDownPct)
  const effectiveCd = rawCd > 0 ? Math.max(0.1, rawCd * (1 - cappedCoolDownPct / 100)) : 0
  return {
    baseCd: rawCd,
    rawCoolDownPct,
    cappedCoolDownPct,
    isCapped: rawCoolDownPct > COOLDOWN_CAP_PCT,
    effectiveCd,
  }
}

/**
 * 判断技能在指定等级下是否包含任何有效直伤段。
 */
export function skillHasDamageSegments(skill, levelIndex = 0) {
  if (!skill?.segments?.length) return false
  const lv = skill.levels?.[levelIndex] || skill.levels?.[0]
  return skill.segments.some((_, idx) => {
    const pair = lv?.segments?.[idx]
    return pair && (Number(pair[0]) > 0 || Number(pair[1]) > 0)
  })
}

/**
 * 读取技能的主伤害类型与主元素属性。
 */
export function getSkillPrimaryProfile(skill) {
  const seg0 = skill?.segments?.[0]
  const damageType = seg0?.damageType === 'magicAtk' ? 'magicAtk' : 'phyAtk'
  const rawEl = seg0?.elementType
  const elementType = VALID_ELEMENTS.includes(rawEl) ? rawEl : 'none'
  return {
    form: skill?.form || 'skill',
    damageType,
    elementType,
  }
}

/**
 * 统一评估单名角色某一个技能/被动在当前面板、星阶与特效下的单次结算结果。
 * 单发结果卡片与全循环 DPS 共用此函数，避免重复组装攻击/目标参数。
 */
export function evaluateHeroAbility({
  hero,
  skill,
  levelIndex = 0,
  atk = {},
  tgt = {},
  effectsCatalog = {},
  effectState = {},
  starSelection = {},
  allowCritOverride,
  needFloatOverride,
} = {}) {
  if (!hero || !skill) {
    return {
      skill: skill || null,
      activeEffects: null,
      starEffects: null,
      result: {
        allowCrit: false,
        needFloat: false,
        critChance: 0,
        noCrit: { min: 0, mid: 0, max: 0 },
        crit: { min: 0, mid: 0, max: 0 },
        expected: 0,
        segments: [],
      },
    }
  }

  const ctx = getSkillPrimaryProfile(skill)
  const eff = aggregateDamageEffects(effectsCatalog, effectState, ctx)
  const se = calculateHeroStarEffects(hero, starSelection, skill, ctx)
  const transformedSkill = applyStarTransformsToSkill(skill, levelIndex, se)

  const dType = ctx.damageType
  const elKey = ctx.elementType
  const elemAddMap = atk.unitElemDamAddPct || {}

  const attackerInput = {
    level: atk.level,
    phyAtk: (Number(atk.phyAtk) || 0) * (1 + eff.phyAtkPct + se.phyAtkPct),
    magicAtk: (Number(atk.magicAtk) || 0) * (1 + eff.magicAtkPct + se.magicAtkPct),
    maxHp: atk.maxHp,
    crit: (Number(atk.crit) || 0) + eff.crit + se.crit,
    critDam: Number(atk.critDam ?? 155) + eff.critDam + se.critDam,
    phyAtkPen: (Number(atk.phyAtkPenPct) || 0) / 100,
    magicAtkPen: (Number(atk.magicAtkPenPct) || 0) / 100,
    normalAtkPhyPen: (Number(atk.normalAtkPhyPenPct) || 0) / 100,
    normalAtkMagPen: (Number(atk.normalAtkMagPenPct) || 0) / 100,
    ignoreDef: (Number(atk.ignoreDefPct) || 0) / 100,
    floatMin: hero.floatMin,
    floatMax: hero.floatMax,
    damAddPhy: (dType === 'phyAtk' ? (Number(atk.damAddZone1Pct) || 0) / 100 : 0) + eff.damAddPhy,
    damAddMagic: (dType === 'magicAtk' ? (Number(atk.damAddZone1Pct) || 0) / 100 : 0) + eff.damAddMagic,
    damAddElement: eff.damAddElement,
    tagDamAdd: eff.tagDamAdd + se.tagDamAdd,
    unitAtkDamAdd: (Number(atk.unitAtkDamAddPct) || 0) / 100 + eff.unitAtkDamAdd + se.unitAtkDamAdd,
    unitPhyDamAdd: (Number(atk.unitPhyDamAddPct) || 0) / 100 + eff.unitPhyDamAdd + se.unitPhyDamAdd,
    unitMagicDamAdd: (Number(atk.unitMagicDamAddPct) || 0) / 100 + eff.unitMagicDamAdd + se.unitMagicDamAdd,
    unitNormalDamAdd: (Number(atk.unitNormalDamAddPct) || 0) / 100 + eff.unitNormalDamAdd + se.unitNormalDamAdd,
    unitSkillDamAdd: (Number(atk.unitSkillDamAddPct) || 0) / 100 + eff.unitSkillDamAdd + se.unitSkillDamAdd,
    unitElemDamAdd: {
      fire: (Number(elemAddMap.fire) || 0) / 100 + eff.unitElemDamAdd.fire,
      water: (Number(elemAddMap.water) || 0) / 100 + eff.unitElemDamAdd.water,
      wind: (Number(elemAddMap.wind) || 0) / 100 + eff.unitElemDamAdd.wind,
      earth: (Number(elemAddMap.earth) || 0) / 100 + eff.unitElemDamAdd.earth,
    },
    spRelicSkillDmgAdd: (Number(atk.spRelicSkillDmgAddPct) || 0) / 100,
    extraEventMult: (Number(atk.extraEventMult) || 1) * eff.extraEventMult * se.extraEventMult,
    realDam: Boolean(atk.realDam),
    realCrit: Boolean(atk.realCrit || eff.realCrit || se.realCrit),
  }

  const targetInput = {
    level: tgt.level,
    phyDef: (Number(tgt.phyDef) || 0) * Math.max(0, 1 + eff.tgtPhyDefPct + se.tgtPhyDefPct),
    magicDef: (Number(tgt.magicDef) || 0) * Math.max(0, 1 + eff.tgtMagicDefPct + se.tgtMagicDefPct),
    critRes: tgt.critRes,
    damResPhy: dType === 'phyAtk' ? (Number(tgt.damResTypePct) || 0) / 100 : 0,
    damResMagic: dType === 'magicAtk' ? (Number(tgt.damResTypePct) || 0) / 100 : 0,
    damResElement: elKey !== 'none' ? { [elKey]: (Number(tgt.damResElementPct) || 0) / 100 } : {},
    unitDamageAdd: (Number(tgt.unitDamageAddPct) || 0) / 100 + se.unitDamageAdd,
    unitBeHitSkillDamAdd: (Number(tgt.unitBeHitSkillDamAddPct) || 0) / 100,
    unitPhyRes: dType === 'phyAtk' ? (Number(tgt.unitTypeResPct) || 0) / 100 : 0,
    unitMagicRes: dType === 'magicAtk' ? (Number(tgt.unitTypeResPct) || 0) / 100 : 0,
    unitElemRes: elKey !== 'none' ? { [elKey]: (Number(tgt.unitElemResPct) || 0) / 100 } : {},
  }

  const resolvedAllowCrit = typeof allowCritOverride === 'boolean'
    ? Boolean(allowCritOverride || se.allowCritOverrideFromStar)
    : undefined

  const result = calculateSkillDamage({
    attacker: attackerInput,
    target: targetInput,
    skill: transformedSkill,
    levelIndex,
    allowCritOverride: resolvedAllowCrit,
    needFloatOverride: typeof needFloatOverride === 'boolean' ? needFloatOverride : undefined,
  })

  const lvData = transformedSkill?.levels?.[levelIndex] || transformedSkill?.levels?.[0]
  const cdInfo = calcEffectiveCooldown(Number(lvData?.cd || 0), atk.coolDownPct)

  const dotSummary = evaluateSkillDotSummary({
    skill: transformedSkill,
    baseResult: result,
    attackerInput,
    targetInput,
    needFloat: result.needFloat,
  })

  const sm = se.summonMods || {}
  const summonResults = evaluateSkillSummons({
    skill: transformedSkill,
    levelIndex,
    atk,
    tgt,
    effPhyAtkPct: eff.phyAtkPct + se.phyAtkPct,
    effMagicAtkPct: eff.magicAtkPct + se.magicAtkPct,
    effTgtPhyDefPct: eff.tgtPhyDefPct + se.tgtPhyDefPct,
    effTgtMagicDefPct: eff.tgtMagicDefPct + se.tgtMagicDefPct,
    effTgtUnitDamageAdd: se.unitDamageAdd || 0,
    effectiveCd: cdInfo.effectiveCd,
    summonMods: {
      summonUnitAtkDamAdd: (eff.summonUnitAtkDamAdd || 0) + (sm.summonUnitAtkDamAdd || 0),
      summonPhyAtkPct: sm.summonPhyAtkPct || 0,
      summonMagicAtkPct: sm.summonMagicAtkPct || 0,
      summonAtkSpeedPct: sm.summonAtkSpeedPct || 0,
      summonInheritAtkAdd: sm.summonInheritAtkAdd || 0,
      summonDurtimeAdd: sm.summonDurtimeAdd || 0,
      summonExtraCount: sm.summonExtraCount || 0,
      expiryBlasts: sm.expiryBlasts || [],
    },
  })

  return {
    skill: transformedSkill,
    activeEffects: eff,
    starEffects: se,
    result,
    dotSummary,
    summonResults,
  }
}

/**
 * 计算整名角色在「自动稳态循环」或「自定义爆发轴」下的综合 DPS 与伤害构成占比。
 */
export function calculateHeroDpsRotation({
  hero,
  atk = {},
  tgt = {},
  effectsCatalog = {},
  effectState = {},
  starSelection = {},
  skillLevelMap = {},
  rotationConfig = {},
} = {}) {
  const atkSpeedInfo = calcEffectiveAtkSpeed(hero?.baseAtkSpeed ?? 0.7, atk.atkSpeedAddPct)
  const coolDownInfo = calcEffectiveCooldown(10, atk.coolDownPct)

  if (!hero) {
    return {
      mode: 'auto',
      durationSec: DEFAULT_ROTATION_DURATION_SEC,
      skillCastLossSec: DEFAULT_SKILL_CAST_LOSS_SEC,
      atkSpeedInfo,
      coolDownInfo,
      normalWindowSec: 0,
      totalDamage: 0,
      totalDps: 0,
      normalDps: 0,
      skillDps: 0,
      talentDps: 0,
      summonDps: 0,
      entries: [],
    }
  }

  const mode = rotationConfig.mode === 'custom' ? 'custom' : 'auto'
  const durationSec = Math.max(1, Number(rotationConfig.durationSec) || DEFAULT_ROTATION_DURATION_SEC)
  const skillCastLossSec = Math.max(0, Math.min(5, Number(rotationConfig.skillCastLossSec ?? DEFAULT_SKILL_CAST_LOSS_SEC)))
  const abilityConfigs = rotationConfig.abilities || {}

  const rawAbilities = [
    ...(Array.isArray(hero.skills) ? hero.skills : []).map((sk, idx) => ({
      sk,
      category: sk.form === 'normalAtk' ? 'normal' : 'skill',
      abilityIndex: idx,
    })),
    ...(Array.isArray(hero.talentSkills) ? hero.talentSkills : []).map((sk, idx) => ({
      sk,
      category: 'talent',
      abilityIndex: (hero.skills?.length || 0) + idx,
    })),
  ]

  let castTimeLoss = 0
  const staged = []

  for (const { sk, category, abilityIndex } of rawAbilities) {
    const maxIdx = Math.max(0, (sk.levels?.length || 1) - 1)
    const lvIdx = Number.isInteger(skillLevelMap[sk.id])
      ? Math.max(0, Math.min(maxIdx, skillLevelMap[sk.id]))
      : maxIdx

    const evaluated = evaluateHeroAbility({
      hero,
      skill: sk,
      levelIndex: lvIdx,
      atk,
      tgt,
      effectsCatalog,
      effectState,
      starSelection,
    })

    const hasDirectDamage = skillHasDamageSegments(evaluated.skill, lvIdx)
    const dotSum = evaluated.dotSummary
    const hasDamage = hasDirectDamage || Boolean(dotSum?.extraDotResults?.length)
    const singleCastExpected = dotSum?.hasDot ? dotSum.fullExpected : evaluated.result.expected

    const lvData = evaluated.skill?.levels?.[lvIdx] || evaluated.skill?.levels?.[0]
    const baseCd = Number(lvData?.cd || 0)
    const cdInfo = calcEffectiveCooldown(baseCd, atk.coolDownPct)
    const cfg = abilityConfigs[sk.id] || {}
    const enabled = hasDamage && cfg.enabled !== false

    let casts = 0
    let intervalSec = cdInfo.effectiveCd

    if (category === 'skill') {
      if (mode === 'auto') {
        casts = enabled && cdInfo.effectiveCd > 0 ? durationSec / cdInfo.effectiveCd : 0
        castTimeLoss += casts * skillCastLossSec
      } else {
        casts = enabled ? Math.max(0, Number(cfg.customCasts ?? 1)) : 0
      }
    } else if (category === 'talent') {
      const dotInterval = dotSum?.buffDurationSec > 0 ? dotSum.buffDurationSec : 0
      // 阿娜洛洁 `04304`：每第 3 次普攻后的第 4 次普攻触发 1 次【欠账】（周期 ≈ 4 / effectiveAtkSpeed）
      const atkCycleInterval = sk.id === '04304' ? (4 / Math.max(0.1, atkSpeedInfo.effectiveAtkSpeed)) : 0
      const fallbackInterval = baseCd > 0
        ? cdInfo.effectiveCd
        : (dotInterval || atkCycleInterval || DEFAULT_PASSIVE_INTERVAL_SEC)
      intervalSec = baseCd > 0
        ? cdInfo.effectiveCd
        : Math.max(0.5, Number(cfg.intervalSec ?? fallbackInterval))
      if (mode === 'auto') {
        casts = enabled ? durationSec / intervalSec : 0
      } else {
        casts = enabled ? Math.max(0, Number(cfg.customCasts ?? 1)) : 0
      }
    }

    staged.push({
      id: sk.id,
      name: sk.name,
      icon: sk.icon || '',
      type: sk.type || category,
      category,
      abilityIndex,
      hasDamage,
      hasDot: Boolean(dotSum?.hasDot),
      dotTicks: dotSum?.totalTicks || 1,
      dotLabel: dotSum?.summaryLabel || '',
      enabled,
      level: lvIdx + 1,
      baseCd,
      effectiveCd: cdInfo.effectiveCd,
      intervalSec,
      singleExpected: singleCastExpected,
      critChance: evaluated.result.critChance,
      segments: evaluated.skill?.segments || [],
      casts,
      cfg,
    })

    // 提取召唤物独立输出条目
    for (const sum of evaluated.summonResults || []) {
      const sumEntryId = `sum::${sk.id}::${sum.id}`
      const sumCfg = abilityConfigs[sumEntryId] || {}
      const sumEnabled = sumCfg.enabled !== undefined ? Boolean(sumCfg.enabled) : !sum.defaultDisabled
      const rawSpeed = sum.effectiveAtkSpeed || sum.atkSpeed
      const sumCycleCd = sum.cd > 0 ? sum.cd : cdInfo.effectiveCd
      let sumHits = 0
      let bonusDamage = 0
      if (sumEnabled) {
        if (mode === 'auto') {
          sumHits = sum.count * sum.uptimeRatio * durationSec * rawSpeed
          if (sum.expiryBlastPerUnit > 0 && sumCycleCd > 0) {
            bonusDamage = (durationSec / sumCycleCd) * sum.count * sum.expiryBlastPerUnit
          }
        } else {
          const parentCasts = Math.max(0, Number(sumCfg.customCasts ?? (sum.durtime <= 0 ? 1 : (cfg.customCasts ?? 1))))
          const activeSec = sum.durtime <= 0
            ? (parentCasts > 0 ? durationSec : 0)
            : Math.min(durationSec, parentCasts * sum.durtime)
          sumHits = sum.count * activeSec * rawSpeed
          if (sum.expiryBlastPerUnit > 0) {
            bonusDamage = parentCasts * sum.count * sum.expiryBlastPerUnit
          }
        }
      }
      staged.push({
        id: sumEntryId,
        name: `${sum.name}${sum.count > 1 ? ` ×${sum.count}` : ''}`,
        parentSkillName: sk.name,
        category: 'summon',
        hasDamage: true,
        enabled: sumEnabled,
        level: lvIdx + 1,
        baseCd: sum.cd > 0 ? sum.cd : baseCd,
        effectiveCd: sumCycleCd,
        intervalSec: 1 / rawSpeed,
        atkSpeed: sum.atkSpeed,
        uptimeRatio: sum.uptimeRatio,
        durtime: sum.durtime,
        atkPct: sum.atkPct,
        singleExpected: sum.singleExpected,
        critChance: sum.critChance,
        segments: [{ damageType: sum.damageType, elementType: sum.elementType, scaling: sum.scaling }],
        casts: sumHits,
        bonusDamage,
        cfg: sumCfg,
      })
    }
  }

  const normalWindowSec = mode === 'auto' ? Math.max(0, durationSec - castTimeLoss) : durationSec

  for (const item of staged) {
    if (item.category !== 'normal') continue
    item.intervalSec = atkSpeedInfo.attackInterval
    if (mode === 'auto') {
      item.casts = item.enabled ? normalWindowSec * atkSpeedInfo.effectiveAtkSpeed : 0
    } else {
      item.casts = item.enabled ? Math.max(0, Number(item.cfg.customCasts ?? 10)) : 0
    }
  }

  let totalDamage = 0
  let normalDamage = 0
  let skillDamage = 0
  let talentDamage = 0
  let summonDamage = 0

  const entries = staged.map((item) => {
    const damage = item.casts * item.singleExpected + (item.bonusDamage || 0)
    const dps = damage / durationSec
    totalDamage += damage
    if (item.category === 'normal') normalDamage += damage
    else if (item.category === 'skill') skillDamage += damage
    else if (item.category === 'summon') summonDamage += damage
    else talentDamage += damage
    return {
      ...item,
      totalDamage: damage,
      dps,
      sharePct: 0,
    }
  })

  for (const entry of entries) {
    entry.sharePct = totalDamage > 0 ? (entry.totalDamage / totalDamage) * 100 : 0
  }

  return {
    mode,
    durationSec,
    skillCastLossSec,
    atkSpeedInfo,
    coolDownInfo,
    normalWindowSec,
    totalDamage,
    totalDps: totalDamage / durationSec,
    normalDps: normalDamage / durationSec,
    skillDps: skillDamage / durationSec,
    talentDps: talentDamage / durationSec,
    summonDps: summonDamage / durationSec,
    entries,
  }
}

/**
 * 基于当前角色配置试算常见词条增量的 DPS 边际收益权重榜，降序返回。
 */
export function calculateDpsStatWeights({
  hero,
  atk = {},
  tgt = {},
  effectsCatalog = {},
  effectState = {},
  starSelection = {},
  skillLevelMap = {},
  rotationConfig = {},
} = {}) {
  if (!hero) return []

  const baseRot = calculateHeroDpsRotation({
    hero,
    atk,
    tgt,
    effectsCatalog,
    effectState,
    starSelection,
    skillLevelMap,
    rotationConfig,
  })
  const baseDps = baseRot.totalDps
  if (baseDps <= 0) return []

  const usedDamageTypes = new Set()
  const usedElements = new Set()
  let usesSkill = false

  for (const entry of baseRot.entries) {
    if (!entry.enabled || entry.totalDamage <= 0) continue
    if (entry.category === 'skill') usesSkill = true
    for (const seg of entry.segments) {
      const dmgType = seg.damageType === 'magicAtk' ? 'magicAtk' : 'phyAtk'
      if (entry.category === 'summon') {
        const sc = seg.scaling === 'magicAtk' ? 'magicAtk' : dmgType
        usedDamageTypes.add(sc)
        continue
      }
      usedDamageTypes.add(dmgType)
      if (VALID_ELEMENTS.includes(seg.elementType)) {
        usedElements.add(seg.elementType)
      }
    }
  }

  const probes = []
  if (usedDamageTypes.has('phyAtk')) {
    probes.push({
      key: 'phyAtk',
      label: '+500 物理攻击',
      patch: (a) => ({ ...a, phyAtk: (Number(a.phyAtk) || 0) + 500 }),
    })
  }
  if (usedDamageTypes.has('magicAtk')) {
    probes.push({
      key: 'magicAtk',
      label: '+500 魔法攻击',
      patch: (a) => ({ ...a, magicAtk: (Number(a.magicAtk) || 0) + 500 }),
    })
  }
  probes.push(
    {
      key: 'crit',
      label: '+10% 暴击率',
      patch: (a) => ({ ...a, crit: (Number(a.crit) || 0) + 10 }),
    },
    {
      key: 'critDam',
      label: '+20% 暴击伤害',
      patch: (a) => ({ ...a, critDam: Number(a.critDam ?? 155) + 20 }),
    },
  )
  if (usedDamageTypes.has('phyAtk')) {
    probes.push({
      key: 'phyAtkPen',
      label: '+10% 物理穿透',
      patch: (a) => ({ ...a, phyAtkPenPct: Math.min(100, (Number(a.phyAtkPenPct) || 0) + 10) }),
    })
  }
  if (usedDamageTypes.has('magicAtk')) {
    probes.push({
      key: 'magicAtkPen',
      label: '+10% 魔法穿透',
      patch: (a) => ({ ...a, magicAtkPenPct: Math.min(100, (Number(a.magicAtkPenPct) || 0) + 10) }),
    })
  }
  probes.push(
    {
      key: 'atkSpeed',
      label: '+20% 攻速加成',
      patch: (a) => ({ ...a, atkSpeedAddPct: (Number(a.atkSpeedAddPct) || 0) + 20 }),
    },
    {
      key: 'coolDown',
      label: '+10% 冷却缩减',
      patch: (a) => ({ ...a, coolDownPct: (Number(a.coolDownPct) || 0) + 10 }),
    },
  )

  for (const el of usedElements) {
    probes.push({
      key: `elem_${el}`,
      label: `+15% ${ELEMENT_NAMES[el]}属性增伤`,
      patch: (a) => ({
        ...a,
        unitElemDamAddPct: {
          ...(a.unitElemDamAddPct || {}),
          [el]: (Number(a.unitElemDamAddPct?.[el]) || 0) + 15,
        },
      }),
    })
  }
  if (usedDamageTypes.has('phyAtk')) {
    probes.push({
      key: 'unitPhyDamAdd',
      label: '+15% 物理增伤',
      patch: (a) => ({ ...a, unitPhyDamAddPct: (Number(a.unitPhyDamAddPct) || 0) + 15 }),
    })
  }
  if (usedDamageTypes.has('magicAtk')) {
    probes.push({
      key: 'unitMagicDamAdd',
      label: '+15% 魔法增伤',
      patch: (a) => ({ ...a, unitMagicDamAddPct: (Number(a.unitMagicDamAddPct) || 0) + 15 }),
    })
  }
  if (usesSkill) {
    probes.push({
      key: 'unitSkillDamAdd',
      label: '+15% 技能增伤',
      patch: (a) => ({ ...a, unitSkillDamAddPct: (Number(a.unitSkillDamAddPct) || 0) + 15 }),
    })
  }
  probes.push({
    key: 'unitAtkDamAdd',
    label: '+15% 通用输出增伤',
    patch: (a) => ({ ...a, unitAtkDamAddPct: (Number(a.unitAtkDamAddPct) || 0) + 15 }),
  })

  return probes
    .map((probe) => {
      const nextRot = calculateHeroDpsRotation({
        hero,
        atk: probe.patch(atk),
        tgt,
        effectsCatalog,
        effectState,
        starSelection,
        skillLevelMap,
        rotationConfig,
      })
      const diffDps = nextRot.totalDps - baseDps
      const diffPct = baseDps > 0 ? (diffDps / baseDps) * 100 : 0
      return {
        key: probe.key,
        label: probe.label,
        nextDps: nextRot.totalDps,
        diffDps,
        diffPct,
      }
    })
    .sort((a, b) => b.diffPct - a.diffPct)
}

/**
 * 计算当前数值相对基准方案 A 的差值与提升比例。
 */
export function compareAgainstBaseline(currentVal, baselineVal) {
  const cur = Number(currentVal) || 0
  const base = Number(baselineVal) || 0
  const diff = cur - base
  const diffPct = base > 0 ? (diff / base) * 100 : 0
  let direction = 'flat'
  if (diff > 0.005) direction = 'up'
  else if (diff < -0.005) direction = 'down'
  return {
    currentVal: cur,
    baselineVal: base,
    diff,
    diffPct,
    direction,
  }
}

export const DEFAULT_PANEL_ATK = {
  level: 50,
  phyAtk: 4500,
  magicAtk: 4500,
  maxHp: 12000,
  crit: 10,
  critDam: 155,
  phyAtkPenPct: 0,
  magicAtkPenPct: 0,
  normalAtkPhyPenPct: 0,
  normalAtkMagPenPct: 0,
  atkSpeedAddPct: 0,
  coolDownPct: 0,
  ignoreDefPct: 0,
  damAddZone1Pct: 0,
  unitAtkDamAddPct: 0,
  unitPhyDamAddPct: 0,
  unitMagicDamAddPct: 0,
  unitNormalDamAddPct: 0,
  unitSkillDamAddPct: 0,
  spRelicSkillDmgAddPct: 0,
  extraEventMult: 1,
  realDam: false,
  realCrit: false,
}

export const DEFAULT_PANEL_TGT = {
  level: 50,
  phyDef: 0,
  magicDef: 0,
  critRes: 0,
  damResElementPct: 0,
  damResTypePct: 0,
  unitDamageAddPct: 0,
  unitBeHitSkillDamAddPct: 0,
  unitTypeResPct: 0,
  unitElemResPct: 0,
}

function diffFlatObject(current = {}, defaults = {}) {
  const diff = {}
  for (const [k, dVal] of Object.entries(defaults)) {
    if (current[k] !== undefined && current[k] !== dVal) {
      diff[k] = current[k]
    }
  }
  return diff
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(token) {
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + pad)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * 纯客户端差量编码：仅保留非默认字段生成紧凑短码 `DC2:...`，无需服务端存储。
 */
export function encodeCompactShareCode(snap = {}) {
  const min = { h: snap.heroId || '' }
  if (snap.skillIndex) min.si = snap.skillIndex
  if (snap.skillLevelMap && Object.keys(snap.skillLevelMap).length) min.sl = snap.skillLevelMap
  if (snap.monsterId) {
    min.m = snap.monsterId
    if (snap.presetMonLevel && snap.presetMonLevel !== 50) min.ml = snap.presetMonLevel
  }
  const atkDiff = diffFlatObject(snap.atk, DEFAULT_PANEL_ATK)
  const elemDiff = diffFlatObject(snap.atk?.unitElemDamAddPct, { fire: 0, water: 0, wind: 0, earth: 0 })
  if (Object.keys(elemDiff).length) atkDiff.el = elemDiff
  if (Object.keys(atkDiff).length) min.a = atkDiff

  const tgtDiff = diffFlatObject(snap.tgt, DEFAULT_PANEL_TGT)
  if (Object.keys(tgtDiff).length) min.t = tgtDiff

  const slv = snap.starSelection?.starLevels || {}
  const sst = snap.starSelection?.starStacks || {}
  const activeStars = Object.fromEntries(Object.entries(slv).filter(([, v]) => Number(v) > 0))
  if (Object.keys(activeStars).length) {
    min.st = { l: activeStars }
    if (Object.keys(sst).length) min.st.s = sst
  }

  const es = snap.effectState || {}
  if (es.petId || es.suitIds?.length || es.equipIds?.length) {
    const ef = {}
    if (es.petId) {
      ef.p = es.petId
      if (es.petLevel && es.petLevel !== 7) ef.pl = es.petLevel
      if (es.petStacks && es.petStacks !== 1) ef.ps = es.petStacks
      if (es.petSynergy) ef.py = 1
    }
    if (es.suitIds?.length) ef.su = es.suitIds
    if (es.suitStacks && Object.keys(es.suitStacks).length) ef.sus = es.suitStacks
    if (es.equipIds?.length) ef.eq = es.equipIds
    if (es.equipStacks && Object.keys(es.equipStacks).length) ef.eqs = es.equipStacks
    min.ef = ef
  }

  const rc = snap.rotationConfig || {}
  if (rc.mode === 'custom' || rc.durationSec !== DEFAULT_ROTATION_DURATION_SEC || rc.skillCastLossSec !== DEFAULT_SKILL_CAST_LOSS_SEC || (rc.abilities && Object.keys(rc.abilities).length)) {
    const r = {}
    if (rc.mode === 'custom') r.m = 'c'
    if (rc.durationSec && rc.durationSec !== DEFAULT_ROTATION_DURATION_SEC) r.d = rc.durationSec
    if (rc.skillCastLossSec !== undefined && rc.skillCastLossSec !== DEFAULT_SKILL_CAST_LOSS_SEC) r.l = rc.skillCastLossSec
    if (rc.abilities && Object.keys(rc.abilities).length) r.ab = rc.abilities
    min.rc = r
  }

  return `DC2:${toBase64Url(JSON.stringify(min))}`
}

/**
 * 解析 `DC2:` 紧凑短码、`DC1:` 全量分享码或原始 JSON 字符串为统一快照结构。
 */
export function decodeSharePayload(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  if (text.startsWith('{')) return JSON.parse(text)
  if (text.startsWith('DC1:')) {
    const bin = atob(text.slice(4))
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  }
  const clean = text.startsWith('DC2:') ? text.slice(4) : text
  const min = JSON.parse(fromBase64Url(clean))
  if (!min || typeof min !== 'object' || !min.h) return null

  const atkRest = { ...(min.a || {}) }
  const elemPatch = atkRest.el || {}
  delete atkRest.el

  return {
    v: 2,
    heroId: min.h,
    skillIndex: min.si || 0,
    skillLevelMap: min.sl || {},
    monsterId: min.m || '',
    presetMonLevel: min.ml || 50,
    atk: {
      ...DEFAULT_PANEL_ATK,
      ...atkRest,
      unitElemDamAddPct: { fire: 0, water: 0, wind: 0, earth: 0, ...elemPatch },
    },
    tgt: {
      ...DEFAULT_PANEL_TGT,
      ...(min.t || {}),
    },
    starSelection: {
      starLevels: min.st?.l || {},
      starStacks: min.st?.s || {},
    },
    effectState: {
      petId: min.ef?.p || '',
      petLevel: min.ef?.pl || 7,
      petStacks: min.ef?.ps || 1,
      petSynergy: Boolean(min.ef?.py),
      suitIds: min.ef?.su || [],
      suitStacks: min.ef?.sus || {},
      equipIds: min.ef?.eq || [],
      equipStacks: min.ef?.eqs || {},
    },
    rotationConfig: {
      mode: min.rc?.m === 'c' ? 'custom' : 'auto',
      durationSec: min.rc?.d || DEFAULT_ROTATION_DURATION_SEC,
      skillCastLossSec: min.rc?.l ?? DEFAULT_SKILL_CAST_LOSS_SEC,
      abilities: min.rc?.ab || {},
    },
  }
}

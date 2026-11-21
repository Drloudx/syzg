/**
 * 持续伤害（DoT / 多跳技能）与召唤物独立输出结算模块。
 *
 * 严格依据 `1.7.15` `Assembly-CSharp` 与 `raw/` 配置：
 * - DoT：`Buff_Burning` / `Buff_Poisoning` / `DOT` 使用 `formType = 'buff'`、不能暴击，按 `buffTime / spTime` 结算总跳数；
 *   通道/地面持续技能（如 `QiWaSkill1`、`Hero051_Skill2`、`Hero053Skill2`、`Hero065Skill2`、`Hero030Skill2`）按实际跳数叠加整次施放总伤。
 * - 召唤物：`Unit.cs:2099-2130` 仅按比例继承召唤师攻防生命及显式配置的穿透比例（如德莉 `magicAtkPenPrecent: 1`），
 *   攻速 / 暴击 / 暴伤 / 浮动区间取自召唤物自身 `mon.json` 配置（`UnitAttribute.cs:609-614`），不继承召唤师装备增伤。
 */

import { calculateSegmentDamage } from './damageCalculator.js'

const VALID_ELEMENTS = ['fire', 'water', 'wind', 'earth']

/**
 * 经 `Assembly-CSharp` 与 `raw/skill.json` / `raw/buff.json` 核实的持续伤害与多跳技能规则表。
 * - `segmentTicks`: 按段下标指定单次施放命中跳数（缺省为 1）
 * - `segmentStacks`: 可叠加 DoT 的默认/最大层数（如修瓦莉蜂毒 3 层）
 * - `buffDurationSec`: Buff 类 DoT 的持续秒数（用于自动循环默认刷新间隔）
 * - `extraDots`: 主技能额外挂出的独立 Buff DoT（如斯卡莉安 `06103` 罪魂诅咒）
 */
export const SKILL_DOT_SPECS = {
  // 奇瓦·焚火冲击：QiWaSkill1.cs (totleTime=3s, spTime=0.49s, t=0 立即触发 1 次 -> 共 7 跳喷射 + 1 次火种引爆)
  '01902': {
    dotKind: 'channel',
    summaryLabel: '3s 喷射每 0.49s 1 跳（共 7 跳）+ 火种 1 段',
    segmentTicks: { 0: 7, 1: 1 },
  },
  // 阿莱克西娅·潮涌之奇迹：Hero051_Skill2.cs + raw/skill.json (durTime=3s, spTime=0.5s -> 6 跳)
  '05103': {
    dotKind: 'zone',
    summaryLabel: '3s 潮涌区域每 0.5s 1 跳（共 6 跳）',
    segmentTicks: { 0: 6 },
  },
  // 艾薇杜尔·凶灵刈割：Hero053Skill2.cs:161-179 (ground 0.31 每 0.5s 1 跳持续 3s = 6 跳 + 重击 3.25 × 1)
  '05303': {
    dotKind: 'zone',
    summaryLabel: '重击 1 段 + 3s 凶灵之炎每 0.5s 1 跳（共 6 跳）',
    segmentTicks: { 0: 6, 1: 1 },
  },
  // 乌尔勒·清扫指令：Hero065Skill2.cs (moveDis=7 over 6f, checkRange=2, damSp=0.5 -> 单点静止重叠约 3.43s ≈ 7 跳，满路径至多 10 跳)
  '06503': {
    dotKind: 'channel',
    summaryLabel: '7u 路径扫射每 0.5s 1 跳（对单静止约 7 跳，满路径至多 10 跳）',
    segmentTicks: { 0: 7 },
  },
  // 阿尔克丝·挑衅姿态：Hero030Skill2.cs:3 (RoarHitCount = 4)
  '03003': {
    dotKind: 'channel',
    summaryLabel: '2s 咆哮每 0.5s 1 跳（共 4 跳）',
    segmentTicks: { 0: 4 },
  },
  // 修瓦莉·蜂毒螯针：raw/buff.json hero069BeePoison (buffTime=5s, spTime=1s, maxLayPara=3)
  '06904': {
    dotKind: 'buff',
    summaryLabel: '蜂毒满层(3层)每秒 9%，持续 5s 共 5 跳',
    buffDurationSec: 5,
    segmentTicks: { 0: 5 },
    segmentStacks: { 0: 3 },
  },
  // 夏库塔拉·内心之焰：raw/buff.json hero008TalentBuff01 (buffTime=5s, spTime=1s, muPower=0.30)
  '00804': {
    dotKind: 'buff',
    summaryLabel: '灼烧每秒 30%（源码实值），持续 5s 共 5 跳',
    buffDurationSec: 5,
    segmentTicks: { 0: 5 },
  },
  // 波特温·钉刺箭袋：raw/buff.json mon_04704DotBuff (buffTime=3s, spTime=1s, muPower=0.50)
  '03104': {
    dotKind: 'buff',
    summaryLabel: '中毒每秒 50%，持续 3s 共 3 跳',
    buffDurationSec: 3,
    segmentTicks: { 0: 3 },
  },
  // 斯卡莉安·罪魂裂痕：砸地 + 怨魂外，附加 hero061Skill2CurseBuff（buffTime=5s, spTime=1s, 10% phyAtk earth form:buff）
  '06103': {
    dotKind: 'buff',
    summaryLabel: '附带「罪魂诅咒」每秒 10% 地属性 Buff 伤，持续 5s 共 5 跳',
    extraDots: [
      {
        name: '罪魂诅咒（Buff DoT）',
        damageType: 'phyAtk',
        elementType: 'earth',
        scaling: 'phyAtk',
        multiplier: 0.1,
        baseDamage: 0,
        ticks: 5,
      },
    ],
  },
}

/**
 * 召唤技能与天赋的构建期提取规格（数量/特判遵循对应 Skill/Buff C# 类）。
 */
export const SUMMON_SKILL_SPECS = {
  '06502': { count: 2, triggerIntervalSec: 0 }, // Hero065Skill1: Hit1+Hit2 各召唤 1 枚，maxCount=2
  '06504': { count: 1, triggerIntervalSec: 30, buffId: 'hero065Talent' },
  '06002': { copyMagicToPhy: true, permanent: true }, // Hero060Skill1: 1剑盾 + 2弓箭手，均取 self.magicAtk
  '02902': { count: 1, triggerIntervalSec: 0 },
  '03403': { count: 1, triggerIntervalSec: 0 },
  '02603': { count: 1, triggerIntervalSec: 0 },
  '07104': { count: 3, triggerIntervalSec: 120, buffId: 'hero071Talent', defaultDisabled: true }, // 低血被动默认关闭避免虚高
}

export function getSkillDotProfile(skillId) {
  return SKILL_DOT_SPECS[skillId] || null
}

/**
 * 计算某个技能/被动在 DoT 完整跳数（含附加 Buff DoT）下的单次施放总伤拆解。
 */
export function evaluateSkillDotSummary({
  skill,
  baseResult,
  attackerInput = {},
  targetInput = {},
  needFloat = false,
} = {}) {
  const segResults = Array.isArray(baseResult?.segments) ? baseResult.segments : []
  const segDefs = Array.isArray(skill?.segments) ? skill.segments : []
  const profile = skill?.dotProfile || getSkillDotProfile(skill?.id)

  const tickBreakdown = segResults.map((segRes, idx) => {
    const def = segDefs[idx] || {}
    const ticks = Math.max(1, Number(def.ticks ?? profile?.segmentTicks?.[idx] ?? 1))
    const stacks = Math.max(1, Number(def.stacks ?? profile?.segmentStacks?.[idx] ?? 1))
    const factor = ticks * stacks
    return {
      index: idx,
      ticks,
      stacks,
      factor,
      singleExpected: segRes.expected,
      totalNoCrit: segRes.noCrit.mid * factor,
      totalCrit: segRes.crit.mid * factor,
      totalExpected: segRes.expected * factor,
    }
  })

  const extraDotsDef = [
    ...(Array.isArray(profile?.extraDots) ? profile.extraDots : []),
    ...(Array.isArray(skill?.starExtraDots) ? skill.starExtraDots : []),
  ]
  const extraDotResults = extraDotsDef.map((ed) => {
    const res = calculateSegmentDamage({
      attacker: attackerInput,
      target: targetInput,
      segment: {
        damageType: ed.damageType || 'magicAtk',
        elementType: ed.elementType || 'none',
        scaling: ed.scaling || ed.damageType || 'magicAtk',
        multiplier: Number(ed.multiplier) || 0,
        baseDamage: Number(ed.baseDamage) || 0,
      },
      form: 'buff',
      allowCrit: false,
      needFloat: Boolean(needFloat),
    })
    const ticks = Math.max(1, Number(ed.ticks) || 1)
    return {
      name: ed.name || '持续伤害',
      ticks,
      singleNoCrit: res.noCrit.mid,
      singleExpected: res.expected,
      totalNoCrit: res.noCrit.mid * ticks,
      totalExpected: res.expected * ticks,
    }
  })

  const hasMultiTicks = tickBreakdown.some((t) => t.factor > 1) || extraDotResults.length > 0
  const sumTickField = (key) => tickBreakdown.reduce((s, t) => s + t[key], 0)
  const extraNoCritSum = extraDotResults.reduce((s, d) => s + d.totalNoCrit, 0)
  const extraExpSum = extraDotResults.reduce((s, d) => s + d.totalExpected, 0)

  const fullNoCrit = sumTickField('totalNoCrit') + extraNoCritSum
  const fullCrit = sumTickField('totalCrit') + extraExpSum
  const fullExpected = sumTickField('totalExpected') + extraExpSum
  const totalTicks = tickBreakdown.reduce((s, t) => s + t.ticks, 0)
    + extraDotResults.reduce((s, d) => s + d.ticks, 0)

  const starDotDesc = Array.isArray(skill?.starExtraDots) && skill.starExtraDots.length
    ? skill.starExtraDots.map((d) => `${d.name} ${d.ticks || 1} 跳`).join('、')
    : ''
  const combinedLabel = [profile?.summaryLabel, starDotDesc ? `含星阶附加：${starDotDesc}` : ''].filter(Boolean).join('；')

  return {
    hasDot: hasMultiTicks,
    dotKind: profile?.dotKind || (extraDotResults.length ? 'buff' : null),
    summaryLabel: combinedLabel,
    buffDurationSec: Number(profile?.buffDurationSec || 0),
    totalTicks,
    singleHitExpected: Number(baseResult?.expected || 0),
    fullNoCrit,
    fullCrit,
    fullExpected,
    tickBreakdown,
    extraDotResults,
  }
}

function buildSummonRecordFromConfig({
  monId,
  count,
  atkPercents,
  rawMon,
  rawSkillsMap,
  durtime = 0,
  cd = 0,
  phyAtkPenPercent = 0,
  magicAtkPenPercent = 0,
  copyMagicToPhy = false,
  defaultDisabled = false,
}) {
  if (!monId || !rawMon?.unitData || rawMon.unitData.noAtk) return null
  const skillRefs = Array.isArray(rawMon.skillList) ? rawMon.skillList : []
  const primaryRef = skillRefs[0]
  const monSkill = primaryRef?.skillId ? rawSkillsMap?.[primaryRef.skillId] : null
  const lv1 = monSkill?.levelData?.['1'] || Object.values(monSkill?.levelData || {})[0] || {}
  const hitEvent = (lv1.aniEvents || []).find((e) => e?.arg?.damage)
  const dmg = hitEvent?.arg?.damage || {}

  const u = rawMon.unitData
  const damageType = dmg.damageType === 'magicAtk' ? 'magicAtk' : 'phyAtk'
  const elementType = VALID_ELEMENTS.includes(dmg.elementType) ? dmg.elementType : 'none'
  const scaling = copyMagicToPhy ? 'magicAtk' : (dmg.muAddType || damageType)

  return {
    id: monId,
    name: rawMon.name || monId,
    count: Math.max(1, Number(count) || 1),
    durtime: Math.max(0, Number(durtime) || 0),
    cd: Math.max(0, Number(cd) || 0),
    atkSpeed: Number(u.atkSpeed || 0.5),
    crit: Number(u.crit || 0),
    critDam: Number(u.critDam ?? u.cirtDam ?? 125),
    floatMin: Number(u.atkFloatMin ?? 0.9),
    floatMax: Number(u.atkFloatMax ?? 1.1),
    damageType,
    elementType,
    scaling,
    multiplier: Number(dmg.muPower ?? 1),
    baseDamage: Number(dmg.baseDamage ?? 0),
    phyAtkPenPercent: Number(phyAtkPenPercent || 0),
    magicAtkPenPercent: Number(magicAtkPenPercent || 0),
    atkPercents,
    defaultDisabled: Boolean(defaultDisabled),
  }
}

/**
 * 在构建期从 `raw/skill.json`、`raw/buff.json` 与 `raw/mon.json` 提取主动技能/被动的召唤物攻击模型。
 */
export function extractSkillSummonsFromRaw({
  skillId,
  rawSkillsMap = {},
  buffDatas = {},
  monDatas = {},
} = {}) {
  const spec = SUMMON_SKILL_SPECS[skillId]
  if (!spec) return []

  // 被动召唤物通过 buff.para.summonData 读取（06504 驻守指令、07104 幽夜眷属）
  if (spec.buffId) {
    const buffPara = buffDatas?.[spec.buffId]?.para
    const sd = buffPara?.summonData
    if (!sd?.monTypeId) return []
    const cd = Number(buffPara.cdTime || buffPara.checkCd || 0)
    const rec = buildSummonRecordFromConfig({
      monId: sd.monTypeId,
      count: spec.count || sd.maxCount || 1,
      atkPercents: [Number(sd.atkPercent || 1)],
      rawMon: monDatas[sd.monTypeId],
      rawSkillsMap,
      durtime: Number(sd.durtime || 0),
      cd,
      phyAtkPenPercent: sd.phyAtkPenPrecent,
      magicAtkPenPercent: sd.magicAtkPenPrecent,
      defaultDisabled: spec.defaultDisabled,
    })
    return rec ? [rec] : []
  }

  const rawSkill = rawSkillsMap?.[skillId]
  if (!rawSkill?.levelData) return []
  const lvKeys = Object.keys(rawSkill.levelData).sort((a, b) => Number(a) - Number(b))
  if (!lvKeys.length) return []

  const firstLv = rawSkill.levelData[lvKeys[0]]
  const ev0 = (firstLv?.aniEvents || []).find((e) => e?.arg?.summonData || e?.arg?.longTwoSummonData || e?.arg?.nearOneSummonData)
  if (!ev0?.arg) return []

  // 德莉 `06002`：同时召唤 2 弓箭手 (longTwoSummonData) + 1 剑盾 (nearOneSummonData)
  if (ev0.arg.longTwoSummonData || ev0.arg.nearOneSummonData) {
    const out = []
    if (ev0.arg.longTwoSummonData) {
      const base = ev0.arg.longTwoSummonData
      const percents = lvKeys.map((k) => {
        const e = (rawSkill.levelData[k]?.aniEvents || []).find((x) => x?.arg?.longTwoSummonData)
        return Number(e?.arg?.longTwoSummonData?.atkPercent || base.atkPercent || 0)
      })
      const rec = buildSummonRecordFromConfig({
        monId: base.monTypeId,
        count: base.maxCount || 2,
        atkPercents: percents,
        rawMon: monDatas[base.monTypeId],
        rawSkillsMap,
        durtime: Number(base.durtime || 0),
        phyAtkPenPercent: base.phyAtkPenPrecent,
        magicAtkPenPercent: base.magicAtkPenPrecent,
        copyMagicToPhy: spec.copyMagicToPhy,
      })
      if (rec) out.push(rec)
    }
    if (ev0.arg.nearOneSummonData) {
      const base = ev0.arg.nearOneSummonData
      const percents = lvKeys.map((k) => {
        const e = (rawSkill.levelData[k]?.aniEvents || []).find((x) => x?.arg?.nearOneSummonData)
        return Number(e?.arg?.nearOneSummonData?.atkPercent || base.atkPercent || 0)
      })
      const rec = buildSummonRecordFromConfig({
        monId: base.monTypeId,
        count: base.maxCount || 1,
        atkPercents: percents,
        rawMon: monDatas[base.monTypeId],
        rawSkillsMap,
        durtime: Number(base.durtime || 0),
        phyAtkPenPercent: base.phyAtkPenPrecent,
        magicAtkPenPercent: base.magicAtkPenPrecent,
        copyMagicToPhy: spec.copyMagicToPhy,
      })
      if (rec) out.push(rec)
    }
    return out
  }

  const baseSd = ev0.arg.summonData
  const percents = lvKeys.map((k) => {
    const e = (rawSkill.levelData[k]?.aniEvents || []).find((x) => x?.arg?.summonData)
    return Number(e?.arg?.summonData?.atkPercent || baseSd.atkPercent || 0)
  })
  const rec = buildSummonRecordFromConfig({
    monId: baseSd.monTypeId,
    count: spec.count || baseSd.maxCount || 1,
    atkPercents: percents,
    rawMon: monDatas[baseSd.monTypeId],
    rawSkillsMap,
    durtime: Number(baseSd.durtime || 0),
    phyAtkPenPercent: baseSd.phyAtkPenPrecent,
    magicAtkPenPercent: baseSd.magicAtkPenPrecent,
  })
  return rec ? [rec] : []
}

/**
 * 结算某技能附带的所有召唤物的单次命中、单只攻速与存在期间总伤/覆盖率。
 */
export function evaluateSkillSummons({
  skill,
  levelIndex = 0,
  atk = {},
  tgt = {},
  effPhyAtkPct = 0,
  effMagicAtkPct = 0,
  effTgtPhyDefPct = 0,
  effTgtMagicDefPct = 0,
  effTgtUnitDamageAdd = 0,
  effectiveCd = 0,
  summonMods = {},
} = {}) {
  const summons = Array.isArray(skill?.summons) ? skill.summons : []
  if (!summons.length) return []

  const casterPhyAtk = (Number(atk.phyAtk) || 0) * (1 + effPhyAtkPct)
  const casterMagicAtk = (Number(atk.magicAtk) || 0) * (1 + effMagicAtkPct)
  const phyDef = (Number(tgt.phyDef) || 0) * Math.max(0, 1 + effTgtPhyDefPct)
  const magicDef = (Number(tgt.magicDef) || 0) * Math.max(0, 1 + effTgtMagicDefPct)

  const modUnitDamAdd = Number(summonMods?.summonUnitAtkDamAdd || 0)
  const modPhyAtkPct = Number(summonMods?.summonPhyAtkPct || 0)
  const modMagicAtkPct = Number(summonMods?.summonMagicAtkPct || 0)
  const modAtkSpeedPct = Number(summonMods?.summonAtkSpeedPct || 0)
  const modInheritAtkAdd = Number(summonMods?.summonInheritAtkAdd || 0)
  const modDurtimeAdd = Number(summonMods?.summonDurtimeAdd || 0)
  const modExtraCount = Number(summonMods?.summonExtraCount || 0)
  const expiryBlasts = Array.isArray(summonMods?.expiryBlasts) ? summonMods.expiryBlasts : []

  return summons.map((sum) => {
    const percs = Array.isArray(sum.atkPercents) && sum.atkPercents.length ? sum.atkPercents : [1]
    const safeIdx = Math.max(0, Math.min(percs.length - 1, Number(levelIndex) || 0))
    const baseAtkPct = Number(percs[safeIdx] ?? percs[percs.length - 1] ?? 1)
    const atkPct = Math.max(0, baseAtkPct + modInheritAtkAdd)

    const effectiveCount = Math.max(1, sum.count + modExtraCount)
    const sumPhyAtk = (sum.scaling === 'magicAtk' ? casterMagicAtk : casterPhyAtk) * atkPct * (1 + modPhyAtkPct)
    const sumMagicAtk = casterMagicAtk * atkPct * (1 + modMagicAtkPct)
    const effectiveAtkSpeed = Math.max(0.1, sum.atkSpeed * (1 + modAtkSpeedPct / 100))
    const effectiveDurtime = sum.durtime > 0 ? sum.durtime + modDurtimeAdd : 0

    const dType = sum.damageType === 'magicAtk' ? 'magicAtk' : 'phyAtk'
    const elKey = VALID_ELEMENTS.includes(sum.elementType) ? sum.elementType : 'none'

    const attackerObj = {
      level: Number(atk.level) || 50,
      phyAtk: sumPhyAtk,
      magicAtk: sumMagicAtk,
      crit: Number(sum.crit) || 0,
      critDam: Number(sum.critDam) || 125,
      phyAtkPen: ((Number(atk.phyAtkPenPct) || 0) / 100) * (Number(sum.phyAtkPenPercent) || 0),
      magicAtkPen: ((Number(atk.magicAtkPenPct) || 0) / 100) * (Number(sum.magicAtkPenPercent) || 0),
      floatMin: Number(sum.floatMin ?? 0.9),
      floatMax: Number(sum.floatMax ?? 1.1),
      unitAtkDamAdd: modUnitDamAdd,
      realDam: Boolean(atk.realDam),
    }

    const buildTargetFor = (tType, tElem) => ({
      level: Number(tgt.level) || 50,
      phyDef,
      magicDef,
      critRes: Number(tgt.critRes) || 0,
      damResPhy: tType === 'phyAtk' ? (Number(tgt.damResTypePct) || 0) / 100 : 0,
      damResMagic: tType === 'magicAtk' ? (Number(tgt.damResTypePct) || 0) / 100 : 0,
      damResElement: tElem !== 'none' ? { [tElem]: (Number(tgt.damResElementPct) || 0) / 100 } : {},
      unitDamageAdd: (Number(tgt.unitDamageAddPct) || 0) / 100 + effTgtUnitDamageAdd,
      unitPhyRes: tType === 'phyAtk' ? (Number(tgt.unitTypeResPct) || 0) / 100 : 0,
      unitMagicRes: tType === 'magicAtk' ? (Number(tgt.unitTypeResPct) || 0) / 100 : 0,
      unitElemRes: tElem !== 'none' ? { [tElem]: (Number(tgt.unitElemResPct) || 0) / 100 } : {},
    })

    const segRes = calculateSegmentDamage({
      attacker: attackerObj,
      target: buildTargetFor(dType, elKey),
      segment: {
        damageType: dType,
        elementType: elKey,
        scaling: dType,
        multiplier: Number(sum.multiplier ?? 1),
        baseDamage: Number(sum.baseDamage ?? 0),
      },
      form: 'normalAtk',
      allowCrit: Number(sum.crit) > 0,
      needFloat: true,
    })

    let expiryBlastPerUnit = 0
    for (const blast of expiryBlasts) {
      const bType = blast.damageType === 'magicAtk' ? 'magicAtk' : 'phyAtk'
      const bElem = VALID_ELEMENTS.includes(blast.elementType) ? blast.elementType : 'none'
      const bRes = calculateSegmentDamage({
        attacker: attackerObj,
        target: buildTargetFor(bType, bElem),
        segment: {
          damageType: bType,
          elementType: bElem,
          scaling: blast.scaling || bType,
          multiplier: Number(blast.multiplier ?? 0),
          baseDamage: 0,
        },
        form: 'skill',
        allowCrit: false,
        needFloat: false,
      })
      expiryBlastPerUnit += bRes.expected
    }

    const cd = sum.cd > 0 ? sum.cd : Number(effectiveCd || 0)
    const uptimeRatio = effectiveDurtime <= 0
      ? 1
      : (cd > 0 ? Math.min(1, effectiveDurtime / cd) : 1)
    const singleDurationHits = effectiveDurtime > 0
      ? effectiveDurtime * effectiveAtkSpeed
      : 0
    const expiryBlastDps = cd > 0 ? (effectiveCount * expiryBlastPerUnit) / cd : 0

    return {
      ...sum,
      baseCount: sum.count,
      count: effectiveCount,
      baseAtkPct,
      atkPct,
      baseDurtime: sum.durtime,
      durtime: effectiveDurtime,
      baseAtkSpeed: sum.atkSpeed,
      atkSpeed: Math.round(effectiveAtkSpeed * 100) / 100,
      effectiveAtkSpeed,
      summonUnitAtkDamAdd: modUnitDamAdd,
      summonPhyAtkPct: modPhyAtkPct,
      singleNoCrit: segRes.noCrit.mid,
      singleCrit: segRes.crit.mid,
      singleExpected: segRes.expected,
      critChance: segRes.critChance,
      uptimeRatio,
      singleCastHits: singleDurationHits,
      expiryBlastPerUnit,
      expiryBlastDps,
      singleCastExpected: singleDurationHits * segRes.expected * effectiveCount + effectiveCount * expiryBlastPerUnit,
      steadyDps: effectiveCount * uptimeRatio * effectiveAtkSpeed * segRes.expected + expiryBlastDps,
    }
  })
}

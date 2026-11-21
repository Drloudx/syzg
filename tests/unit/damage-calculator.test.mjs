import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  calcDefenseK,
  calcLevelSuppression,
  calcNetCritChance,
  calculateSegmentDamage,
  calculateSkillDamage,
  truncInt,
} from '../../src/utils/damageCalculator.js'
import { parseMonsterWeakness } from '../../src/utils/damageCalcData.js'
import { aggregateDamageEffects, isEffectApplicable } from '../../src/utils/damageEffects.js'
import { applyStarTransformsToSkill, calculateHeroStarEffects } from '../../src/utils/heroStarsDamage.js'
import { validateResource } from '../../src/utils/resourceSchemas.js'

test('truncInt 向零截断（不四舍五入、负数不向下取整）', () => {
  assert.equal(truncInt(123.99), 123)
  assert.equal(truncInt(-1.8), -1)
})

test('物理与魔法防御常数 K(L) 与 COMBAT_FORMULAS 口径表一致', () => {
  assert.ok(Math.abs(calcDefenseK('phyAtk', 1) - 397.8615) < 1e-4)
  assert.ok(Math.abs(calcDefenseK('magicAtk', 1) - 325.5201) < 1e-4)
  assert.ok(Math.abs(calcDefenseK('phyAtk', 20) - 1502.36) < 1e-3)
  assert.ok(Math.abs(calcDefenseK('magicAtk', 20) - 1229.20) < 1e-3)
  assert.ok(Math.abs(calcDefenseK('phyAtk', 100) - 11003.88) < 1e-3)
  assert.ok(Math.abs(calcDefenseK('magicAtk', 100) - 9002.88) < 1e-3)
})

test('等级压制仅对高等级目标生效且 16 级起封顶 0.5', () => {
  assert.equal(calcLevelSuppression(60, 40), 1)
  assert.equal(calcLevelSuppression(60, 60), 1)
  assert.ok(Math.abs(calcLevelSuppression(60, 65) - (1 - 0.008 * Math.pow(5, 1.5))) < 1e-6)
  assert.equal(calcLevelSuppression(60, 76), 0.5)
  assert.equal(calcLevelSuppression(60, 100), 0.5)
})

test('第一增减伤区同区相加：火增伤 20% + 火弱点 -30% 合成 ×1.50（非连乘 ×1.56）', () => {
  const res = calculateSegmentDamage({
    attacker: { level: 60, magicAtk: 1000, damAddElement: { fire: 0.2 } },
    target: { level: 60, magicDef: 0, damResElement: { fire: -0.3 } },
    segment: { damageType: 'magicAtk', elementType: 'fire', scaling: 'magicAtk', multiplier: 1, baseDamage: 0 },
    form: 'skill',
    allowCrit: false,
    needFloat: false,
  })
  assert.equal(res.noCrit.mid, 1500)
  assert.ok(Math.abs(res.steps.zone1Mult - 1.5) < 1e-9)
})

test('真实伤害 realDam 跳过防御且 scaling=auto 取物/魔攻较大值', () => {
  const normalRes = calculateSegmentDamage({
    attacker: { level: 20, phyAtk: 1000, magicAtk: 2000, realDam: false },
    target: { level: 20, magicDef: 1229.20 },
    segment: { damageType: 'magicAtk', elementType: 'none', scaling: 'auto', multiplier: 1, baseDamage: 0 },
    form: 'skill',
    allowCrit: false,
    needFloat: false,
  })
  // 有效防御 == K(20) 时减伤 50%
  assert.equal(normalRes.noCrit.mid, 1000)

  const trueDamRes = calculateSegmentDamage({
    attacker: { level: 20, phyAtk: 1000, magicAtk: 2000, realDam: true },
    target: { level: 20, magicDef: 1229.20 },
    segment: { damageType: 'magicAtk', elementType: 'none', scaling: 'auto', multiplier: 1, baseDamage: 0 },
    form: 'skill',
    allowCrit: false,
    needFloat: false,
  })
  assert.equal(trueDamRes.noCrit.mid, 2000)
})

test('1.7.15 暴击判定与 realCrit / 技能禁止暴击 / 浮动首次截断', () => {
  assert.equal(calcNetCritChance({ allowCrit: false, realCrit: false, crit: 100, critRes: 0 }), 0)
  assert.equal(calcNetCritChance({ allowCrit: false, realCrit: true, crit: 0, critRes: 50 }), 1)
  assert.ok(Math.abs(calcNetCritChance({ allowCrit: true, realCrit: false, crit: 35, critRes: 15 }) - 0.2) < 1e-9)

  const res = calculateSegmentDamage({
    attacker: {
      level: 60,
      phyAtk: 1000,
      crit: 50,
      critDam: 150,
      floatMin: 0.8,
      floatMax: 1.2,
      unitNormalDamAdd: 0.2,
    },
    target: { level: 60, phyDef: 0, critRes: 0 },
    segment: { damageType: 'phyAtk', elementType: 'none', scaling: 'phyAtk', multiplier: 1, baseDamage: 0 },
    form: 'normalAtk',
    allowCrit: true,
    needFloat: true,
  })
  assert.equal(res.noCrit.min, 960)
  assert.equal(res.noCrit.max, 1440)
  assert.equal(res.crit.min, 1440)
  assert.equal(res.crit.max, 2160)
  assert.equal(res.expected, 1500)
})

test('保底 1 伤校验与怪物弱点正则解析', () => {
  const minRes = calculateSegmentDamage({
    attacker: { level: 1, phyAtk: 1 },
    target: { level: 100, phyDef: 99999, unitPhyRes: 1 },
    segment: { damageType: 'phyAtk', elementType: 'none', scaling: 'phyAtk', multiplier: 1, baseDamage: 0 },
    form: 'skill',
    allowCrit: false,
    needFloat: false,
  })
  assert.equal(minRes.noCrit.mid, 1)

  assert.deepEqual(parseMonsterWeakness('受到火属性伤害增加{20%}'), { weakElement: 'fire', weakPct: 0.2 })
  assert.deepEqual(parseMonsterWeakness('受到风属性伤害增加{30%}'), { weakElement: 'wind', weakPct: 0.3 })
  assert.deepEqual(parseMonsterWeakness(''), { weakElement: null, weakPct: 0 })
})

test('damage-calc.json 产物通过 schema 校验且支持整招多段技能计算', () => {
  const data = JSON.parse(readFileSync('public/data/parsed/damage-calc.json', 'utf8'))
  assert.equal(validateResource('data/parsed/damage-calc.json', data), true)
  assert.equal(data.heroes.length, 40)
  // 黑名单地区（如黑森林）怪物不应混入伤害计算器预设列表
  assert.equal(data.monsters.some((m) => m.name === '吵吵蕈'), false)

  const qiwa = data.heroes.find((h) => h.name === '奇瓦')
  assert.ok(qiwa)
  assert.equal(qiwa.img, 'chara019_0')
  assert.equal(qiwa.talentSkills.length, 1)
  const passiveSkill = qiwa.talentSkills[0]
  assert.equal(passiveSkill.name, '火种引燃')
  assert.equal(passiveSkill.isTalent, true)
  const passiveRes = calculateSkillDamage({
    attacker: { level: 60, magicAtk: 1000, unitSkillDamAdd: 0.5 },
    target: { level: 60, magicDef: 0 },
    skill: passiveSkill,
    levelIndex: 0,
  })
  // form='buff' 不吃 unitSkillDamAdd，60% × 1000 = 600
  assert.equal(passiveRes.noCrit.mid, 600)

  const fireImpact = qiwa.skills.find((s) => s.name === '焚火冲击')
  assert.ok(fireImpact)
  assert.equal(fireImpact.segments.length, 2)

  const skillRes = calculateSkillDamage({
    attacker: { level: 60, magicAtk: 1000, floatMin: qiwa.floatMin, floatMax: qiwa.floatMax },
    target: { level: 60, magicDef: 0 },
    skill: fireImpact,
    levelIndex: 0,
  })
  assert.equal(skillRes.allowCrit, false)
  assert.equal(skillRes.segments.length, 2)
  assert.equal(skillRes.noCrit.mid, 1600)
})

test('全角色被动天赋已完成源码核实且倍率与形态口径准确', () => {
  const data = JSON.parse(readFileSync('public/data/parsed/damage-calc.json', 'utf8'))
  const findTalent = (heroName) => {
    const hero = data.heroes.find((h) => h.name === heroName)
    assert.ok(hero, `缺少角色 ${heroName}`)
    assert.equal(hero.talentSkills.length, 1)
    return hero.talentSkills[0]
  }

  // 0 个未核实（pending）天赋
  const pendingTalents = data.heroes.flatMap((h) => (h.talentSkills || []).filter((t) => t.reviewStatus === 'pending'))
  assert.equal(pendingTalents.length, 0)

  // 纯增益类被动不应有误提出来的假伤害段
  assert.equal(findTalent('诺姿').segments.length, 0)
  assert.equal(findTalent('皮塔').segments.length, 0)

  // 去伪/合并/补全后的伤害被动断言
  const edith = findTalent('埃迪蒂')
  assert.equal(edith.form, 'normalAtk')
  assert.equal(edith.crit, 'yes')
  assert.equal(edith.segments.length, 1)
  assert.equal(edith.segments[0].elementType, 'water')
  assert.deepEqual(edith.levels[0].segments, [[1, 0]])

  const shakuntala = findTalent('夏库塔拉')
  assert.equal(shakuntala.form, 'buff')
  assert.equal(shakuntala.segments.length, 1)
  assert.equal(shakuntala.segments[0].elementType, 'fire')
  assert.deepEqual(shakuntala.levels[0].segments, [[0.3, 0]])

  const aug = findTalent('奥格')
  assert.equal(aug.form, 'skill')
  assert.equal(aug.crit, 'no')
  assert.equal(aug.segments.length, 1)
  assert.equal(aug.segments[0].damageType, 'phyAtk')
  assert.equal(aug.segments[0].elementType, 'water')
  assert.deepEqual(aug.levels[0].segments, [[0.75, 0]])

  const galatea = findTalent('伽拉忒亚')
  assert.equal(galatea.form, 'buff')
  assert.equal(galatea.crit, 'no')
  assert.equal(galatea.segments[0].scaling, 'phyAtk')
  assert.deepEqual(galatea.levels[0].segments, [[1.5, 0]])

  const garrit = findTalent('嘉莉缇')
  assert.equal(garrit.form, 'skill')
  assert.equal(garrit.crit, 'no')
  assert.deepEqual(garrit.levels[0].segments, [[0.8, 0]])

  const alkes = findTalent('阿尔克丝')
  assert.equal(alkes.form, 'normalAtk')
  assert.equal(alkes.crit, 'yes')
  assert.equal(alkes.segments[0].elementType, 'earth')
  assert.deepEqual(alkes.levels[0].segments, [[2, 0]])

  const potwin = findTalent('波特温')
  assert.equal(potwin.form, 'buff')
  assert.equal(potwin.crit, 'no')
  assert.deepEqual(potwin.levels[0].segments, [[0.5, 0]])

  const elphipa = findTalent('艾尔菲帕')
  assert.equal(elphipa.form, 'buff')
  assert.equal(elphipa.crit, 'no')
  assert.deepEqual(elphipa.levels[0].segments, [[0.65, 0]])

  const adila = findTalent('阿迪拉')
  assert.equal(adila.form, 'normalAtk')
  assert.equal(adila.crit, 'yes')
  assert.equal(adila.segments[0].elementType, 'wind')
  assert.deepEqual(adila.levels[0].segments, [[0.8, 0], [0.4, 0]])

  const xiuwali = findTalent('修瓦莉')
  assert.equal(xiuwali.form, 'buff')
  assert.equal(xiuwali.crit, 'no')
  assert.equal(xiuwali.segments[0].elementType, 'earth')
  assert.deepEqual(xiuwali.levels[0].segments, [[0.03, 0]])

  const upa = findTalent('乌帕·萝特')
  assert.equal(upa.form, 'normalAtk')
  assert.equal(upa.crit, 'no')
  assert.equal(upa.segments.length, 2)
  assert.equal(upa.segments[1].scaling, 'maxHp')
  assert.deepEqual(upa.levels[0].segments, [[1, 0], [0.03, 0]])
})

test('魔物特性、套装与装备词条特效目录已过滤隐藏装备且乘区归类与 C# 源码一致', () => {
  const data = JSON.parse(readFileSync('public/data/parsed/damage-calc.json', 'utf8'))
  assert.equal(validateResource('data/parsed/damage-calc.json', data), true)
  assert.equal(data.effects.pets.length, 22)
  assert.equal(data.effects.suits.length, 8)
  assert.equal(data.effects.equips.length, 5)

  // 已隐藏的 4/5 阶套装与 SP2/4/5 阶词条不得进入目录
  const suitIds = new Set(data.effects.suits.map((s) => s.id))
  const equipIds = new Set(data.effects.equips.map((e) => e.id))
  for (const hiddenSuitId of ['suit_413', 'suit_423', 'suit_433', 'suit_523']) {
    assert.equal(suitIds.has(hiddenSuitId), false)
  }
  for (const hiddenEquipId of ['equip_sp0203_1', 'equip_403', 'equip_404', 'equip_405', 'equip_501', 'equip_502', 'equip_504']) {
    assert.equal(equipIds.has(hiddenEquipId), false)
  }

  // 1. 事件独立连乘（荆棘1件 +7% 与 荒原2件 +13% 与 荆棘词条3层 +9% 连乘）+ 臭臭蕈 Lv.7 + 吵吵蕈联动（+36% skillDam, +15% crit）
  const skillMods = aggregateDamageEffects(
    data.effects,
    {
      petId: 'pet_017',
      petLevel: 7,
      petSynergy: true,
      suitIds: ['suit_111', 'suit_122', 'suit_133', 'suit_333'],
      equipIds: ['equip_sp0102_1', 'equip_014', 'equip_301', 'equip_305'],
      equipStacks: { equip_301: 3 },
    },
    { form: 'skill', damageType: 'magicAtk', elementType: 'fire' },
  )
  assert.ok(Math.abs(skillMods.unitSkillDamAdd - 0.36) < 1e-6)
  assert.equal(skillMods.crit, 15)
  assert.ok(Math.abs(skillMods.extraEventMult - 1.07 * 1.13 * 1.09) < 1e-6)
  assert.ok(Math.abs(skillMods.damAddMagic - 0.2) < 1e-6) // 湖水3件进入一区 magicAtk
  assert.ok(Math.abs(skillMods.unitElemDamAdd.fire - 0.15) < 1e-6) // 高温进入火属性独立乘区
  assert.ok(Math.abs(skillMods.phyAtkPct - 0.1) < 1e-6) // 魔爪 +10% 进图物攻
  assert.equal(skillMods.damAddElement.earth, 0) // 地之灵在火系技能不生效

  // 2. 切换到普通攻击：技能限定项（荆棘1/荒原2/臭臭蕈）失活，麦田3件（×1.40）+ 射水杜吉芽 Lv.7（×3.60）+ 山岩3件（realCrit）+ 罪孽重锤（×1.20）激活
  const normalMods = aggregateDamageEffects(
    data.effects,
    {
      petId: 'pet_062',
      petLevel: 7,
      suitIds: ['suit_111', 'suit_133', 'suit_223'],
      equipIds: ['equip_sp0103_1'],
    },
    { form: 'normalAtk', damageType: 'phyAtk', elementType: 'earth' },
  )
  assert.equal(normalMods.realCrit, true)
  assert.ok(Math.abs(normalMods.extraEventMult - 1.4 * 3.6 * 1.2) < 1e-6)
  assert.equal(isEffectApplicable({ when: { form: 'skill' } }, { form: 'normalAtk' }), false)

  // 3. 验证 tagDamAdd 与 tgtPhyDefPct 聚合及普攻 D0 之后生效（CombatPanel:6686）
  const syntheticMods = aggregateDamageEffects(
    {
      equips: [
        { id: 'syn_def', maxStacks: 5, when: { always: true }, mods: { tgtPhyDefPct: -0.02 } },
        { id: 'syn_tag', maxStacks: 1, when: { form: 'normalAtk' }, mods: { tagDamAdd: 0.13 } },
      ],
    },
    { equipIds: ['syn_def', 'syn_tag'], equipStacks: { syn_def: 5 } },
    { form: 'normalAtk', damageType: 'phyAtk', elementType: 'none' },
  )
  assert.ok(Math.abs(syntheticMods.tgtPhyDefPct - (-0.10)) < 1e-6)
  assert.ok(Math.abs(syntheticMods.tagDamAdd - 0.13) < 1e-6)
  const baseNormal = calculateSegmentDamage({
    attacker: { level: 50, phyAtk: 1000 },
    target: { level: 50, phyDef: 0 },
    segment: { damageType: 'phyAtk', elementType: 'none', scaling: 'phyAtk', multiplier: 1, baseDamage: 0 },
    form: 'normalAtk',
    allowCrit: false,
    needFloat: false,
  })
  const tagNormal = calculateSegmentDamage({
    attacker: { level: 50, phyAtk: 1000, tagDamAdd: syntheticMods.tagDamAdd },
    target: { level: 50, phyDef: 0 },
    segment: { damageType: 'phyAtk', elementType: 'none', scaling: 'phyAtk', multiplier: 1, baseDamage: 0 },
    form: 'normalAtk',
    allowCrit: false,
    needFloat: false,
  })
  assert.equal(baseNormal.noCrit.mid, 1000)
  assert.equal(tagNormal.noCrit.mid, 1130)
})

test('全角色 160 枚星阶技能（命座）覆盖完整且额外段/倍率/首段必暴/破防结算精确', () => {
  const data = JSON.parse(readFileSync('public/data/parsed/damage-calc.json', 'utf8'))
  const totalStars = data.heroes.reduce((sum, h) => sum + (h.starSkills?.length || 0), 0)
  assert.equal(totalStars, 160)

  // 1. 奇瓦：01908（4星）在火种引燃 01904 追加 30% 段；01906 Lv.4 在浮游烈焰 01903 走事件连乘 ×1.24；01907 Lv.4 ×6 叠 18% 魔攻
  const qiwa = data.heroes.find((h) => h.name === '奇瓦')
  const qiwaTalent = qiwa.talentSkills[0]
  const qiwaStarsTalent = calculateHeroStarEffects(
    qiwa,
    { starLevels: { '01907': 4, '01908': 1 }, starStacks: { '01907': 6 } },
    qiwaTalent,
    { form: qiwaTalent.form, damageType: 'magicAtk', elementType: 'fire' },
  )
  assert.ok(Math.abs(qiwaStarsTalent.magicAtkPct - 0.18) < 1e-6)
  assert.equal(qiwaStarsTalent.extraSegs.length, 1)
  const txQiwaTalent = applyStarTransformsToSkill(qiwaTalent, 0, qiwaStarsTalent)
  assert.equal(txQiwaTalent.segments.length, 2)
  assert.deepEqual(txQiwaTalent.levels[0].segments, [[0.6, 0], [0.3, 0]])

  // 2. 伽拉忒亚：06408（4星）把火剑5层爆发 muPower 直接 +0.70（1.50 -> 2.20），不是 ×1.70
  const galatea = data.heroes.find((h) => h.name === '伽拉忒亚')
  const galTalent = galatea.talentSkills[0]
  const galStars = calculateHeroStarEffects(
    galatea,
    { starLevels: { '06408': 1 } },
    galTalent,
    { form: galTalent.form, damageType: 'magicAtk', elementType: 'fire' },
  )
  const txGalTalent = applyStarTransformsToSkill(galTalent, 0, galStars)
  assert.ok(Math.abs(txGalTalent.levels[0].segments[0][0] - 2.2) < 1e-6)

  // 3. 修瓦莉：06907（3星 Lv.4）给骑士连击 06903 倍率 ×1.50 且仅第 1 段强制必暴（第 2 段不可暴击）
  const xiuwali = data.heroes.find((h) => h.name === '修瓦莉')
  const xiuSkill2 = xiuwali.skills.find((s) => s.id === '06903')
  const xiuStars = calculateHeroStarEffects(
    xiuwali,
    { starLevels: { '06907': 4 } },
    xiuSkill2,
    { form: 'skill', damageType: 'phyAtk', elementType: 'earth' },
  )
  const txXiuSkill2 = applyStarTransformsToSkill(xiuSkill2, xiuSkill2.levels.length - 1, xiuStars)
  const xiuRes = calculateSkillDamage({
    attacker: { level: 60, phyAtk: 1000, crit: 0, critDam: 150 },
    target: { level: 60, phyDef: 0 },
    skill: txXiuSkill2,
    levelIndex: xiuSkill2.levels.length - 1,
  })
  assert.equal(xiuRes.segments.length, 2)
  assert.equal(xiuRes.segments[0].critChance, 1)
  assert.equal(xiuRes.segments[1].critChance, 0)
  assert.equal(xiuRes.expected, xiuRes.segments[0].crit.mid + xiuRes.segments[1].noCrit.mid)

  // 4. 梅莉莉：02705 解锁 02702 暴击 +60 暴伤；02708 给 02701 追加 100% 无视防御风属性段
  const melili = data.heroes.find((h) => h.name === '梅莉莉')
  const melNormal = melili.skills.find((s) => s.id === '02701')
  const melSkill1 = melili.skills.find((s) => s.id === '02702')
  const melStarsOnSkill1 = calculateHeroStarEffects(melili, { starLevels: { '02705': 4 } }, melSkill1, { form: 'skill' })
  assert.equal(melStarsOnSkill1.allowCritOverrideFromStar, true)
  assert.equal(melStarsOnSkill1.critDam, 60)

  const melStarsOnNormal = calculateHeroStarEffects(melili, { starLevels: { '02708': 1 } }, melNormal, { form: 'normalAtk' })
  const txMelNormal = applyStarTransformsToSkill(melNormal, 0, melStarsOnNormal)
  const melNormalRes = calculateSkillDamage({
    attacker: { level: 60, phyAtk: 1000, crit: 0, needFloat: false },
    target: { level: 60, phyDef: 10000 },
    skill: txMelNormal,
    levelIndex: 0,
    needFloatOverride: false,
  })
  assert.equal(melNormalRes.segments.length, 2)
  assert.equal(melNormalRes.segments[1].noCrit.mid, 1000) // 第2段 100% ignoreDef 完整打穿 10000 物防

  // 5. 米托拉：new_00206 Lv.4 给 new00203 倍率 ×1.30 并施加目标双防 -25%；panelStatic（如 03207）不重复叠加属性
  const mituola = data.heroes.find((h) => h.name === '米托拉')
  const mitSkill2 = mituola.skills.find((s) => s.id === 'new00203')
  const mitStars = calculateHeroStarEffects(mituola, { starLevels: { new_00206: 4, new_00207: 4 } }, mitSkill2, { form: 'skill' })
  assert.ok(Math.abs(mitStars.skillMultScale - 1.3) < 1e-6)
  assert.ok(Math.abs(mitStars.tgtPhyDefPct - (-0.25)) < 1e-6)
  assert.ok(Math.abs(mitStars.tgtMagicDefPct - (-0.25)) < 1e-6)
  assert.equal(mitStars.activeCount, 2)
})

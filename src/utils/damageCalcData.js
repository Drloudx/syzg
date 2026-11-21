/**
 * 角色伤害计算器的精简数据提取与常量。
 *
 * 与 `scripts/dev/build-damage-calc-data.mjs` 共用，避免运行时下载整份 `heroes.json` (3 MB) 与
 * `monsters.json` (1 MB)。不参与游戏结算引擎 —— 纯数值计算在 `damageCalculator.js`。
 */

const WEAK_ELEMENT_MAP = {
  火: 'fire',
  水: 'water',
  风: 'wind',
  地: 'earth',
}

/**
 * 解析怪物弱点文案（如 "受到火属性伤害增加{20%}"）为第一增减伤区的负抗性比例。
 * @param {string} weakAttDes
 * @returns {{ weakElement: string | null, weakPct: number }}
 */
export function parseMonsterWeakness(weakAttDes) {
  const text = String(weakAttDes || '')
  const match = /受到([火水风地])属性伤害增加\{?\s*(\d+(?:\.\d+)?)%\s*\}?/.exec(text)
  if (!match) return { weakElement: null, weakPct: 0 }
  return {
    weakElement: WEAK_ELEMENT_MAP[match[1]] || null,
    weakPct: Number(match[2]) / 100,
  }
}

/**
 * 提取单个技能或被动天赋的伤害配置与各等级倍率。
 * @param {object} skill
 * @param {{ isTalent?: boolean }} [options]
 */
function toDamageSkillRecord(skill, { isTalent = false } = {}) {
  const levelsRaw = Array.isArray(skill?.levelData) ? skill.levelData : []
  const baseMech = levelsRaw[0]?.mechanics || {}
  const baseDam = baseMech.damage || {}
  const baseSegs = Array.isArray(baseDam.segments) ? baseDam.segments : []
  const rawFormLabel = baseDam.formLabel || (skill?.type === 'normal' ? '普通攻击' : '技能伤害')

  return {
    id: skill.id,
    name: skill.name || '',
    type: isTalent ? 'talent' : String(skill.type || ''),
    isTalent: Boolean(isTalent),
    icon: skill.icon || '',
    maxLevel: Number(skill.maxLevel || levelsRaw.length || 1),
    form: isTalent ? (baseDam.form || 'talent') : (baseDam.form || (skill.type === 'normal' ? 'normalAtk' : 'skill')),
    formLabel: isTalent
      ? (baseSegs.length ? `被动·${rawFormLabel}` : '被动天赋')
      : rawFormLabel,
    crit: baseDam.crit === 'yes' ? 'yes' : 'no',
    types: Array.isArray(baseDam.types) ? baseDam.types : [],
    elements: Array.isArray(baseDam.elements) ? baseDam.elements : [],
    applies: Array.isArray(baseMech.bonuses?.applies) ? baseMech.bonuses.applies : [],
    outcomes: Array.isArray(baseMech.outcomes) ? baseMech.outcomes : [],
    reviewStatus: baseMech.reviewStatus || 'unknown',
    notes: Array.isArray(baseMech.notes) ? baseMech.notes : [],
    segments: baseSegs.map((seg) => ({
      damageType: seg.damageType || 'phyAtk',
      elementType: seg.elementType || 'none',
      scaling: seg.scaling || seg.damageType || 'phyAtk',
    })),
    levels: levelsRaw.map((lv, idx) => {
      const segs = lv?.mechanics?.damage?.segments || baseSegs
      return {
        level: Number(lv?.level || idx + 1),
        cd: Number(lv?.cd || 0),
        cost: Number(lv?.cost || 0),
        des: String(lv?.des || ''),
        segments: segs.map((seg) => [
          Number(seg?.multiplier || 0),
          Number(seg?.baseDamage || 0),
        ]),
      }
    }),
  }
}

/**
 * 将完整英雄条目压缩为伤害计算器所需精简记录（保留技能与被动天赋倍率、立绘 img 及基础暴伤/浮动）。
 * @param {object} hero
 */
export function toDamageHeroRecord(hero) {
  const unit = hero?.unitData || {}
  const skills = (Array.isArray(hero?.skills) ? hero.skills : [])
    .map((skill) => toDamageSkillRecord(skill))
  const talentSkills = (Array.isArray(hero?.talentSkills) ? hero.talentSkills : [])
    .map((talent) => toDamageSkillRecord(talent, { isTalent: true }))

  return {
    id: hero.id,
    name: hero.name,
    icon: hero.icon || '',
    img: hero.img || '',
    rare: Number(hero.rare || 0),
    jobName: hero.jobName || '',
    elementName: hero.elementName || '',
    floatMin: Number(unit.atkFloatMin ?? 0.9),
    floatMax: Number(unit.atkFloatMax ?? 1.1),
    baseCritDam: Number(unit.critDam ?? 150),
    baseAtkSpeed: Number(unit.atkSpeed ?? 0.7),
    skills,
    talentSkills,
  }
}

/**
 * 从怪物图鉴条目的各形态中提取计算器可用的目标预设（按名称+防抗去重，避免冗余克隆）。
 * @param {object} monster
 */
export function toDamageMonsterForms(monster) {
  const forms = Array.isArray(monster?.forms) ? monster.forms : []
  const seen = new Set()
  const out = []

  for (const form of forms) {
    const raw = form?.rawStats
    if (!raw) continue
    const phyDef = Number(raw.phyDef || 0)
    const magicDef = Number(raw.magicDef || 0)
    const critRes = Number(raw.critRes || 0)
    const { weakElement, weakPct } = parseMonsterWeakness(form.weakAttDes)
    const label = form.tabLabel && form.tabLabel !== monster.name
      ? `${monster.name}（${form.tabLabel}）`
      : (form.name || monster.name)
    const dedupeKey = `${label}|${phyDef}|${magicDef}|${critRes}|${weakElement || ''}|${weakPct}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    out.push({
      id: String(form.id || monster.id),
      name: label,
      icon: monster.icon || '',
      monRank: Number(form.monRank || 1),
      baseLevel: Number(form.level || 1),
      phyDef,
      magicDef,
      critRes,
      weakElement,
      weakPct,
      weakAttDes: form.weakAttDes || '',
    })
  }

  return out
}

/**
 * 提取怪物等级强度系数映射 `{ "1": 1, "20": 1.85, ... }`。
 * @param {object} monLevelStrengthJson
 */
export function extractLevelStrengthMap(monLevelStrengthJson) {
  const src = monLevelStrengthJson?.datas?.monLevelStrength || monLevelStrengthJson?.monLevelStrength || {}
  const map = {}
  for (const [lv, entry] of Object.entries(src)) {
    const coeff = Number(entry?.coefficient)
    if (Number.isFinite(coeff) && coeff > 0) {
      map[lv] = coeff
    }
  }
  return map
}

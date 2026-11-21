/**
 * 全角色 160 枚星阶技能（命座）的构建期提取与运行时乘区/技能改写聚合。
 *
 * 严格按 1.7.15 Assembly-CSharp `*Star*.cs` 核对口径：
 * - panelStatic（raw/skillTrigger buffEffect 为空，即 HeroBattleAttributeGroup.heroStarSkill_*）：
 *   已在游戏角色面板白字中体现，计算器仅展示说明、不重复叠加；
 * - utility：护盾、回血、回蓝、减伤、冷缩、召唤物持续等非直伤增幅机制，标注说明；
 * - combat：实战进图激活的独立乘区、技能倍率乘算（muPower *= 1+rate）、额外伤害段、必暴、暴伤、战斗加攻、目标降防等。
 */
import { isEffectApplicable } from './damageEffects.js'

const ELEM_ZH_TO_EN = {
  火: 'fire',
  水: 'water',
  风: 'wind',
  地: 'earth',
}

function stripBraces(text) {
  return String(text || '').replace(/\{([^}]*)\}/g, '$1').trim()
}

function num(val, fallback = 0) {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

function round4(val) {
  return Math.round(num(val) * 10000) / 10000
}

function normElem(el) {
  if (!el) return 'none'
  return ELEM_ZH_TO_EN[el] || el
}

function toSeg(damageInfo, extra = {}) {
  if (!damageInfo) return null
  return {
    damageType: damageInfo.damageType || 'phyAtk',
    elementType: normElem(damageInfo.elementType),
    scaling: damageInfo.muAddType || damageInfo.damageType || 'phyAtk',
    multiplier: round4(damageInfo.muPower),
    baseDamage: num(damageInfo.baseDamage),
    ...extra,
  }
}

/**
 * 160 枚星阶中真正参与「伤害数值计算」的战斗向规则表（按星阶 ID 索引）。
 * 未列入的 ID 根据是否有 buffId / buffEffect 自动识别为 panelStatic（-）或 utility。
 */
const COMBAT_STAR_EXTRACTORS = {
  // ===== 希尔 001 =====
  '00106': {
    label: '普攻对眩晕标签增伤',
    when: { form: 'normalAtk' },
    extract: (p) => ({ mods: { tagDamAdd: round4(p.addDamage) }, badge: `普攻对眩晕+${Math.round(num(p.addDamage) * 100)}%` }),
  },
  '00107': {
    label: '技能1命中降目标双防',
    when: { always: true },
    extract: (p, buffs) => {
      const val = num(buffs[p.addBuff]?.para?.value)
      return { mods: { tgtPhyDefPct: val, tgtMagicDefPct: val }, badge: `目标双防${Math.round(val * 100)}%` }
    },
  },

  // ===== 茜塔 005 =====
  '00505': {
    label: '技能1事件独立连乘',
    when: { skillId: '00502' },
    extract: (p) => ({ mods: { eventMult: round4(p.skillDamAdd) }, badge: `狂斧一击×${(1 + num(p.skillDamAdd)).toFixed(2)}` }),
  },

  // ===== 拉碧丝 007 =====
  '00707': {
    label: '技能2附加友方全伤增益',
    when: { always: true },
    extract: (p, buffs) => {
      const val = round4(buffs[p.addBuffId]?.para?.damAddRate)
      return { mods: { unitAtkDamAdd: val }, badge: `通用全伤+${Math.round(val * 100)}%` }
    },
  },

  // ===== 夏库塔拉 008 =====
  '00805': {
    label: '技能1倍率提升',
    when: { skillId: '00802' },
    extract: (p) => ({ skillMultScale: round4(p.skill1DamAddRate), badge: `妖炎风暴倍率+${Math.round(num(p.skill1DamAddRate) * 100)}%` }),
  },
  '00806': {
    label: '光环友方全伤增益',
    when: { always: true },
    extract: (p) => ({ mods: { unitAtkDamAdd: round4(p.damAddRate) }, badge: `全伤+${Math.round(num(p.damAddRate) * 100)}%` }),
  },

  // ===== 可可娜 009 =====
  '00907': {
    label: '最近友方物攻加成（仅对队友生效，测他人/组队可用）',
    when: { always: true },
    extract: (p, buffs) => {
      const bid = (p.addBuff || [])[0]
      const val = round4(buffs[bid]?.para?.atk)
      return { mods: { phyAtkPct: val }, badge: `最近友方物攻+${Math.round(val * 100)}%` }
    },
  },

  // ===== 沃夫加 012 =====
  '01205': {
    label: '普攻多重射击总倍率（单目标全吃；多目标由敌人均摊）',
    when: { skillId: '01201' },
    extract: (p) => ({
      skillMultScale: round4(Math.max(0, num(p.muPowerAdd, 1) - 1)),
      badge: `普攻总倍率${Math.round(num(p.muPowerAdd) * 100)}%（单目标）`,
    }),
  },
  '01208': {
    label: '小队仅剩自己时物攻提升',
    when: { always: true },
    extract: (p) => ({ mods: { phyAtkPct: round4(p.atkAdd) }, badge: `孤狼物攻+${Math.round(num(p.atkAdd) * 100)}%` }),
  },

  // ===== 皮塔 014 =====
  '01405': {
    label: '技能1事件独立连乘',
    when: { skillId: '01402' },
    extract: (p) => ({ mods: { eventMult: round4(p.skillDamAddRate) }, badge: `痛宰背刺×${(1 + num(p.skillDamAddRate)).toFixed(2)}` }),
  },
  '01406': {
    label: '附近流血敌人数技能连乘',
    maxStacks: 4,
    defaultStacks: 1,
    stackLabel: '附近流血敌人',
    when: { skillIds: ['01402', '01403'] },
    extract: (p) => ({ mods: { eventMult: round4(p.skillDamAddRate) }, badge: `技能+${Math.round(num(p.skillDamAddRate) * 100)}%/名(连乘)` }),
  },

  // ===== 芭杜尔 015 =====
  '01505': {
    label: '技能2额外附带风魔法伤害段',
    when: { skillId: '01503' },
    extract: (p) => {
      const seg = toSeg(p.damage)
      return { extraSegs: seg ? [seg] : [], badge: `藤蔓缠绕追加${Math.round(num(p.damage?.muPower) * 100)}%风伤段` }
    },
  },

  // ===== 奇瓦 019 =====
  '01906': {
    label: '技能2事件独立连乘',
    when: { skillId: '01903' },
    extract: (p) => ({ mods: { eventMult: round4(p.damageAddRate) }, badge: `浮游烈焰×${(1 + num(p.damageAddRate)).toFixed(2)}` }),
  },
  '01907': {
    label: '引燃火种叠层魔攻加成',
    maxStacks: 6,
    defaultStacks: 6,
    stackLabel: '引燃层数',
    when: { always: true },
    extract: (p, buffs) => {
      const bid = (p.buffs || [])[0]
      const val = round4(buffs[bid]?.para?.attr?.magicAtk?.percent)
      return { mods: { magicAtkPct: val }, badge: `魔攻+${Math.round(val * 100)}%/层` }
    },
  },
  '01908': {
    label: '天赋引燃追加魔法伤害段',
    when: { skillId: '01904' },
    extract: (p) => {
      const seg = toSeg({ ...p.damage, elementType: 'fire' })
      return { extraSegs: seg ? [seg] : [], badge: `引燃追加${Math.round(num(p.damage?.muPower) * 100)}%魔伤段` }
    },
  },

  // ===== 卡夫 023 =====
  '02305': {
    label: '技能伤害事件独立连乘',
    when: { form: 'skill' },
    extract: (p, buffs) => {
      const val = round4(buffs[p.skillDamgeBuff]?.para?.rate)
      return { mods: { eventMult: val }, badge: `技能×${(1 + val).toFixed(2)}(独立连乘)` }
    },
  },
  '02306': {
    label: '普攻主目标倍率提升（另溅射周围）',
    when: { skillId: '02301' },
    extract: (p) => ({ skillMultScale: round4(p.rate), badge: `普攻主目标倍率+${Math.round(num(p.rate) * 100)}%` }),
  },
  '02307': {
    label: '释放技能2后提高物理攻击',
    when: { always: true },
    extract: (p, buffs) => {
      const val = round4(buffs[p.buffId]?.para?.attr?.phyAtk?.percent)
      return { mods: { phyAtkPct: val }, badge: `狂风后物攻+${Math.round(val * 100)}%` }
    },
  },

  // ===== 嘉莉缇 025 =====
  '02505': {
    label: '技能2倍率提升',
    when: { skillId: '02503' },
    extract: (p) => ({ skillMultScale: round4(p.skill2DamAdd), badge: `箭如雨下倍率+${Math.round(num(p.skill2DamAdd) * 100)}%` }),
  },
  '02506': {
    label: '天赋追加弩箭倍率提升',
    when: { skillId: '02504' },
    extract: (p) => ({ skillMultScale: round4(p.talentDamAddRate), badge: `猎手节律倍率+${Math.round(num(p.talentDamAddRate) * 100)}%` }),
  },
  '02507': {
    label: '技能1追加穿风地物理伤害段',
    when: { skillId: '02502' },
    extract: (p) => {
      const seg = toSeg(p.skill1DamageAdd)
      return { extraSegs: seg ? [seg] : [], badge: `技能1追加${Math.round(num(p.skill1DamageAdd?.muPower) * 100)}%地伤段` }
    },
  },

  // ===== 贝拉多娜 026 =====
  '02606': {
    label: '释放技能2后物理攻击提高',
    when: { always: true },
    extract: (p, buffs) => {
      const val = round4(buffs[p.addBuffId]?.para?.attr?.phyAtk?.percent)
      return { mods: { phyAtkPct: val }, badge: `物攻+${Math.round(val * 100)}%` }
    },
  },

  // ===== 梅莉莉 027 =====
  '02705': {
    label: '解锁技能/天赋暴击并提高战斗暴伤',
    when: { always: true },
    extract: (p) => ({
      allowCritSkillIds: ['02702', '02703', '02704'],
      mods: { critDam: num(p.critDamAdd) },
      badge: `厨刀解锁暴击 · 暴伤+${num(p.critDamAdd)}%`,
    }),
  },
  '02706': {
    label: '技能1每把厨刀倍率提升',
    when: { skillId: '02702' },
    extract: (p) => ({ skillMultScale: round4(p.skill1DamAdd), badge: `厨刀投掷倍率+${Math.round(num(p.skill1DamAdd) * 100)}%` }),
  },
  '02707': {
    label: '放技能后获得战斗暴击率',
    when: { always: true },
    extract: (p) => {
      const val = num(p.addNewBuff?.newBuffPara?.attr?.crit?.baseValue)
      return { mods: { crit: val }, badge: `放技能暴击率+${val}%` }
    },
  },
  '02708': {
    label: '叠满6层标记追加100%无视防御风伤段',
    when: { skillId: '02701' },
    extract: (p, buffs) => {
      const d = buffs[p.addBuffId]?.para?.damage
      const seg = toSeg(d, { ignoreDef: num(d?.ignoreDef, 1) })
      return { extraSegs: seg ? [seg] : [], badge: `6层印记追加100%无视防御段` }
    },
  },

  // ===== 阿尔克丝 030 =====
  '03005': {
    label: '技能1倍率提升',
    when: { skillId: '03002' },
    extract: (p) => ({ skillMultScale: round4(p.damageAddRate), badge: `狂野挥击倍率+${Math.round(num(p.damageAddRate) * 100)}%` }),
  },
  '03007': {
    label: '技能2倍率提升',
    when: { skillId: '03003' },
    extract: (p) => ({ skillMultScale: round4(p.damageAddRate), badge: `挑衅姿态倍率+${Math.round(num(p.damageAddRate) * 100)}%` }),
  },

  // ===== 波特温 031 =====
  '03106': {
    label: '技能2降低命中敌人物理防御',
    when: { always: true },
    extract: (p, buffs) => {
      const val = num(buffs[p.addBuffId]?.para?.attr?.phyDef?.percent)
      return { mods: { tgtPhyDefPct: val }, badge: `目标物防${Math.round(val * 100)}%` }
    },
  },

  // ===== 诺姿 032 =====
  '03205': {
    label: '技能1倍率提升',
    when: { skillId: '03202' },
    extract: (p) => ({ skillMultScale: round4(p.damageAddRate), badge: `夺命连斩倍率+${Math.round(num(p.damageAddRate) * 100)}%` }),
  },
  '03206': {
    label: '技能2对半血以下额外倍率',
    when: { skillId: '03203' },
    extract: (p) => ({ skillMultScale: round4(p.lowHpDamageAddRate), badge: `目标<50%HP 断命十字倍率+${Math.round(num(p.lowHpDamageAddRate) * 100)}%` }),
  },

  // ===== 乌帕·萝特 033 =====
  '03306': {
    label: '放技能后自身全伤提高',
    when: { always: true },
    extract: (p) => {
      const val = round4(p.addNewBuff?.newBuffPara?.damAddRate)
      return { mods: { unitAtkDamAdd: val }, badge: `全伤+${Math.round(val * 100)}%` }
    },
  },
  '03307': {
    label: '技能2倍率提升',
    when: { skillId: '03303' },
    extract: (p) => ({ skillMultScale: round4(p.damAddRate), badge: `涌泉爆裂倍率+${Math.round(num(p.damAddRate) * 100)}%` }),
  },

  // ===== 露帕·萝特 034 =====
  '03405': {
    label: '技能1倍率提升',
    when: { skillId: '03402' },
    extract: (p) => ({ skillMultScale: round4(p.skill_1DamAddRate), badge: `跃涌浪潮倍率+${Math.round(num(p.skill_1DamAddRate) * 100)}%` }),
  },
  '03407': {
    label: '按场上召唤物数提高魔攻',
    maxStacks: 3,
    defaultStacks: 3,
    stackLabel: '召唤物数',
    when: { always: true },
    extract: (p) => ({ mods: { magicAtkPct: round4(p.magicAddRate) }, badge: `魔攻+${Math.round(num(p.magicAddRate) * 100)}%/召唤物` }),
  },

  // ===== 贝尔卡 036 =====
  '03605': {
    label: '普攻/技能对目标附加易伤',
    when: { always: true },
    extract: (p) => ({ mods: { unitDamageAdd: round4(p.damAddValue) }, badge: `目标易伤+${Math.round(num(p.damAddValue) * 100)}%` }),
  },
  '03606': {
    label: '技能2倍率提升',
    when: { skillId: '03603' },
    extract: (p) => ({ skillMultScale: round4(p.skill_2DamAddRate), badge: `水元素扩散倍率+${Math.round(num(p.skill_2DamAddRate) * 100)}%` }),
  },
  '03607': {
    label: '技能1事件独立连乘',
    when: { skillId: '03602' },
    extract: (p) => ({ mods: { eventMult: round4(p.skillDamAdd) }, badge: `水球术×${(1 + num(p.skillDamAdd)).toFixed(2)}` }),
  },

  // ===== 埃迪蒂 041 =====
  '04106': {
    label: '技能1倍率提升',
    when: { skillId: '04102' },
    extract: (p) => ({ skillMultScale: round4(p.skill_1DamAddRate), badge: `涌流斩倍率+${Math.round(num(p.skill_1DamAddRate) * 100)}%` }),
  },

  // ===== 艾尔菲帕 045 =====
  '04505': {
    label: '天赋爆伤提升并附加闪电链段',
    when: { skillId: '04504' },
    extract: (p) => {
      const seg = toSeg(p.lightAtkConf?.damage)
      return {
        skillMultScale: round4(p.buffDamAddRate),
        extraSegs: seg ? [seg] : [],
        badge: `电能引爆+${Math.round(num(p.buffDamAddRate) * 100)}% · 追加${Math.round(num(p.lightAtkConf?.damage?.muPower) * 100)}%闪电链`,
      }
    },
  },
  '04506': {
    label: '技能2每道雷电倍率提升',
    when: { skillId: '04503' },
    extract: (p) => ({ skillMultScale: round4(p.skill2DamAddRate), badge: `聚雷力场倍率+${Math.round(num(p.skill2DamAddRate) * 100)}%` }),
  },
  '04507': {
    label: '电能爆发叠层提高魔攻',
    maxStacks: 11,
    defaultStacks: 5,
    stackLabel: '传导层数',
    when: { always: true },
    extract: (p) => {
      const maxLay = num(p.addNewBuff?.newBuffPara?.maxLayPara, 5)
      const val = round4(p.addNewBuff?.newBuffPara?.attr?.magicAtk?.percent)
      return { mods: { magicAtkPct: val }, maxStacksOverride: maxLay, badge: `魔攻+${Math.round(val * 100)}%/层(至多${maxLay}层)` }
    },
  },

  // ===== 迈妮娅 046 =====
  '04605': {
    label: '反击稻草人销毁/到期引爆地伤',
    when: { skillId: '04603' },
    extract: (p) => {
      const seg = toSeg(p.damage)
      return { extraSegs: seg ? [seg] : [], badge: `假人自爆${Math.round(num(p.damage?.muPower) * 100)}%地物理` }
    },
  },

  // ===== 阿迪拉 047 =====
  '04705': {
    label: '技能1命中叠层提高暴击率',
    maxStacks: 10,
    defaultStacks: 5,
    stackLabel: '叠层',
    when: { always: true },
    extract: (p) => {
      const val = num(p.addNewBuff?.newBuffPara?.attr?.crit?.baseValue)
      return { mods: { crit: val }, badge: `暴击+${val}%/层` }
    },
  },
  '04708': {
    label: '普攻对眩晕/撕裂目标独立连乘',
    when: { form: 'normalAtk' },
    extract: (p) => ({ mods: { eventMult: round4(p.damAddRate) }, badge: `普攻对异常×${(1 + num(p.damAddRate)).toFixed(2)}` }),
  },

  // ===== 菲莉娜 049 =====
  '04905': {
    label: '普攻弹射追加伤害段',
    when: { skillId: '04901' },
    extract: (p) => ({
      extraSegs: [{ damageType: 'phyAtk', elementType: 'wind', scaling: 'phyAtk', multiplier: round4(p.damRate), baseDamage: 0, allowCrit: true }],
      badge: `普攻弹射追加${Math.round(num(p.damRate) * 100)}%段`,
    }),
  },
  '04906': {
    label: '技能1倍率提升',
    when: { skillId: '04902' },
    extract: (p) => ({ skillMultScale: round4(p.skillDamAddRate), badge: `集束箭头倍率+${Math.round(num(p.skillDamAddRate) * 100)}%` }),
  },
  '04908': {
    label: '技能2特殊攻击必定暴击',
    when: { skillId: '04903' },
    extract: () => ({ realCritSkillIds: ['04903'], badge: `穿甲箭头必定暴击(realCrit)` }),
  },

  // ===== 米拉贝尔 050 =====
  '05008': {
    label: '狂怒状态下物理攻击提高',
    when: { always: true },
    extract: (p) => ({ mods: { phyAtkPct: round4(p.atkAddRate) }, badge: `狂怒物攻+${Math.round(num(p.atkAddRate) * 100)}%` }),
  },

  // ===== 阿莱克西娅 051 =====
  '05105': {
    label: '天赋触发叠层魔法攻击提升',
    maxStacks: 2,
    defaultStacks: 2,
    stackLabel: '祷言层数',
    when: { always: true },
    extract: (p, buffs) => {
      const val = round4(buffs[p.addBuffId]?.para?.magicAtkAddRate)
      return { mods: { magicAtkPct: val }, badge: `魔攻+${Math.round(val * 100)}%/层` }
    },
  },
  '05106': {
    label: '护盾期间全伤提升',
    when: { always: true },
    extract: (p, buffs) => {
      const val = round4(buffs[p.addBuffId]?.para?.damAddValueRate)
      return { mods: { unitAtkDamAdd: val }, badge: `持盾全伤+${Math.round(val * 100)}%` }
    },
  },
  '05107': {
    label: '技能2对命中敌人施加易伤',
    when: { always: true },
    extract: (p) => ({ mods: { unitDamageAdd: round4(p.damAddValue) }, badge: `目标易伤+${Math.round(num(p.damAddValue) * 100)}%` }),
  },

  // ===== 艾薇杜尔 053 =====
  '05305': {
    label: '技能1倍率提升',
    when: { skillId: '05302' },
    extract: (p) => ({ skillMultScale: round4(p.skill1DamAddRate), badge: `降灵猎袭倍率+${Math.round(num(p.skill1DamAddRate) * 100)}%` }),
  },
  '05306': {
    label: '技能2追加凶灵之炎范围爆发段',
    when: { skillId: '05303' },
    extract: (p) => {
      const seg = toSeg(p.damage)
      return { extraSegs: seg ? [seg] : [], badge: `凶灵刈割追加${Math.round(num(p.damage?.muPower) * 100)}%风伤段` }
    },
  },
  '05307': {
    label: '攻击叠层物理攻击提高',
    maxStacks: 20,
    defaultStacks: 10,
    stackLabel: '魔眼层数',
    when: { always: true },
    extract: (p) => {
      const maxLay = num(p.addNewBuff?.newBuffPara?.maxLayPara, 10)
      const val = round4(p.addNewBuff?.newBuffPara?.attr?.phyAtk?.percent)
      return { mods: { phyAtkPct: val }, maxStacksOverride: maxLay, badge: `物攻+${Math.round(val * 100)}%/层(至多${maxLay}层)` }
    },
  },

  // ===== 迦南 055 =====
  '05505': {
    label: '技能1追加大范围斩击段',
    when: { skillId: '05502' },
    extract: (p) => {
      const seg = toSeg(p.damage)
      return { extraSegs: seg ? [seg] : [], badge: `秘剑追加${Math.round(num(p.damage?.muPower) * 100)}%风斩段` }
    },
  },
  '05508': {
    label: '一式·飞翎必暴并附加目标-30%物防',
    when: { always: true },
    extract: (p, buffs) => {
      const defPct = num(buffs[p.addBuffId]?.para?.attr?.phyDef?.percent, -0.3)
      return {
        realCritSkillIds: ['05504'],
        mods: { tgtPhyDefPct: defPct },
        badge: `一式飞翎必暴 · 破甲目标物防${Math.round(defPct * 100)}%`,
      }
    },
  },

  // ===== 露比特·鲁特 062 =====
  '06205': {
    label: '技能1倍率提升',
    when: { skillId: '06202' },
    extract: (p) => ({ skillMultScale: round4(p.skill1DamAddRate), badge: `炒锅连击倍率+${Math.round(num(p.skill1DamAddRate) * 100)}%` }),
  },
  '06206': {
    label: '技能2投喂伙伴后提高造成伤害',
    when: { always: true },
    extract: (p) => {
      const val = round4(p.addNewBuffConf?.newBuffPara?.damAddRate)
      return { mods: { unitAtkDamAdd: val }, badge: `伙伴全伤+${Math.round(val * 100)}%` }
    },
  },

  // ===== 伽拉忒亚 064 =====
  '06405': {
    label: '技能1倍率提升',
    when: { skillId: '06402' },
    extract: (p) => ({ skillMultScale: round4(p.skill1DamAdd), badge: `魔剑爆发倍率+${Math.round(num(p.skill1DamAdd) * 100)}%` }),
  },
  '06406': {
    label: '技能2终结追加魔剑爆发段',
    when: { skillId: '06403' },
    extract: (p) => {
      const seg = toSeg(p.damageFire)
      return { extraSegs: seg ? [seg] : [], badge: `霜烬终结追加${Math.round(num(p.damageFire?.muPower) * 100)}%魔攻伤` }
    },
  },
  '06408': {
    label: '业炎5层爆发倍率叠加+70%',
    when: { skillId: '06404' },
    extract: (p) => ({ muPowerAdd: round4(p.fireDamAdd), badge: `业炎5层爆发倍率+${Math.round(num(p.fireDamAdd) * 100)}%` }),
  },

  // ===== 乌尔勒 065 =====
  '06506': {
    label: '技能2主光束倍率提升（外围50%溅射）',
    when: { skillId: '06503' },
    extract: (p) => ({ skillMultScale: round4(p.skill2AddDamRate), badge: `清扫指令倍率+${Math.round(num(p.skill2AddDamRate) * 100)}%` }),
  },

  // ===== 奥格 066 =====
  '06605': {
    label: '技能1每次凿击倍率提升',
    when: { skillId: '06602' },
    extract: (p) => ({ skillMultScale: round4(p.skill1DamAdd), badge: `冰岩凿击倍率+${Math.round(num(p.skill1DamAdd) * 100)}%` }),
  },

  // ===== 修瓦莉 069 =====
  '06905': {
    label: '技能1倍率提升 & 后续普攻按层连乘',
    maxStacks: 5,
    defaultStacks: 3,
    stackLabel: '专注层数',
    when: { always: true },
    extract: (p) => {
      const focusRate = round4(p.addNewBuff?.newBuffPara?.damageAddRate)
      return {
        skill1TargetId: '06902',
        skillMultScaleOnTarget: round4(p.damageAddRate),
        normalEventMult: focusRate,
        badge: `技能1+${Math.round(num(p.damageAddRate) * 100)}% · 普攻+${Math.round(focusRate * 100)}%/层`,
      }
    },
  },
  '06907': {
    label: '技能2倍率提升且第一段必定暴击',
    when: { skillId: '06903' },
    extract: (p) => ({
      skillMultScale: round4(p.damageAddRate),
      firstHitRealCrit: true,
      badge: `骑士连击倍率+${Math.round(num(p.damageAddRate) * 100)}% · 首段必暴`,
    }),
  },

  // ===== 洛莉安 071 =====
  '07105': {
    label: '技能1基础倍率提升',
    when: { skillId: '07102' },
    extract: (p) => ({ skillMultScale: round4(p.skill1DamRateAdd), badge: `幽夜领域倍率+${Math.round(num(p.skill1DamRateAdd) * 100)}%` }),
  },
  '07108': {
    label: '累计失血40%后全伤提升',
    when: { always: true },
    extract: (p, buffs) => {
      const val = round4(buffs[p.addBuffId]?.para?.attr?.unitDamAdd?.baseValue)
      return { mods: { unitAtkDamAdd: val }, badge: `全伤+${Math.round(val * 100)}%` }
    },
  },

  // ===== 米托拉 new_002 =====
  'new_00205': {
    label: '技能1倍率提升',
    when: { skillId: 'new00202' },
    extract: (p) => ({ skillMultScale: round4(p.skill1DamAddRate), badge: `瞬杀匕首倍率+${Math.round(num(p.skill1DamAddRate) * 100)}%` }),
  },
  'new_00206': {
    label: '技能2倍率提升 & 终结击破防',
    when: { always: true },
    extract: (p, buffs) => {
      const defPct = num(buffs[(p.addBuff || [])[0]]?.para?.value)
      return {
        skill2TargetId: 'new00203',
        skillMultScaleOnTarget: round4(p.skill2DamAddRate),
        mods: { tgtPhyDefPct: defPct, tgtMagicDefPct: defPct },
        badge: `落幕之舞+${Math.round(num(p.skill2DamAddRate) * 100)}% · 破双防${Math.round(defPct * 100)}%`,
      }
    },
  },
}

/**
 * 从 heroes.json 的 starSkills + skillTrigger.json + buff.json 提取精简星阶数据，供写入 damage-calc.json。
 */
export function buildHeroStarRecords({ rawHero, skillTriggersData = {}, buffDatas = {} }) {
  const stars = Array.isArray(rawHero?.starSkills) ? rawHero.starSkills : []
  return stars.map((star, idx) => {
    const id = star.id
    const extractor = COMBAT_STAR_EXTRACTORS[id] || null
    const triggerLevels = skillTriggersData?.[id]?.levelData || {}
    const lvList = Array.isArray(star.levelData) ? star.levelData : []
    const maxLevel = Number(star.maxLevel || lvList.length || 1)
    const firstTrigger = triggerLevels['1'] || triggerLevels[Object.keys(triggerLevels)[0]]
    const firstBuff = firstTrigger?.buffId ? buffDatas[firstTrigger.buffId] : null
    const isPanelStatic = !extractor && (!firstTrigger?.buffId || !firstBuff?.buffEffect)

    const effectKind = extractor ? 'combat' : (isPanelStatic ? 'panelStatic' : 'utility')
    const levels = []
    for (let lv = 1; lv <= maxLevel; lv += 1) {
      const desEntry = lvList.find((d) => Number(d.level) === lv) || lvList[lv - 1] || {}
      const tLv = triggerLevels[String(lv)] || triggerLevels['1']
      const bPara = tLv?.buffId ? (buffDatas[tLv.buffId]?.para || {}) : {}
      const payload = extractor ? extractor.extract(bPara, buffDatas) : {}
      levels.push({
        level: lv,
        des: stripBraces(desEntry.des),
        ...payload,
      })
    }

    const lastPayload = levels[levels.length - 1] || {}
    return {
      id,
      slot: idx + 1,
      name: star.name || '',
      icon: star.icon || '',
      maxLevel,
      effectKind,
      label: extractor?.label || (isPanelStatic ? '角色面板基础属性（已计入手动面板，不重复叠加）' : '生存 / 回复 / 冷缩 / 召唤机制向星阶'),
      maxStacks: lastPayload.maxStacksOverride || extractor?.maxStacks || 1,
      defaultStacks: extractor?.defaultStacks || 1,
      stackLabel: extractor?.stackLabel || '',
      when: extractor?.when || { always: false },
      levels,
    }
  })
}

function addMods(acc, mods, scale = 1) {
  if (!mods || scale <= 0) return
  if (mods.phyAtkPct) acc.phyAtkPct += num(mods.phyAtkPct) * scale
  if (mods.magicAtkPct) acc.magicAtkPct += num(mods.magicAtkPct) * scale
  if (mods.crit) acc.crit += num(mods.crit) * scale
  if (mods.critDam) acc.critDam += num(mods.critDam) * scale
  if (mods.tagDamAdd) acc.tagDamAdd += num(mods.tagDamAdd) * scale
  if (mods.tgtPhyDefPct) acc.tgtPhyDefPct += num(mods.tgtPhyDefPct) * scale
  if (mods.tgtMagicDefPct) acc.tgtMagicDefPct += num(mods.tgtMagicDefPct) * scale
  if (mods.unitAtkDamAdd) acc.unitAtkDamAdd += num(mods.unitAtkDamAdd) * scale
  if (mods.unitPhyDamAdd) acc.unitPhyDamAdd += num(mods.unitPhyDamAdd) * scale
  if (mods.unitMagicDamAdd) acc.unitMagicDamAdd += num(mods.unitMagicDamAdd) * scale
  if (mods.unitNormalDamAdd) acc.unitNormalDamAdd += num(mods.unitNormalDamAdd) * scale
  if (mods.unitSkillDamAdd) acc.unitSkillDamAdd += num(mods.unitSkillDamAdd) * scale
  if (mods.unitDamageAdd) acc.unitDamageAdd += num(mods.unitDamageAdd) * scale
  if (mods.eventMult) acc.extraEventMult *= (1 + num(mods.eventMult) * scale)
}

function matchesStarScope(star, skill, context) {
  const w = star.when
  if (!w || w.always) return true
  if (w.skillId) return skill?.id === w.skillId
  if (Array.isArray(w.skillIds)) return w.skillIds.includes(skill?.id)
  return isEffectApplicable({ when: w }, context)
}

/**
 * 汇总当前角色已勾选星阶对面板乘区与当前选中技能的作用结果。
 */
export function calculateHeroStarEffects(hero, starSelection = {}, skill = null, context = {}) {
  const acc = {
    phyAtkPct: 0,
    magicAtkPct: 0,
    crit: 0,
    critDam: 0,
    realCrit: false,
    allowCritOverrideFromStar: null,
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
    unitElemDamAdd: { fire: 0, water: 0, wind: 0, earth: 0 },
    unitDamageAdd: 0,
    extraEventMult: 1,
    skillMultScale: 1,
    muPowerAdd: 0,
    firstHitRealCrit: false,
    extraSegs: [],
    activeCount: 0,
  }

  const stars = Array.isArray(hero?.starSkills) ? hero.starSkills : []
  const starLevels = starSelection?.starLevels || {}
  const starStacks = starSelection?.starStacks || {}

  for (const star of stars) {
    const lv = Number(starLevels[star.id] || 0)
    if (lv <= 0) continue
    acc.activeCount += 1
    if (star.effectKind !== 'combat') continue

    const entry = star.levels?.find((x) => x.level === lv) || star.levels?.[lv - 1]
    if (!entry) continue

    const maxStacks = entry.maxStacksOverride || star.maxStacks || 1
    const stacks = Math.max(1, Math.min(maxStacks, Number(starStacks[star.id] || star.defaultStacks || 1)))
    const scoped = matchesStarScope(star, skill, context)

    // 针对复合星阶的按技能分拆规则（如 06905 技能1倍率+普攻专注；new_00206 技能2倍率+破防）
    if (entry.skill1TargetId && skill?.id === entry.skill1TargetId && entry.skillMultScaleOnTarget) {
      acc.skillMultScale *= (1 + num(entry.skillMultScaleOnTarget))
    }
    if (entry.skill2TargetId && skill?.id === entry.skill2TargetId && entry.skillMultScaleOnTarget) {
      acc.skillMultScale *= (1 + num(entry.skillMultScaleOnTarget))
    }
    if (entry.normalEventMult && context?.form === 'normalAtk') {
      acc.extraEventMult *= (1 + num(entry.normalEventMult) * stacks)
    }

    if (!scoped) continue

    addMods(acc, entry.mods, stacks)
    if (entry.skillMultScale) {
      acc.skillMultScale *= (1 + num(entry.skillMultScale))
    }
    if (entry.muPowerAdd) {
      acc.muPowerAdd += num(entry.muPowerAdd)
    }
    if (Array.isArray(entry.allowCritSkillIds) && entry.allowCritSkillIds.includes(skill?.id)) {
      acc.allowCritOverrideFromStar = true
    }
    if (Array.isArray(entry.realCritSkillIds) && entry.realCritSkillIds.includes(skill?.id)) {
      acc.realCrit = true
    }
    if (entry.firstHitRealCrit) {
      acc.firstHitRealCrit = true
    }
    if (Array.isArray(entry.extraSegs) && entry.extraSegs.length) {
      acc.extraSegs.push(...entry.extraSegs)
    }
  }

  return acc
}

/**
 * 把星阶带来的技能倍率放大（muPower *= 1+rate）、倍率累加、首段必暴、额外段应用到技能快照，
 * 不修改原始 data/heroes 缓存对象。
 */
export function applyStarTransformsToSkill(skill, levelIndex = 0, starEffects = null) {
  if (!skill || !starEffects) return skill
  const levels = Array.isArray(skill.levels) ? skill.levels : []
  const lvData = levels[levelIndex] || levels[0]
  if (!lvData) return skill

  const scale = num(starEffects.skillMultScale, 1)
  const addPower = num(starEffects.muPowerAdd, 0)
  const baseDefs = Array.isArray(skill.segments) ? skill.segments : []
  const baseVals = Array.isArray(lvData.segments) ? lvData.segments : []
  const extraSegs = Array.isArray(starEffects.extraSegs) ? starEffects.extraSegs : []

  const nextDefs = baseDefs.map((seg, idx) => ({
    ...seg,
    ...(idx === 0 && starEffects.firstHitRealCrit ? { realCrit: true } : {}),
  }))
  const nextVals = baseVals.map((pair, idx) => {
    const mult = num(pair?.[0], 0) * scale + (idx === 0 ? addPower : 0)
    const base = Math.trunc(num(pair?.[1], 0) * scale)
    return [mult, base]
  })

  for (const extra of extraSegs) {
    nextDefs.push({
      damageType: extra.damageType,
      elementType: extra.elementType,
      scaling: extra.scaling,
      ignoreDef: num(extra.ignoreDef, 0),
      realCrit: Boolean(extra.realCrit),
      allowCrit: typeof extra.allowCrit === 'boolean' ? extra.allowCrit : undefined,
    })
    nextVals.push([num(extra.multiplier, 0), num(extra.baseDamage, 0)])
  }

  const nextLevels = levels.map((lv, i) => (i === (levels[levelIndex] ? levelIndex : 0)
    ? { ...lv, segments: nextVals }
    : lv))

  return {
    ...skill,
    crit: starEffects.allowCritOverrideFromStar ? 'yes' : skill.crit,
    segments: nextDefs,
    levels: nextLevels,
  }
}

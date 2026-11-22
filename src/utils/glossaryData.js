/**
 * 词条百科构建模块（构建期纯函数）：生成 `parsed/glossary.json`。
 *
 * 方案 A 全自动架构：
 * 1. 机制骨架：采用面向玩家的百科定义（状态百科、战斗属性、核心机制）。
 * 2. 数据驱动自动化：自动根据 buff.json / hero.json / mon.json / pet.json 等原表：
 *    - 自动聚合与统计持续时间区间（durationRange）、跳字结算频率（spTime）、伤害属性；
 *    - 自动反查施加来源（角色及对应技能、怪物、魔物、道具），支持图鉴联动；
 *    - 自动捕捉新异常与怪物异变状态，绝不漏数据。
 */
import {
  STATUS_RULES,
  DETECT_TYPE_LABELS,
  BROKEN_BUFF_EFFECTS,
  matchCanonicalStatus,
  resolveBuffIcon,
  describeBuff,
  isEliteBuff,
  resolveEliteEntryName,
  isCookBuff,
  isInternalBuffName,
  isPlainObject
} from './buffParser.js'
import { buildBuffSourceIndex } from './buffSourceIndex.js'
import { buildSkillLevelIndex } from './skillLevelIndex.js'
import {
  STATUS_ENCYCLOPEDIA,
  STATS_ENCYCLOPEDIA,
  MECHANICS_ENCYCLOPEDIA,
  ELITE_ENCYCLOPEDIA
} from '../config/glossaryEncyclopedia.js'
import { isBlacklisted } from '../config/blacklist.js'

export const GLOSSARY_SECTIONS = [
  { id: 'status', name: '异常与状态', desc: '打在战斗单位身上的持续伤害、强力控制、削弱与增益屏障。' },
  { id: 'stats', name: '战斗属性', desc: '决定角色攻防能力的基础面板、进阶上限与元素抗性。' },
  { id: 'mechanics', name: '核心机制', desc: '技能体系、伤害结算流与仇恨索敌等游戏底层运转规则。' },
  { id: 'buffs', name: 'Buff 效果', desc: '角色技能、魔物伙伴、装备套装、秘境遗器与职业被动的战斗状态出处与数值。' }
]

const countBy = values => {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  return counts
}
const toSorted = counts => [...counts.entries()]
  .map(([value, count]) => ({ value, count }))
  .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'zh-Hans-CN'))

/**
 * 某个分组内的「分类」与「标签」分布。
 */
export function facetCountsForGroup(entries, groupId) {
  const scoped = (entries || []).filter(entry => !groupId || groupId === 'all' || entry.group === groupId)
  const categories = toSorted(countBy(scoped.map(entry => entry.category).filter(Boolean)))
    .map(({ value, count }) => ({ category: value, count }))
  const tags = toSorted(countBy(scoped.flatMap(entry => [...new Set(entry.tags || [])])))
    .map(({ value, count }) => ({ tag: value, count }))
  return { categories, tags }
}

/**
 * 提取持续时间文本说明
 */
function extractDurationText(buffs) {
  const nums = buffs.map(b => Number(b.buffTime || 0)).filter(t => t > 0)
  if (!nums.length) return '即时 / 永久生效'
  const hasPermanent = nums.some(t => t >= 9999)
  const regular = nums.filter(t => t < 9999)
  if (!regular.length) return '永久生效'
  const min = Math.min(...regular)
  const max = Math.max(...regular)
  const base = min === max ? `${min} 秒` : `${min} ~ ${max} 秒`
  return hasPermanent ? `${base}（部分技能为永久被动）` : base
}

/**
 * 提取结算频率说明
 */
function extractIntervalText(buffs) {
  const intervals = buffs.map(b => b.para?.spTime || b.para?.interval).filter(Boolean).map(Number).filter(n => n > 0)
  if (!intervals.length) return ''
  const min = Math.min(...intervals)
  const max = Math.max(...intervals)
  return min === max ? `每 ${min} 秒结算一次` : `每 ${min} ~ ${max} 秒结算一次`
}

/**
 * 提取伤害类型与元素
 */
function extractDamageTypeText(buffs) {
  const elements = new Set()
  const types = new Set()
  for (const b of buffs) {
    const el = b.para?.damage?.elementType
    if (el && el !== 'none') elements.add(el)
    const dt = b.para?.damage?.damageType || b.para?.damage?.muAddType
    if (dt === 'magicAtk') types.add('魔法伤害')
    else if (dt === 'phyAtk') types.add('物理伤害')
  }
  const elNames = { fire: '火属性', water: '水属性', wind: '风属性', earth: '地属性' }
  const elStr = [...elements].map(e => elNames[e] || e).join('/')
  const typeStr = [...types].join('/')
  if (!elStr && !typeStr) return ''
  return [elStr, typeStr].filter(Boolean).join(' ')
}

const emptySources = () => ({
  heroes: [], monsters: [], pets: [], items: [],
  suits: [], runes: [], affixes: [], dungeons: [], relics: [], jobs: [], roomBuffs: []
})

const CARRIER_NAME_RE = /(?:升星\s*\d+|star\s*\d+|天赋被动|^\S+\s+天赋$|\s+被动$|\s*技能\s*\d+$|_?特性$|亡语lv\d+|^\S+三件套$|^\S+四件套$|判定等级增伤$)/i

const stripBraces = text => String(text || '').replace(/\{([^{}]+)\}/g, '$1').replace(/\s+/g, ' ').trim()

function collectChildBuffIds(nodes, buffData) {
  const out = new Set()
  const visit = (node, depth = 0) => {
    if (depth > 8 || node == null) return
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1)
      return
    }
    if (!isPlainObject(node)) return
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && (/buff/i.test(key) || key === 'newBuffBaseId') && buffData[value]) {
        out.add(value)
      } else if (value && typeof value === 'object') {
        visit(value, depth + 1)
      }
    }
  }
  for (const n of nodes) visit(n, 0)
  return out
}

function resolveBuffCategory(buff, sources) {
  if (sources.dungeons.length || sources.relics.length) return '秘境与遗器'
  if (sources.suits.length || sources.runes.length || sources.affixes.length || sources.items.some(i => i.isEquip)) {
    return '装备与套装'
  }
  if (sources.jobs.length) return '职业被动'
  if (sources.pets.length) return '魔物特性'
  if (sources.heroes.length) return '角色与技能'
  if (sources.monsters.length) return '怪物效果'
  if (sources.items.length || sources.roomBuffs.length) return '道具与副本'
  return (buff?.buffTags || []).includes('减益') ? '减益与削弱' : '其他状态'
}

/**
 * 聚合施加来源列表
 */
function aggregateSources(buffs, sourceIndex) {
  const heroesMap = new Map()
  const monstersMap = new Map()
  const petsMap = new Map()
  const itemsMap = new Map()
  const suitsMap = new Map()
  const runesMap = new Map()
  const affixesMap = new Map()
  const dungeonsMap = new Map()
  const relicsMap = new Map()
  const jobsMap = new Map()
  const roomBuffsMap = new Map()

  const upsert = (map, key, entry) => {
    if (!map.has(key)) map.set(key, entry)
    else if (entry.skillName && !map.get(key).skillName) map.get(key).skillName = entry.skillName
  }

  for (const buff of buffs) {
    const owners = sourceIndex.get(buff.buffID) || []
    for (const o of owners) {
      if (!o.name || isBlacklisted(o)) continue
      if (o.kind === '角色') {
        upsert(heroesMap, o.name, { id: o.id, name: o.name, icon: o.icon, skillName: o.skillName || '' })
      } else if (o.kind === '怪物') {
        upsert(monstersMap, o.name, { id: o.id, name: o.name, icon: o.icon, skillName: o.skillName || '', place: o.place || [] })
      } else if (o.kind === '魔物') {
        upsert(petsMap, o.name, { id: o.id, name: o.name, icon: o.icon, skillName: o.skillName || '' })
      } else if (o.kind === '物品') {
        upsert(itemsMap, o.name, { id: o.id, name: o.name, icon: o.icon, isEquip: Boolean(o.isEquip) })
      } else if (o.kind === '套装') {
        upsert(suitsMap, `${o.id || o.name}::${o.skillName || ''}`, {
          id: o.id, name: o.name, equipId: o.equipId || '', icon: o.icon || '', skillName: o.skillName || ''
        })
      } else if (o.kind === '符石') {
        upsert(runesMap, o.name, { id: o.id, name: o.name, icon: o.icon || '' })
      } else if (o.kind === '词缀') {
        upsert(affixesMap, o.name, { id: o.id, name: o.name, skillName: o.skillName || '' })
      } else if (o.kind === '秘境') {
        upsert(dungeonsMap, `${o.id}::${o.eventId || o.skillName || ''}`, {
          id: o.id, name: o.name, eventId: o.eventId || '', skillName: o.skillName || ''
        })
      } else if (o.kind === '遗器') {
        upsert(relicsMap, o.name, { id: o.id, name: o.name, icon: o.icon || '' })
      } else if (o.kind === '职业') {
        upsert(jobsMap, `${o.id}::${o.name}`, { id: o.id, name: o.name, skillName: o.skillName || '' })
      } else if (o.kind === '副本') {
        upsert(roomBuffsMap, o.name, { id: o.id, name: o.name, skillName: o.skillName || '' })
      }
    }
  }

  const sortByTitle = list => list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  return {
    heroes: sortByTitle([...heroesMap.values()]),
    monsters: sortByTitle([...monstersMap.values()]),
    pets: sortByTitle([...petsMap.values()]),
    items: sortByTitle([...itemsMap.values()]),
    suits: sortByTitle([...suitsMap.values()]),
    runes: sortByTitle([...runesMap.values()]),
    affixes: sortByTitle([...affixesMap.values()]),
    dungeons: sortByTitle([...dungeonsMap.values()]),
    relics: sortByTitle([...relicsMap.values()]),
    jobs: sortByTitle([...jobsMap.values()]),
    roomBuffs: sortByTitle([...roomBuffsMap.values()])
  }
}

function buildBuffRules(variants, primary, buffData) {
  const rules = []
  const seenLabels = new Set()
  const pushRule = (label, value) => {
    if (!label || !value || seenLabels.has(label)) return
    seenLabels.add(label)
    rules.push({ label, value })
  }

  pushRule('持续时间', extractDurationText(variants))
  const intervalText = extractIntervalText(variants)
  if (intervalText) pushRule('结算频率', intervalText)
  const dmgTypeText = extractDamageTypeText(variants)
  if (dmgTypeText) pushRule('伤害类型', dmgTypeText)

  const overlay = variants.find(b => b.canOverlay)
  if (overlay) {
    const maxStack = Math.max(...variants.map(b => Number(b.para?.maxLayPara || 0)))
    pushRule('叠加机制', maxStack > 0 ? `可叠加，最多 ${maxStack} 层` : '可叠加')
  }

  const detectLabel = DETECT_TYPE_LABELS[primary?.para?.detectType] || ''
  if (detectLabel) pushRule('生效时机', detectLabel)

  const parsed = describeBuff(primary, { buffData })
  for (const grp of parsed.groups || []) {
    for (const item of grp.items || []) {
      if (rules.length >= 8) break
      pushRule(item.label, item.value)
    }
  }
  return rules
}

export function buildGlossaryData({
  buffJson, heroJson, petJson, monJson, skillJson, skillTriggerJson, itemJson, heroSkillUpgradeJson, fileMonJson, monstersJson,
  equipSuitJson, equipEnchantJson, equipGlobalConfigJson,
  relicDungeonInfoJson, relicDungeonEventsJson, activityListJson, relicInfoJson,
  generalJson, battleBuffCardJson,
  // 三张图鉴的可见 id（见 `scripts/parse/glossary.mjs`）。传了就只保留图鉴里点得开的来源。
  visibleHeroIds, visiblePetIds, visibleMonsterIds
} = {}) {
  const buffData = buffJson || {}
  const sourceInput = {
    buffJson: buffData, heroJson, petJson, monJson, skillJson, skillTriggerJson, itemJson, fileMonJson, monstersJson,
    equipSuitJson, equipEnchantJson, equipGlobalConfigJson,
    relicDungeonInfoJson, relicDungeonEventsJson, activityListJson, relicInfoJson,
    generalJson, battleBuffCardJson
  }
  const sourceIndex = buildBuffSourceIndex({
    ...sourceInput,
    visibleHeroIds, visiblePetIds, visibleMonsterIds
  })
  const unfilteredSourceIndex = (visibleHeroIds || visiblePetIds || visibleMonsterIds)
    ? buildBuffSourceIndex(sourceInput)
    : null
  const levelIndex = buildSkillLevelIndex({ skillJson, buffJson: buffData, heroSkillUpgradeJson })
  const childBuffIds = collectChildBuffIds([
    buffData, skillJson, skillTriggerJson,
    relicDungeonInfoJson, relicDungeonEventsJson,
    generalJson?.jobPaBuffConfDes, battleBuffCardJson
  ], buffData)

  // 1. 按 STATUS_RULES 自动聚合匹配的 buff
  const statusBuckets = new Map()
  for (const rule of STATUS_RULES) {
    statusBuckets.set(rule.id, [])
  }

  const eliteByName = new Map()
  const claimedBuffs = new Set()

  for (const buff of Object.values(buffData)) {
    if (!isPlainObject(buff) || buff.show === false) continue
    const name = String(buff.buffName || '').trim()
    if (!name || isCookBuff(buff) || isInternalBuffName(name)) continue

    // 精英怪与秘境异变
    if (isEliteBuff(buff)) {
      const entryName = resolveEliteEntryName(buff)
      if (!eliteByName.has(entryName)) eliteByName.set(entryName, [])
      eliteByName.get(entryName).push(buff)
      claimedBuffs.add(buff)
      continue
    }

    const hit = matchCanonicalStatus(buff)
    if (hit && statusBuckets.has(hit.id)) {
      statusBuckets.get(hit.id).push(buff)
      claimedBuffs.add(buff)
    }
  }

  // 2. 组装「异常与战斗状态」词条
  const statusEntries = []
  for (const rule of STATUS_RULES) {
    const buffs = statusBuckets.get(rule.id) || []
    const enc = STATUS_ENCYCLOPEDIA[rule.id] || {
      name: rule.name,
      category: rule.category,
      summary: `${rule.name}状态，在战斗中产生相应的战术影响。`,
      defaultTags: [rule.category, '战斗状态'],
      defaultRules: []
    }

    // 自动寻找最佳图标
    const iconBuff = buffs.find(b => b.buffIcon)
    const icon = iconBuff ? resolveBuffIcon(iconBuff.buffIcon) : ''

    // 动态提取特征
    const durText = extractDurationText(buffs)
    const intervalText = extractIntervalText(buffs)
    const dmgTypeText = extractDamageTypeText(buffs)

    const rules = []
    if (durText) rules.push({ label: '持续时间', value: durText })
    if (intervalText) rules.push({ label: '结算频率', value: intervalText })
    if (dmgTypeText) rules.push({ label: '伤害类型', value: dmgTypeText })

    // 融合百科规则
    for (const r of (enc.defaultRules || [])) {
      if (!rules.some(item => item.label === r.label)) {
        rules.push(r)
      }
    }

    // 自动提取施加来源
    const sources = aggregateSources(buffs, sourceIndex)

    statusEntries.push({
      id: rule.id,
      name: enc.name || rule.name,
      group: 'status',
      category: enc.category || rule.category,
      icon,
      tags: [...new Set([...(enc.defaultTags || []), enc.category || rule.category])],
      summary: enc.summary,
      rules,
      sources,
      buffCount: buffs.length
    })
  }

  // 3. 组装精英怪异变状态
  for (const [name, buffs] of eliteByName) {
    const enc = ELITE_ENCYCLOPEDIA?.[name]
    const iconBuff = buffs.find(b => b.buffIcon)
    const icon = iconBuff ? resolveBuffIcon(iconBuff.buffIcon) : ''
    const des = enc?.summary || buffs.find(b => b.buffDes)?.buffDes || '精英怪物携带的异变特质，强化怪物的战斗能力。'
    const sources = aggregateSources(buffs, sourceIndex)
    statusEntries.push({
      id: `elite_${name}`,
      name,
      group: 'status',
      category: '怪物异变',
      icon,
      tags: enc?.defaultTags || ['怪物特质', '异变'],
      summary: des,
      rules: enc?.defaultRules || [
        { label: '特质类型', value: '精英首领常驻被动' },
        { label: '生效机制', value: '怪物入场即生效，无法被驱散' }
      ],
      sources,
      buffCount: buffs.length
    })
  }

  // 4. 组装「战斗属性」与「核心机制」
  const statsEntries = STATS_ENCYCLOPEDIA.map(item => ({
    ...item,
    icon: '',
    sources: emptySources()
  }))

  const mechanicsEntries = MECHANICS_ENCYCLOPEDIA.map(item => ({
    ...item,
    icon: '',
    sources: emptySources()
  }))

  // 5. 组装「Buff 效果」：覆盖其余可触发/展示的战斗 Buff（含子 Buff 如优雅、秘境遗器、装备套装、职业被动等）
  const reservedNames = new Set([
    ...statusEntries.map(e => e.name),
    ...statsEntries.map(e => e.name),
    ...mechanicsEntries.map(e => e.name)
  ])
  const buffBuckets = new Map()
  for (const buff of Object.values(buffData)) {
    if (!isPlainObject(buff)) continue
    const id = String(buff.buffID || '').trim()
    const name = String(buff.buffName || '').trim()
    if (!id || !name || reservedNames.has(name)) continue
    if (/ceshi|test|demo/i.test(id) || /ceshi|test/i.test(String(buff.buffType || '')) || /^\d{2,}/.test(name)) continue
    if (isCookBuff(buff) || isInternalBuffName(name) || isEliteBuff(buff)) continue
    if (BROKEN_BUFF_EFFECTS.has(String(buff.buffEffect || ''))) continue
    if (!levelIndex.isReachable(id)) continue

    const isChild = childBuffIds.has(id)
    if (buff.show === false && !(isChild && (buff.buffIcon || buff.buffDes))) continue

    const cleanDes = stripBraces(buff.buffDes || buff.des)
    if (CARRIER_NAME_RE.test(name) && !buff.buffIcon) continue
    if ((!cleanDes || cleanDes === name) && !buff.buffIcon) continue

    if (!buffBuckets.has(name)) buffBuckets.set(name, [])
    buffBuckets.get(name).push(buff)
  }

  const buffEntries = []
  const usedIds = new Set([...statusEntries, ...statsEntries, ...mechanicsEntries].map(e => e.id).filter(Boolean))
  for (const [name, variants] of buffBuckets) {
    // 优先选有图标且说明最完整的一条作代表
    const primary = [...variants].sort((a, b) => {
      const score = x => (x.buffIcon ? 1000 : 0) + stripBraces(x.buffDes || x.des).length
      return score(b) - score(a)
    })[0]
    const iconBuff = variants.find(b => b.buffIcon)
    const icon = iconBuff ? resolveBuffIcon(iconBuff.buffIcon) : ''
    const sources = aggregateSources(variants, sourceIndex)
    const hasVisibleSource = Object.values(sources).some(list => Array.isArray(list) && list.length > 0)
    if (!hasVisibleSource && unfilteredSourceIndex) {
      const rawSources = aggregateSources(variants, unfilteredSourceIndex)
      if (Object.values(rawSources).some(list => Array.isArray(list) && list.length > 0)) {
        continue
      }
    }
    const category = resolveBuffCategory(primary, sources)
    const rules = buildBuffRules(variants, primary, buffData)

    const rawDes = variants
      .map(v => stripBraces(v.buffDes || v.des))
      .filter(d => d && d !== name)
      .sort((a, b) => b.length - a.length)[0]
    const fallbackRuleDesc = rules
      .filter(r => r.label !== '持续时间')
      .slice(0, 3)
      .map(r => `${r.label}：${r.value}`)
      .join('；')
    const summary = rawDes || fallbackRuleDesc || `${name}战斗状态效果。`

    const sourceTags = []
    if (sources.heroes.length) sourceTags.push('角色')
    if (sources.pets.length) sourceTags.push('魔物伙伴')
    if (sources.suits.length) sourceTags.push('装备套装')
    if (sources.runes.length) sourceTags.push('符石')
    if (sources.affixes.length) sourceTags.push('装备词缀')
    if (sources.items.some(i => i.isEquip)) sourceTags.push('装备')
    if (sources.items.some(i => !i.isEquip)) sourceTags.push('道具')
    if (sources.dungeons.length) sourceTags.push('活动秘境')
    if (sources.relics.length) sourceTags.push('法盘遗器')
    if (sources.jobs.length) sourceTags.push('职业被动')
    if (sources.roomBuffs.length) sourceTags.push('副本增益')
    if (sources.monsters.length) sourceTags.push('怪物')

    const tags = [...new Set([
      ...variants.flatMap(v => v.buffTags || []).filter(Boolean),
      ...sourceTags
    ])]

    let entryId = `buff_${primary.buffID}`
    if (usedIds.has(entryId)) entryId = `buff_${primary.buffID}_${buffEntries.length}`
    usedIds.add(entryId)

    buffEntries.push({
      id: entryId,
      name,
      group: 'buffs',
      category,
      icon,
      tags,
      summary,
      rules,
      sources,
      buffCount: variants.length
    })
  }
  buffEntries.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))

  const allEntries = [...statusEntries, ...statsEntries, ...mechanicsEntries, ...buffEntries]

  // 分组统计
  const groupCounts = countBy(allEntries.map(e => e.group))
  const sections = GLOSSARY_SECTIONS.map(sec => ({
    ...sec,
    count: groupCounts.get(sec.id) || 0
  }))

  return {
    meta: {
      skillLevelCap: levelIndex.cap,
      totalBuffs: Object.keys(buffData).length,
      entries: allEntries.length
    },
    sections,
    // 兼容字段
    groups: sections,
    entries: allEntries,
    buffs: allEntries
  }
}

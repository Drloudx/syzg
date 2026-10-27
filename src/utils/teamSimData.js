/**
 * 配队模拟器 —— 数据派生层。
 *
 * 只从 heroes.json / pets.json 抽取必要字段，不重复存整份数据：
 *   角色：id / name / job / jobName / element / elementName / icon
 *   魔物：id / name / element / elementName / icon / passive{限定条件, 加成类型, 数值, 原文}
 *
 * 队伍被动的原文形如：
 *   队伍中 {火属性} 伙伴物理攻击增加 {6%}。
 *   队伍中 {近卫、守护} 职业伙伴 生命值 增加 {4%}。
 *   队伍伙伴 暴击率 增加 {5%}。
 *   队伍中每有一个{风属性}伙伴，获得 {5%} 物理攻击力 提升。
 *   队伍中 {水属性} 且职业为 {射手、突袭} 的伙伴，暴击率增加 {10%}。
 *
 * 解析把原文转成「限定条件 + 加成类型 + 数值」，用于匹配与筛选。
 */

/** 属性名 */
const ELEMENTS = ['火', '水', '风', '地']
/** 职业名（与 heroes.json 的 jobName 一致） */
const JOBS = ['近卫', '守护', '秘术', '射手', '支援', '突袭']

/**
 * 从队伍被动原文解析出结构化规则。
 *
 * 返回：
 *   elements  限定属性（空数组 = 不限）
 *   jobs      限定职业（空数组 = 不限）
 *   stat      加成属性，如「物理攻击」「暴击率」「魔法防御」「最大生命值」
 *   value     数值（百分数，6 表示 6%）
 *   perCount  是否「每有一个 X 伙伴」的累加型
 *   raw       原文
 */
/**
 * 已知的「加成属性」词表，按长度降序匹配（保证「物理攻击力」优先于「物理攻击」）。
 *
 * 为什么用词表而不是正则推导：原文写法太杂 ——
 *   「伙伴的 魔法防御 增加」  「伙伴魔法防御增加」  「魔法防御 {6%}」
 *   正则先啃到「业伙伴的魔法防御」这种残片，再用词表直接认名词最稳。
 */
const STAT_WORDS = [
  '物理攻击力', '魔法攻击力', '物理防御力', '魔法防御力',
  '物理攻击', '魔法攻击', '物理防御', '魔法防御',
  '最大生命值', '生命值',
  '暴击伤害', '暴击率',
  '冷却缩减', '攻击速度', '移动速度', '攻速', '移速',
  '攻击和移速',
].sort((a, b) => b.length - a.length)

const JOB_ALIAS = { 法师: '秘术', 辅助: '支援', 术士: '秘术' }

export function parseTeamPassive(desc) {
  if (!desc) return null
  const text = String(desc).replace(/\s+/g, '')

  // 限定属性
  const elements = ELEMENTS.filter(e => new RegExp(`${e}属性`).test(text))

  // 限定职业：{} 与 【】 内命中，或正文里裸写职业名
  const jobs = []
  const jobSource = text
  for (const job of JOBS) if (jobSource.includes(job)) jobs.push(job)
  for (const [alias, job] of Object.entries(JOB_ALIAS)) {
    if (jobSource.includes(alias) && !jobs.includes(job)) jobs.push(job)
  }

  // 加成属性：直接查词表
  const stat = STAT_WORDS.find(w => text.includes(w)) || ''

  // 数值
  const valMatch = text.match(/([\d.]+)\s*%/)
  const value = valMatch ? Number(valMatch[1]) : 0

  return {
    elements: [...new Set(elements)],
    jobs: [...new Set(jobs)],
    stat,
    value,
    perCount: /每有一个/.test(text),
    raw: String(desc).trim(),
  }
}

/** 角色精简记录 */
export function toHeroRecord(hero) {
  return {
    id: hero.id,
    name: hero.name,
    job: hero.job,
    jobName: hero.jobName || '',
    element: hero.element,
    elementName: hero.elementName || '',
    icon: hero.icon || '',
  }
}

/**
 * 魔物精简记录。
 *
 * 🔴 **只取索引 3 的技能作为队伍被动**，不做任何兜底查找。
 *
 * 原因：一个魔物的 4 个技能里，`trait`（特性）也常带「队伍中…」字样
 * （实测 3 个：草原黏团 / 魔水粘团 / 熔火喷炎者）。
 * 但**特性是角色携带生效的，不是编队出战魔物给的** —— 混进来会算错受益人数。
 *
 * 出战场上的 3 个魔物，生效的是第 4 个技能（索引 3），与 PetsView 的
 * `idx === 3 ? '队伍被动'` 标签一致。
 */
export function toPetRecord(pet) {
  const skills = pet.skills || []
  const passiveSkill = skills[3]
  const desc = passiveSkill?.levelData?.[0]?.des || ''
  return {
    id: pet.id,
    name: pet.name,
    element: pet.element,
    elementName: pet.elementName || '',
    // 数据里只有文件名，不含目录；拼路径在视图层做（见 TeamSimView 的 petIcon）
    monImg: pet.monImg || '',
    passive: parseTeamPassive(desc),
  }
}

/**
 * 判断某角色能否吃到某魔物的队伍被动。
 * 限定条件之间是「且」关系；同一维度内（多个属性/职业）是「或」关系。
 */
export function matchesPassive(hero, passive) {
  if (!passive) return false
  const { elements, jobs } = passive
  const elementOk = !elements.length || elements.includes(hero.elementName)
  const jobOk = !jobs.length || jobs.includes(hero.jobName)
  return elementOk && jobOk
}

/** 队伍可吃的全部加成（按魔物聚合） */
export function evaluateTeam(team, pets) {
  return pets.map(pet => {
    const hitHeroes = team.filter(h => matchesPassive(h, pet.passive))
    return { pet, hitHeroes, count: hitHeroes.length }
  })
}

export { ELEMENTS, JOBS }

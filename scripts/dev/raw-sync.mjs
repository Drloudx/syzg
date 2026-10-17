import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { resolveChild } from './maintenance-paths.mjs'

export const RAW_ALIASES = Object.freeze({
  'condition.json': ['task/condition.json'],
  'equipEnchant.json': ['equip/equipEnchant.json'],
  'equipGroup.json': ['equip/equipGroup.json'],
  'equipSuit.json': ['equip/equipSuit.json'],
  'equipGlobalConfig.json': ['equip/装备符石数据对应表equipGlobalConfig.json'],
  'equipLevel.json': ['equip/装备升级经验equipLevel.json'],
  'equipDec.json': ['equip/装备分解equipDec.json'],
  ...Object.fromEntries([
    'hero', 'heroArchives', 'heroBehavior', 'heroLevel', 'heroMail',
    'heroRank', 'heroSkillUpgrade', 'heroStar', 'heroTalk'
  ].map(name => [`${name}.json`, [`hero/${name}.json`]])),
  ...Object.fromEntries(['pet', 'petLevel', 'petSetting'].map(name => [`${name}.json`, [`pet/${name}.json`]]))
})

export const DERIVED_RAW_FILES = new Set([
  'dungeonBattle.json', 'dungeonBattleRooms.json', 'dungeonBattleRoutes.json',
  'monsterTowerUsage.json', 'equip/equips.json'
])

/**
 * **已知不是合法 JSON 的源表** —— 同步时跳过，不报 invalid。
 *
 * 这些是策划配置文件，含注释、尾随逗号或裸控制字符（`Config_decrypted` 里就是这样）：
 *
 * | 文件 | 问题 | 是否被代码读取 |
 * | --- | --- | --- |
 * | `attachment.json` | `//` 注释 | 否 |
 * | `newAI.json` | 尾随逗号 | 否 |
 * | `pvp_bot.json` | `//` 注释 | 否 |
 * | `relics.json` | 尾随逗号 | 否 |
 * | `roomEffect.json` | 尾随逗号 | 否（`roomEffects.mjs` 不读它） |
 * | `words.json` | 是**逗号分隔词表**，不是 JSON | 否 —— 仅被 `commentBlocklist.js` 引用为**来源说明**（`BLOCKLIST_SOURCE` 常量 + 注释），实际用内嵌类别正则 |
 *
 * 列入条件：**确认没有代码读取该文件内容**。
 * 判据不是「grep 到文件名就算消费」—— 来源说明、常量标识不算读取（`words.json` 即此类）。
 * 新增条目必须核实，否则会掩盖真实的同步失败。
 * 唯一真正的读取方是 `scripts/parse/` 下的 `readJson()`。
 *
 * 🔴 `diary.json` **不在**此列 —— `runtime-tables.mjs` 真的 `readJson('diary.json')` 读它
 * （物品详情的书籍/日记文本）。它的源表同样不是合法 JSON，所以**同步不进去**，
 * 实际用的是 `raw/diary.json`。两者可见文字已逐字比对一致，当前无偏差；
 * 风险在于源表将来更新时不会生效，且无报错。详见 RISKS 故障 25。
 */
export const NON_JSON_SOURCE_FILES = new Set([
  'attachment.json', 'newAI.json', 'pvp_bot.json', 'relics.json', 'roomEffect.json', 'words.json'
])

export const fileDigest = file => createHash('sha256').update(readFileSync(file)).digest('hex')

export function createRawSyncPlan({ sourceRoot, targetRoot, replace = false, files = null, onInvalid = null }) {
  if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
    throw new Error(`Configuration directory not found: ${sourceRoot}`)
  }
  const sources = []
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.json')) sources.push(full)
    }
  }
  if (files) sources.push(...files.map(file => resolveChild(sourceRoot, file)))
  else walk(sourceRoot)

  const plan = new Map()
  for (const source of sources.sort()) {
    const sourceName = relative(sourceRoot, source).replaceAll('\\', '/')
    if (DERIVED_RAW_FILES.has(sourceName)) continue
    if (NON_JSON_SOURCE_FILES.has(sourceName)) continue
    const content = readFileSync(source)
    try {
      JSON.parse(content.toString('utf8'))
    } catch (error) {
      if (onInvalid) {
        onInvalid({ source, sourceName, error: error.message })
        continue
      }
      throw new Error(`Invalid JSON ${source}: ${error.message}`)
    }
    const sourceHash = createHash('sha256').update(content).digest('hex')
    const group = []
    for (const targetName of [sourceName, ...(RAW_ALIASES[sourceName] || [])]) {
      const target = resolveChild(targetRoot, targetName)
      const previous = plan.get(target)
      if (previous) {
        if (previous.sourceHash !== sourceHash) throw new Error(`Conflicting source tables for ${targetName}`)
        group.push(previous)
        continue
      }
      const targetHash = existsSync(target) ? fileDigest(target) : null
      const action = !targetHash ? 'add' : targetHash === sourceHash ? 'unchanged' : replace ? 'replace' : 'keep'
      const entry = { source, sourceName, sourceHash, target, targetName, targetHash, action }
      plan.set(target, entry)
      group.push(entry)
    }
    // Filling only a missing alias must not introduce a second version of an existing original.
    if (!replace && group.some(entry => entry.action === 'keep')) {
      for (const entry of group) if (entry.action === 'add') entry.action = 'blocked'
    }
  }
  return [...plan.values()]
}

export function applyRawSyncPlan(plan) {
  const writes = plan.filter(entry => entry.action === 'add' || entry.action === 'replace')
  // Validate the entire plan before the first copy so a changed source cannot cause a partial sync.
  for (const entry of writes) {
    const currentTargetHash = existsSync(entry.target) ? fileDigest(entry.target) : null
    if (fileDigest(entry.source) !== entry.sourceHash || currentTargetHash !== entry.targetHash) {
      throw new Error(`Table changed after preview; rerun synchronization: ${entry.targetName}`)
    }
  }
  for (const entry of writes) {
    mkdirSync(dirname(entry.target), { recursive: true })
    copyFileSync(entry.source, entry.target)
  }
  return writes.length
}

/**
 * 角色剧情脚本同步：`public/data/dialogs/` 从 `游戏数据/剧情` 重新裁剪生成。
 *
 * 与 `check-task-data.mjs` 对 `taskDialogs/` 做的事同源：GAoNano 剧本的 `exps`
 * 是逐帧舞台指令流（moveLayer / tag / wait / top / setLayer …），而本站唯一的
 * 消费方 `HeroStoryPanels.normalizeDialogue` **只读 `text` 与 `option`**。
 *
 * 2026-11-11 之前这个目录没有生成脚本，只能「就地瘦身」——原表更新后它不会跟着变，
 * 会导致角色档案里展开的剧情正文是旧的。现改为**从源重新生成**：
 *   1. 保留既有文件名集合（页面按 `archives[].dialogs[].id` 请求，集合由产物决定）；
 *   2. 每个文件都从 `游戏数据/剧情/<同名>.json` 重读、裁剪、写回；
 *   3. 源缺失时保留原文件并告警（不静默删）。
 *
 * 用法：
 *   node scripts/dev/sync-dialogs.mjs            # 预览
 *   node scripts/dev/sync-dialogs.mjs --apply    # 写入（变更文件先备份）
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { dialogRoot, publicDataRoot, backupRoot, configRoot } from './maintenance-paths.mjs'

/** 只保留页面真正读取的条目；非剧本结构原样返回。 */
export const pruneDialogScript = (obj) => {
  if (!obj || !Array.isArray(obj.exps)) return obj
  return { ...obj, exps: obj.exps.filter(e => e && KEEP.has(e.key)) }
}

const KEEP = new Set(['text', 'option'])

/**
 * 收集 `heroArchives.archiveDesc` 里存成**剧情 id** 的条目（如 `bsl_hero_069_1`）。
 * 这些「首次见面」档案的正文不在 archiveDesc 里，而是对应一份剧情剧本；
 * 页面要显示正文，就必须把这些剧本也收进 `public/data/dialogs/`。
 */
function collectArchiveDialogIds() {
  const archivesPath = path.join(configRoot, 'heroArchives.json')
  if (!fs.existsSync(archivesPath)) return []
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(archivesPath, 'utf8'))
  } catch {
    return []
  }
  const table = (raw?.datas || raw)?.archives || (raw?.datas || raw)
  const ids = new Set()
  for (const list of Object.values(table || {})) {
    if (!Array.isArray(list)) continue
    for (const arch of list) {
      const desc = arch && typeof arch === 'object' ? arch.archiveDesc : ''
      if (typeof desc === 'string' && /^[A-Za-z0-9_]+$/.test(desc)) ids.add(desc)
    }
  }
  return [...ids]
}

/**
 * 收集角色「互动」页签（`heroBehavior.chat` / `heroBehavior.heroEvent`）引用的剧情 id。
 *
 * 🔴 2026-11-11：这些是 `yd_*` / `fav_*` 等「好感对话」。此前 `dialogs/` 只放了任务类
 * 剧情，`yd_*` 全部没收录 → 详情页「互动」里点开就「无法加载对话文本」
 * （实测 11 个角色、81 条引用缺失）。这里按引用把它们补进产物。
 */
function collectBehaviorDialogIds() {
  const behaviorPath = path.join(configRoot, 'heroBehavior.json')
  if (!fs.existsSync(behaviorPath)) return []
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(behaviorPath, 'utf8'))
  } catch {
    return []
  }
  const table = raw?.datas || raw || {}
  const ids = new Set()
  const collect = side => {
    for (const list of side?.chat || []) {
      if (list && typeof list === 'object' && list.dialog) ids.add(list.dialog)
    }
    for (const ev of side?.heroEvent || []) {
      if (ev && typeof ev === 'object' && ev.dialog) ids.add(ev.dialog)
    }
  }
  for (const side of Object.values(table)) collect(side)
  return [...ids]
}

// 仅在直接运行时执行同步；被 import 时只导出纯函数
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirectRun) runSync()

function runSync() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean' } } })
  const APPLY = !!values.apply
  const TARGET = path.join(publicDataRoot, 'dialogs')

  if (!fs.existsSync(TARGET)) {
    console.log(`[sync-dialogs] 目录不存在：${TARGET}`)
    return
  }

  const files = fs.readdirSync(TARGET).filter(f => f.endsWith('.json'))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupDir = path.join(backupRoot, `sync-dialogs-${stamp}`)

  // 目录里已有的文件 + 需要补的：档案正文（bsl_*）+ 互动好感对话（yd_* 等）
  const existing = new Set(files)
  const wanted = new Set([...collectArchiveDialogIds(), ...collectBehaviorDialogIds()])
  const missingNeeded = [...wanted].filter(id => !existing.has(`${id}.json`) && fs.existsSync(path.join(dialogRoot, `${id}.json`)))

  let changed = 0
  let same = 0
  const missing = []
  let beforeBytes = 0
  let afterBytes = 0

  const targets = [...files, ...missingNeeded.map(id => `${id}.json`)]
  for (const f of targets) {
    const target = path.join(TARGET, f)
    const src = path.join(dialogRoot, f)
    const exists = fs.existsSync(target)
    const raw = exists ? fs.readFileSync(target, 'utf8') : ''
    beforeBytes += Buffer.byteLength(raw)
    if (!fs.existsSync(src)) {
      missing.push(f)
      afterBytes += Buffer.byteLength(raw)
      continue
    }
    let obj
    try {
      obj = JSON.parse(fs.readFileSync(src, 'utf8'))
    } catch {
      missing.push(f)
      afterBytes += Buffer.byteLength(raw)
      continue
    }
    const next = JSON.stringify(pruneDialogScript(obj), null, 2)
    afterBytes += Buffer.byteLength(next)
    if (exists && next === raw) {
      same += 1
      continue
    }
    changed += 1
    if (APPLY) {
      if (exists) {
        fs.mkdirSync(backupDir, { recursive: true })
        fs.writeFileSync(path.join(backupDir, f), raw, 'utf8')
      }
      fs.writeFileSync(target, next, 'utf8')
    }
  }

  const mb = n => (n / 1024 / 1024).toFixed(2)
  console.log(`[sync-dialogs] ${TARGET}`)
  console.log(`  文件数   : ${files.length}`)
  console.log(`  需更新   : ${changed}`)
  console.log(`  未变     : ${same}`)
  console.log(`  源缺失   : ${missing.length}${missing.length ? ` -> ${missing.slice(0, 8).join(', ')}` : ''}`)
  console.log(`  体积     : ${mb(beforeBytes)} MB -> ${mb(afterBytes)} MB`)
  if (APPLY) console.log(`  已写回   : ${changed} 个；原件备份在 ${backupDir}`)
  else console.log('  [preview] 只读预览；加 --apply 才写回（并备份原始文件）。')
}

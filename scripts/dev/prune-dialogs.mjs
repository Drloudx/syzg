/**
 * 角色剧情脚本瘦身：`public/data/dialogs/` 只保留页面读取的条目。
 *
 * 与 `check-task-data.mjs` 对 `taskDialogs/` 做的事同源：GAoNano 剧本的 `exps`
 * 是逐帧舞台指令流（moveLayer / tag / wait / top / setLayer …），而本站唯一的
 * 消费方 `HeroStoryPanels.normalizeDialogue` **只读 `text` 与 `option`**。
 *
 * 差异在于：`taskDialogs/` 由 `check-task-data.mjs --apply` 从 GAoNano 重新复制，
 * 而 `dialogs/` **没有生成脚本**（2026-08-28 随仓库加入的目录，内容与 taskDialogs 有 82 个同名），
 * 所以这里做成**就地瘦身**：读原文件、裁剪、写回，并在项目同级备份原文件。
 *
 * 默认预览；`--apply` 才写。写过一次后再跑是幂等的（已是精简形态时无变化）。
 *
 * 用法：
 *   node scripts/dev/prune-dialogs.mjs            # 预览
 *   node scripts/dev/prune-dialogs.mjs --apply    # 写回 + 备份
 *   node scripts/dev/prune-dialogs.mjs --dir <目录> [--apply]
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { publicDataRoot, backupRoot } from './maintenance-paths.mjs'

const { values } = parseArgs({ options: {
  apply: { type: 'boolean' },
  dir: { type: 'string' }
} })
const APPLY = !!values.apply
const TARGET = path.resolve(values.dir || path.join(publicDataRoot, 'dialogs'))

const KEEP = new Set(['text', 'option'])

/** 只保留页面真正读取的条目；非剧本结构原样返回。 */
export const pruneDialogScript = (obj) => {
  if (!obj || !Array.isArray(obj.exps)) return obj
  return { ...obj, exps: obj.exps.filter(e => e && KEEP.has(e.key)) }
}

if (!fs.existsSync(TARGET)) {
  console.log(`[prune] 目录不存在：${TARGET}`)
  process.exit(0)
}

const files = fs.readdirSync(TARGET).filter(f => f.endsWith('.json'))
let before = 0
let after = 0
let changedCount = 0
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const backupDir = path.join(backupRoot, `prune-dialogs-${stamp}`)

for (const f of files) {
  const p = path.join(TARGET, f)
  const raw = fs.readFileSync(p, 'utf-8')
  let obj
  try { obj = JSON.parse(raw) } catch { console.log(`[prune] 跳过非法 JSON：${f}`); continue }
  const pruned = JSON.stringify(pruneDialogScript(obj), null, 2)
  before += Buffer.byteLength(raw)
  after += Buffer.byteLength(pruned)
  if (raw === pruned) continue
  changedCount++
  if (APPLY) {
    fs.mkdirSync(backupDir, { recursive: true })
    fs.writeFileSync(path.join(backupDir, f), raw, 'utf-8') // 备份原始文件
    fs.writeFileSync(p, pruned, 'utf-8')
  }
}

const mb = n => (n / 1024 / 1024).toFixed(2)
console.log(`[prune] ${TARGET}`)
console.log(`  文件数     : ${files.length}`)
console.log(`  需处理     : ${changedCount}`)
console.log(`  体积       : ${mb(before)} MB -> ${mb(after)} MB`)
if (APPLY) {
  console.log(`  已写回     : ${changedCount} 个；原始文件备份在 ${backupDir}`)
} else {
  console.log('  [preview] 只读预览；加 --apply 才写回（并备份原始文件）。')
}

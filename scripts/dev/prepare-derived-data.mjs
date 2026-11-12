/**
 * 数据构建总入口前置：把「不随 sync-raw 自动更新」的派生数据一次性对齐。
 *
 * 为什么单独一层：`sync-raw` 会跳过 `DERIVED_RAW_FILES`；`public/data/dialogs` 与
 * `public/data/taskDialogs` 也不是 `scripts/parse` 的产物（分别是就地裁剪与
 * `check-task-data` 维护）。以前这些都靠手工记得跑，漏掉就**静默**沿用旧数据。
 *
 * 顺序有依赖：派生 raw 表 → taskDialogs（依赖最新剧情）→ dialogs → 再交给 parse。
 *
 * 用法：
 *   node scripts/dev/prepare-derived-data.mjs           # 预览
 *   node scripts/dev/prepare-derived-data.mjs --apply   # 实际同步
 */
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { values } = parseArgs({ options: { apply: { type: 'boolean' } } })
const APPLY = !!values.apply

const steps = [
  ['派生 raw 表', ['scripts/dev/rebuild-derived-raw.mjs']],
  ['任务剧情副本', ['scripts/dev/check-task-data.mjs']],
  ['角色剧情脚本', ['scripts/dev/sync-dialogs.mjs']]
]

let failed = 0
for (const [label, args] of steps) {
  const argv = [...args, ...(APPLY ? ['--apply'] : [])]
  console.log(`\n── ${label} ── node ${argv.join(' ')}`)
  const r = spawnSync(process.execPath, argv, { cwd: REPO, stdio: 'inherit' })
  if (r.status !== 0) {
    failed += 1
    console.error(`  ❌ ${label} 失败（exit ${r.status}）`)
  }
}

if (failed) {
  console.error(`\n[prepare-derived-data] ${failed} 个步骤失败`)
  process.exit(1)
}
console.log(`\n[prepare-derived-data] ${APPLY ? '已同步' : '预览完成'}（${steps.length} 步全部通过）`)

/**
 * 从 public/images 删除「未被引用且源目录有同名文件」的图片。
 *
 * 安全措施：
 *   - 只删 docs/audit/images-deletable-v3.txt 里列出的路径
 *   - 删前逐个校验：文件存在 + stem 在源目录（游戏数据/）里确实有
 *   - 任何一条校验不过就跳过并报告，不硬删
 *   - --dry 只看不删
 */
import { readFileSync, existsSync, unlinkSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const DRY = process.argv.includes('--dry')
const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const DATA_ROOT = process.env.MYRZG_DATA_DIR || join(dirname(root), '游戏数据')
const imageRoot = join(root, 'public/images')
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg)$/i

const walk = dir => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

/* 源目录名索引 */
const sourceNames = new Set()
for (const sub of ['图片资源/图集', '图片资源/单图', '资源包']) {
  const dir = join(DATA_ROOT, sub)
  if (!existsSync(dir)) continue
  for (const f of walk(dir)) if (IMAGE_EXT.test(f)) sourceNames.add(basename(f).replace(IMAGE_EXT, ''))
}

const lines = readFileSync(join(root, 'docs/audit/images-deletable-v3.txt'), 'utf8').split('\n').filter(Boolean)
console.log(`=== ${DRY ? 'DRY-RUN' : '执行'}：清单 ${lines.length} 个 ===\n`)

let deleted = 0, deletedKb = 0, skipped = 0
const skipReasons = []

for (const line of lines) {
  const parts = line.split("\t"); const kb = parts[0]; const path = parts[parts.length - 1]
  const abs = join(imageRoot, path)
  const stem = basename(path).replace(IMAGE_EXT, '')

  if (!existsSync(abs)) { skipped += 1; skipReasons.push(`不存在: ${path}`); continue }
  if (!sourceNames.has(stem)) { skipped += 1; skipReasons.push(`源目录无同名: ${path}`); continue }

  const realKb = statSync(abs).size / 1024
  if (!DRY) unlinkSync(abs)
  deleted += 1
  deletedKb += realKb
}

console.log(`  ${DRY ? '将删除' : '已删除'}: ${deleted} 个 / ${(deletedKb / 1024).toFixed(2)} MB`)
console.log(`  跳过:     ${skipped} 个`)
for (const r of skipReasons.slice(0, 10)) console.log(`    ${r}`)
if (skipReasons.length > 10) console.log(`    …还有 ${skipReasons.length - 10} 条`)

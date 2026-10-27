/**
 * 终版审计 v3 —— 补上 v2 漏掉的两类引用。
 *
 * v1/v2 的漏判（实测踩到，勿重蹈）：
 *   (1) **版本表污染**：dist 里 `__IMAGE_VERSIONS__` 列了 public/images 全部文件，
 *       当成"被引用"会得出"全都在用"的假结论 → v1 栽在这。
 *   (2) **数据里的完整路径**：data JSON 有 `"/images/chapters/map_w1_c0.webp"` 这种
 *       整条路径（不是单纯文件名）。v2 只比对「文件主 stem」，永远匹配不上
 *       → 误删 174 个，被 camp-facilities 单测抓到。
 *
 * v3 判据（任一命中即「在用」）：
 *   A. 剥掉版本表后，dist 代码含该 stem
 *   B. src 源码含该 stem（JS/Vue/CSS 的 url()）
 *   C. data JSON 含该 stem（"stem" 形式）
 *   D. data JSON 含该「相对路径」（如 chapters/map_w1_c0.webp）← v3 新增
 *   E. 插值前缀匹配（`gacha_egg_${n}` → 前缀 gacha_egg_）
 *   F. 数字拼接规则（at{3位}_0 且该编号在数据中有对应 id）
 */
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const DATA_ROOT = process.env.MYRZG_DATA_DIR || join(dirname(root), '游戏数据')
const imageRoot = join(root, 'public/images')
const outDir = join(root, 'docs/audit')
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg)$/i
const slash = v => v.replaceAll('\\', '/')

const walk = dir => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name)
    return e.isDirectory() ? walk(p) : [p]
  })
}

/* A. dist 代码（剥版本表） */
let code = ''
if (existsSync(join(root, 'dist/assets'))) {
  for (const f of readdirSync(join(root, 'dist/assets'))) {
    if (!/\.(js|css)$/.test(f)) continue
    code += '\n' + readFileSync(join(root, 'dist/assets', f), 'utf8').replace(/"\/images\/[^"]+":\{[^}]*\}/g, '""')
  }
}

/* B. src 源码 */
let srcText = ''
for (const f of walk(join(root, 'src'))) {
  if (/\.(js|vue|mjs|css)$/.test(f)) srcText += '\n' + readFileSync(f, 'utf8')
}

/* C/D. data JSON：既收 stem，也收完整相对路径 */
const dataStems = new Set()
const dataPaths = new Set()
const walkJson = (v, d = 0) => {
  if (d > 12 || v === null) return
  if (typeof v === 'string') {
    if (v.length < 120 && !v.includes(' ') && !v.includes('/')) dataStems.add(v)
    for (const m of v.matchAll(/\/images\/([^"'\s]+\.(?:webp|png|jpe?g|gif|avif|svg))/gi)) dataPaths.add(m[1])
    return
  }
  if (Array.isArray(v)) return v.forEach(x => walkJson(x, d + 1))
  if (typeof v === 'object') return Object.values(v).forEach(x => walkJson(x, d + 1))
}
for (const f of walk(join(root, 'public/data'))) {
  if (f.endsWith('.json')) { try { walkJson(JSON.parse(readFileSync(f, 'utf8'))) } catch { /* ignore */ } }
}

/* E. 插值前缀 */
const patterns = []
for (const m of `${code}\n${srcText}`.matchAll(/([A-Za-z][A-Za-z0-9_\-]{2,})[$][{]/g)) patterns.push(m[1])

/* F. 数字拼接 id 集合 */
const idSet = new Set()
const dataAll = [...dataStems, ...dataPaths].join(' ')
for (const m of dataAll.matchAll(/(?:new_)?hero_0*(\d+)/g)) idSet.add(String(m[1]).padStart(3, '0'))
const AT_RULE = /^at(\d{3})_[01]$/

/* 源目录：能否重新导入 */
const sourceNames = new Set()
for (const sub of ['图片资源/图集', '图片资源/单图', '资源包']) {
  const dir = join(DATA_ROOT, sub)
  if (!existsSync(dir)) continue
  for (const f of walk(dir)) if (IMAGE_EXT.test(f)) sourceNames.add(basename(f).replace(IMAGE_EXT, ''))
}

const rows = []
for (const file of walk(imageRoot).filter(f => IMAGE_EXT.test(f))) {
  const rel = slash(relative(imageRoot, file))
  const stem = basename(file).replace(IMAGE_EXT, '')
  const kb = +(statSync(file).size / 1024).toFixed(1)

  const hits = []
  if (code.includes(stem)) hits.push('dist')
  if (srcText.includes(stem)) hits.push('src')
  if (dataStems.has(stem)) hits.push('data-stem')
  if (dataPaths.has(rel)) hits.push('data-path')
  if (patterns.some(p => stem.startsWith(p))) hits.push('pattern')
  const at = AT_RULE.exec(stem)
  if (at && idSet.has(at[1])) hits.push('at-rule')

  const referenced = hits.length > 0
  rows.push({
    path: rel, kb, referenced, via: hits.join('+') || '-',
    inSource: sourceNames.has(stem),
    verdict: referenced ? 'referenced' : (sourceNames.has(stem) ? 'orphanFromSource' : 'orphanLocalOnly'),
  })
}

const g = v => rows.filter(r => r.verdict === v)
const mb = l => +(l.reduce((a, r) => a + r.kb, 0) / 1024).toFixed(2)
const ref = g('referenced'), del = g('orphanFromSource'), keep = g('orphanLocalOnly')

console.log('=== 图片引用审计 v3 ===\n')
console.log(`  总计            ${rows.length} 个 / ${mb(rows)} MB`)
console.log(`  ✅ 被引用        ${ref.length} 个 / ${mb(ref)} MB`)
console.log(`  🟡 未引用·源里有  ${del.length} 个 / ${mb(del)} MB`)
console.log(`  🔴 未引用·源里无  ${keep.length} 个 / ${mb(keep)} MB`)
console.log(`\n  判据覆盖：data 完整路径 ${dataPaths.size} 条 ｜ 插值前缀 ${patterns.length} ｜ 数字id ${idSet.size}`)

mkdirSync(outDir, { recursive: true })
const dump = (n, l) => writeFileSync(join(outDir, n), l.map(r => `${r.kb}\t${r.via}\t${r.path}`).join('\n') + '\n', 'utf8')
dump('images-referenced.txt', ref)
dump('images-deletable-v3.txt', del)
dump('images-local-only.txt', keep)

console.log(`\n  清单：images-deletable-v3.txt (${del.length} 个 / ${mb(del)} MB)`)

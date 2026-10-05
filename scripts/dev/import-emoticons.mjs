/**
 * 导入聊天表情素材到 `public/images/emoticons/`。
 *
 * 源（本机维护目录，可用环境变量覆盖）：
 *   - 黄豆：`E:\Desktop\微信表情包\贴吧经典黄豆表情包` 下的**两个子目录，按顺序导入**：
 *     `tb_黄豆表情`（60 张）在前、`tb_物品与符号`（25 张）在后 → `MYRZG_EMOTICON_SRC_TIEBA`
 *   - 《深渊之歌》第 1 弹：`E:\Desktop\微信表情包\深渊之歌第1弹`（`syzg_*.png`，240×240）
 *     → `MYRZG_EMOTICON_SRC_ABYSS`
 *   - 按钮图标：`public/ui/emoticon.svg`（矢量，随仓库维护；不再从图标包导入）
 *
 * 为什么转 WebP：仓库运行时图片统一为 `.webp`（见 2026-09-18 日报与 `import-buff-icons.mjs`），
 * 新素材按同一口径导入。这里用**无损 WebP**——像素与原图逐字节一致，因此不属于
 * "压缩"（SPEC 六：压缩需用户明确授权），只是换容器。
 *
 * **清单不另维护**：表情清单（含中文名与顺序）就是 `src/config/emoticons.js` 的
 * `EMOTICON_PACKS`，两个方向都核对——目录里每个表情都能在源目录找到文件、
 * 源目录里也没有被漏掉的文件。少一张图、改了名字、加了没登记的新图都会直接报错，
 * 不会静默产出"有词条没图"或"有图没词条"。
 *
 * 用法：
 *   node scripts/dev/import-emoticons.mjs            # 预览（默认，不写任何文件）
 *   node scripts/dev/import-emoticons.mjs --apply
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { EMOTICON_PACKS } from '../../src/config/emoticons.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const apply = process.argv.includes('--apply')

const TIEBA_ROOT =
  process.env.MYRZG_EMOTICON_SRC_TIEBA || 'E:/Desktop/微信表情包/贴吧经典黄豆表情包'
/** 黄豆包的来源子目录：**顺序即选择器里的分组顺序**（用户指定：黄豆在前、物品在后） */
const TIEBA_SUBDIRS = ['tb_黄豆表情', 'tb_物品与符号']
const ABYSS_SOURCE =
  process.env.MYRZG_EMOTICON_SRC_ABYSS || 'E:/Desktop/微信表情包/深渊之歌第1弹'

const PUBLIC_ROOT = path.join(root, 'public')

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const rel = (to) => path.relative(root, to).replaceAll('\\', '/')

/** 各表情包的源：`[{ dir, label }]`，数组顺序 = 分组顺序 */
const PACK_SOURCES = {
  tieba: TIEBA_SUBDIRS.map((name) => ({ dir: path.join(TIEBA_ROOT, name), label: name })),
  abyss1: [{ dir: ABYSS_SOURCE, label: path.basename(ABYSS_SOURCE) }]
}

/**
 * 一个源目录里可用的素材：`<文件名（不含扩展名）>` → `{ path, ext }`。
 *
 * 同时接受 `.png`（原始导出）与 `.webp`（维护目录里已经就地转过格式的情况——
 * 实测出现过：用户整理素材时直接把整包转成了 WebP）。同名时优先 `.png`。
 */
function sourceFiles(dir) {
  if (!fs.existsSync(dir)) throw new Error(`源目录不存在：${dir}`)
  const map = new Map()
  for (const name of fs.readdirSync(dir)) {
    const ext = path.extname(name).toLowerCase()
    if (ext !== '.png' && ext !== '.webp') continue
    const stem = path.basename(name, path.extname(name))
    const current = map.get(stem)
    if (current && current.ext === '.png') continue
    map.set(stem, { path: path.join(dir, name), ext })
  }
  return map
}

const plan = []
const problems = []

for (const pack of EMOTICON_PACKS) {
  const sources = PACK_SOURCES[pack.id]
  if (!sources) throw new Error(`${pack.id} 没有配置源目录（PACK_SOURCES）`)

  // 目录表里有重名 key 的话，后面"漏登记/多余文件"的判断会失去意义
  const keys = pack.items.map((item) => item.key)
  if (new Set(keys).size !== keys.length) problems.push(`${pack.id}：目录表里有重复的表情名`)

  const seen = new Set()
  for (const source of sources) {
    const files = sourceFiles(source.dir)
    for (const [stem, entry] of files) {
      if (seen.has(stem)) {
        problems.push(`${pack.id}：${stem} 在多个来源目录里重复出现（${source.label}）`)
        continue
      }
      seen.add(stem)
    }
  }

  for (const item of pack.items) {
    if (!item.name) {
      problems.push(`${pack.id}/${item.key}：目录表里没有中文名`)
      continue
    }
    const stem = path.basename(item.file, '.webp')
    let source = null
    for (const spec of sources) {
      const files = sourceFiles(spec.dir)
      if (files.has(stem)) {
        source = { ...files.get(stem), label: spec.label }
        break
      }
    }
    if (!source) {
      problems.push(`${pack.id}/${item.key}：源目录里找不到 ${stem}.png（或 .webp）`)
      continue
    }

    const sourceBytes = fs.readFileSync(source.path)
    const meta = await sharp(sourceBytes).metadata()
    const output = await sharp(sourceBytes).webp({ lossless: true, effort: 5 }).toBuffer()
    plan.push({
      pack: pack.id,
      key: item.key,
      name: item.name,
      from: `${source.label}/${path.basename(source.path)}`,
      to: rel(path.join(PUBLIC_ROOT, item.path.replace(/^\//, ''))),
      size: `${meta.width}x${meta.height}`,
      sourceKB: +(sourceBytes.length / 1024).toFixed(2),
      outputKB: +(output.length / 1024).toFixed(2),
      sourceSha256: hash(sourceBytes),
      _output: output
    })
  }

  // 反向核对：源目录里有、目录表里没有的素材（漏登记或命名不符）
  for (const stem of seen) {
    if (!keys.includes(stem)) problems.push(`${pack.id}：源目录的 ${stem} 不在表情目录表里（漏登记？）`)
  }
  // 顺序核对：plan 里这一包的顺序必须与目录表一致
  const plannedKeys = plan.filter((entry) => entry.pack === pack.id).map((entry) => entry.key)
  if (plannedKeys.join('|') !== pack.items.slice(0, plannedKeys.length).map((i) => i.key).join('|')) {
    problems.push(`${pack.id}：导入顺序与目录表不一致`)
  }
}

if (problems.length) {
  console.error('[import-emoticons] 清单与素材不一致，未写入任何文件：')
  for (const problem of problems) console.error(`  ✗ ${problem}`)
  process.exit(1)
}

const byPack = EMOTICON_PACKS.map((pack) => {
  const entries = plan.filter((entry) => entry.pack === pack.id)
  return {
    id: pack.id,
    label: pack.label,
    items: entries.length,
    sourceKB: +entries.reduce((sum, e) => sum + e.sourceKB, 0).toFixed(1),
    outputKB: +entries.reduce((sum, e) => sum + e.outputKB, 0).toFixed(1),
    sources: PACK_SOURCES[pack.id].map((s) => `${s.label}（${sourceFiles(s.dir).size}）`)
  }
})

const sourceTotal = plan.reduce((sum, entry) => sum + entry.sourceKB, 0)
const outputTotal = plan.reduce((sum, entry) => sum + entry.outputKB, 0)

console.log(
  JSON.stringify(
    {
      mode: apply ? 'apply' : 'preview',
      target: 'public/images/emoticons/**',
      files: plan.length,
      byPack,
      sourceTotalKB: +sourceTotal.toFixed(1),
      outputTotalKB: +outputTotal.toFixed(1),
      savingPercent: +((1 - outputTotal / sourceTotal) * 100).toFixed(1),
      first: plan.slice(0, 3).map(({ pack, key, name, size }) => `${pack}/${key}=${name} ${size}`),
      last: plan.slice(-3).map(({ pack, key, name, size }) => `${pack}/${key}=${name} ${size}`)
    },
    null,
    1
  )
)

if (!apply) {
  console.log('[import-emoticons] 预览模式，未写入任何文件。加 --apply 写入。')
  process.exit(0)
}

for (const entry of plan) {
  const outPath = path.join(root, entry.to)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, entry._output)
  // 逐字节回读校验：写坏的图片在浏览器里只表现为"图挂了"，不会在导入时报错
  if (hash(fs.readFileSync(outPath)) !== hash(entry._output)) throw new Error(`写入校验失败：${outPath}`)
}

/*
 * 清掉这一包里已经不在目录表中的旧文件（例如整包换命名方案时留下的 image_emoticon*.webp）。
 * **只删本包目录内、且不在目录表里的文件**，删除前列出清单；不动其他目录。
 */
let removed = 0
for (const pack of EMOTICON_PACKS) {
  const dir = path.join(PUBLIC_ROOT, pack.dir.replace(/^\//, ''))
  if (!fs.existsSync(dir)) continue
  const wanted = new Set(pack.items.map((item) => item.file))
  for (const name of fs.readdirSync(dir)) {
    if (wanted.has(name)) continue
    fs.unlinkSync(path.join(dir, name))
    removed += 1
  }
}

console.log(
  `已写入 ${plan.length} 个表情到 public/images/emoticons（${outputTotal.toFixed(1)} KB）` +
    (removed ? `，清理了 ${removed} 个不在目录表里的旧文件` : '')
)

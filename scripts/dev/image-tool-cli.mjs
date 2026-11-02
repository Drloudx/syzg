/**
 * 图片处理工具 —— 供 exe 调用的后端脚本。
 *
 * 为什么拆成「exe(GUI) + 这个脚本」：
 *   sharp 是原生模块（libvips，19 MB DLL），pkg / Node SEA 都无法把原生模块
 *   打进单文件。而 node.exe 自身 90 MB，塞进 exe 会让体积失控。
 *   所以 exe 只做界面，真正的转换交给这个脚本（用项目里已装的 sharp）。
 *
 * 用法（exe 会这样调）：
 *   node scripts/dev/image-tool-cli.mjs --files "a.png" "b.jpg" --quality 85 --max-width 960
 *   node scripts/dev/image-tool-cli.mjs --dir "D:/pics" --quality 85 --max-width 960
 *
 * 输出：JSON 行（每处理完一个文件输出一行），便于 exe 实时显示进度。
 *
 * 🔴 输出到**同目录**，保留原图（用户选的策略）。
 */
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, join, dirname, basename } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    files: { type: 'string', multiple: true },
    dir: { type: 'string' },
    quality: { type: 'string' },
    'max-width': { type: 'string' },
    'recursive': { type: 'boolean' },
    'delete-original': { type: 'boolean' }
  }
})

const QUALITY = Number.parseInt(values.quality || '85', 10)
const MAX_WIDTH = values['max-width'] ? Number.parseInt(values['max-width'], 10) : null
const RECURSIVE = Boolean(values.recursive)
const DELETE_ORIGINAL = Boolean(values['delete-original'])

if (!Number.isFinite(QUALITY) || QUALITY < 1 || QUALITY > 100) {
  console.log(JSON.stringify({ type: 'fatal', message: `quality 需为 1..100，收到 ${values.quality}` }))
  process.exit(1)
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff', '.gif', '.avif', '.heic'])

/** 收集待处理文件 */
function collectFiles() {
  const out = []

  // ① 显式文件列表
  if (values.files?.length) {
    for (const f of values.files) {
      if (!existsSync(f)) {
        console.log(JSON.stringify({ type: 'skip', file: f, reason: '文件不存在' }))
        continue
      }
      if (!IMAGE_EXT.has(extname(f).toLowerCase())) {
        console.log(JSON.stringify({ type: 'skip', file: f, reason: '不是支持的图片格式' }))
        continue
      }
      out.push(f)
    }
  }

  // ② 目录（可递归）
  if (values.dir) {
    if (!existsSync(values.dir)) {
      console.log(JSON.stringify({ type: 'fatal', message: `目录不存在：${values.dir}` }))
      process.exit(1)
    }
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) {
          if (RECURSIVE) walk(p)
          continue
        }
        if (IMAGE_EXT.has(extname(e.name).toLowerCase())) out.push(p)
      }
    }
    walk(values.dir)
  }

  return out
}

const files = collectFiles()
console.log(JSON.stringify({ type: 'start', total: files.length, quality: QUALITY, maxWidth: MAX_WIDTH }))

if (!files.length) {
  console.log(JSON.stringify({ type: 'done', ok: 0, skip: 0, fail: 0, savedBytes: 0 }))
  process.exit(0)
}

const { default: sharp } = await import('sharp')

let ok = 0, skip = 0, fail = 0
let origTotal = 0, newTotal = 0

for (const f of files) {
  const name = basename(f)
  try {
    const before = statSync(f).size
    const buf = readFileSync(f)
    const meta = await sharp(buf).metadata()

    // WebP 输入：跳过（已经是目标格式）
    if (meta.format === 'webp') {
      console.log(JSON.stringify({ type: 'skip', file: name, reason: '已是 WebP' }))
      skip++
      origTotal += before
      newTotal += before
      continue
    }

    let pipeline = sharp(buf)
    if (MAX_WIDTH && meta.width && meta.width > MAX_WIDTH) {
      pipeline = pipeline.resize({ width: MAX_WIDTH })
    }
    const out = await pipeline.webp({ quality: QUALITY, effort: 5 }).toBuffer()

    // 压缩后反而变大 → 不写，保留原文件
    if (out.length >= before) {
      console.log(JSON.stringify({
        type: 'skip', file: name,
        reason: `压缩后更大（${Math.round(before / 1024)} → ${Math.round(out.length / 1024)} KB）`
      }))
      skip++
      origTotal += before
      newTotal += before
      continue
    }

    const target = join(dirname(f), basename(f, extname(f)) + '.webp')
    writeFileSync(target, out)

    // 复核可解码
    const check = await sharp(target).metadata()
    if (check.format !== 'webp' || !check.width) {
      throw new Error('产出的 WebP 无法解码')
    }

    ok++
    origTotal += before
    newTotal += out.length
    console.log(JSON.stringify({
      type: 'ok',
      file: name,
      out: basename(target),
      beforeKB: Math.round(before / 1024),
      afterKB: Math.round(out.length / 1024),
      saving: Math.round((1 - out.length / before) * 100)
    }))

    if (DELETE_ORIGINAL && target !== f) {
      const { unlinkSync } = await import('node:fs')
      unlinkSync(f)
      console.log(JSON.stringify({ type: 'deleted', file: name }))
    }
  } catch (err) {
    fail++
    console.log(JSON.stringify({ type: 'fail', file: name, message: String(err?.message || err) }))
  }
}

console.log(JSON.stringify({
  type: 'done',
  ok,
  skip,
  fail,
  origKB: Math.round(origTotal / 1024),
  newKB: Math.round(newTotal / 1024),
  savedKB: Math.round((origTotal - newTotal) / 1024)
}))

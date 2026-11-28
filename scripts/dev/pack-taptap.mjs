import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const TAPTAP_TOP_DIR = 'syzg-wiki'
export const TAPTAP_MAX_ZIP_BYTES = 300 * 1024 * 1024 // 314572800 字节

const EXCLUDED_DIRS = new Set(['tools', 'update', 'test2', '.git', 'node_modules'])
const EXCLUDED_ROOT_FILES = new Set([
  'preview-rewards.html',
  '_headers',
  '_redirects',
  '_routes.json',
  'baidu-analytics.js'
])

const crc32Table = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c >>> 0
  }
  return table
})()

function computeCrc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crc32Table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function toDosTimeDate(mtime = new Date()) {
  const d = mtime instanceof Date ? mtime : new Date(mtime)
  const year = Math.max(1980, d.getFullYear())
  const dosTime = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f)
  const dosDate = (((year - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f)
  return { dosTime, dosDate }
}

/**
 * 纯 Node 构建标准 ZIP（强制 POSIX `/` 路径、UTF-8 标志、按压缩收益自动选 DEFLATE / STORE）。
 * @param {Array<{ name: string, data: Buffer, mtime?: Date }>} entries
 */
export function buildZipBuffer(entries) {
  const localChunks = []
  const centralChunks = []
  let offset = 0
  const seen = new Set()

  for (const entry of entries) {
    const name = String(entry.name || '').replace(/\\/g, '/')
    if (!name || name.startsWith('/') || name.split('/').includes('..')) {
      throw new Error(`非法 ZIP 条目路径: ${name}`)
    }
    if (seen.has(name)) {
      throw new Error(`重复 ZIP 条目: ${name}`)
    }
    seen.add(name)

    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const deflated = zlib.deflateRawSync(raw)
    const useDeflate = deflated.length < raw.length
    const payload = useDeflate ? deflated : raw
    const method = useDeflate ? 8 : 0
    const crc = computeCrc32(raw)
    const nameBuf = Buffer.from(name, 'utf8')
    const { dosTime, dosDate } = toDosTimeDate(entry.mtime)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt16LE(0x0800, 6) // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(payload.length, 18)
    localHeader.writeUInt32LE(raw.length, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28)

    localChunks.push(localHeader, nameBuf, payload)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(0x0314, 4) // Unix + PKZIP 2.0
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(method, 10)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(payload.length, 20)
    centralHeader.writeUInt32LE(raw.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    centralChunks.push(centralHeader, nameBuf)
    offset += localHeader.length + nameBuf.length + payload.length
  }

  const centralSize = centralChunks.reduce((sum, b) => sum + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localChunks, ...centralChunks, eocd])
}

/** 回读 ZIP 中央目录以校验条目结构（防止目录扁平或越界）。 */
export function inspectZipBuffer(zipBuf) {
  let eocdOffset = -1
  for (let i = zipBuf.length - 22; i >= Math.max(0, zipBuf.length - 65557); i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) throw new Error('ZIP 缺少 EOCD 尾记录')
  const count = zipBuf.readUInt16LE(eocdOffset + 10)
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16)
  const names = []
  let pos = cdOffset
  for (let idx = 0; idx < count; idx++) {
    if (zipBuf.readUInt32LE(pos) !== 0x02014b50) throw new Error(`ZIP 中央目录头损坏 at ${pos}`)
    const nameLen = zipBuf.readUInt16LE(pos + 28)
    const extraLen = zipBuf.readUInt16LE(pos + 30)
    const commentLen = zipBuf.readUInt16LE(pos + 32)
    names.push(zipBuf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8'))
    pos += 46 + nameLen + extraLen + commentLen
  }
  return names
}

/** 清理 TapTap 不需要的外围文件和开发/平台配置。 */
export function pruneTapTapDir(targetDir) {
  const removed = []
  for (const dirName of EXCLUDED_DIRS) {
    const p = path.join(targetDir, dirName)
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true })
      removed.push(`${dirName}/`)
    }
  }
  for (const fileName of EXCLUDED_ROOT_FILES) {
    const p = path.join(targetDir, fileName)
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true })
      removed.push(fileName)
    }
  }
  function sweep(cur) {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__MACOSX' || EXCLUDED_DIRS.has(entry.name)) {
          fs.rmSync(p, { recursive: true, force: true })
          removed.push(path.relative(targetDir, p).replace(/\\/g, '/') + '/')
        } else {
          sweep(p)
        }
      } else if (
        entry.name === '.DS_Store' ||
        entry.name === 'Thumbs.db' ||
        entry.name.startsWith('._') ||
        entry.name.startsWith('.env') ||
        entry.name.startsWith('.dev.vars') ||
        entry.name.endsWith('.map')
      ) {
        fs.rmSync(p, { force: true })
        removed.push(path.relative(targetDir, p).replace(/\\/g, '/'))
      }
    }
  }
  sweep(targetDir)
  return removed
}

/** 静态自检构建产物是否满足 TapTap 工具箱规则。 */
export function validateTapTapBuildDir(targetDir) {
  const indexHtmlPath = path.join(targetDir, 'index.html')
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(`缺少入口文件: ${indexHtmlPath}`)
  }
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8')
  const absIndexHits = indexHtml.match(/(?:src|href)=["']\/(?!\/)[^"']*["']/g) || []
  if (absIndexHits.length) {
    throw new Error(`index.html 存在根绝对路径: ${absIndexHits.join(', ')}`)
  }
  if (/<script[^>]*baidu-analytics\.js/i.test(indexHtml)) {
    throw new Error('index.html 仍引用了 baidu-analytics.js')
  }

  const assetsDir = path.join(targetDir, 'assets')
  if (fs.existsSync(assetsDir)) {
    for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.css')) continue
      const css = fs.readFileSync(path.join(assetsDir, entry.name), 'utf8')
      const absCssHits = css.match(/url\((['"]?)\/(images|ui|fonts|assets|data)\/[^'")]+/g) || []
      if (absCssHits.length) {
        throw new Error(`${entry.name} 存在未转成相对路径的 CSS url(): ${absCssHits.slice(0, 5).join(', ')}`)
      }
    }
  }
}

export function validateZipStructure(zipBuf, topDir = TAPTAP_TOP_DIR) {
  if (zipBuf.length > TAPTAP_MAX_ZIP_BYTES) {
    throw new Error(`ZIP 超过 300 MiB 上限 (${zipBuf.length} > ${TAPTAP_MAX_ZIP_BYTES})`)
  }
  const names = inspectZipBuffer(zipBuf)
  const topDirs = new Set()
  let hasEntryHtml = false
  for (const name of names) {
    if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) {
      throw new Error(`ZIP 存在非法路径: ${name}`)
    }
    const parts = name.split('/')
    if (parts.length < 2) {
      throw new Error(`ZIP 根目录不允许出现散落文件或无嵌套路径: ${name}`)
    }
    topDirs.add(parts[0])
    if (name === `${topDir}/index.html`) hasEntryHtml = true
  }
  if (topDirs.size !== 1 || !topDirs.has(topDir)) {
    throw new Error(`ZIP 必须只有一个顶层文件夹 "${topDir}"，实际: ${[...topDirs].join(', ')}`)
  }
  if (!hasEntryHtml) {
    throw new Error(`ZIP 顶层文件夹第一层缺少 ${topDir}/index.html`)
  }
  return { count: names.length, topDir }
}

function collectFiles(rootDir) {
  const list = []
  function walk(cur) {
    const items = fs.readdirSync(cur, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    for (const item of items) {
      const full = path.join(cur, item.name)
      if (item.isDirectory()) walk(full)
      else if (item.isFile()) list.push(full)
    }
  }
  walk(rootDir)
  return list
}

function parseVersionArg() {
  const idx = process.argv.indexOf('--version')
  if (idx !== -1 && process.argv[idx + 1]) return String(process.argv[idx + 1]).trim()
  if (process.env.TAPTAP_VERSION) return String(process.env.TAPTAP_VERSION).trim()
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  return String(pkg.version || '1.0.0').replace(/^v/, '')
}

function main() {
  const version = parseVersionArg().replace(/[^0-9A-Za-z._-]/g, '-')
  const distRoot = path.join(repoRoot, 'dist-taptap')
  const stageDir = path.join(distRoot, TAPTAP_TOP_DIR)
  const zipPath = path.join(distRoot, `${TAPTAP_TOP_DIR}-${version}.zip`)

  fs.rmSync(distRoot, { recursive: true, force: true })

  console.log(`[pack-taptap] 1/4 运行 Vite TapTap 构建 (VITE_TARGET=taptap)...`)
  const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const res = spawnSync(process.execPath, [viteBin, 'build'], {
    cwd: repoRoot,
    env: { ...process.env, VITE_TARGET: 'taptap' },
    stdio: 'inherit'
  })
  if (res.status !== 0) {
    process.exit(res.status || 1)
  }

  console.log(`[pack-taptap] 2/4 清理非 TapTap 文件...`)
  const removed = pruneTapTapDir(stageDir)
  console.log(`[pack-taptap] 已移除 ${removed.length} 项冗余文件/目录: ${removed.join(', ') || '(无)'}`)

  console.log(`[pack-taptap] 3/4 静态自检...`)
  validateTapTapBuildDir(stageDir)

  console.log(`[pack-taptap] 4/4 打包 ZIP (${zipPath})...`)
  const files = collectFiles(stageDir)
  const entries = files.map(fullPath => {
    const rel = path.relative(stageDir, fullPath).replace(/\\/g, '/')
    const st = fs.statSync(fullPath)
    return {
      name: `${TAPTAP_TOP_DIR}/${rel}`,
      data: fs.readFileSync(fullPath),
      mtime: st.mtime
    }
  })
  const zipBuf = buildZipBuffer(entries)
  const check = validateZipStructure(zipBuf, TAPTAP_TOP_DIR)
  fs.writeFileSync(zipPath, zipBuf)

  const sha256 = createHash('sha256').update(zipBuf).digest('hex')
  const mib = (zipBuf.length / (1024 * 1024)).toFixed(2)
  console.log(`[pack-taptap] 完成！`)
  console.log(`  ZIP 路径 : ${zipPath}`)
  console.log(`  顶层目录 : ${check.topDir}/ (包含 ${check.topDir}/index.html)`)
  console.log(`  条目数量 : ${check.count}`)
  console.log(`  文件大小 : ${zipBuf.length} 字节 (${mib} MiB / 上限 300 MiB)`)
  console.log(`  SHA-256  : ${sha256}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
}

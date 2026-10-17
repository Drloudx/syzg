/**
 * 有损图片压缩工具：PNG 调色板量化、JPEG quality 85，均不属于无损压缩。
 * 默认只预览（`public/images`，或 `--root` 指定的图片根），绝不写图。
 * 仅在用户明确授权压缩后使用 `--apply --allow-lossy`；逐文件验证同根原图备份。
 *
 * ── 备份语义 ──
 * `--backup` 与 `--backup-to` 都指**镜像根**，不是父目录：备份路径 = `<镜像根>/<相对处理根的路径>`。
 *   --backup <dir>     使用已存在的镜像根，逐文件要求与原文件逐字节一致（SHA-256）
 *   --backup-to <dir>  先按同一布局**建立**镜像根（COPYFILE_EXCL + 回读校验），再继续
 * 镜像根缺失时直接报错并给出建库命令 —— 静默当成「候选全部缺备份」会让
 * 「有备份才压缩」这条保证退化成一句提示。
 * 默认镜像根来自 `maintenance-paths.mjs` 的 `imageBackupRoot`（`../vue-myrzg备份-资源/images`）。
 */
import { constants as fsConstants, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { imageBackupRoot, projectRoot, resolveChild } from './maintenance-paths.mjs'
import { fileDigest } from './raw-sync.mjs'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  apply: { type: 'boolean' }, 'allow-lossy': { type: 'boolean' },
  backup: { type: 'string' }, 'backup-to': { type: 'string' },
  // 默认根为 public/images（该目录下的图片由同名镜像备份）。
  // `--root` 用于处理根之外的图片目录（如 public/ui 这类站点装饰与导出产物），
  // 必须显式给出，且仍受「备份必须在处理根之外」的约束。
  root: { type: 'string' }
} })
if (positionals.length > 1) throw new Error('Only one input directory is accepted')
if (values.backup && values['backup-to']) throw new Error('Use either --backup or --backup-to, not both')
if (values.apply && !values['allow-lossy']) throw new Error('Lossy compression requires explicit --apply --allow-lossy')

// 处理根：同时决定「扫描范围」与「备份镜像内的相对路径」。
const processingRoot = resolve(values.root || join(projectRoot, 'public/images'))
if (!existsSync(processingRoot)) throw new Error(`Root directory does not exist: ${processingRoot}`)
const inputDir = resolve(positionals[0] || processingRoot)
if (relative(processingRoot, inputDir)) resolveChild(processingRoot, inputDir)

const backupRoot = resolve(values.backup || values['backup-to'] || imageBackupRoot)
const backupDistance = relative(processingRoot, backupRoot)
if (!backupDistance || (!isAbsolute(backupDistance) && backupDistance !== '..' && !backupDistance.startsWith(`..${sep}`))) {
  throw new Error('Backups must be outside the processed image root')
}

const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) { walk(full); continue }
    if (!entry.isFile()) continue
    const ext = extname(entry.name).toLowerCase()
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') files.push(full)
  }
}
walk(inputDir)

const backupPath = file => resolveChild(backupRoot, relative(processingRoot, file))

if (values['backup-to']) {
  let copied = 0, bytes = 0
  for (const file of files) {
    const dest = backupPath(file)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(file, dest, fsConstants.COPYFILE_EXCL)
    if (fileDigest(file) !== fileDigest(dest)) throw new Error(`Backup verification failed: ${dest}`)
    copied++
    bytes += statSync(file).size
  }
  console.log(`[compress] 镜像根已建立：${backupRoot}（${copied} 个文件 / ${(bytes / 1048576).toFixed(2)} MB，逐文件 SHA-256 校验通过）`)
}

if (!existsSync(backupRoot)) {
  throw new Error(`Backup mirror does not exist: ${backupRoot}\n`
    + `先建立镜像根：node scripts/dev/compress-images.mjs --root <图片根> --backup-to <镜像根>\n`
    + '或用 --backup 指定已存在的镜像根。没有原图备份不得压缩。')
}

const candidates = files.filter(file => statSync(file).size >= 2048)
const hasOriginalBackup = (file, backup) => {
  if (!existsSync(backup)) return false
  const sourceStat = statSync(file)
  const backupStat = statSync(backup)
  if (!backupStat.isFile() || (sourceStat.dev === backupStat.dev && sourceStat.ino === backupStat.ino)) return false
  return fileDigest(file) === fileDigest(backup)
}
const invalidBackups = candidates.filter(file => !hasOriginalBackup(file, backupPath(file)))
console.log(`[compress] 处理根 ${processingRoot}；${candidates.length} candidates; ${invalidBackups.length} missing or non-matching original backups.`)
if (!values.apply) {
  console.log('[compress] Preview only. No images were encoded or changed. Compression requires user authorization and --apply --allow-lossy.')
  process.exit(0)
}
if (invalidBackups.length) throw new Error(`Original backup verification failed: ${invalidBackups.slice(0, 8).join(', ')}`)
const { default: sharp } = await import('sharp')
let origTotal = 0, newTotal = 0, skipped = 0, ok = 0
for (const f of files) {
  const orig = statSync(f).size
  if (orig < 2048) { skipped++; origTotal += orig; newTotal += orig; continue } // 跳过 <2KB 微小图
  origTotal += orig
  try {
    const backup = backupPath(f)
    if (!hasOriginalBackup(f, backup)) throw new Error('Image changed after backup validation')
    const buf = readFileSync(f)
    const meta = await sharp(buf).metadata()
    let out
    if (meta.format === 'png') {
      out = await sharp(buf).png({ palette: true, colours: 256, compressionLevel: 9 }).toBuffer()
    } else {
      out = await sharp(buf).jpeg({ quality: 85 }).toBuffer()
    }
    if (out.length < orig) { writeFileSync(f, out); newTotal += out.length; ok++ }
    else { newTotal += orig; skipped++ }
  } catch (e) {
    console.warn('  skip(错误):', f, e.message)
    newTotal += orig
  }
}
const savings = origTotal ? 100 * (1 - newTotal / origTotal) : 0
const lines = `${files.length} 个文件（跳过 ${skipped}），${ok} 个已进行有损压缩\n原始 ${(origTotal/1048576).toFixed(1)}MB → 压缩后 ${(newTotal/1048576).toFixed(1)}MB，节省 ${savings.toFixed(1)}%`
console.log(lines)

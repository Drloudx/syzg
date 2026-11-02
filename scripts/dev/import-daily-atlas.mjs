/**
 * 导入日常计划（DailyWorkPanel）用到的图片到 public/images/DailyWorkPanel。
 *
 * ## 来源
 * `资源包/assets/res/texture/uipanel/dailyworkpanel/`，共 35 张：
 *   - `plan01`~`plan06`     360×620   计划竖卡（面板上那几张）
 *   - `plan_01`~`plan_09`   368×208   子关卡缩略图
 *   - `plan_cave_*`         368×208   矿洞类缩略图
 *   - `plan02_0x` / `plan05_0x` / `plan06_0x`  368×208  子关卡缩略图
 *   - `plan_bg`             1680×1000 面板底
 *   - `plan_info_botm`      1000×600  详情底
 *
 * ## 口径
 * 与项目其他图集一致：**无损 WebP**。这批图是手绘插画，有大量渐变与细线，
 * 有损压缩在暗部会出现色带，实测无损体积可接受。
 *
 * 清单**不手写**：从 `dailyWork.json` 的 `img` 字段自动收敛，
 * 加上面板底/详情底两张固定资源，避免「有页面没图」。
 *
 * 用法：
 *   node scripts/dev/import-daily-atlas.mjs            # 预览
 *   node scripts/dev/import-daily-atlas.mjs --apply    # 写入
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { bundleRoot, configRoot } from './maintenance-paths.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const SRC = path.join(bundleRoot, 'assets/res/texture/uipanel/dailyworkpanel')
const DST = path.join(root, 'public/images/DailyWorkPanel')
const apply = process.argv.includes('--apply')

/** 面板固定资源（不在 dailyWork.json 的 img 里） */
const FIXED = ['plan_bg', 'plan_info_botm']

/** 从原表收敛清单，不手写 */
function collectNames() {
  const conf = JSON.parse(fs.readFileSync(path.join(configRoot, 'dailyWork.json'), 'utf8'))
  const names = new Set(FIXED)
  for (const plan of Object.values(conf.plans || {})) {
    if (plan.img) names.add(plan.img)
    for (const stage of plan.plan || []) {
      if (stage.img) names.add(stage.img)
    }
  }
  return [...names].sort()
}

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

const names = collectNames()
console.log(`待导入 ${names.length} 张（含固定资源 ${FIXED.length} 张）`)

const plan = []
for (const name of names) {
  const file = path.join(SRC, `${name}.png`)
  if (!fs.existsSync(file)) throw new Error(`缺少源图：${file}`)
  const srcBuf = fs.readFileSync(file)
  const meta = await sharp(srcBuf).metadata()
  const out = await sharp(srcBuf).webp({ lossless: true, effort: 6 }).toBuffer()
  plan.push({
    name,
    to: `${name}.webp`,
    size: `${meta.width}x${meta.height}`,
    sourceBytes: srcBuf.length,
    outputBytes: out.length,
    _out: out
  })
}

const srcTotal = plan.reduce((s, e) => s + e.sourceBytes, 0)
const outTotal = plan.reduce((s, e) => s + e.outputBytes, 0)

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'preview',
  source: path.relative(root, SRC).replaceAll('\\', '/'),
  target: path.relative(root, DST).replaceAll('\\', '/'),
  files: plan.length,
  sourceTotalKB: +(srcTotal / 1024).toFixed(1),
  outputTotalKB: +(outTotal / 1024).toFixed(1),
  savingPercent: +((1 - outTotal / srcTotal) * 100).toFixed(1)
}, null, 1))

if (!apply) {
  console.log('[import-daily-atlas] 预览模式，加 --apply 写入。')
  process.exit(0)
}

fs.mkdirSync(DST, { recursive: true })
for (const entry of plan) {
  const outPath = path.join(DST, entry.to)
  fs.writeFileSync(outPath, entry._out)
  if (hash(fs.readFileSync(outPath)) !== hash(entry._out)) throw new Error(`写入校验失败：${outPath}`)
}
console.log(`已写入 ${plan.length} 个文件到 ${path.relative(root, DST).replaceAll('\\', '/')}，合计 ${(outTotal / 1024).toFixed(1)} KB`)

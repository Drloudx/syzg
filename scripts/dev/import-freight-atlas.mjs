/**
 * 导入货运站（FreightPanel）用到的图片到 public/images/FreightPanel_Atlas。
 *
 * 两类来源：
 *   1. 图集切图 `图片资源/图集/FreightPanel_Atlas/<精灵>.png`（35 张，含 5 张价格档位图标）
 *   2. 预制体目录里的独立大图与 NPC 立绘
 *      `资源包/assets/res/texture/uipanel/freightpanel/<名>.png`
 *
 * 为什么 NPC 立绘要从预制体目录取：`cart_at_npc_*` 是 256×256 / 165×241 的整图，
 * 不在图集矩形表里（图集只有 UI 边框与价格标），订单卡片的立绘只能单独导入。
 *
 * 转换口径与项目其他图集一致：**无损 WebP**。NPC 立绘有渐变与半透明边缘，
 * 有损压缩在暗部会出现色带，无损实测体积可接受。
 *
 * 用法：
 *   node scripts/dev/import-freight-atlas.mjs            # 预览
 *   node scripts/dev/import-freight-atlas.mjs --apply    # 写入
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { atlasAtlas, bundleRoot } from './maintenance-paths.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const target = path.join(root, 'public/images/FreightPanel_Atlas')
const apply = process.argv.includes('--apply')

const atlas = atlasAtlas('FreightPanel_Atlas')
/**
 * 立绘与大图的候选目录，按优先级排列。
 * `cart_bg` 只在 prefab 目录有（texture 侧同名件在 orderpanel 下，是另一张），
 * 所以不能只认一个目录；同一文件两处都在时取先命中的那个。
 */
const SOURCE_DIRS = [
  path.join(bundleRoot, 'assets/res/texture/uipanel/freightpanel'),
  path.join(bundleRoot, 'assets/res/prefab/uiprefab/freightpanel')
]

const findSource = (name) => {
  for (const dir of SOURCE_DIRS) {
    const file = path.join(dir, `${name}.png`)
    if (fs.existsSync(file)) return file
  }
  return null
}

/** 图集精灵里本项目实际用到的（避免把 cart_bar_* 这类载重条也搬进来）。 */
const ATLAS_SPRITES = [
  'cart_back', 'cart_order_say', 'cart_order_price', 'cart_tips_pricetag',
  'cart_tips_botm', 'cart_select_botm', 'cart_page', 'cart_page_on',
  'cart_price_max', 'cart_price_high', 'cart_price_ori', 'cart_price_low', 'cart_price_min',
  'cart_time', 'cart_speed_icon'
]

/** 图集外的独立大图：面板底、订单列表面板底、市场面板底、空态。 */
const EXTRA_FILES = ['cart_bg', 'cart_order_botm', 'cart_market_botm', 'cart_order_empty']

/** 订单卡片立绘：`newOrder.goods[].charaImg` 的全集，由脚本自动收敛，不手写清单。 */
function collectNpcNames() {
  const confPath = path.join(root, 'raw/newOrder.json')
  if (!fs.existsSync(confPath)) throw new Error(`缺少订单原表：${confPath}`)
  const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'))
  const names = new Set()
  for (const goods of Object.values(conf.goods || {})) {
    if (goods.charaImg) names.add(String(goods.charaImg))
  }
  return [...names].sort()
}

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')

const spriteTable = new Map(atlas.metas.map(sprite => [sprite.name, sprite]))
const atlasMeta = await sharp(atlas.atlasPng).metadata()

const sources = []
for (const name of ATLAS_SPRITES) {
  const file = path.join(atlas.spriteDir, `${name}.png`)
  if (!fs.existsSync(file)) throw new Error(`图集缺少精灵：${file}`)
  if (!spriteTable.has(name)) throw new Error(`图集 sprite 表里没有 ${name}`)
  sources.push({ name, file, kind: 'atlas' })
}
for (const name of EXTRA_FILES) {
  const file = findSource(name)
  if (!file) throw new Error(`缺少独立大图：${name}（已查找 ${SOURCE_DIRS.join(' / ')}）`)
  sources.push({ name, file, kind: 'extra' })
}
for (const name of collectNpcNames()) {
  const file = findSource(name)
  if (!file) throw new Error(`缺少 NPC 立绘：${name}（已查找 ${SOURCE_DIRS.join(' / ')}）`)
  sources.push({ name, file, kind: 'npc' })
}

const plan = []
for (const { name, file, kind } of sources) {
  // 图集精灵与整图裁剪逐像素核对，确认预切图没切歪或切到空白
  if (kind === 'atlas') {
    const sprite = spriteTable.get(name)
    const expected = await sharp(atlas.atlasPng)
      .extract({ left: sprite.x, top: sprite.y, width: sprite.width, height: sprite.height })
      .raw().toBuffer()
    const actual = await sharp(file).raw().toBuffer()
    if (!expected.equals(actual)) {
      throw new Error(`${name} 与图集 sprite 表 (${sprite.x},${sprite.y},${sprite.width}x${sprite.height}) 的裁剪结果不一致`)
    }
  }
  const sourceBytes = fs.readFileSync(file)
  const out = await sharp(sourceBytes).webp({ lossless: true, effort: 6 }).toBuffer()
  const meta = await sharp(sourceBytes).metadata()
  plan.push({
    kind,
    name,
    to: `${name}.webp`,
    size: `${meta.width}x${meta.height}`,
    sourceBytes: sourceBytes.length,
    sourceSha256: hash(sourceBytes),
    outputBytes: out.length,
    _out: out
  })
}

const sourceTotal = plan.reduce((sum, entry) => sum + entry.sourceBytes, 0)
const outputTotal = plan.reduce((sum, entry) => sum + entry.outputBytes, 0)

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'preview',
  atlas: `${atlasMeta.width}x${atlasMeta.height}`,
  summary: plan.reduce((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] || 0) + 1 }), {}),
  files: plan.length,
  sourceTotalKB: +(sourceTotal / 1024).toFixed(1),
  outputTotalKB: +(outputTotal / 1024).toFixed(1),
  savingPercent: +((1 - outputTotal / sourceTotal) * 100).toFixed(1)
}, null, 1))

if (!apply) {
  console.log('[import-freight-atlas] 预览模式，未写入任何文件。加 --apply 写入。')
  process.exit(0)
}

fs.mkdirSync(target, { recursive: true })
const written = []
for (const entry of plan) {
  const outPath = path.join(target, entry.to)
  fs.writeFileSync(outPath, entry._out)
  if (hash(fs.readFileSync(outPath)) !== hash(entry._out)) throw new Error(`写入校验失败：${outPath}`)
  written.push({ file: entry.to, size: entry.size, bytes: entry.outputBytes })
}
console.log(`已写入 ${written.length} 个文件到 public/images/FreightPanel_Atlas，合计 ${(outputTotal / 1024).toFixed(1)} KB`)

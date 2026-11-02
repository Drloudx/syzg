/**
 * 拼合货运小车图标 —— 供导航菜单 `/ui/cart_wagon.webp` 使用。
 *
 * ## 坐标从哪来（🔴 这决定了脚本可信度）
 *
 * 用 **UnityPy 直接读** `APK解包/.../prefab/uiprefab/freightpanel/freightpanel.asset`
 * 的 Transform，拿到每个 UITexture 的 `m_LocalPosition` / `m_LocalScale` / `mWidth` / `mHeight`。
 *
 * **不要用 `scripts/dev/scratch/codec/freight-prefab.txt` 那份 dump** ——
 * 它只有局部坐标、**漏了 `m_LocalScale`**，而所有部件该值都是 `(-1, 1)`
 * （即贴图水平镜像后绘制）。按它拼会整车左右颠倒、车轮落到车头前方。
 *
 * ## cartGo 子树真值（UnityPy 导出，world 坐标 + localScale）
 *
 * ```
 * cartGo      world=(334, 15)   scale=( 1, 1)
 *   wheel2    world=(334, 15)   scale=( 1, 1)
 *     w0..w3  world=(230,-139)  scale=(-1, 1)   272x212  车轮（左右各一对）
 *   hood      world=(334, 93)   scale=(-1, 1)   492x404  棚子
 *   back      world=(335,-48)   scale=(-1, 1)   556x432  车斗
 *   front     world=(343,-77)   scale=(-1, 1)   540x268  车辕
 *   2/5/3/4   world=...         scale=(-1, 1)   120~280  货物（本脚本不拼）
 *   box       world=(345,-22)   scale=( 1, 1)   176x192  宝箱（本脚本不拼）
 * ```
 *
 * ### 车轮只放一次
 * `cyyd_cart001_w0.png` 是 272×212 内画着**一对**轮子（左轮在下、右轮在上），
 * w1/w2/w3 是同一对的旋转帧。`wheel1` 与 `wheel2` 是坐标完全重叠的两个节点
 * （动画相位不同），静态取一帧即得完整四轮画面。
 *
 * ### 为什么只拼空车
 * 导航图标在 34px 下显示，货物（麻袋/木桶/宝箱）会糊成一团色块。
 * 需要带货物时用 `--with-cargo`。
 *
 * ## 两个技术坑
 * ① **预乘 alpha 合成**：Unity 导出的 PNG 在 alpha=0 处仍留深色 RGB，
 *    直接走 sharp 的 composite 会插值出灰白脏边。这里手工在预乘空间做 over。
 * ② **先合成、后缩放**：先缩再合会让 alpha 边缘二次插值，同样出灰边。
 *
 * 用法：
 *   node scripts/dev/build-cart-icon.mjs              # 预览
 *   node scripts/dev/build-cart-icon.mjs --apply      # 写入
 *   node scripts/dev/build-cart-icon.mjs --with-cargo # 带货物
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { bundleRoot } from './maintenance-paths.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const SRC = path.join(bundleRoot, 'assets/res/prefab/uiprefab/freightpanel')
const OUT = path.join(root, 'public/ui/cart_wagon.webp')
const apply = process.argv.includes('--apply')
const withCargo = process.argv.includes('--with-cargo')
const TARGET_W = 192

/*
 * 真值（UnityPy 从 freightpanel.asset 读出）：x/y 是 UITexture 的 **transform 世界坐标**
 * （NGUI pivot=Center，即图片中心），w/h 是 mWidth/mHeight，flipX 来自 localScale.x = -1。
 */
const EMPTY = [
  { d: 1, f: 'cyyd_cart001_back', x: 335, y: -48, w: 556, h: 432, flipX: true },
  { d: 9, f: 'cyyd_cart001_front', x: 343, y: -77, w: 540, h: 268, flipX: true },
  { d: 10, f: 'cyyd_cart001_w0', x: 230, y: -139, w: 272, h: 212, flipX: true },
  { d: 20, f: 'cyyd_cart001_hood', x: 334, y: 93, w: 492, h: 404, flipX: true }
]

/* 带货物（备用）：同样用真值；box 的 localScale.x = +1，不镜像 */
const CARGO = [
  { d: 2, f: 'cyyd_cart001_5', x: 259, y: 38, w: 232, h: 228, flipX: true },
  { d: 3, f: 'cyyd_cart001_3', x: 352, y: -5, w: 280, h: 232, flipX: true },
  { d: 4, f: 'cyyd_cart001_4', x: 353, y: 52, w: 280, h: 176, flipX: true },
  { d: 5, f: 'cyyd_cart001_1', x: 466, y: -29, w: 120, h: 164, flipX: true },
  { d: 6, f: 'cyyd_cart001_2', x: 382, y: -63, w: 120, h: 164, flipX: true },
  { d: 8, f: 'cyyd_cart001_treasure_box', x: 345, y: -22, w: 176, h: 192, flipX: false }
]

const LAYERS = [...EMPTY, ...(withCargo ? CARGO : [])].sort((a, b) => a.d - b.d)

/* ── ① 包围盒（NGUI 中心原点、Y 向上） ── */
let minX = Infinity; let maxX = -Infinity
let minY = Infinity; let maxY = -Infinity
for (const l of LAYERS) {
  minX = Math.min(minX, l.x - l.w / 2)
  maxX = Math.max(maxX, l.x + l.w / 2)
  minY = Math.min(minY, l.y - l.h / 2)
  maxY = Math.max(maxY, l.y + l.h / 2)
}
const PAD = 2
const W = Math.ceil(maxX - minX) + PAD * 2
const H = Math.ceil(maxY - minY) + PAD * 2
console.log(`模式=${withCargo ? '带货物' : '空车'} 层数=${LAYERS.length}`)
console.log(`包围盒 ${Math.ceil(maxX - minX)}x${Math.ceil(maxY - minY)} → 画布 ${W}x${H}`)

/* ── ② 预乘合成 ── */
const canvas = new Float32Array(W * H * 4)
for (const l of LAYERS) {
  const file = path.join(SRC, `${l.f}.png`)
  if (!fs.existsSync(file)) throw new Error(`缺少部件：${file}`)

  let img = sharp(file)
  if (l.flipX) img = img.flop()   // flop = 水平翻转，对应 localScale.x = -1
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pw = info.width; const ph = info.height
  const left = Math.round((l.x - pw / 2) - minX) + PAD
  const top = Math.round(maxY - (l.y + ph / 2)) + PAD
  if (pw !== l.w || ph !== l.h) console.warn(`  ⚠ ${l.f} 实际 ${pw}x${ph}，预制体写 ${l.w}x${l.h}`)

  for (let y = 0; y < ph; y += 1) {
    const cy = top + y
    if (cy < 0 || cy >= H) continue
    for (let x = 0; x < pw; x += 1) {
      const cx = left + x
      if (cx < 0 || cx >= W) continue
      const si = (y * pw + x) * 4
      const sa = data[si + 3] / 255
      if (sa === 0) continue
      const di = (cy * W + cx) * 4
      const da = canvas[di + 3]
      const oa = sa + da * (1 - sa)
      if (oa === 0) continue
      for (let c = 0; c < 3; c += 1) {
        canvas[di + c] = (data[si + c] * sa + canvas[di + c] * da * (1 - sa)) / oa
      }
      canvas[di + 3] = oa
    }
  }
  console.log(`  d=${String(l.d).padStart(2)} ${l.f.padEnd(28)} ${pw}x${ph} flip=${l.flipX ? 'Y' : 'N'} → (${left},${top})`)
}

/* ── ③ 8bit + alpha 净化 ── */
const rgba = Buffer.alloc(W * H * 4)
for (let i = 0; i < canvas.length; i += 4) {
  let a = canvas[i + 3]
  if (a < 8 / 255) a = 0
  rgba[i] = Math.round(Math.min(255, Math.max(0, canvas[i])))
  rgba[i + 1] = Math.round(Math.min(255, Math.max(0, canvas[i + 1])))
  rgba[i + 2] = Math.round(Math.min(255, Math.max(0, canvas[i + 2])))
  rgba[i + 3] = Math.round(a * 255)
}

/* ── ④ 裁边 → 缩放 → 无损 WebP ── */
const png = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()
const trimmed = await sharp(png).trim({ threshold: 1 }).png().toBuffer()
const tm = await sharp(trimmed).metadata()

const webp = await sharp(trimmed)
  .resize({ width: TARGET_W, kernel: 'lanczos3' })
  .webp({ lossless: true, effort: 6 })
  .toBuffer()
const wm = await sharp(webp).metadata()

const previewName = withCargo ? 'cart-icon-cargo' : 'cart-icon-preview'
fs.mkdirSync('scratch', { recursive: true })
fs.writeFileSync(`scratch/${previewName}.png`, trimmed)
console.log(`裁切 ${tm.width}x${tm.height} → ${wm.width}x${wm.height}，${(webp.length / 1024).toFixed(1)} KB`)
console.log(`预览：scratch/${previewName}.png`)

if (!apply) {
  console.log('[build-cart-icon] 加 --apply 写入 public/ui/cart_wagon.webp')
  process.exit(0)
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, webp)
const sha = crypto.createHash('sha256').update(fs.readFileSync(OUT)).digest('hex').slice(0, 12)
console.log(`已写入 ${path.relative(root, OUT).replaceAll('\\', '/')} sha256=${sha}`)

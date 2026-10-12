/**
 * 把「模拟招募结果」合成一张 PNG，用于分享 / 保存。
 *
 * 出口是 `shareOrSaveImage()`：**触摸设备调起分享、鼠标设备直接下载**（见该函数说明）。
 *
 * ## 为什么手写 canvas 合成，而不是引 html2canvas
 *
 * 结果页全是**已知的静态图层**（底图 + 每张卡的底板/立绘/边框/角标/星级），
 * 布局是 prefab 固定坐标、不做响应式重排。html2canvas 的已知弱项恰好全在这页上
 * （webp、`filter`、`border-image` 切片、绝对定位叠加），引进来反而更容易画错，
 * 且项目一贯避免新增依赖。
 *
 * ## 为什么按 DOM 实测矩形取位，而不是重抄一遍 CSS 常量
 *
 * 各图层的百分比定位都写在组件的 CSS 里。若在这里再抄一份，以后改样式就会
 * **静默画歪**（截图和页面不一致，且不会报错）。所以这里读的是
 * `getBoundingClientRect()` 实测值 + `object-fit`/`filter` 的 computed 值，
 * **样式改了截图自动跟着变**。
 *
 * ## 两个容易踩的点（都踩过）
 *
 * 1. **WebGL 画布抓不到**：蛋池的蛋袋是 Spine WebGL canvas，本上下文没开
 *    `preserveDrawingBuffer`，隔帧抓只会得到空白。必须在同一任务里先 `renderNow()`
 *    同步重画再 `drawImage`（见 `gachaSpinePlayer` 的 `renderSharedSceneNow`）。
 * 2. **画布不等于 1534×750**：`fit="height"` 时 `GachaStage` 会把画布宽度设成
 *    `容器宽 / scale`（宽屏下超过 1534），按写死的 1534 换算会让宽屏下坐标整体偏移。
 */
import { GACHA_DESIGN_WIDTH, GACHA_DESIGN_HEIGHT } from './gachaLayout.js'

/**
 * 取"让 WebGL 画布同步重画"的函数。
 *
 * 🔴 **必须动态 import**，不能在文件顶部静态引入 `gachaSpinePlayer`：
 * 那个模块会拉进 `spine-webgl`，而它在 Node 环境里解析不了（缺扩展名的内部导入），
 * 于是**连纯逻辑单测都跑不起来**（实测 `ERR_MODULE_NOT_FOUND: AssetManager`）。
 * 分享/下载的分支逻辑本来就不该依赖渲染栈，按需加载即可。
 */
async function loadRenderSceneNow() {
  try {
    const mod = await import('./gachaSpinePlayer.js')
    return mod.renderSharedSceneNow
  } catch {
    // 渲染栈不可用（如单测环境）时静默跳过 WebGL 层，其余图层照常绘制
    return null
  }
}

/**
 * 输出倍率。设计画布 1534×750，2 倍 → 3068×1500，卡面（256px）在手机上足够清晰。
 */
const OUT_SCALE = 2

/** 同一次合成里同一张图会被多张卡引用（底板/边框按品质复用），按 src 缓存解码结果。 */
const imageCache = new Map()

/**
 * 解码一张图。
 *
 * 🔴 `crossOrigin = 'anonymous'` 是**必须**的：原生端图片走 CDN 绝对地址（跨域），
 * 不带这个属性会把 canvas **污染**，随后 `toBlob()` 抛 `SecurityError`。
 * 网页端图片是同源相对路径，加了也无副作用。
 */
function loadImage(src) {
  const cached = imageCache.get(src)
  if (cached) return cached
  const promise = new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`图片加载失败：${src}`))
    img.src = src
  })
  // 失败的不留在缓存里，下次可重试
  promise.catch(() => imageCache.delete(src))
  imageCache.set(src, promise)
  return promise
}

/**
 * 按元素的 `object-fit` 把图画进给定矩形，**逐值复现 CSS 行为**。
 *
 * 🔴 早先这里只判了 `fill`，其余一律走 `contain`（`Math.min` 等比居中）——
 * 于是 `object-fit: cover` 的背板被**当成 contain** 画进分享图：图缩到 `min` 比例居中，
 * 左右（或上下）留出未着墨的空带，而实时页面是 `cover` 铺满。
 * 症状就是「分享图左右两侧没显示全」——背板被缩窄，两侧露出底色。
 * 判据是元素自身的 computed `objectFit`，不要在这里按元素名硬编码。
 *
 * 三种比例关系：`fill` 拉伸；`contain` 取 `min`（整图可见，留白）；
 * `cover` 取 `max`（铺满矩形，超出部分裁掉）。
 *
 * `object-position` 按 CSS 初始值 `50% 50%` 居中——本项目所有 `img` 均未设该项。
 */
function drawImageFit(ctx, img, rect, fit) {
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  if (!nw || !nh) return

  if (fit === 'fill') {
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h)
    return
  }

  // `none`：原始尺寸居中（不缩放），超出矩形的部分裁掉
  if (fit === 'none') {
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.w, rect.h)
    ctx.clip()
    ctx.drawImage(img, rect.x + (rect.w - nw) / 2, rect.y + (rect.h - nh) / 2)
    ctx.restore()
    return
  }

  const containScale = Math.min(rect.w / nw, rect.h / nh)
  let scale
  if (fit === 'cover') scale = Math.max(rect.w / nw, rect.h / nh)
  else if (fit === 'scale-down') scale = Math.min(1, containScale)
  else scale = containScale // contain 及未知取值

  const w = nw * scale
  const h = nh * scale
  const x = rect.x + (rect.w - w) / 2
  const y = rect.y + (rect.h - h) / 2

  // `cover` / `scale-down` 都可能超出矩形，必须按矩形裁切（等价于 CSS 的溢出裁切）
  if (w > rect.w + 0.5 || h > rect.h + 0.5) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.w, rect.h)
    ctx.clip()
    ctx.drawImage(img, x, y, w, h)
    ctx.restore()
    return
  }
  ctx.drawImage(img, x, y, w, h)
}

/** 画一段居中文字（用于重复获得的「×N」计数），样式取自元素自身的 computed 值。 */
function drawCenteredText(ctx, el, rect) {
  const text = (el.textContent || '').trim()
  if (!text) return
  const cs = getComputedStyle(el)
  ctx.save()
  ctx.font = `${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`
  ctx.fillStyle = cs.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const shadow = cs.textShadow
  if (shadow && shadow !== 'none') {
    // `text-shadow: 0 1px 2px rgba(0,0,0,.7)` → 解析出偏移与颜色
    const m = shadow.match(/^(-?[\d.]+)px\s+(-?[\d.]+)px\s+[\d.]+px\s+(.+)$/)
    if (m) {
      ctx.shadowOffsetX = parseFloat(m[1])
      ctx.shadowOffsetY = parseFloat(m[2])
      ctx.shadowColor = m[3]
    }
  }
  ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2)
  ctx.restore()
}

/**
 * 解析 `background-size`，返回实际绘制尺寸（**设计像素**）。
 *
 * 支持 `cover` / `contain` / 百分比 / 长度 / `auto`（`auto` 保持原图宽高比）。
 *
 * 🔴 这里**不能**像早先那样硬编码 `cover`：`.g-slice--btn-y` 等按钮底板用的是
 * `background: … / 100% 100%`（整图拉伸），按 `cover` 画等于等比放大后再居中裁切，
 * 底板四边会被切掉。同理 `.gacha-bleed` 确实是 `cover`，两者必须按 computed 值分别走。
 *
 * 🔴 computed 里的绝对长度是 **CSS（视觉）像素**，而 `boxW/boxH` 是设计像素，
 * 故按 `scale` 折算；百分比天然与单位无关，不折算。
 */
function resolveBackgroundSize(sizeStr, natW, natH, boxW, boxH, scale) {
  const s = (sizeStr || 'auto').trim()
  if (s === 'cover') {
    const k = Math.max(boxW / natW, boxH / natH)
    return [natW * k, natH * k]
  }
  if (s === 'contain') {
    const k = Math.min(boxW / natW, boxH / natH)
    return [natW * k, natH * k]
  }
  const parts = s.split(/\s+/).filter(Boolean)
  const one = (v, base) => {
    if (v === undefined || v === 'auto') return null
    if (v.endsWith('%')) return (parseFloat(v) / 100) * base
    const n = parseFloat(v)
    return Number.isFinite(n) ? n / scale : null
  }
  const w = one(parts[0], boxW)
  const h = one(parts[1], boxH)
  if (w === null && h === null) return [natW, natH]
  if (w === null) return [natW * (h / natH), h]
  if (h === null) return [w, natH * (w / natW)]
  return [w, h]
}

/**
 * 解析 `background-position` 的一个分量（返回**设计像素**偏移）。
 * 百分比按剩余空间折算，绝对长度按 `scale` 折算。
 */
function resolveBackgroundAxis(token, free, scale) {
  if (token === undefined || token === 'center') return free / 2
  if (token === 'left' || token === 'top') return 0
  if (token === 'right' || token === 'bottom') return free
  if (token.endsWith('%')) return (free * parseFloat(token)) / 100
  const n = parseFloat(token)
  return Number.isFinite(n) ? n / scale : free / 2
}

/** 按顶层逗号切分 CSS 值列表；函数括号内的逗号是参数分隔符，不算层分隔符。 */
function splitLayerList(str) {
  const out = []
  if (!str) return out
  let depth = 0
  let cur = ''
  for (const ch of str) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/**
 * computed 颜色值是否可交给 canvas 直接使用；全透明与认不出的写法返回 `null`。
 *
 * 🔴 不能把任意字符串赋给 `fillStyle`：非法值会被**静默忽略**，于是用上一次的颜色
 * 把整块涂出来。认不出宁可跳过这一层。
 */
function solidColorValue(value) {
  if (!value) return null
  const v = value.trim()
  if (!v || v === 'transparent') return null
  if (/^rgba?\(/i.test(v) || /^hsla?\(/i.test(v)) {
    const parts = v.slice(v.indexOf('(') + 1, v.lastIndexOf(')')).split(/[,\s/]+/).filter(Boolean)
    if (parts.length >= 4 && parseFloat(parts[3]) === 0) return null
    return v
  }
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v
  if (/^[a-z]+$/i.test(v)) return v
  return null
}

/** 渐变里的非颜色关键字：用来把「方向 / 形状 / 尺寸」与「颜色停靠点」分开。 */
const GRADIENT_KEYWORDS = /^(circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner|at|to|in|none|auto)$/

function isColorToken(token) {
  if (!token) return false
  if (/^rgba?\(/i.test(token) || /^hsla?\(/i.test(token)) return true
  if (/^#[0-9a-f]{3,8}$/i.test(token)) return true
  if (/^[a-z]+$/i.test(token)) return !GRADIENT_KEYWORDS.test(token.toLowerCase())
  return false
}

/**
 * 复现 `border-radius` 的形状裁切。
 *
 * 🔴 CSS 只把 `background-color` / `background-image` 裁进圆角框，`border-image` **不受**
 * `border-radius` 影响 —— 故本函数只服务于背景，`drawBorderImage` 仍走矩形裁切。
 *
 * computed 的圆角绝对长度是 CSS（视觉）像素，按 `scale` 折算；百分比相对各自边长。
 */
function applyBorderRadiusClip(ctx, el, rect, scale) {
  const cs = getComputedStyle(el)
  const side = (base, token) => {
    if (!token) return 0
    const t = token.trim()
    if (t.endsWith('%')) return (parseFloat(t) / 100) * base
    const n = parseFloat(t)
    return Number.isFinite(n) ? n / scale : 0
  }
  const corner = (value) => {
    const parts = (value || '0px').trim().split(/\s+/).filter(Boolean)
    return [side(rect.w, parts[0]), side(rect.h, parts[1] ?? parts[0])]
  }
  const radii = [
    corner(cs.borderTopLeftRadius),
    corner(cs.borderTopRightRadius),
    corner(cs.borderBottomRightRadius),
    corner(cs.borderBottomLeftRadius)
  ]
  if (!radii.some(([a, b]) => a > 0 || b > 0)) {
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.w, rect.h)
    ctx.clip()
    return
  }

  // CSS 的重叠收敛：同一侧两个圆角之和超过边长时，所有圆角同比缩小
  const [[tlx, tly], [trx, tryy], [brx, bry], [blx, bly]] = radii
  const k = Math.min(
    1,
    rect.w / (tlx + trx || 1),
    rect.w / (blx + brx || 1),
    rect.h / (tly + bly || 1),
    rect.h / (tryy + bry || 1)
  )
  const [[a1, b1], [a2, b2], [a3, b3], [a4, b4]] = radii.map(([a, b]) => [a * k, b * k])
  const x = rect.x
  const y = rect.y
  const w = rect.w
  const h = rect.h
  // 用四段椭圆拼出圆角框（`0` 半径退化为直角，与 `roundRect` 等价但无 API 版本依赖）
  ctx.beginPath()
  ctx.moveTo(x + a1, y)
  ctx.lineTo(x + w - a2, y)
  ctx.ellipse(x + w - a2, y + b2, a2, b2, 0, -Math.PI / 2, 0)
  ctx.lineTo(x + w, y + h - b3)
  ctx.ellipse(x + w - a3, y + h - b3, a3, b3, 0, 0, Math.PI / 2)
  ctx.lineTo(x + a4, y + h)
  ctx.ellipse(x + a4, y + h - b4, a4, b4, 0, Math.PI / 2, Math.PI)
  ctx.lineTo(x, y + b1)
  ctx.ellipse(x + a1, y + b1, a1, b1, 0, Math.PI, Math.PI * 1.5)
  ctx.closePath()
  ctx.clip()
}

/** 渐变方向：返回 CSS 角度（0 = 上，90 = 右）。 */
function parseLinearAngle(config, boxW, boxH) {
  const t = (config || '').trim().toLowerCase()
  if (!t) return 180
  if (t.startsWith('to ')) {
    const sides = t.slice(3).split(/\s+/).filter(Boolean)
    const hasTop = sides.includes('top')
    const hasBottom = sides.includes('bottom')
    const hasLeft = sides.includes('left')
    const hasRight = sides.includes('right')
    if ((hasTop || hasBottom) && (hasLeft || hasRight)) {
      // 角方向：渐变线**垂直于**连接该角两个邻角的直线，指向该角所在象限
      const dirX = (hasRight ? 1 : -1) * boxH
      const dirY = (hasBottom ? 1 : -1) * boxW
      return (Math.atan2(dirX, -dirY) * 180) / Math.PI
    }
    if (hasTop) return 0
    if (hasBottom) return 180
    if (hasLeft) return 270
    if (hasRight) return 90
    return 180
  }
  if (t.endsWith('deg')) return parseFloat(t)
  if (t.endsWith('turn')) return parseFloat(t) * 360
  if (t.endsWith('grad')) return parseFloat(t) * 0.9
  if (t.endsWith('rad')) return (parseFloat(t) * 180) / Math.PI
  return 180
}

/** 渐变形状：返回圆心与两个半径（**设计像素**，相对渐变框原点）。 */
function parseRadialConfig(config, boxW, boxH, scale) {
  const text = (config || '').trim()
  const at = text.match(/\bat\b([\s\S]*)$/i)
  const head = (at ? text.slice(0, at.index) : text).trim()
  const tail = at ? at[1].trim() : ''

  const axis = (token, base) => {
    if (!token || token === 'center') return base / 2
    if (token === 'left' || token === 'top') return 0
    if (token === 'right' || token === 'bottom') return base
    if (token.endsWith('%')) return (parseFloat(token) / 100) * base
    const n = parseFloat(token)
    return Number.isFinite(n) ? n / scale : base / 2
  }
  const pos = tail.split(/\s+/).filter(Boolean)
  const cx = axis(pos[0], boxW)
  // CSS：只给一个位置分量时，另一个取 `center`
  const cy = pos[1] === undefined ? boxH / 2 : axis(pos[1], boxH)

  const circle = /\bcircle\b/i.test(head)
  const sizeKey = (head.match(/\b(closest-side|closest-corner|farthest-side|farthest-corner)\b/i) || [])[1]
  const numeric = head
    .replace(/\b(circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner)\b/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const len = (token, base) => {
    if (!token) return null
    if (token.endsWith('%')) return (parseFloat(token) / 100) * base
    const n = parseFloat(token)
    return Number.isFinite(n) ? n / scale : null
  }

  let rx = null
  let ry = null
  if (numeric.length >= 2) {
    rx = len(numeric[0], boxW)
    ry = len(numeric[1], boxH)
  } else if (numeric.length === 1) {
    rx = len(numeric[0], boxW)
    ry = circle ? rx : len(numeric[0], boxH)
  }
  if (!(rx > 0) || !(ry > 0)) {
    const key = (sizeKey || 'farthest-corner').toLowerCase()
    const near = key.startsWith('closest')
    const corner = key.endsWith('corner')
    const nx = near ? Math.min(cx, boxW - cx) : Math.max(cx, boxW - cx)
    const ny = near ? Math.min(cy, boxH - cy) : Math.max(cy, boxH - cy)
    if (circle) {
      rx = ry = corner ? Math.hypot(nx, ny) : near ? Math.min(nx, ny) : Math.max(nx, ny)
    } else if (corner) {
      // 椭圆保持与渐变框相同的宽高比：rx² = nx² + (ny·W/H)²
      rx = Math.sqrt(nx * nx + ((ny * boxW) / boxH) ** 2)
      ry = (rx * boxH) / boxW
    } else {
      rx = nx
      ry = ny
    }
  }
  if (!(rx > 0)) rx = boxW
  if (!(ry > 0)) ry = boxH
  return { cx, cy, rx, ry }
}

/** 停靠点位置：百分比无量纲；绝对长度是视觉像素，按 `scale` 折算到渐变线长度。 */
function stopOffset(token, linePx, scale) {
  if (!token) return null
  const t = token.trim()
  if (t.endsWith('%')) return parseFloat(t) / 100
  const n = parseFloat(t)
  return Number.isFinite(n) && linePx > 0 ? n / scale / linePx : null
}

/** 解析 `<color-stop-list>`，缺位置的按 CSS 规则补位（首 0 / 末 1 / 中间按两侧均分）。 */
function parseColorStops(listStr, linePx, scale) {
  const items = splitLayerList(listStr)
  const offsets = []
  const colors = []
  let lastColor = null
  for (const item of items) {
    let color = null
    let posToken = null
    const m = item.match(
      /^(rgba?\([^()]*\)|hsla?\([^()]*\)|#[0-9a-f]{3,8}|[a-z]+)(?:\s+(-?[\d.]+(?:%|[a-z]+)?))?$/i
    )
    if (m && isColorToken(m[1])) {
      color = m[1]
      posToken = m[2] ?? null
    } else {
      // 双位置写法 `red 0% 30%` 会被拆成「颜色 + 位置」两条，第二条只有位置
      const pm = item.match(/^(-?[\d.]+(?:%|[a-z]+)?)/)
      if (!pm) continue
      posToken = pm[1]
    }
    if (color) lastColor = color
    else color = lastColor
    if (!color) continue
    colors.push(color)
    offsets.push(stopOffset(posToken, linePx, scale))
  }
  if (!offsets.length) return []
  if (offsets[0] === null) offsets[0] = 0
  if (offsets[offsets.length - 1] === null) offsets[offsets.length - 1] = 1
  let i = 0
  while (i < offsets.length) {
    if (offsets[i] !== null) {
      i++
      continue
    }
    let j = i
    while (j < offsets.length && offsets[j] === null) j++
    const step = (offsets[j] - offsets[i - 1]) / (j - i + 1)
    for (let k = i; k < j; k++) offsets[k] = offsets[i - 1] + step * (k - i + 1)
    i = j
  }
  for (let k = 1; k < offsets.length; k++) {
    if (offsets[k] < offsets[k - 1]) offsets[k] = offsets[k - 1]
  }
  return offsets.map((offset, k) => [offset, colors[k]])
}

/** 写入停靠点；`repeating-` 前缀把「首末间距」当作周期向两端铺满 `[0, 1]`。 */
function addColorStops(gradient, stops, repeating) {
  const first = stops[0][0]
  const last = stops[stops.length - 1][0]
  const period = last - first
  if (!repeating || !(period > 0)) {
    for (const [offset, color] of stops) {
      gradient.addColorStop(Math.min(1, Math.max(0, offset)), color)
    }
    return
  }
  let base = first
  while (base > 0) base -= period
  for (; base < 1; base += period) {
    for (const [offset, color] of stops) {
      const v = base + (offset - first)
      if (v < 0 || v > 1) continue
      gradient.addColorStop(v, color)
    }
  }
  // 兜住两端，避免首末停靠点因浮点落在 [0, 1] 外时留下透明边
  gradient.addColorStop(0, stops[0][1])
  gradient.addColorStop(1, stops[stops.length - 1][1])
}

const GRADIENT_RE = /^(repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/i

/**
 * 画一层 CSS 渐变为填充（`linear-gradient` / `radial-gradient`）。
 *
 * 渐变按 `background-size: auto`（等价 `100% 100%`）铺满元素框：被合成的渐变元素
 * 均未显式设 `background-size`。`conic-gradient` 未实现且全仓无使用者，此时只保留
 * `background-color` 与其余层，不让整张分享图失败。
 */
function paintGradient(ctx, value, rect, scale) {
  const m = value.match(GRADIENT_RE)
  if (!m) return
  const repeating = Boolean(m[1])
  const kind = m[2].toLowerCase()
  const items = splitLayerList(m[3])
  if (!items.length) return
  const headIsColor = isColorToken(items[0].split(/\s+/)[0])
  const config = headIsColor ? '' : items[0]
  const stopList = items.slice(headIsColor ? 0 : 1).join(', ')
  if (!stopList) return

  if (kind === 'linear') {
    const rad = (parseLinearAngle(config, rect.w, rect.h) * Math.PI) / 180
    const sin = Math.sin(rad)
    const cos = Math.cos(rad)
    // CSS 的渐变线长度 = |W·sinθ| + |H·cosθ|
    const linePx = Math.abs(rect.w * sin) + Math.abs(rect.h * cos)
    const stops = parseColorStops(stopList, linePx, scale)
    if (!stops.length) return
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    const half = linePx / 2
    // canvas 的 y 轴向下，方向向量 = (sinθ, -cosθ)
    const gradient = ctx.createLinearGradient(
      cx - sin * half,
      cy + cos * half,
      cx + sin * half,
      cy - cos * half
    )
    addColorStops(gradient, stops, repeating)
    ctx.fillStyle = gradient
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    return
  }

  if (kind === 'radial') {
    const { cx, cy, rx, ry } = parseRadialConfig(config, rect.w, rect.h, scale)
    const stops = parseColorStops(stopList, Math.max(rx, ry), scale)
    if (!stops.length) return
    // 非等比 `ctx.scale` 把单位圆拉成椭圆，省去手算椭圆上的点
    ctx.save()
    ctx.translate(rect.x + cx, rect.y + cy)
    ctx.scale(rx, ry)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    addColorStops(gradient, stops, repeating)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/** 画一层 `url(...)` 背景图（`background-size` / `position` / `repeat` 按 computed 逐层复现）。 */
async function drawBackgroundLayerImage(ctx, value, rect, scale, index, cs) {
  const m = value.match(/url\(["']?(.*?)["']?\)/)
  if (!m?.[1]) return
  let img
  try {
    img = await loadImage(m[1])
  } catch {
    return /* 背景图失败不该毁掉整张分享图 */
  }
  const natW = img.naturalWidth
  const natH = img.naturalHeight
  if (!natW || !natH) return

  // 多层背景的 `size` / `position` / `repeat` 也是逗号列表，按同序号取；值少了沿用最后一项
  const pick = (str, fallback) => {
    const parts = splitLayerList(str)
    if (!parts.length) return fallback
    return parts[index] ?? parts[parts.length - 1]
  }
  const [w, h] = resolveBackgroundSize(
    pick(cs.backgroundSize, 'auto'),
    natW,
    natH,
    rect.w,
    rect.h,
    scale
  )
  if (!(w > 0) || !(h > 0)) return

  const posTokens = pick(cs.backgroundPosition, '0% 0%').trim().split(/\s+/).filter(Boolean)
  const offX = resolveBackgroundAxis(posTokens[0], rect.w - w, scale)
  const offY = resolveBackgroundAxis(posTokens[1], rect.h - h, scale)

  const repeat = pick(cs.backgroundRepeat, 'no-repeat')
  const tileX = repeat === 'repeat' || repeat === 'repeat-x'
  const tileY = repeat === 'repeat' || repeat === 'repeat-y'
  if (!tileX && !tileY) {
    ctx.drawImage(img, rect.x + offX, rect.y + offY, w, h)
    return
  }
  // 平铺：从矩形左上方向外对齐到最近的一格，再逐格画（上限兜底，防 1px 图死循环）
  let sx = rect.x + offX
  let sy = rect.y + offY
  while (sx > rect.x) sx -= w
  while (sy > rect.y) sy -= h
  const stepX = tileX ? w : Number.POSITIVE_INFINITY
  const stepY = tileY ? h : Number.POSITIVE_INFINITY
  let guard = 0
  for (let y = sy; y < rect.y + rect.h && guard < 4096; y += stepY) {
    for (let x = sx; x < rect.x + rect.w && guard < 4096; x += stepX) {
      ctx.drawImage(img, x, y, w, h)
      guard++
    }
    if (!Number.isFinite(stepY)) break
  }
}

/**
 * 画元素的所有背景绘制层：`background-color` + 每一层 `background-image`。
 *
 * 🔴 早先这一支只识别 `url(...)`，于是**渐变背景直接 return 掉**：收集器已按
 * `cs.backgroundImage !== 'none'` 把图层入栈，画的时候却什么都没画——页面正常，
 * 只有分享图少一层（蛋池星光辉光 `.pet-diamond__glow` 就是 `radial-gradient`）。
 * 现在按 computed 值分派：`url()` 走图片支，`linear-gradient` / `radial-gradient`
 * 走渐变支，`background-color` 先铺底。
 *
 * 🔴 CSS 绘制顺序：`background-color` 在**所有** `background-image` 层之下；
 * 多层 `background-image` 里**先列的画在上面**，故倒序遍历。
 *
 * 简化项：`background-origin` / `background-clip` 未处理——本页相关元素 `border-width`
 * 全为 0，`border-box` 与 `padding-box` 重合；`background-attachment` 全为 `scroll`。
 */
async function drawBackgroundImage(ctx, el, rect, scale) {
  const cs = getComputedStyle(el)
  const layers =
    cs.backgroundImage && cs.backgroundImage !== 'none' ? splitLayerList(cs.backgroundImage) : []
  const color = solidColorValue(cs.backgroundColor)
  if (!layers.length && !color) return

  ctx.save()
  if (cs.filter && cs.filter !== 'none') ctx.filter = cs.filter
  // 背景受元素形状裁切（`border-radius` 裁背景，**不裁** `border-image`）
  applyBorderRadiusClip(ctx, el, rect, scale)

  if (color) {
    ctx.fillStyle = color
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
  }

  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    if (GRADIENT_RE.test(layer)) {
      paintGradient(ctx, layer, rect, scale)
      continue
    }
    await drawBackgroundLayerImage(ctx, layer, rect, scale, i, cs)
  }
  ctx.restore()
}

/**
 * 画元素的 CSS 九宫格边框（`border-image`）。
 *
 * 🔴 这是与 `background-image` **并列**的独立绘制源：`.g-slice--top-item`（资源槽底牌）
 * 只有 `border-image`，没有 `background-image`。早先收集器只读 `backgroundImage`，
 * 于是资源槽底板在分享图里整块消失（页面上正常，因为浏览器原生支持 `border-image`）。
 *
 * 复现 `slice` / `width` / `fill` / `stretch` 语义：把源图按 `slice` 切成九块，
 * 四角与四边按 `width` 给出的边框盒**各自拉伸**（`stretch`），中间块仅在 `fill` 时画。
 * 超出盒子的边框宽度按 CSS 规则等比缩小；`outset` 本页全为 0，未处理。
 * `round` / `repeat` / `space` 本页未使用，退化为 `stretch`。
 */
async function drawBorderImage(ctx, el, rect, scale) {
  const cs = getComputedStyle(el)
  const src = cs.borderImageSource
  if (!src || src === 'none') return
  const m = src.match(/url\(["']?(.*?)["']?\)/)
  if (!m?.[1]) return
  let img
  try {
    img = await loadImage(m[1])
  } catch {
    return
  }
  const natW = img.naturalWidth
  const natH = img.naturalHeight
  if (!natW || !natH) return

  // 1~4 值展开为「上 右 下 左」（与 CSS 边距简写同规则）
  const expand = (tokens) => {
    const [a, b = a, c = a, d = b] = tokens
    return [a, b, c, d]
  }
  const sliceStr = cs.borderImageSlice || '100%'
  const fill = /\bfill\b/.test(sliceStr)
  const [stT, stR, stB, stL] = expand(
    sliceStr.replace(/\bfill\b/g, '').trim().split(/\s+/).filter(Boolean)
  )
  const slicePx = (token, axisLen) => {
    if (token === undefined) return 0
    if (token.endsWith('%')) return (parseFloat(token) / 100) * axisLen
    const n = parseFloat(token)
    return Number.isFinite(n) ? n : 0
  }
  let sl = slicePx(stL, natW)
  let sr = slicePx(stR, natW)
  let st = slicePx(stT, natH)
  let sb = slicePx(stB, natH)
  // 同侧切片之和超过源图尺寸时，CSS 会等比缩小到刚好放下
  if (sl + sr > natW) {
    const k = natW / (sl + sr)
    sl *= k
    sr *= k
  }
  if (st + sb > natH) {
    const k = natH / (st + sb)
    st *= k
    sb *= k
  }

  // `border-image-width`：`auto` 取对应 slice；无单位数 = border-width 倍数；其余按长度/百分比
  // 绝对长度是 CSS（视觉）像素，按 `scale` 折算成设计像素；百分比与倍数天然无量纲
  const bwSide = (token, sliceVal, boxLen, borderWidth) => {
    if (token === undefined || token === 'auto') return sliceVal
    if (token.endsWith('%')) return (parseFloat(token) / 100) * boxLen
    const n = parseFloat(token)
    if (!Number.isFinite(n)) return sliceVal
    // 无单位数字是 border-width 的倍数（border-width 也是视觉像素，一并折算）
    return /^-?[\d.]+$/.test(token) ? (n * borderWidth) / scale : n / scale
  }
  const bwStr = cs.borderImageWidth || 'auto'
  const bwTokens = bwStr === 'auto' ? ['auto'] : bwStr.trim().split(/\s+/).filter(Boolean)
  const [bwT, bwR, bwB, bwL] = expand(bwTokens)
  let bt = bwSide(bwT, st, rect.h, parseFloat(cs.borderTopWidth) || 0)
  let br = bwSide(bwR, sr, rect.w, parseFloat(cs.borderRightWidth) || 0)
  let bb = bwSide(bwB, sb, rect.h, parseFloat(cs.borderBottomWidth) || 0)
  let bl = bwSide(bwL, sl, rect.w, parseFloat(cs.borderLeftWidth) || 0)
  // 同侧边框宽度之和超过盒子尺寸时同样等比缩小
  if (bl + br > rect.w) {
    const k = rect.w / (bl + br)
    bl *= k
    br *= k
  }
  if (bt + bb > rect.h) {
    const k = rect.h / (bt + bb)
    bt *= k
    bb *= k
  }

  // 源/目标各切四刀 → 九块
  const sx = [0, sl, natW - sr, natW]
  const sy = [0, st, natH - sb, natH]
  const dx = [rect.x, rect.x + bl, rect.x + rect.w - br, rect.x + rect.w]
  const dy = [rect.y, rect.y + bt, rect.y + rect.h - bb, rect.y + rect.h]

  ctx.save()
  if (cs.filter && cs.filter !== 'none') ctx.filter = cs.filter
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // 中间块只在 `fill` 时画
      if (row === 1 && col === 1 && !fill) continue
      const sw = sx[col + 1] - sx[col]
      const sh = sy[row + 1] - sy[row]
      const dw = dx[col + 1] - dx[col]
      const dh = dy[row + 1] - dy[row]
      if (!(sw > 0) || !(sh > 0) || !(dw > 0) || !(dh > 0)) continue
      ctx.drawImage(img, sx[col], sy[row], sw, sh, dx[col], dy[row], dw, dh)
    }
  }
  ctx.restore()
}

/**
 * 合成分享图。
 *
 * ## 取位方式：读 DOM 实测矩形，不重抄 CSS
 *
 * 所有图层的坐标都由 `getBoundingClientRect()` 实测得到，再按画布缩放换算到输出坐标系。
 * 这样改样式后截图自动跟随，不会"改了样式、截图还是旧的"（那类问题不报错，很难发现）。
 *
 * ## 绘制顺序：按 `z-index` 排序，而不是 DOM 顺序
 *
 * 舞台用绝对定位 + `z-index` 分层（背景 1 / 桌面 3 / Spine 5 / UI 10+），
 * DOM 顺序与视觉层级**不一致**，照 DOM 画会出现"蛋框盖住名牌"这类错层。
 *
 * @param {HTMLElement} stageEl `GachaStage` 的根元素
 * @param {{ requireSelector: string, emptyError: string }} config
 *   `requireSelector` 用于**校验舞台是否正确**（防止误传别的面板而静默出空气图）。
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderGachaShareImage(stageEl, config) {
  if (!stageEl) throw new Error('结果舞台不存在')
  const { requireSelector, emptyError } = config
  /*
   * 🔴 必须校验传入的是**目标面板**的舞台。
   *
   * 页面上同时存在多个 `.gacha-stage`（卡池面板那个仍挂载着，只是被覆盖层挡住），
   * 角色池与蛋池也各自有舞台。若调用方误传，整个流程仍能跑完、`toBlob` 也会成功，
   * 但产出的是**一张空气图**（实测 `opaqueRatio: 0`）—— 而且不会报错。
   * 所以这里主动断言，把"静默画错"变成明确报错。
   */
  if (!stageEl.querySelector(requireSelector)) throw new Error(emptyError)

  const canvasEl = stageEl.querySelector('.gacha-canvas') || stageEl
  const stageRect = canvasEl.getBoundingClientRect()
  if (!stageRect.width || !stageRect.height) throw new Error('结果画布不可见，无法截图')

  /*
   * 输出坐标系 = **画布布局坐标 ÷ 画布缩放**。
   *
   * 为什么不是固定的 1534×750：`fit="height"` 时 `GachaStage` 把画布布局尺寸设成
   * `1534 × (容器宽/scale)`，而内容用 `gachaPos`（`calc(50% ± x)`，百分比相对画布元素）
   * 定位——所以真实坐标系是**画布布局盒**，不是设计常量。
   *
   * ⚠️ 也不能用 `画布CSS尺寸 / 1534×750` 反推比例：那多出来的高度是**画布自身的余量**，
   * 内容并不铺满它，照它换算会在上下留白边。
   *
   * 正确做法：**直接读画布的 `transform: scale(...)`**（`GachaStage` 暴露的就是这个值），
   * 它才是"设计像素 → CSS 像素"的真实比例。
   */
  const scale = canvasScale(canvasEl)
  if (!scale) throw new Error('无法读取画布缩放，截图失败')

  /*
   * 🔴 手机竖屏时 `GachaViewport` 把整页内容 `rotate(90deg)`，此时
   * `getBoundingClientRect()` 返回的是**旋转后的轴对齐包围盒**：画布和每个图层的
   * 宽高都被**互换**了（实测画布设计盒 1624×750 横版，包围盒却是 393×851 竖版）。
   *
   * 照搬会得到一张竖版图，且每个图层的宽高错位——合成结果是一张横竖拧着的乱图。
   *
   * 处理：把包围盒换算回**内容自身坐标系**（未旋转）。输出保持横版构图
   * ——分享出去的是场景本身，不是"用户侧着看"的那一帧。
   */
  const quarter = contentQuarterTurn(canvasEl)
  const rotated = quarter % 2 !== 0
  // 旋转绕中心进行，包围盒中心 = 内容盒中心（`transform-origin: center`）
  const cx = stageRect.left + stageRect.width / 2
  const cy = stageRect.top + stageRect.height / 2
  const visualW = rotated ? stageRect.height : stageRect.width
  const visualH = rotated ? stageRect.width : stageRect.height
  /*
   * 视口偏移 → 内容坐标偏移的**逆变换**：顺时针转 θ 后 (u, v) → (u·cosθ − v·sinθ, u·sinθ + v·cosθ)，
   * 于是 (dx, dy) → (dx·cosθ + dy·sinθ, −dx·sinθ + dy·cosθ)。四分之一圈只有 0/±1 两种取值。
   */
  const [cos, sin] = [[1, 0], [0, 1], [-1, 0], [0, -1]][quarter]
  const toDesign = r => {
    // 奇数圈时包围盒宽高互换，先换回元素自身的视觉尺寸
    const lw = rotated ? r.height : r.width
    const lh = rotated ? r.width : r.height
    const dx = r.left + r.width / 2 - cx
    const dy = r.top + r.height / 2 - cy
    const u = dx * cos + dy * sin
    const v = -dx * sin + dy * cos
    return {
      x: (u + visualW / 2 - lw / 2) / scale,
      y: (v + visualH / 2 - lh / 2) / scale,
      w: lw / scale,
      h: lh / scale
    }
  }

  // ── 收集要画的图层 ──
  // 遍历**所有后代元素**（`*`），不按标签白名单过滤：
  // 早先用 `'img, canvas, p, span, em, div'` 列举，`<button>` 不在其中 →
  // 结果页的抽取按钮（`button.g-slice.result-btn`，背景图挂在 `.g-slice--btn-y` 上）
  // 整个没被枚举到，分享图里「招募十次」只剩文字、**底板丢失**。
  // 白名单漏一个标签就静默丢一层，所以改为全量枚举 + 逐元素判"这个元素画什么"。
  //
  // 每个元素按 CSS 的绘制顺序可产出多个图层：
  //   `background-image`（背景）→ `border-image`（边框九宫格）→ 文字（内容）
  // 跳过不可见的（`display:none` / 零尺寸 / `opacity:0`），否则会把隐藏层画出来。
  const layers = []
  for (const el of stageEl.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (parseFloat(cs.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue

    const d = toDesign(r)
    const z = zIndexPath(el)
    // 同一元素可产出多层，`order` 先留 0，末尾按入栈顺序统一编号
    const push = (kind) => layers.push({ el, rect: r, d, z, kind, order: 0 })

    if (el.tagName === 'CANVAS') { push('canvas'); continue }
    if (el.tagName === 'IMG') { push('image'); continue }

    // `border-image` 与 `background-image` 是两个**独立**的绘制源，可同时存在，各判各画
    // 入栈顺序 = CSS 绘制顺序：背景 → 边框图 → 内容
    // 🔴 判据不能只看 `background-image`：纯 `background-color` 的元素（透明底色层、
    // 圆角标签等）根本没有背景图，只看背景图会连 `background-color` 一起漏掉
    const hasBgImage = cs.backgroundImage && cs.backgroundImage !== 'none'
    const hasBgColor = solidColorValue(cs.backgroundColor) !== null
    if (hasBgImage || hasBgColor) push('bg')
    if (cs.borderImageSource && cs.borderImageSource !== 'none') push('border')
    // 纯文字（蛋池名牌、星级数字、按钮文案等）：只有**叶子**才当文字画
    if (!el.children.length && (el.textContent || '').trim()) push('text')
  }
  if (!layers.length) throw new Error('舞台内没有可绘制的内容')
  // 稳定排序：z 相同时保持入栈顺序（同元素内保持 背景→边框→文字，DOM 内后者在上）
  layers.forEach((l, i) => { l.order = i })
  layers.sort((a, b) => (a.z - b.z) || (a.order - b.order))

  /*
   * 🔴 输出尺寸 = **画布的可见区域**（`stageRect`），不是内容包围盒。
   *
   * 为什么不能用包围盒：背景 `pet-bg` 与桌面前景 `pet-desk-fg` 都故意溢出舞台
   * （实测 x −158…1597、y 130…1012，而舞台是 1440×900），它们在页面上本来就被
   * `overflow: hidden` 裁掉。若按包围盒输出，等于把"页面上看不到的部分"也画进去，
   * 结果就是四周多出内容未覆盖的**白边**（用户看到的白条）。
   *
   * 按舞台可见区输出后：超出的部分自然被裁（与页面一致），也不会留白。
   *
   * 🔴 `stageRect` 是 `getBoundingClientRect()`，即**视觉（CSS）像素**，已经含画布
   * `transform: scale()`；而上面 `toDesign()` 把图层换算成**设计像素**。两者单位不同，
   * 所以这里必须补上 `scale`：
   *
   *   设计像素 × (OUT_SCALE × scale) = 视觉像素 × OUT_SCALE = 输出像素
   *
   * 漏掉 `scale` 时，画布按视觉尺寸开、内容按设计尺寸画：`scale > 1`（窗口比
   * 1534 CSS px 更宽，如 1920×1080 → 1.2516）时内容只铺到 1534×2 = 3068 px，
   * 右边与下边各留一条**没画上的透明带**；`scale < 1`（1440×900 → 0.9387）时内容
   * 反而溢出、把整张盖满，所以那个尺寸下看不出问题——这也是它长期未被发现的原因。
   *
   * 🔴 输出尺寸取 `visualW/visualH`（**未旋转**的内容可见区），不取 `stageRect`。
   * 竖屏下 `stageRect` 是旋转后的包围盒（393×851），照它开画布会把横版场景塞进
   * 竖版图里，再叠上宽高互换的图层 → 得到一张拧着的乱图（实测 786×1702）。
   */
  const out = document.createElement('canvas')
  out.width = Math.round(visualW * OUT_SCALE)
  out.height = Math.round(visualH * OUT_SCALE)
  const ctx = out.getContext('2d')
  ctx.scale(OUT_SCALE * scale, OUT_SCALE * scale)

  for (const { el, d, kind } of layers) {
    if (!d.w || !d.h) continue

    if (kind === 'canvas') {
      // WebGL 画布：**先同步重画再抓**（本上下文未开 preserveDrawingBuffer，
      // 隔帧抓只会得到空白——实测采样点全 0）。
      const renderNow = await loadRenderSceneNow()
      renderNow?.(el)
      try {
        ctx.drawImage(el, d.x, d.y, d.w, d.h)
      } catch {
        /* 跨域/上下文丢失：跳过该层，不让整张图失败 */
      }
      continue
    }

    if (kind === 'image') {
      const cs = getComputedStyle(el)
      try {
        const img = await loadImage(el.currentSrc || el.src)
        ctx.save()
        // 图片自带的滤镜（如背板的 brightness）要一并复现
        if (cs.filter && cs.filter !== 'none') ctx.filter = cs.filter
        drawImageFit(ctx, img, d, cs.objectFit)
        ctx.restore()
      } catch {
        /* 单张图失败不该毁掉整张分享图 */
      }
      continue
    }

    if (kind === 'bg') {
      // CSS 背景图（`.gacha-bleed` 铺底、`.g-slice--btn-*` 按钮底板等）
      await drawBackgroundImage(ctx, el, d, scale)
      continue
    }

    if (kind === 'border') {
      // CSS 九宫格边框（`.g-slice--top-item` 资源槽底牌等）
      await drawBorderImage(ctx, el, d, scale)
      continue
    }

    // 纯文字（蛋池名牌、星级数字、按钮文案等）
    drawCenteredText(ctx, el, d)
  }

  return out
}

/**
 * 读画布的等比缩放（`GachaStage` 用 `transform: scale(...)` 适配舞台）。
 *
 * 从 `transform` 矩阵取，而不是从 `getBoundingClientRect()` 反推——后者在有祖先缩放、
 * 旋转（手机竖屏整页 rotate 90°）时会失真。矩阵里的 `a` 分量就是纯缩放。
 */
function canvasScale(canvasEl) {
  const t = getComputedStyle(canvasEl).transform
  if (!t || t === 'none') return 1
  const m = t.match(/matrix\(([^,]+),/)
  const scale = m ? parseFloat(m[1]) : NaN
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

/**
 * 元素所处的**内容坐标系相对视口转了多少个 90°**（0/1/2/3，顺时针）。
 *
 * `GachaViewport` 在触摸设备竖屏时给整页内容套 `transform: rotate(90deg)`
 * （实测矩阵 `matrix(0, 1, -1, 0, …)`），此后 `getBoundingClientRect()` 返回的是
 * **旋转后的轴对齐包围盒**——宽高互换、坐标也被转到视口系。
 *
 * 沿祖先累加角度：2D 变换下旋转角可加，且均匀缩放不影响 `atan2` 的结果。
 * 只取整 90° 的倍数；非直角旋转按 0 处理（本页不存在这种用法）。
 */
function contentQuarterTurn(el) {
  let deg = 0
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const t = getComputedStyle(node).transform
    if (!t || t === 'none') continue
    const m = t.match(/matrix\(([^)]+)\)/)
    if (!m) continue
    const p = m[1].split(',').map(Number)
    if (p.length < 4 || !p.every(Number.isFinite)) continue
    deg += Math.atan2(p[1], p[0]) * 180 / Math.PI
  }
  const norm = ((deg % 360) + 360) % 360
  return Math.round(norm / 90) % 4
}

/**
 * 元素在舞台内的**层级路径**：沿祖先累加 `z-index`，用于跨容器排序。
 *
 * 为什么不直接读自身 `z-index`：舞台的层是嵌套的（`.pet-stage-cam` 里还有子层），
 * 只比自身值会让不同分支的元素无法比较。累加路径能还原视觉叠放顺序。
 */
function zIndexPath(el) {
  let z = 0
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const value = parseInt(getComputedStyle(node).zIndex, 10)
    if (Number.isFinite(value)) z += value
  }
  return z
}

/**
 * 角色池（`HeroShowPanel`）的分享图。
 * @param {HTMLElement} stageEl
 */
export function renderGachaResultImage(stageEl) {
  return renderGachaShareImage(stageEl, {
    requireSelector: '.result-diamond',
    emptyError: '传入的舞台不含招募结果，无法截图'
  })
}

/**
 * 魔物蛋池（`PetGachaAniPanel`）的分享图。
 *
 * 蛋池的分享按钮在**揭晓演出中**，分享的是**当前这一只**（背景 + 蛋袋 + 蛋框 + 名牌 + 星级），
 * 与游戏一致。⚠️ 中间的蛋袋是 Spine WebGL canvas，必须同步重画后才能抓到。
 */
export function renderGachaPetImage(stageEl) {
  return renderGachaShareImage(stageEl, {
    requireSelector: '.pet-diamond-wrap',
    emptyError: '传入的舞台不含魔物蛋揭晓结果，无法截图'
  })
}

/** Blob → base64（去掉 data URL 前缀）。`Filesystem.writeFile` 收的是纯 base64。 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(new Error('图片编码失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 下载兜底（浏览器不支持分享、或分享失败时用）。
 */
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 立刻 revoke 会让部分浏览器来不及取数据，放到下一轮事件循环
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * 是否是**触摸设备**（手机/平板）。
 *
 * 用 `(pointer: coarse)` 而不是宽度断点：桌面窄窗口仍该走下载、触屏平板即便很宽也该调分享。
 * 这也是项目既有约定（`GachaViewport.vue`、`theme.css` 都用它区分触屏）。
 */
function isTouchDevice() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * 调起分享或直接下载。**按设备分流**（用户明确要求）：
 *
 * - **触摸设备（手机/平板）** → 调起系统分享面板，用户可存图 / 发给别人。
 *   网页端优先 `navigator.share({ files })`；原生端写 Cache 目录后 `Share.share({ url })`。
 * - **鼠标设备（电脑）** → **直接下载**。桌面浏览器虽然 `canShare` 也返回 true，
 *   但实际调不起可用的分享面板（实测会挂起），先试再兜底等于让用户白等一次超时。
 *
 * @returns {Promise<'shared'|'downloaded'>}
 */
export async function shareOrSaveImage(blob, fileName, { title = '', dialogTitle = '' } = {}) {
  if (isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: await blobToBase64(blob),
      directory: Directory.Cache
    })
    await Share.share({ title, url: uri, dialogTitle })
    return 'shared'
  }

  // 电脑：不试分享，直接下载
  if (!isTouchDevice()) {
    downloadBlob(blob, fileName)
    return 'downloaded'
  }

  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await withTimeout(navigator.share({ files: [file], title }), SHARE_TIMEOUT_MS)
      return 'shared'
    } catch (err) {
      // 用户主动取消 → 尊重他的选择，不要偷偷下载
      if (err?.name === 'AbortError') throw err
      // 其它失败（无 UI、平台限制）→ 退回下载，至少让他拿到图
      downloadBlob(blob, fileName)
      return 'downloaded'
    }
  }

  downloadBlob(blob, fileName)
  return 'downloaded'
}

/**
 * 给 `navigator.share` 加超时。
 *
 * 🔴 **实测某些环境里 share 会永远挂起**（既不 resolve 也不 reject，例如无 UI 的自动化浏览器）——
 * 那样下面的 `catch` 兜底永远不会执行，用户点了分享会**一直卡住、什么都不发生**。
 * 所以这里必须有超时，把"挂起"转成"失败"再走兜底。
 *
 * 超时值取 20 秒：真人操作系统分享面板（选 App、写附言）通常几秒内完成，
 * 20 秒还没返回基本可判定为异常；同时不至于误伤手慢的用户。
 */
const SHARE_TIMEOUT_MS = 20000
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error('分享超时')
        err.name = 'TimeoutError'
        reject(err)
      }, ms)
    })
  ])
}

/** 是否原生端。单独包一层便于测试替换（`env.js` 的 `isNative` 是模块加载时定死的）。 */
function isNativePlatform() {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true
}

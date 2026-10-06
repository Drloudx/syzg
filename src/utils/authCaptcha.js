/**
 * 人机验证（蛋点选）—— 题目生成与 SVG 渲染。
 *
 * ## 题目形态（照着找）
 *
 * ```
 *  提示区： [蛋A] [蛋B] [蛋C]        ← 3 张，顺序有意义，不带名字
 *  画布  ： 2×3 网格中随机空一格，放 5 个蛋（含那 3 个 + 2 个干扰）
 *  用户  ： 按提示顺序点中那 3 个
 * ```
 *
 * - 盲猜成功率 `1/(5×4×3)` = **1/60 ≈ 1.7%**；
 * - **错 1 次即整题作废**（换新题），所以不需要 attempts 计数；
 * - 蛋池只用 4 星与 5 星（共 13 个），★干扰蛋取自"另一个星级"★，
 *   所以"目标"与"干扰"两类天然不重叠，题目不会自相矛盾。
 *
 * ## 🔴 诚实的防护定位（读一遍再改）
 *
 * **这个验证码挡不住会写图像处理的脚本。** 原因很直白：
 * 只要答案对用户可见（否则用户也答不出），它对机器就可推导 ——
 * SVG 里的那张图，脚本也能拿到、也能匹配。
 *
 * 下面这些做法只是**提高门槛**，不是"防住"：
 * - 图片**内联 base64**（不暴露文件名/URL，脚本没法直接读 `href` 知道是哪个蛋）；
 * - 画布实例带**随机旋转/缩放/偏移**（简单的位置模板匹配失效）；
 * - 提示区与画布**都随机变换**（同一个蛋在两处的呈现不同）；
 * - 元素顺序**打乱**，实例序号与蛋的身份无对应关系。
 *
 * **真正的防线是限流**：同邮箱冷却 + 同 IP 限流 + 一次性邮箱黑名单
 * + SES 日限额 500 封的硬熔断。详见方案 §17.2。
 */

import { CAPTCHA_CANVAS_COUNT, CAPTCHA_PROMPT_COUNT } from '../config/auth.js'
import { CAPTCHA_EGGS, CAPTCHA_STARS, eggsOfStar } from '../config/captchaEggs.js'

/**
 * 几何常量（单位 = SVG 用户坐标；外层 `width="100%"` 自适应）。
 *
 * ## 尺寸是按真机反馈调过的
 *
 * 第一版用的是"2×3 网格 + 94px 大蛋"，在真机（Redmi 411×812 CSS px）上
 * 渲染成 375×341，用户反馈**上下两排的蛋都太大、画布的尤其大**。
 *
 * 现在：
 * - 提示区 **44px**（要看清，但不能占满屏）
 * - 画布 **34px** —— 明显比提示区小，逼着人真的去找
 * - 触摸热区仍给到 **54px**（远大于 44px 的最小可用值），**小图不等于难点**
 *
 * ## 为什么画布不排网格了
 *
 * 原来是"2×3 网格里随机空一格"，用户看久了能靠**格子位置**记形状，
 * 而且网格本身也给了脚本一个强先验。现在改成**自由散布**（带最小间距约束），
 * 位置真随机，两个方向上都更难。
 */
const SVG_W = 360

// 提示区（三个蛋排成一行；顺序有意义，所以不做散布）
const PROMPT_EGG = 44
const PROMPT_GAP = 20
const PROMPT_TOP = 10
const PROMPT_BAND_H = 66

// 画布（自由散布区）
const CANVAS_TOP = PROMPT_BAND_H + 6
const CANVAS_H = 196
const CANVAS_PAD = 4
const CANVAS_EGG = 34

/** 触摸热区边长。**比蛋大得多** —— 手指点得中比看着大好更重要。 */
const HIT_BOX = 54
/** 两个热区之间的最小中心距，避免热区互相盖住导致"点这个却算那个"。 */
const MIN_CENTER_DIST = HIT_BOX + 4

const SVG_H = CANVAS_TOP + CANVAS_H + CANVAS_PAD

/** 散布区的可用矩形（热区要整个落在里面，所以四周各让出半个热区）。 */
const FIELD = {
  x0: CANVAS_PAD + HIT_BOX / 2,
  x1: SVG_W - CANVAS_PAD - HIT_BOX / 2,
  y0: CANVAS_TOP + HIT_BOX / 2,
  y1: CANVAS_TOP + CANVAS_H - HIT_BOX / 2
}

/**
 * 用 WebCrypto 取 [0, n) 的整数。
 *
 * 布局随机用 `Math.random` 其实也够（它不影响安全性：答案存在服务端，
 * 且脚本无论如何都要做图像匹配）。这里仍用 WebCrypto，是为了避免
 * "安全相关代码里混着弱随机"这种将来容易被抄错的习惯。
 */
function randomInt(n) {
  if (n <= 0) throw new Error('randomInt: n 必须为正')
  const limit = Math.floor(0x100000000 / n) * n
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % n
  }
}

function randomFloat(min, max) {
  return min + (max - min) * (randomInt(1_000_000) / 1_000_000)
}

/** 无放回抽 n 个。 */
function sample(arr, n) {
  if (n > arr.length) throw new Error(`sample: 要抽 ${n} 个但只有 ${arr.length} 个`)
  const pool = [...arr]
  const out = []
  for (let i = 0; i < n; i++) out.push(pool.splice(randomInt(pool.length), 1)[0])
  return out
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** XML 属性值转义（base64 里没有这些字符，但 id 之类要过一遍更稳）。 */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 渲染一个蛋实例：`<image>` **直接内联** base64，外面套随机变换。
 *
 * ## 🔴 为什么不用 `<defs>` + `<use>`
 *
 * 一开始为了省体积（13KB vs 75KB）用了 `<use href="#glyph">` 引用 `<defs>` 里的 `<image>`，
 * 结果**光栅化出来是空白** —— 很多 SVG 实现**只支持 `<use>` 引用 `<symbol>`/`<g>`/`<path>`，
 * 不支持引用 `<image>`**。这种失败是**静默的**（元素存在、属性合法、就是不显示），
 * 单测完全查不出来（结构断言全过），只有在真渲染时才暴露。
 *
 * 而验证码是**注册流程的必经之路** —— 它瞎了等于所有人都注册不了。
 * 所以这里选**兼容性拉满**的写法：每个实例直接内联一份 `<image>`，
 * 代价是体积大 6 倍（约 75KB/题），换来的是"任何渲染器都画得出来"。
 *
 * > 这个坑值得记：**能用别名不等于敢用别名** —— 验证码这种"坏了就全站注册停摆"的东西，
 * > 要优先选最保守的写法。
 */
function renderEggInstance(b64, cx, cy, boxSize) {
  const rot = randomFloat(-12, 12)
  const scale = randomFloat(0.9, 1.1)
  const dx = randomFloat(-6, 6)
  const dy = randomFloat(-6, 6)
  const half = boxSize / 2
  return (
    `<g transform="translate(${(cx + dx).toFixed(2)} ${(cy + dy).toFixed(2)}) rotate(${rot.toFixed(2)}) scale(${scale.toFixed(3)})">` +
    `<image href="${esc(b64)}" x="${(-half).toFixed(2)}" y="${(-half).toFixed(2)}" ` +
    `width="${boxSize}" height="${boxSize}" preserveAspectRatio="xMidYMid meet"/>` +
    `</g>`
  )
}

/**
 * 在散布区里给 n 个实例找位置：**拒绝采样**，彼此中心距不小于 `MIN_CENTER_DIST`。
 *
 * 为什么不用"网格 + 抖动"：网格会留下**可记忆的规律**（人看几轮就能靠格子记形状），
 * 而且给脚本一个很强的先验。真·自由散布两个方向上都更难。
 *
 * 采样失败（空间不够）时退化为"抖动网格"兜底，保证**永远出得了题** ——
 * 验证码生成失败等于注册停摆，宁可位置丑一点也不能抛异常。
 */
function scatterPositions(n) {
  const out = []
  const triesPerEgg = 400

  for (let i = 0; i < n; i++) {
    let placed = null
    for (let t = 0; t < triesPerEgg; t++) {
      const x = randomFloat(FIELD.x0, FIELD.x1)
      const y = randomFloat(FIELD.y0, FIELD.y1)
      const clash = out.some((p) => Math.hypot(p.x - x, p.y - y) < MIN_CENTER_DIST)
      if (!clash) {
        placed = { x, y }
        break
      }
    }
    if (!placed) {
      // 兜底：抖动网格（normalized 坐标 → 实际矩形）
      const cols = Math.ceil(Math.sqrt(n))
      const rows = Math.ceil(n / cols)
      const col = i % cols
      const row = Math.floor(i / cols)
      placed = {
        x: FIELD.x0 + ((col + 0.5) / cols) * (FIELD.x1 - FIELD.x0) + randomFloat(-8, 8),
        y: FIELD.y0 + ((row + 0.5) / rows) * (FIELD.y1 - FIELD.y0) + randomFloat(-8, 8)
      }
    }
    out.push(placed)
  }
  return out
}

/**
 * 站点主背景图 —— 与 `src/assets/theme.css` 里 `html, body` 的
 * `background-image: url('/ui/map_w1_bg.webp')` **是同一张**。
 *
 * 🔴 **这里按 URL 引用，不内联 base64。** 两个原因：
 *
 * 1. **太大**：原图 251.7KB，base64 之后约 340KB，会让**每个**验证码请求
 *    凭空多出这么大一坨（蛋图那 80KB 已经不小了）；
 * 2. **没必要**：验证码 SVG 必须**内联进 DOM**（`.hit` 热区要绑点击事件），
 *    内联的情况下相对 URL 会按页面 origin 正常解析；而且站点别处早就加载过这张图，
 *    浏览器缓存直接命中 —— **零额外传输**。
 *
 * ⚠️ 若将来把这个 SVG 改成塞进 `<img src="data:image/svg+xml,...">` 渲染，
 * 外部引用会被浏览器拦掉，背景会变成兜底底色（不会报错、只是没图）。
 * 那种情况下要么改回内联、要么改回程序化纹理。
 */
const SITE_BG_URL = '/ui/map_w1_bg.webp'

/**
 * 背景：**站点主背景图原样铺满**，只在上面撒一点纹理。
 *
 * 用户反馈三级：
 * 1. 第一版纯色 → "背景太干净"（不像找东西的题，也白送脚本一个干净的匹配底）；
 * 2. 加程序化羊皮纸纹理 → 改用**站点主背景图**；
 * 3. 我为了保对比度在图上面压了一层 `opacity=0.6` 的暖色薄纱，
 *    结果地图被冲淡了 → 用户："不要虚化"。
 *
 * 🔴 **所以现在不加任何整幅的半透明色块** —— 背景图什么样就什么样。
 * 只保留三样**不会盖住图**的东西：
 *
 * 1. `feTurbulence` 细颗粒（低透明度）—— 打散纯色区域，干扰形状匹配；
 * 2. 少量墨点与划痕 —— 制造与蛋无关的碎块；
 * 3. 四周很轻的晕影 —— 收拢视线（`0.18`，只压边缘，不碰中间）。
 *
 * 蛋图的可读性改为**靠蛋图自身**保证：蛋图边缘清晰、颜色饱和，
 * 而地图底本身是浅色羊皮纸调，对比度是够的（真机实测确认）。
 * 若将来换成深色背景图，再单独讨论要不要加局部衬底，**别默认整幅压一层**。
 */
function buildBackground() {
  const grainId = 'n' + randomInt(1e9).toString(36)
  const vignId = 'v' + randomInt(1e9).toString(36)

  const specks = []
  const speckCount = 18
  for (let i = 0; i < speckCount; i++) {
    const cx = randomFloat(0, SVG_W)
    const cy = randomFloat(0, SVG_H)
    const r = randomFloat(0.7, 2.2)
    const op = randomFloat(0.04, 0.13)
    specks.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#5a4629" opacity="${op.toFixed(2)}"/>`)
  }

  // 几道淡淡的斜向划痕，进一步打散"干净"的观感
  const strokes = []
  for (let i = 0; i < 4; i++) {
    const x = randomFloat(0, SVG_W)
    const y = randomFloat(0, SVG_H)
    const len = randomFloat(24, 70)
    const ang = randomFloat(-0.9, 0.9)
    strokes.push(
      `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" ` +
        `x2="${(x + Math.cos(ang) * len).toFixed(1)}" y2="${(y + Math.sin(ang) * len).toFixed(1)}" ` +
        `stroke="#5a4629" stroke-opacity="${randomFloat(0.04, 0.09).toFixed(2)}" stroke-width="${randomFloat(0.6, 1.3).toFixed(1)}"/>`
    )
  }

  return (
    `<defs>` +
    `<filter id="${grainId}" x="0" y="0" width="100%" height="100%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${randomFloat(0.7, 1.1).toFixed(2)}" ` +
    `numOctaves="3" seed="${randomInt(9999)}" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/>` +
    `</filter>` +
    `<radialGradient id="${vignId}" cx="50%" cy="45%" r="74%">` +
    `<stop offset="62%" stop-color="#3d2f1c" stop-opacity="0"/>` +
    `<stop offset="100%" stop-color="#3d2f1c" stop-opacity="0.18"/>` +
    `</radialGradient>` +
    `</defs>` +
    // 兜底底色：图没加载出来（或断网）时也不会变成透明/白块。
    // 它画在背景图**之前**，所以图正常时完全看不见 —— 不是"压在图上的色块"。
    `<rect x="0" y="0" width="${SVG_W}" height="${SVG_H}" fill="#e2d5b6"/>` +
    // 站点主背景图：原样铺满，slice 裁切不拉伸
    `<image href="${SITE_BG_URL}" x="0" y="0" width="${SVG_W}" height="${SVG_H}" ` +
    `preserveAspectRatio="xMidYMid slice"/>` +
    // 颗粒（很轻，只为打散纯色区，不做覆盖式淡化）
    `<rect x="0" y="0" width="${SVG_W}" height="${SVG_H}" filter="url(#${grainId})" opacity="0.1"/>` +
    // 墨点与划痕
    specks.join('') +
    strokes.join('') +
    // 晕影（只压边缘）
    `<rect x="0" y="0" width="${SVG_W}" height="${SVG_H}" fill="url(#${vignId})"/>`
  )
}

/**
 * 出题。
 *
 * @param {{debug?: boolean}} [options]
 *   `debug: true` 时额外返回 `debug` 字段（含画布/提示区各自的蛋 id），**仅供单测校验正解**。
 *   🔴 **默认不返回** —— 这样即使将来有人写成 `json({ ...buildCaptcha() })`，
 *   也不会把答案泄漏出去。要拿答案必须显式写 `{ debug: true }`，一眼可见。
 *
 * @returns {{ svg:string, answer:string, star:number, targetIds:string[], debug?:object }}
 *   `answer` 是**画布实例序号**按提示顺序拼成的串（如 `"3,0,4"`），
 *   存在 `captchas.answer` 里（再经 pepper 哈希）。**绝不返回给客户端。**
 */
export function buildCaptcha(options = {}) {
  const wantDebug = options.debug === true
  const canvasCount = CAPTCHA_CANVAS_COUNT
  const promptCount = CAPTCHA_PROMPT_COUNT
  const decoyCount = canvasCount - promptCount

  // 1) 随机挑一个星级当"目标星级"，干扰蛋取自**另一个**星级
  const star = CAPTCHA_STARS[randomInt(CAPTCHA_STARS.length)]
  const otherStar = CAPTCHA_STARS.find((s) => s !== star)
  if (otherStar === undefined) {
    throw new Error('buildCaptcha: 蛋池只有一个星级，无法构造"另一类"干扰蛋')
  }

  const targets = sample(eggsOfStar(star), promptCount)
  const decoys = sample(eggsOfStar(otherStar), decoyCount)

  // 2) 画布顺序打乱：实例序号与蛋身份**无对应关系**
  const canvas = shuffle([...targets, ...decoys])

  // 3) 自由散布（带最小间距），不再用网格
  const spots = scatterPositions(canvasCount)

  // 4) 组装 SVG —— 每个实例**各自内联一份** base64（不用 <use>，理由见 renderEggInstance 的注释）
  const promptTotalW = promptCount * PROMPT_EGG + (promptCount - 1) * PROMPT_GAP
  const promptStartX = (SVG_W - promptTotalW) / 2 + PROMPT_EGG / 2
  const promptBaseY = PROMPT_TOP + PROMPT_EGG / 2

  const promptSvg = targets.map((egg, i) => {
    // 提示区是**同一个蛋的另一份实例**：变换独立随机，与画布上那份在视觉上不一致。
    // 纵向给一点微抖动，避免三个蛋像"贴上去的一排图标"。
    const cx = promptStartX + i * (PROMPT_EGG + PROMPT_GAP)
    const cy = promptBaseY + randomFloat(-3, 3)
    return renderEggInstance(egg.b64, cx, cy, PROMPT_EGG)
  })

  const canvasSvg = canvas.map((egg, i) => {
    const { x: cx, y: cy } = spots[i]
    // 热区：以蛋心为中心的正方形，带实例序号。序号与蛋身份无对应关系。
    const hit =
      `<rect class="hit" data-i="${i}" x="${(cx - HIT_BOX / 2).toFixed(1)}" ` +
      `y="${(cy - HIT_BOX / 2).toFixed(1)}" width="${HIT_BOX}" height="${HIT_BOX}" ` +
      `fill="transparent" style="cursor:pointer"/>`
    return { hit, art: renderEggInstance(egg.b64, cx, cy, CANVAS_EGG) }
  })

  const hitLayer = canvasSvg.map((c) => c.hit).join('')
  const artLayer = canvasSvg.map((c) => c.art).join('')

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} ${SVG_H}" width="100%" ` +
    `role="img" aria-label="人机验证：请按顺序点击提示中的蛋" class="captcha-svg">` +
    buildBackground() +
    // 分隔线：把提示区与画布分开（用虚线，配合背景更像"手绘的纸"）
    `<line x1="10" y1="${PROMPT_BAND_H - 3}" x2="${SVG_W - 10}" y2="${PROMPT_BAND_H - 3}" ` +
    `stroke="#7a6444" stroke-opacity="0.4" stroke-width="1" stroke-dasharray="5 4"/>` +
    promptSvg.join('') +
    artLayer +
    // 热区放**最上层**，保证点击一定能落在 rect 上（蛋图带变换，边缘可能露出来）
    hitLayer +
    `</svg>`

  // 5) 正解 = 目标蛋在画布上的实例序号，**按提示顺序**
  const answer = targets.map((t) => canvas.findIndex((c) => c.id === t.id))
  if (answer.some((i) => i < 0)) throw new Error('buildCaptcha: 目标蛋没进画布（内部错误）')
  if (new Set(answer).size !== answer.length) {
    throw new Error('buildCaptcha: 正解出现重复位置（内部错误）')
  }

  const result = {
    svg,
    answer: answer.join(','),
    star,
    targetIds: targets.map((t) => t.id)
  }

  if (wantDebug) {
    /*
     * 只给单测用：把"画布上每个位置的蛋是谁"和"提示区顺序"都摊开，
     * 这样才能真正验证 `answer` 指向的位置**确实**是提示里那三个蛋。
     * 不校验这个的话，出题逻辑写反了（比如把 answer 算成了干扰蛋的序号）
     * 会让**所有人都注册不了**，而且极难定位。
     */
    result.debug = {
      canvasIds: canvas.map((c) => c.id),
      canvasStars: canvas.map((c) => c.star),
      canvasSpots: spots.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      promptIds: targets.map((t) => t.id),
      promptStars: targets.map((t) => t.star),
      decoyIds: decoys.map((d) => d.id)
    }
  }

  return result
}

/** 供前端与测试断言用的画布规模（避免两端各写一份）。 */
export const CAPTCHA_SHAPE = Object.freeze({
  promptCount: CAPTCHA_PROMPT_COUNT,
  canvasCount: CAPTCHA_CANVAS_COUNT,
  promptEgg: PROMPT_EGG,
  canvasEgg: CANVAS_EGG,
  hitBox: HIT_BOX,
  width: SVG_W,
  height: SVG_H
})

/** 仅调试用：列出蛋池，不返回图片数据。 */
export function captchaEggPoolSummary() {
  return CAPTCHA_EGGS.map((e) => ({ id: e.id, star: e.star, name: e.name }))
}

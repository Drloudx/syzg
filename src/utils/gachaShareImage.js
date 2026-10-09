/**
 * 把「模拟招募结果」合成一张 PNG，用于分享 / 保存。
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
 * 卡片有 10 个图层、各自的百分比定位写在 `.rd__*` 的 CSS 里。若在这里再抄一份，
 * 以后改样式就会**静默画歪**（截图和页面不一致，且不会报错）。所以这里读的是
 * `getBoundingClientRect()` 实测值 + `object-fit`/`filter` 的 computed 值，
 * **样式改了截图自动跟着变**。
 */
import { GACHA_DESIGN_WIDTH, GACHA_DESIGN_HEIGHT } from './gachaLayout.js'

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
 * 按元素的 `object-fit` 把图画进给定矩形。
 * - `fill`：直接拉伸（`gacha_card_reget` 就是靠它把 128×68 拉到 240×68）
 * - 其它（`contain`）：等比缩放并居中，与 CSS 行为一致
 */
function drawImageFit(ctx, img, rect, fit) {
  if (fit === 'fill') {
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h)
    return
  }
  const scale = Math.min(rect.w / img.naturalWidth, rect.h / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  ctx.drawImage(img, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h)
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
 * 合成结果图。
 *
 * @param {HTMLElement} stageEl `GachaStage` 的根元素（含 `.gacha-canvas`）
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderGachaResultImage(stageEl) {
  if (!stageEl) throw new Error('结果舞台不存在')
  /*
   * 🔴 必须校验传入的是**结果面板**的舞台。
   *
   * 页面上同时存在多个 `.gacha-stage`（卡池面板那个仍挂载着，只是被覆盖层挡住）。
   * 若调用方误传了卡池的舞台，`querySelector` 仍能跑完、`toBlob` 也会成功，
   * 但产出的是**一张空气图**（实测 `opaqueRatio: 0`）—— 而且不会报错。
   * 所以这里主动断言，把"静默画错"变成明确报错。
   */
  if (!stageEl.querySelector('.result-diamond')) {
    throw new Error('传入的舞台不含招募结果，无法截图')
  }
  const canvasEl = stageEl.querySelector('.gacha-canvas') || stageEl
  const stageRect = canvasEl.getBoundingClientRect()
  if (!stageRect.width || !stageRect.height) throw new Error('结果画布不可见，无法截图')

  // CSS 像素 → 设计坐标（画布被等比缩放过，所以用比例换算而不是直接相减）
  const k = GACHA_DESIGN_WIDTH / stageRect.width
  const toDesign = r => ({
    x: (r.left - stageRect.left) * k,
    y: (r.top - stageRect.top) * k,
    w: r.width * k,
    h: r.height * k
  })

  const out = document.createElement('canvas')
  out.width = Math.round(GACHA_DESIGN_WIDTH * OUT_SCALE)
  out.height = Math.round(GACHA_DESIGN_HEIGHT * OUT_SCALE)
  const ctx = out.getContext('2d')
  ctx.scale(OUT_SCALE, OUT_SCALE)

  // ── 背板：`object-fit: cover` + 页面上的提亮滤镜（读 computed，不写死） ──
  const bgEl = stageEl.querySelector('.result-backdrop__bg')
  if (bgEl) {
    const cs = getComputedStyle(bgEl)
    const bg = await loadImage(bgEl.currentSrc || bgEl.src)
    ctx.save()
    if (cs.filter && cs.filter !== 'none') ctx.filter = cs.filter
    const scale = Math.max(GACHA_DESIGN_WIDTH / bg.naturalWidth, GACHA_DESIGN_HEIGHT / bg.naturalHeight)
    const w = bg.naturalWidth * scale
    const h = bg.naturalHeight * scale
    ctx.drawImage(bg, (GACHA_DESIGN_WIDTH - w) / 2, (GACHA_DESIGN_HEIGHT - h) / 2, w, h)
    ctx.restore()
  }

  // ── 卡片：DOM 顺序就是绘制顺序（底板 → 立绘 → 边框 → 角标 → 星级） ──
  for (const card of stageEl.querySelectorAll('.result-diamond')) {
    for (const layer of card.children) {
      const rect = toDesign(layer.getBoundingClientRect())
      if (!rect.w || !rect.h) continue

      if (layer.tagName === 'IMG') {
        const img = await loadImage(layer.currentSrc || layer.src)
        drawImageFit(ctx, img, rect, getComputedStyle(layer).objectFit)
        continue
      }
      // `.rd__frag` 是 span 包一层 img；`.rd__frag-cnt` 是纯文字
      const innerImg = layer.querySelector('img')
      if (innerImg) {
        const img = await loadImage(innerImg.currentSrc || innerImg.src)
        drawImageFit(ctx, img, rect, getComputedStyle(innerImg).objectFit)
        continue
      }
      drawCenteredText(ctx, layer, rect)
    }
  }

  return out
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
 * 调起分享；不支持或失败时退回下载。
 *
 * - **原生端**：写进 Cache 目录再 `Share.share({ url })` —— 与「导出数据备份」同一套做法。
 * - **网页端**：优先 `navigator.share({ files })`（移动浏览器弹系统分享面板）；
 *   桌面浏览器多数不支持文件分享，退回直接下载。
 *
 * ⚠️ `navigator.canShare({ files })` 返回 true **不代表 share 一定会成功**：
 * 部分环境（如无 UI 的自动化浏览器）会 reject，也可能一直挂起。
 * 所以这里对 share 的失败做**兜底下载**，避免用户点了分享却什么都没发生。
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

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
   * 输出坐标系 = 画布的**设计坐标**。
   *
   * ⚠️ 不能用 `画布CSS尺寸 / 1534×750` 反推比例：`fit="height"` 时 `GachaStage`
   * 会把画布设成 `1534 × (容器宽/scale)`（实测 1534×958.75，而设计高是 750），
   * 多出来的高度是**画布自身的余量**，内容并不铺满它——照它换算会在上下留白边。
   *
   * 正确做法：**直接读画布的 `transform: scale(...)`**（`GachaStage` 暴露的就是这个值），
   * 它才是"设计像素 → CSS 像素"的真实比例。于是：
   *   设计坐标 = (CSS 坐标 − 画布左上角) / scale
   */
  /*
   * 输出坐标系 = **画布布局坐标 ÷ 画布缩放**。
   *
   * 为什么不是固定的 1534×750：`fit="height"` 时 `GachaStage` 把画布布局尺寸设成
   * `1534 × (容器宽/scale)`，而内容用 `gachaPos`（`calc(50% ± x)`，百分比相对画布元素）
   * 定位——所以真实坐标系是**画布布局盒**，不是设计常量。
   */
  const scale = canvasScale(canvasEl)
  if (!scale) throw new Error('无法读取画布缩放，截图失败')
  const toDesign = r => ({
    x: (r.left - stageRect.left) / scale,
    y: (r.top - stageRect.top) / scale,
    w: r.width / scale,
    h: r.height / scale
  })

  // ── 收集要画的图层 ──
  // 三类：`<img>` / WebGL `<canvas>` / **带 CSS 背景图的元素**（`.gacha-bleed` 就是这种，
  // 它是 div + `background-image`，只找 img 会把它整个漏掉 → 舞台边缘留白）。
  // 跳过不可见的（`display:none` / 零尺寸 / `opacity:0`），否则会把隐藏层画出来。
  const layers = []
  for (const el of stageEl.querySelectorAll('img, canvas, p, span, em, div')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (parseFloat(cs.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue

    const isImg = el.tagName === 'IMG'
    const isCanvas = el.tagName === 'CANVAS'
    const bgImage = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : ''
    // 有 CSS 背景图 → 按背景画（`.gacha-bleed` 这类铺底容器）
    if (!isImg && !isCanvas && bgImage) {
      layers.push({ el, rect: r, d: toDesign(r), z: zIndexPath(el), bgOnly: true })
      continue
    }
    // 其它非图片元素：只有**叶子**才当文字画（有子元素的交给子元素）
    if (!isImg && !isCanvas && el.children.length) continue
    layers.push({ el, rect: r, d: toDesign(r), z: zIndexPath(el), bgOnly: false })
  }
  if (!layers.length) throw new Error('舞台内没有可绘制的内容')
  // 稳定排序：z 相同时保持 DOM 顺序（同级内后出现的在上）
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
   */
  const out = document.createElement('canvas')
  out.width = Math.round(stageRect.width * OUT_SCALE)
  out.height = Math.round(stageRect.height * OUT_SCALE)
  const ctx = out.getContext('2d')
  ctx.scale(OUT_SCALE, OUT_SCALE)

  for (const { el, d, bgOnly } of layers) {
    if (!d.w || !d.h) continue

    if (el.tagName === 'CANVAS') {
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

    if (bgOnly) {
      // CSS 背景图（`.gacha-bleed`）：把 url 解出来当普通图铺满该元素矩形。
      // 不处理 `background-size` 的各种取值——这里只有 `cover` 一种用法。
      const cs = getComputedStyle(el)
      const m = cs.backgroundImage.match(/url\(["']?(.*?)["']?\)/)
      if (m?.[1]) {
        try {
          const img = await loadImage(m[1])
          ctx.save()
          if (cs.filter && cs.filter !== 'none') ctx.filter = cs.filter
          // `cover`：等比放大到铺满，再居中裁切
          const scale = Math.max(d.w / img.naturalWidth, d.h / img.naturalHeight)
          const w = img.naturalWidth * scale
          const h = img.naturalHeight * scale
          ctx.beginPath()
          ctx.rect(d.x, d.y, d.w, d.h)
          ctx.clip()
          ctx.drawImage(img, d.x + (d.w - w) / 2, d.y + (d.h - h) / 2, w, h)
          ctx.restore()
        } catch {
          /* 背景图失败不该毁掉整张分享图 */
        }
      }
      continue
    }

    if (el.tagName === 'IMG') {
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

    // 纯文字（蛋池名牌、星级数字等）
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

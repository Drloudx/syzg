import assert from 'node:assert/strict'
import test from 'node:test'

import { CAPTCHA_CANVAS_COUNT, CAPTCHA_PROMPT_COUNT } from '../../src/config/auth.js'
import { CAPTCHA_EGGS, CAPTCHA_STARS, eggsOfStar } from '../../src/config/captchaEggs.js'
import { buildCaptcha, captchaEggPoolSummary, CAPTCHA_SHAPE } from '../../src/utils/authCaptcha.js'

/**
 * 蛋点选验证码的出题逻辑守护测试。
 *
 * 🔴 **最重要的一条是「正解必须真的对」**：
 * 如果出题时把 `answer` 算成了干扰蛋的位置、或者顺序反了，
 * 症状是**所有真人都会被判错**（而且重试多少次都一样），
 * 但服务端日志看起来一切正常 —— 属于最难查的一类 bug。
 * 所以这里用 `{ debug: true }` 把画布摊开，逐个位置核对。
 */

test('蛋池构成符合方案（只用 4/5 星，共 13 个）', () => {
  assert.equal(CAPTCHA_EGGS.length, 13)
  assert.deepEqual([...CAPTCHA_STARS], [4, 5])
  assert.equal(eggsOfStar(4).length, 8)
  assert.equal(eggsOfStar(5).length, 5)

  // 5 星那 5 个必须与玩家截图里的一致
  const five = eggsOfStar(5).map((e) => e.name)
  for (const name of ['宝石迷迷可', '真护之黑龙', '星云史莱姆', '东天之青龙', '格里芬']) {
    assert.ok(five.includes(name), `5 星蛋里缺少 ${name}`)
  }

  // 🔴 必须用 displayStar 而不是内部 star：生成器已过滤，这里确认 star 字段是显示值
  for (const e of CAPTCHA_EGGS) {
    assert.ok(e.star === 4 || e.star === 5, `${e.id} 的 star=${e.star} 不在 4/5 内`)
    assert.match(e.b64, /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/, `${e.id} 的 b64 不是合法 data URI`)
  }
})

test('🔴 正解必须真的指向提示里那三个蛋（且顺序一致）', () => {
  for (let round = 0; round < 60; round++) {
    const { answer, debug } = buildCaptcha({ debug: true })
    const picks = answer.split(',').map(Number)

    // 形状：3 个互不相同的合法序号
    assert.equal(picks.length, CAPTCHA_PROMPT_COUNT)
    assert.equal(new Set(picks).size, CAPTCHA_PROMPT_COUNT, '正解出现重复位置')
    for (const p of picks) {
      assert.ok(Number.isInteger(p) && p >= 0 && p < CAPTCHA_CANVAS_COUNT, `序号越界：${p}`)
    }

    // 语义：按顺序取画布上的这三个位置，应当**逐个等于**提示区的三个蛋
    const pickedIds = picks.map((p) => debug.canvasIds[p])
    assert.deepEqual(pickedIds, debug.promptIds, `第 ${round} 轮：正解指向的蛋与提示不符`)
  }
})

test('干扰蛋来自另一个星级，两类互不重叠', () => {
  for (let round = 0; round < 40; round++) {
    const { star, debug } = buildCaptcha({ debug: true })
    const other = star === 4 ? 5 : 4

    assert.ok(debug.promptStars.every((s) => s === star), '提示区混进了别的星级')
    assert.ok(debug.decoyIds.every((id) => {
      const egg = CAPTCHA_EGGS.find((e) => e.id === id)
      return egg.star === other
    }), '干扰蛋没有取自另一个星级')

    // 画布上每个 id 只出现一次（无重复实例），且总数正确
    assert.equal(debug.canvasIds.length, CAPTCHA_CANVAS_COUNT)
    assert.equal(new Set(debug.canvasIds).size, CAPTCHA_CANVAS_COUNT, '画布出现重复的蛋')

    // 画布 = 提示区 3 个 + 干扰 2 个
    const expect = new Set([...debug.promptIds, ...debug.decoyIds])
    assert.deepEqual(new Set(debug.canvasIds), expect)
  }
})

test('SVG 结构与可点击热区正确', () => {
  const { svg } = buildCaptcha()

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.match(svg, /viewBox="0 0 \d+ \d+"/)
  assert.match(svg, /<\/svg>$/)

  // 热区：每个画布实例一个，且序号连续覆盖 0..N-1
  const hits = [...svg.matchAll(/class="hit" data-i="(\d+)"/g)].map((m) => Number(m[1]))
  assert.equal(hits.length, CAPTCHA_CANVAS_COUNT, '热区数量不对')
  assert.deepEqual([...hits].sort((a, b) => a - b), [...Array(CAPTCHA_CANVAS_COUNT).keys()])

  // 🔴 蛋图必须**逐个直接内联**，不能用 <use> 引用 <defs> 里的 <image>
  //    —— 后者在多数 SVG 渲染器里不显示（会静默变成空白，验证码直接瞎掉）。
  //
  // 注意：SVG 里现在有 **9** 张 <image>（1 张站点主背景 + 8 张蛋图），
  // 所以下面要先按 data URI 把蛋图挑出来。
  const images = [...svg.matchAll(/<image href="([^"]+)"/g)].map((m) => m[1])
  const eggImages = images.filter((h) => h.startsWith('data:'))
  const external = images.filter((h) => !h.startsWith('data:'))
  assert.equal(eggImages.length, CAPTCHA_CANVAS_COUNT + CAPTCHA_PROMPT_COUNT, '内联的蛋图数量不对')
  for (const href of eggImages) {
    assert.match(href, /^data:image\/webp;base64,/, '蛋图必须是内联 data URI')
  }
  assert.equal(/<use\s/.test(svg), false, 'SVG 里不该出现 <use>（渲染兼容性坑）')
  // <defs> 现在用于背景滤镜/渐变（合法且必要），但**里面绝不能有 <image>** ——
  // 那意味着又回到了"用 id 别名引用蛋图"的老路。
  const defsBlock = (svg.match(/<defs>([\s\S]*?)<\/defs>/) || [])[1] || ''
  assert.equal(/<image/.test(defsBlock), false, '<defs> 里不该有 <image>（会退回别名引用）')

  // 蛋图必须是**内联 data URI**：绝不能出现蛋的文件名 / `pet_xxx`，
  // 否则脚本读一下 href 就知道"这个位置是哪个蛋"，题目形同虚设。
  //
  // ⚠️ 唯一的例外是**站点主背景图** `/ui/map_w1_bg.webp` —— 它与题目无关
  // （每道题都一样，不携带任何答案信息），且太大不适合内联。
  assert.ok(!/pet_0\d\d/.test(svg), 'SVG 里出现了蛋的内部 id —— 身份泄漏')
  assert.deepEqual(external, ['/ui/map_w1_bg.webp'], '除站点主背景外不该有外部图片引用')
})

test('默认不返回 debug（防止不小心把答案 spread 进响应）', () => {
  const plain = buildCaptcha()
  assert.equal('debug' in plain, false, '默认返回值里不该有 debug 字段')
  assert.deepEqual(Object.keys(plain).sort(), ['answer', 'star', 'svg', 'targetIds'].sort())
})

test('热区在蛋图之上（点击一定落在 rect 上）', () => {
  const { svg } = buildCaptcha()
  const lastImage = svg.lastIndexOf('<image ')
  const firstHit = svg.indexOf('class="hit"')
  assert.ok(firstHit > lastImage, '热区必须画在所有蛋图之后，否则边缘点击会落空')
})

test('🔴 每个蛋实例必须是独立内联（防回退到 <use> 的渲染坑）', () => {
  // 这一条是"渲染出来是空白"那个坑的回归守卫：
  // 只要有人为了省体积改回 <defs>+<use>，这里立刻红。
  const { svg } = buildCaptcha()
  const inlineCount = (svg.match(/<image href="data:image\/webp;base64,/g) || []).length
  assert.equal(inlineCount, CAPTCHA_CANVAS_COUNT + CAPTCHA_PROMPT_COUNT)
  assert.equal(/href="#/.test(svg), false, 'href 指向内部 id = 用了 <use> 或别名，会渲染失败')
})

test('每次出题都不一样（位置与目标都在变）', () => {
  const seen = new Set()
  const stars = new Set()
  for (let i = 0; i < 120; i++) {
    const { answer, star, svg } = buildCaptcha()
    stars.add(star)
    seen.add(answer + '|' + svg.length + '|' + svg.slice(0, 200))
  }
  // 120 次里至少应有 100 种不同（组合空间 60 起，加布局随机后远大于此）
  assert.ok(seen.size > 100, `120 次只出现 ${seen.size} 种题，随机性可疑`)
  assert.deepEqual([...stars].sort(), [4, 5], '两个星级都应出现过')
})

test('🔴 渲染顺序必须与实例序号一致（k 号图画的就是 canvasIds[k]）', () => {
  /*
   * 上面那条测试只能证明"answer 是按 canvasIds 算出来的"（构造上自洽），
   * **证明不了画出来的是不是同一个东西** —— 万一渲染时把顺序搞乱
   * （比如画布用 shuffle 后的数组、而 answer 用原来的），
   * 单测全绿、人却永远点不对。
   *
   * 这条直接解析 SVG 里的 base64，逐个位置比对。
   */
  const b64ById = new Map(CAPTCHA_EGGS.map((e) => [e.id, e.b64]))

  for (let round = 0; round < 20; round++) {
    const { svg, debug } = buildCaptcha({ debug: true })
    // 只取**蛋图**（内联 data URI）；背景那张站点主背景图要先剔掉，
    // 它画在最前面，不参与"提示区 / 画布"的顺序
    const images = [...svg.matchAll(/<image href="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((h) => h.startsWith('data:'))

    // 输出顺序：提示区（promptCount 个）在前，画布（canvasCount 个）在后
    assert.equal(images.length, CAPTCHA_PROMPT_COUNT + CAPTCHA_CANVAS_COUNT)

    images.slice(0, CAPTCHA_PROMPT_COUNT).forEach((href, k) => {
      assert.equal(href, b64ById.get(debug.promptIds[k]), `第 ${round} 轮：提示区第 ${k} 个画错了`)
    })
    images.slice(CAPTCHA_PROMPT_COUNT).forEach((href, k) => {
      assert.equal(href, b64ById.get(debug.canvasIds[k]), `第 ${round} 轮：画布第 ${k} 个画错了`)
    })
  }
})

test('🔴 每个实例的蛋图与它的热区同心（点得中）', () => {
  // 热区 rect 决定"点哪里算这个实例"；蛋图 <g translate> 决定"看到的是哪个"。
  // 两者若错位，用户会"看着对、点了却说错"。自由散布之后更要守这一条。
  for (let round = 0; round < 30; round++) {
    const { svg } = buildCaptcha()

    const artPos = [...svg.matchAll(/<g transform="translate\(([\d.-]+) ([\d.-]+)\)/g)]
      .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
      .slice(CAPTCHA_PROMPT_COUNT) // 前 3 个是提示区

    const hitPos = [...svg.matchAll(/class="hit" data-i="(\d+)" x="([\d.]+)" y="([\d.]+)"/g)].map((m) => ({
      i: Number(m[1]),
      cx: Number(m[2]) + CAPTCHA_SHAPE.hitBox / 2,
      cy: Number(m[3]) + CAPTCHA_SHAPE.hitBox / 2
    }))

    assert.equal(artPos.length, CAPTCHA_CANVAS_COUNT)
    assert.equal(hitPos.length, CAPTCHA_CANVAS_COUNT)

    for (const hit of hitPos) {
      const art = artPos[hit.i]
      // 蛋图中心有 ±6px 随机抖动，但必须仍在热区中心附近
      const dist = Math.hypot(art.x - hit.cx, art.y - hit.cy)
      assert.ok(dist <= 9, `第 ${round} 轮：实例 ${hit.i} 蛋图偏离热区中心 ${dist.toFixed(1)}px`)
    }
  }
})

test('🔴 蛋之间不许重叠（否则会「点这个却算那个」）', () => {
  const minDist = 34 // 允许一点点视觉交叠，但热区（54px）绝不允许大面积互盖
  for (let round = 0; round < 40; round++) {
    const { debug } = buildCaptcha({ debug: true })
    const spots = debug.canvasSpots
    for (let a = 0; a < spots.length; a++) {
      for (let b = a + 1; b < spots.length; b++) {
        const d = Math.hypot(spots[a].x - spots[b].x, spots[a].y - spots[b].y)
        assert.ok(d >= minDist, `第 ${round} 轮：实例 ${a} 与 ${b} 中心距仅 ${d.toFixed(1)}px`)
      }
    }
  }
})

test('画布蛋明显小于提示蛋（用户要求：下面得小很多）', () => {
  assert.ok(
    CAPTCHA_SHAPE.canvasEgg < CAPTCHA_SHAPE.promptEgg * 0.85,
    `画布蛋 ${CAPTCHA_SHAPE.canvasEgg}px 不够小于提示蛋 ${CAPTCHA_SHAPE.promptEgg}px`
  )
  // 触摸热区仍要足够大（手指点得中）
  assert.ok(CAPTCHA_SHAPE.hitBox >= 44, '热区小于 44px，手指容易点不中')
  assert.ok(CAPTCHA_SHAPE.hitBox > CAPTCHA_SHAPE.canvasEgg, '热区应大于蛋本身')
})

test('背景用的是站点主背景图 + 不干净的处理层', () => {
  const { svg } = buildCaptcha()
  // 与 theme.css 的 body 背景同一张
  assert.ok(svg.includes('/ui/map_w1_bg.webp'), '缺少站点主背景图')
  // 图上还叠了让它"不干净"的几层
  assert.match(svg, /<feTurbulence/, '缺少颗粒噪点层')
  assert.match(svg, /<radialGradient/, '缺少晕影层')
  const specks = (svg.match(/<circle /g) || []).length
  assert.ok(specks >= 10, `墨点只有 ${specks} 个，背景太干净`)
  const strokes = (svg.match(/<line /g) || []).length
  assert.ok(strokes >= 4, `划痕只有 ${strokes} 条`)
  // 兜底底色必须在图之前画（图没加载时也不会露白）
  const firstRect = svg.indexOf('<rect x="0" y="0"')
  const bgImage = svg.indexOf('/ui/map_w1_bg.webp')
  assert.ok(firstRect > 0 && firstRect < bgImage, '兜底底色应画在主背景图之前')
})

test('🔴 背景图不许被整幅色块压住 / 不许模糊（用户要求：不要虚化）', () => {
  /*
   * 踩过的坑：为了"保对比度"，我在背景图上压了一层 `opacity=0.6` 的暖色薄纱，
   * 结果地图被冲淡，用户直接说"不要虚化"。
   *
   * 这条守卫盯着两件事：
   *  1. 背景图**之后**出现的"铺满整幅 + 实色填充"矩形，透明度必须极低；
   *  2. 不许出现模糊类滤镜。
   *
   * 注意**允许**的东西：`url(#grad)` 的晕影（渐变、只压边缘）、
   * 低透明度的颗粒层、以及画在背景图**之前**的兜底底色（图正常时看不见）。
   */
  const { svg } = buildCaptcha()
  const bgAt = svg.indexOf('/ui/map_w1_bg.webp')
  assert.ok(bgAt > 0, '找不到背景图')
  const tail = svg.slice(bgAt)

  assert.ok(!/feGaussianBlur/.test(svg), '背景图不该有模糊滤镜')

  for (const m of tail.matchAll(/<rect x="0" y="0" width="(\d+)" height="(\d+)"([^>]*)\/>/g)) {
    const [, w, h, attrs] = m
    if (Number(w) < CAPTCHA_SHAPE.width - 1 || Number(h) < CAPTCHA_SHAPE.height - 1) continue
    const fill = (attrs.match(/fill="([^"]+)"/) || [])[1] || ''
    if (fill.startsWith('url(')) continue // 渐变（晕影）不算"色块"
    const op = Number((attrs.match(/opacity="([\d.]+)"/) || [])[1] ?? '1')
    assert.ok(op <= 0.15, `背景图被整幅色块压住了：fill=${fill} opacity=${op}`)
  }
})

test('散布位置确实随机（不是网格）', () => {
  // 收集多次出题的所有落点，检查 x/y 都覆盖了较宽范围且不落在固定格点上
  const xs = []
  const ys = []
  for (let i = 0; i < 40; i++) {
    const { debug } = buildCaptcha({ debug: true })
    for (const s of debug.canvasSpots) {
      xs.push(s.x)
      ys.push(s.y)
    }
  }
  const span = (arr) => Math.max(...arr) - Math.min(...arr)
  assert.ok(span(xs) > 200, `x 跨度只有 ${span(xs)}px，不够随机`)
  assert.ok(span(ys) > 100, `y 跨度只有 ${span(ys)}px，不够随机`)
  // 唯一点位要足够多（网格只会有少数几种取值）
  assert.ok(new Set(xs.map((x) => Math.round(x / 10))).size > 15, 'x 分布过于集中，像网格')
})

test('星级分布不偏（各占约一半）', () => {
  let four = 0
  const N = 400
  for (let i = 0; i < N; i++) if (buildCaptcha().star === 4) four++
  assert.ok(four > N * 0.4 && four < N * 0.6, `${N} 次里 4 星占 ${four} 次，偏离过大`)
})

test('盲猜率与方案一致（1/60）', () => {
  // 画布 5 个位置里按顺序点中 3 个：5×4×3 = 60
  const space = CAPTCHA_CANVAS_COUNT * (CAPTCHA_CANVAS_COUNT - 1) * (CAPTCHA_CANVAS_COUNT - 2)
  assert.equal(space, 60)
})

test('CAPTCHA_SHAPE 与 config 一致', () => {
  assert.equal(CAPTCHA_SHAPE.promptCount, CAPTCHA_PROMPT_COUNT)
  assert.equal(CAPTCHA_SHAPE.canvasCount, CAPTCHA_CANVAS_COUNT)
  assert.ok(CAPTCHA_SHAPE.width > 0 && CAPTCHA_SHAPE.height > 0)
})

test('蛋池摘要不含图片数据（只用于调试）', () => {
  const summary = captchaEggPoolSummary()
  assert.equal(summary.length, 13)
  for (const item of summary) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'name', 'star'])
  }
})

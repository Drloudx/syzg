import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 模拟招募页面（/gacha）回归：
 *   1. 资源与错误：无控制台报错、无失败请求，画布内所有图片都真正解码成功；
 *   2. 布局：关键元素的实际屏幕位置与原始 prefab 设计坐标（1534×750、原点居中）一致；
 *   3. 交互：抽一次 → 揭晓演出三段可点击推进 → 结果一览；
 *   4. 弹层：概率详情（原表 percTip）+ 记录查询（本地模拟记录分页）。
 * 截图输出到项目外 `ui-checks/gacha-replica/`，供人工核对视觉。
 */

const SHOT_ROOT = join(process.cwd(), '..', 'ui-checks', 'gacha-replica')
const DESIGN = { width: 1534, height: 750 }

test.beforeAll(() => {
  mkdirSync(SHOT_ROOT, { recursive: true })
})

/** 截图路径按 project 分目录：桌面与移动端不得写同名文件，否则会互相覆盖。 */
function shotPath(testInfo, name) {
  return join(SHOT_ROOT, testInfo.project.name, name)
}

/** 打开卡池页并等待画布与图片就绪。 */
async function openGacha(page) {
  const problems = []
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`))
  page.on('response', response => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`)
  })

  await page.goto('/#/gacha')
  await expect(page.locator('.gacha-canvas')).toBeVisible()
  await page.waitForFunction(() => Array.from(document.images).every(img => img.complete))
  return problems
}

/** 点击抽取后先经过翻卡演出（GachaCardPanel）：跳过它直接进入揭晓
 *  （WebGL 不可用时演出会自动跳过，此时已在揭晓，跳过按钮不存在）。 */
async function skipCardAni(page) {
  await page.locator('.card-skip').click({ timeout: 5000 }).catch(() => {})
}

test('卡池页资源全部可加载且无运行时报错', async ({ page }, testInfo) => {
  const problems = await openGacha(page)

  const broken = await page.evaluate(() => Array.from(document.images)
    .filter(img => img.naturalWidth === 0)
    .map(img => img.currentSrc || img.src))
  expect(broken, `以下图片解码失败：\n${broken.join('\n')}`).toEqual([])
  expect(problems, problems.join('\n')).toEqual([])
  await page.screenshot({ path: shotPath(testInfo, '01-pool.png') })
})

test('关键元素位置与 prefab 设计坐标一致', async ({ page }, testInfo) => {
  // 设计坐标断言在桌面视口下进行：移动端容器过窄，画布被等比缩到很小，
  // 位置换算虽同样成立但分辨率不足以支撑 2px 精度；移动端另有横向溢出与提示的用例。
  test.skip(testInfo.project.name !== 'desktop', '设计坐标断言只在桌面视口执行')
  await openGacha(page)

  // 设计坐标 → 期望屏幕中心：画布中心 + (x, -y) × 缩放
  const metrics = await page.evaluate(() => {
    const canvas = document.querySelector('.gacha-canvas')
    const rect = canvas.getBoundingClientRect()
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      scale: rect.width / 1534
    }
  })
  expect(metrics.scale).toBeGreaterThan(0.3)

  const cases = [
    { selector: '.pool-tab >> nth=0', x: -469, y: 135, label: '卡池页签首个（Toggles -469,135，左边缘对齐 -631）' },
    { selector: '.pool-tab >> nth=1', x: -469, y: 45, label: '卡池页签第二个（Vertical 排列，cellHeight=90）' },
    { selector: '.draw-btn >> nth=0', x: 196, y: -316, label: '单抽按钮（Buttons/One 400-204, -340+24）' },
    { selector: '.draw-btn >> nth=1', x: 487, y: -316, label: '十连按钮（Buttons/Ten 400+87, -340+24）' },
    { selector: '.draw-cost >> nth=0', x: 196, y: -264, label: '单取消耗行（按钮上方 52，gacha_btn_tag 底板）' },
    { selector: '.draw-cost >> nth=1', x: 487, y: -264, label: '十连消耗行' },
    { selector: '.close-btn', x: 587, y: 335, label: '返回按钮（TopRight/Back 587,335）' },
    { selector: '.pool-period', x: 461, y: 227, label: '期次贴图（periodType 461,227）' }
  ]

  for (const item of cases) {
    const box = await page.locator(item.selector).boundingBox()
    expect(box, `${item.label} 未渲染`).not.toBeNull()
    const actualX = box.x + box.width / 2
    const actualY = box.y + box.height / 2
    const expectX = metrics.centerX + item.x * metrics.scale
    const expectY = metrics.centerY - item.y * metrics.scale
    expect(Math.abs(actualX - expectX), `${item.label} 横坐标偏差 ${(actualX - expectX).toFixed(1)}px`).toBeLessThan(2)
    expect(Math.abs(actualY - expectY), `${item.label} 纵坐标偏差 ${(actualY - expectY).toFixed(1)}px`).toBeLessThan(2)
  }

  // 画布尺寸：`fit === 'height'` 时宽、高都会按舞台尺寸延展（`舞台尺寸 / scale`），
  // 使遮罩/暗场/背景完整铺满舞台、消除上下切边缝隙；但不得小于设计分辨率。
  // 因此断言「不小于 DESIGN」而非「等于 DESIGN」，并核对确实覆盖了缩放后的舞台。
  const canvasBox = await page.locator('.gacha-canvas').evaluate(el => {
    const stage = el.parentElement
    const scale = Number((el.style.transform.match(/scale\(([\d.]+)\)/) || [])[1]) || 1
    return {
      width: el.offsetWidth,
      height: el.offsetHeight,
      stageWidth: stage ? stage.clientWidth : 0,
      stageHeight: stage ? stage.clientHeight : 0,
      scale
    }
  })
  expect(canvasBox.width).toBeGreaterThanOrEqual(DESIGN.width)
  expect(canvasBox.height).toBeGreaterThanOrEqual(DESIGN.height)
  // 缩放后必须完整覆盖舞台，否则边缘会出现缝隙
  expect(canvasBox.width * canvasBox.scale).toBeGreaterThanOrEqual(canvasBox.stageWidth - 1)
  expect(canvasBox.height * canvasBox.scale).toBeGreaterThanOrEqual(canvasBox.stageHeight - 1)
})

test('固定尺寸按钮与页签使用预渲染纹理（sliced_buttons）', async ({ page }, testInfo) => {
  await openGacha(page)

  // 已定尺寸的按钮/页签不做 CSS 切片，改用 `public/images/sliced_buttons` 的预渲染纹理，
  // 以 `background-size: 100% 100%` 整幅铺满（见 features/gacha/GACHA.md「布局与素材」）。
  // 需变尺寸的切片（com_info_botm、item_info_color* 等）仍走 border-image，不在本条覆盖范围。
  const slices = await page.evaluate(() => {
    const read = selector => {
      const el = typeof selector === 'string' ? document.querySelector(selector) : selector
      if (!el) return null
      const style = getComputedStyle(el)
      return {
        backgroundImage: style.backgroundImage,
        backgroundSize: style.backgroundSize,
        borderImageSource: style.borderImageSource
      }
    }
    const draws = document.querySelectorAll('.draw-btn')
    return {
      tab: read('.pool-tab__bg'),
      draw: read(draws[0]),
      drawTen: read(draws[1]),
      mini: read('.mini-btn')
    }
  })

  for (const [name, expectSprite] of [
    ['tab', 'sliced_buttons/gacha_page'],
    ['draw', 'sliced_buttons/com_btn_N_sp'],
    ['drawTen', 'sliced_buttons/com_btn_Y_sp'],
    ['mini', 'sliced_buttons/com_btn_mini']
  ]) {
    expect(slices[name]?.backgroundImage, `${name} 应使用预渲染纹理`).toContain(expectSprite)
    expect(slices[name]?.backgroundSize, `${name} 应整幅铺满`).toBe('100% 100%')
    expect(slices[name]?.borderImageSource, `${name} 不应再重复切片`).toBe('none')
  }
})

test('概率详情与记录查询弹层可用', async ({ page }, testInfo) => {
  await openGacha(page)

  // 概率详情：正文来自原表 percTip，含名单替换后的角色名
  await page.locator('.mini-btn').first().click()
  await expect(page.locator('.tip-panel')).toBeVisible()
  await expect(page.locator('.tip-panel__title')).toContainText('概率详情')
  // 覆盖层必须真的落在视口内：每个面板各有自己的 GachaStage，
  // 若不绝对定位会被排到页面下方裁掉，而 toBeVisible 不会发现这一点
  const tipBox = await page.locator('.tip-panel').boundingBox()
  const viewport = page.viewportSize()
  expect(tipBox.y, `弹层顶部 ${tipBox.y} 应在视口内`).toBeGreaterThanOrEqual(0)
  expect(tipBox.y + tipBox.height, '弹层底部应在视口内').toBeLessThanOrEqual(viewport.height + 1)
  expect(tipBox.x + tipBox.width, '弹层右侧应在视口内').toBeLessThanOrEqual(viewport.width + 1)
  const rateText = await page.locator('.tip-rate__body').innerText()
  expect(rateText).toContain('概率说明')
  expect(rateText).not.toContain('{rare5List}')
  expect(rateText).toContain('保底抽取')
  await page.screenshot({ path: shotPath(testInfo, '02-rate.png') })

  await page.locator('.tip-panel__close').click()
  await expect(page.locator('.tip-panel')).toBeHidden()

  // 记录查询：未抽过时显示空态说明
  await page.locator('.mini-btn').nth(1).click()
  await expect(page.locator('.tip-record__empty')).toBeVisible()
  await page.screenshot({ path: shotPath(testInfo, '03-record-empty.png') })

  // 点面板空白底板不关闭（关闭只走面板外的遮罩区域或 ✕）
  const canvas = await page.evaluate(() => {
    const rect = document.querySelector('.gacha-canvas').getBoundingClientRect()
    return { centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2, scale: rect.width / 1534 }
  })
  // 面板内空白点：页码(-60~60)与「上一页」按钮(-329~-199)之间的空档，design (-150,-327)
  await page.mouse.click(canvas.centerX - 150 * canvas.scale, canvas.centerY + 327 * canvas.scale)
  await expect(page.locator('.tip-panel')).toBeVisible()

  // 点面板外的遮罩区域关闭。
  // 用 dispatchEvent 而非坐标点击：窄屏（手机竖屏）下 800 宽的底板被缩到整个视口宽度，
  // 视口内已不存在「面板外」的遮罩可见区域（按设计坐标算出的点会落进 .tip-scroll-wrap），
  // 坐标点击在手机端不可靠；遮罩本身的关闭行为两端一致，故直接派发 click。
  await page.locator('.tip-root__mask').dispatchEvent('click')
  await expect(page.locator('.tip-panel')).toBeHidden()
})

test('抽卡到揭晓演出再到结果一览', async ({ page }, testInfo) => {
  await openGacha(page)

  // 页签切换（vue-router 不对查询值做百分号编码，冒号原样保留）
  await page.locator('.pool-tab').nth(1).click()
  await expect(page).toHaveURL(/pool=hero:2:2:0/)

  // 十连
  await page.locator('.draw-btn').nth(1).click()
  // 翻卡演出先挂载（Spine 画布挂在自己的包裹节点 `.card-spine-wrap` 里，
  // 由 `gachaSpinePlayer` 注入 <canvas>；断言包裹节点与 canvas 同时就位）
  await expect(page.locator('.card-spine-wrap')).toBeVisible()
  await expect(page.locator('.card-spine-wrap canvas')).toBeAttached()
  await skipCardAni(page)
  const catcher = page.locator('.reveal-click-catcher')
  await expect(catcher).toBeVisible()

  // 三段推进：step1 星级 → step2 背框 → step3 立绘/台词
  // （每个角色单独走这三段；点击跳段按稀有度而定，故直接轮询到立绘出现）
  await expect(page.locator('.reveal-bigstar-item').first()).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: shotPath(testInfo, '04-reveal-stars.png') })
  await catcher.click()
  const portrait = page.locator('.reveal-portrait__img')
  for (let attempt = 0; attempt < 12 && !(await portrait.isVisible().catch(() => false)); attempt += 1) {
    await catcher.click().catch(() => {})
    await page.waitForTimeout(150)
  }
  await expect(portrait).toBeVisible()
  await page.screenshot({ path: shotPath(testInfo, '06-reveal-portrait.png') })

  // 跳过 → 直接进入结果一览（跳过后只保留 5 星，除非已到最后一个）
  const skip = page.locator('.reveal-skip')
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await page.locator('.result-diamond').first().isVisible().catch(() => false)) break
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {})
    else await catcher.click().catch(() => {})
    await page.waitForTimeout(150)
  }
  await expect(page.locator('.result-diamonds')).toBeVisible({ timeout: 15_000 })
  expect(await page.locator('.result-diamond').count()).toBeGreaterThan(0)
  // 结果面板按 HeroShowUI：十连只有「招募十次」+ 消耗行，右上角货币条 + ✕ 关闭
  const resultScope = page.locator('.gacha-overlay:has(.result-diamonds)')
  await expect(resultScope.locator('.result-btn__label--ten')).toContainText(/招募|购买/)
  await expect(resultScope.locator('.draw-cost')).toBeVisible()
  await expect(resultScope.locator('.currency-row .currency-slot')).toHaveCount(3)
  await expect(resultScope.locator('.result-close img')).toHaveAttribute('src', /com_btn_close/)
  await page.screenshot({ path: shotPath(testInfo, '07-result.png') })

  // 返回卡池页：保底提示与已抽次数应更新
  await page.locator('.result-close').click()
  await expect(page.locator('.safe-hint')).toBeVisible()
  await expect(page.locator('.sim-note')).toContainText('已抽')
  await page.screenshot({ path: shotPath(testInfo, '08-pool-after.png') })
})

test('货币条按 prefab 位置渲染，余额不足时变红并禁用抽取', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '货币槽坐标断言只在桌面视口执行')
  // 预置一个空钱包：验证「不足」分支（正常首次进入会带上模拟额度）
  // pinia-plugin-persistedstate 直接持久化 store 的 state 对象，不做外层包装
  await page.addInitScript(() => {
    window.localStorage.setItem('gachaState', JSON.stringify({
      runtimeByPool: {},
      records: [],
      owned: [],
      fragmentsByHero: {},
      crystals: 0,
      wallet: { item_20004: 0 },
      walletSeed: { item_20004: 0 },
      soundOn: false
    }))
  })
  await openGacha(page)

  const metrics = await page.evaluate(() => {
    const rect = document.querySelector('.gacha-canvas').getBoundingClientRect()
    return { centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2, scale: rect.width / 1534 }
  })

  /**
   * 货币条整行右锚定在 design x=462（prefab 原为 526，本页在货币条与关闭按钮之间
   * 腾出音效开关后整行左移 64）；槽内是统一的「图标→数字→+」，数字变长时整行向左
   * 生长，故断言**行末位置**与行高，而不是每个图标的绝对坐标（图标位置会随数字长度浮动）。
   */
  async function expectRowAnchored() {
    const rowBox = await page.locator('.currency-row').boundingBox()
    const expectRight = metrics.centerX + 462 * metrics.scale
    expect(Math.abs(rowBox.x + rowBox.width - expectRight), '货币条行末应与 design x=462 对齐').toBeLessThan(3)
    const expectY = metrics.centerY - 335 * metrics.scale
    expect(Math.abs(rowBox.y + rowBox.height / 2 - expectY), '货币条应在 y=335').toBeLessThan(3)
    // 底牌高度必须仍是 28（不能被 40 高的「+」撑高）
    const plate = await page.locator('.currency-slot__bg').first().boundingBox()
    expect(Math.abs(plate.height - 28 * metrics.scale), '底牌高度应为 28').toBeLessThan(2)
    // 底牌必须与槽内内容垂直对齐（曾因残留 translateY(-50%) 整体偏高半格）
    const slotBox = await page.locator('.currency-slot').first().boundingBox()
    expect(Math.abs(plate.y + plate.height / 2 - (slotBox.y + slotBox.height / 2)), '底牌应与数据垂直居中对齐').toBeLessThan(2)
  }

  // 角色池：消耗券(-304→74) + 氪金(-152→226) + 神晶(+17→395)
  await expect(page.locator('.currency-slot__icon')).toHaveCount(3)
  await expectRowAnchored()

  // 余额不足：数值变红；但按钮**保持可点**并按 `buildDrawOptions` 的 `enabled = unit > 0`
  // （只取决于卡池是否有消耗，与钱包无关）。点击后走替代货币购买券的消耗确认弹窗，
  // 而不是把按钮禁用——对应 `HeroPoolUI` 的券不足分支。
  const ticketLabel = page.locator('.currency-slot').nth(0).locator('.currency-slot__label')
  await expect(ticketLabel).toHaveClass(/g-text--danger/)
  await expect(page.locator('.draw-btn').nth(0)).toBeEnabled()
  await expect(page.locator('.draw-btn').nth(1)).toBeEnabled()

  await page.locator('.draw-btn').nth(0).click()
  await expect(page.locator('.consume-modal-root')).toBeVisible()
  await expect(page.locator('.consume-modal-msg')).toContainText('购买')
  await page.screenshot({ path: shotPath(testInfo, '10-wallet-empty.png') })
  await page.locator('.consume-btn--cancel').click()
  await expect(page.locator('.consume-modal-root')).toBeHidden()

  // 点「+」补充模拟额度后恢复，且不再变红
  await page.locator('.currency-slot').nth(0).locator('.currency-slot__add').click()
  await expect(ticketLabel).not.toHaveClass(/g-text--danger/)
  await expect(page.locator('.draw-btn').nth(0)).toBeEnabled()
  const before = Number(await ticketLabel.innerText())
  expect(before).toBeGreaterThan(0)

  // 抽一次：跳过翻卡演出进入结果一览，返回后消耗券应减少 1
  await page.locator('.draw-btn').nth(0).click()
  await skipCardAni(page)
  await expect(page.locator('.reveal-click-catcher')).toBeVisible()
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await page.locator('.result-close').isVisible().catch(() => false)) break
    if (await page.locator('.reveal-skip').isVisible().catch(() => false)) await page.locator('.reveal-skip').click()
    else await page.locator('.reveal-click-catcher').click().catch(() => {})
    await page.waitForTimeout(120)
  }
  await expect(page.locator('.result-close')).toBeVisible()
  await page.locator('.result-close').click()
  await expect(ticketLabel).toHaveText(String(before - 1))

  // 记录查询：抽过之后应有一条落在弹层内的记录行（列表定位错会排到面板上方看不见）
  await page.locator('.mini-btn').nth(1).click()
  // 弹层必须真的留在文档里：曾出现「点开后被 URL 同步立刻关闭」的问题
  await expect(page.locator('.tip-panel')).toBeVisible()
  await expect(page.locator('.tip-panel__title')).toContainText('记录查询')
  const row = page.locator('.tip-record__row').first()
  await expect(row).toBeVisible()
  const rowBox = await row.boundingBox()
  const panelBox = await page.locator('.tip-panel__bg').boundingBox()
  expect(rowBox.y, '记录行应在弹层内').toBeGreaterThan(panelBox.y)
  expect(rowBox.y + rowBox.height).toBeLessThan(panelBox.y + panelBox.height)
  await expect(row).toContainText('星')
  await page.screenshot({ path: shotPath(testInfo, '13-record-rows.png') })
})

test('蛋池货币槽按源码分支：特别贩售=券+氪金+神晶，常规贩售=券+银币', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '货币槽坐标断言只在桌面视口执行')
  await openGacha(page)
  await page.locator('.kind-toggle').nth(1).click()
  await expect(page).toHaveURL(/kind=pet/)

  const metrics = await page.evaluate(() => {
    const rect = document.querySelector('.gacha-canvas').getBoundingClientRect()
    return { centerX: rect.left + rect.width / 2, scale: rect.width / 1534 }
  })

  // 默认选中「特别贩售」：源码 InitRight 对名字含「特别」的池（不分角色/蛋池）
  // 显示 消耗券 + 氪金 + 神晶（tipPosX[0/1/2]），隐藏银币。
  await expect(page.locator('.currency-slot__icon')).toHaveCount(3)
  const slotTitles = await page.locator('.currency-slot__label').evaluateAll(els =>
    els.map(el => el.getAttribute('title') ?? '')
  )
  expect(slotTitles.join('|'), '特别贩售应显示消耗券+氪金+神晶，不含银币').not.toContain('银币')
  expect(slotTitles.filter(t => t.includes('神晶')).length, '应包含神晶槽').toBe(1)

  // 行末仍右锚定 design 462，数字变长时整行向左生长、不会压到音效开关与关闭按钮。
  const rowBox = await page.locator('.currency-row').boundingBox()
  const expectRight = metrics.centerX + 462 * metrics.scale
  expect(Math.abs(rowBox.x + rowBox.width - expectRight), '货币条行末应与 design x=462 对齐').toBeLessThan(3)
  await page.screenshot({ path: shotPath(testInfo, '11-wallet-pet-special.png') })

  // 切到「常规贩售」：ke/payKe 隐藏，显示 银币(tipPosX[4]=+35) + 消耗券(tipPosX[3]=-116)。
  await page.locator('.pool-tab').nth(1).click()
  await expect(page.locator('.currency-slot__icon')).toHaveCount(2)
  const regularTitles = await page.locator('.currency-slot__label').evaluateAll(els =>
    els.map(el => el.getAttribute('title') ?? '')
  )
  expect(regularTitles.join('|'), '常规贩售应包含银币槽').toContain('银币')
  const rowBox2 = await page.locator('.currency-row').boundingBox()
  expect(Math.abs(rowBox2.x + rowBox2.width - expectRight), '常规贩售货币条行末同样对齐 462').toBeLessThan(3)
  await page.screenshot({ path: shotPath(testInfo, '11-wallet-pet-regular.png') })
})

test('窄视口下画布完整，手机横置、桌面保留横屏提示', async ({ page, isMobile }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openGacha(page)

  const box = await page.locator('.gacha-canvas').boundingBox()
  const stage = await page.locator('.gacha-stage').boundingBox()
  // contain 缩放：画布完整落在容器内，不超出边界
  expect(box.x).toBeGreaterThanOrEqual(stage.x - 1)
  expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height + 1)
  await expect(page.locator('.gacha-viewport')).toHaveAttribute('data-rotated', String(isMobile))
  if (isMobile) {
    await expect(page.locator('.gacha-rotate-hint')).toHaveCount(0)
  } else {
    await expect(page.locator('.gacha-rotate-hint')).toBeVisible()
    const hintEvents = await page.locator('.gacha-rotate-hint').evaluate(el => getComputedStyle(el).pointerEvents)
    expect(hintEvents).toBe('none')
  }
  await page.screenshot({ path: shotPath(testInfo, '12-portrait-hint.png') })
})

test('魔物蛋卡池可切换且贴图正确', async ({ page }, testInfo) => {
  await openGacha(page)

  await page.locator('.kind-toggle').nth(1).click()
  await expect(page).toHaveURL(/kind=pet/)
  await expect(page.locator('.pool-period')).toBeVisible()
  // 切换卡池后封面是**新图**，仍在异步下载：这里必须轮询等它解码完成。
  // （`openGacha` 的等图发生在点切换之前，覆盖不到切换后新挂载的封面，
  //   直接读 naturalWidth 会与图片加载赛跑，属于测试竞态而非页面缺陷。）
  await expect.poll(
    () => page.locator('.pool-cover').evaluate(el => el.naturalWidth),
    { message: '蛋池封面应完成加载（宽度 > 800）' }
  ).toBeGreaterThan(800)
  await page.locator('.draw-btn').first().click()
  // 蛋池走 GachaPetPanel（PetGachaAniPanel 完整还原）：蛋袋等待点击 → 出蛋揭晓 UI
  await expect(page.locator('.pet-catcher')).toBeVisible()
  const diamond = page.locator('.pet-diamond')
  for (let attempt = 0; attempt < 6 && !(await diamond.isVisible().catch(() => false)); attempt += 1) {
    await page.locator('.pet-catcher').click()
    await page.waitForTimeout(600)
  }
  await expect(diamond).toBeVisible()
  await expect(page.locator('.pet-name__text').first()).toBeVisible()
  await page.screenshot({ path: shotPath(testInfo, '09-pet-reveal.png') })
})

/**
 * 🔴 分享图必须**满幅**，不能有没画上的透明带。
 *
 * 为什么单独立一条、并且**强制 1920×1080**：
 * 合成器 `gachaShareImage.js` 按「画布可见区 × OUT_SCALE」开输出画布，而图层矩形是
 * **设计像素**（`toDesign()` 除以了画布 scale）。少乘 scale 时：
 *   - `scale > 1`（窗口宽于 1534 CSS px，如 1920×1080 → 1.2516）→ 内容只铺到
 *     1534×2 = 3068 px，右边与下边各留一条透明带（**用户报的就是这个**）；
 *   - `scale < 1`（1440×900 → 0.9387）→ 内容溢出把整张盖满，**看不出问题**。
 * desktop 项目默认视口恰好是 1440×900，所以这个缺陷在所有既有用例里都是隐形的，
 * 必须显式改视口才能守住。
 */
test('魔物蛋分享图在放大视口下仍满幅（无透明带）', async ({ page }) => {
  // 1440×900 是 desktop 项目默认视口，此处刻意选 scale > 1 的尺寸
  await page.setViewportSize({ width: 1920, height: 1080 })
  await openGacha(page)

  await page.locator('.kind-toggle').nth(1).click()
  await expect(page).toHaveURL(/kind=pet/)
  await page.locator('.draw-btn').first().click()
  await expect(page.locator('.pet-catcher')).toBeVisible()
  const diamond = page.locator('.pet-diamond')
  for (let attempt = 0; attempt < 10 && !(await diamond.isVisible().catch(() => false)); attempt += 1) {
    await page.locator('.pet-catcher').click()
    await page.waitForTimeout(600)
  }
  await expect(page.locator('.pet-share')).toBeVisible()

  // 直接驱动**真实合成器**，量输出画布的 alpha 包围盒。
  // 走 `import('/src/...')` 是因为 dev server 直接供源码模块（Vite 特性）。
  const result = await page.evaluate(async () => {
    const mod = await import('/src/utils/gachaShareImage.js')
    // 页面上有多个 `.gacha-stage`（卡池面板也在），必须挑**含分享按钮**的那个
    const stage = Array.from(document.querySelectorAll('.gacha-stage'))
      .find(el => el.querySelector('.pet-share'))
    const canvas = await mod.renderGachaPetImage(stage)
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
    let minX = canvas.width
    let minY = canvas.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (data[(y * canvas.width + x) * 4 + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    const canvasEl = stage.querySelector('.gacha-canvas') || stage
    return {
      width: canvas.width,
      height: canvas.height,
      bbox: { minX, minY, maxX, maxY },
      scale: Number.parseFloat(
        (getComputedStyle(canvasEl).transform.match(/matrix\(([^,]+),/) || [0, 1])[1]
      )
    }
  })

  // 前置条件自检：没真的处于放大视口，这条用例就失去意义（避免以后被改成静默通过）
  expect(result.scale, '本用例只在画布被放大（scale > 1）时才有鉴别力').toBeGreaterThan(1)
  expect(
    result.bbox,
    `分享图应满幅（输出 ${result.width}×${result.height}，scale ${result.scale.toFixed(4)}）`
  ).toEqual({ minX: 0, minY: 0, maxX: result.width - 1, maxY: result.height - 1 })
})

/**
 * 🔴 触摸设备竖屏时，`GachaViewport` 会把整页内容 `rotate(90deg)`。
 *
 * 此时 `getBoundingClientRect()` 返回**旋转后的轴对齐包围盒**（宽高互换），合成器若照搬
 * 就会产出**竖版乱图**：实测 393×851 竖屏下输出 786×1702（横版场景塞进竖版画布，
 * 图层宽高也全错位）。这是与「透明带」不同的另一个缺陷，只有触摸+竖屏才出现。
 *
 * 判据：**同一场景在竖屏与横屏下必须合成出尺寸完全相同的横版图**。
 * 这条比"看输出是不是横的"更严——它同时锁住取景与图层取位。
 *
 * 只在触摸项目跑：非触摸设备 `pointer: coarse` 为 false，不会触发旋转，用例无鉴别力。
 */
test('触摸竖屏分享图与横屏一致（不产出竖版乱图）', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, '只在触摸项目下有鉴别力（旋转仅在 pointer: coarse 生效）')

  const shoot = async () => {
    await page.setViewportSize(
      page.viewportSize().width > page.viewportSize().height
        ? { width: 851, height: 393 }
        : { width: 393, height: 851 }
    )
    await page.waitForTimeout(1200)
    return page.evaluate(async () => {
      const mod = await import('/src/utils/gachaShareImage.js')
      const stage = Array.from(document.querySelectorAll('.gacha-stage'))
        .find(el => el.querySelector('.pet-share'))
      const canvasEl = stage.querySelector('.gacha-canvas') || stage
      const out = await mod.renderGachaPetImage(stage)
      const { data } = out.getContext('2d').getImageData(0, 0, out.width, out.height)
      let minX = out.width
      let minY = out.height
      let maxX = -1
      let maxY = -1
      for (let y = 0; y < out.height; y += 1) {
        for (let x = 0; x < out.width; x += 1) {
          if (data[(y * out.width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      const content = stage.closest('.gacha-viewport__content')
      return {
        width: out.width,
        height: out.height,
        bbox: { minX, minY, maxX, maxY },
        contentTransform: content ? getComputedStyle(content).transform : 'none'
      }
    })
  }

  await page.setViewportSize({ width: 393, height: 851 })
  await openGacha(page)
  await page.locator('.kind-toggle').nth(1).click()
  await page.locator('.draw-btn').first().click()
  await expect(page.locator('.pet-catcher')).toBeVisible()
  const diamond = page.locator('.pet-diamond')
  for (let attempt = 0; attempt < 10 && !(await diamond.isVisible().catch(() => false)); attempt += 1) {
    await page.locator('.pet-catcher').click()
    await page.waitForTimeout(600)
  }
  await expect(page.locator('.pet-share')).toBeVisible()

  const portrait = await shoot()
  // 前置条件自检：内容层确实被旋转了，否则这条用例守不到东西
  expect(
    portrait.contentTransform,
    '竖屏下内容层应带 rotate(90deg)（矩阵 a=0），否则本用例失去鉴别力'
  ).toMatch(/^matrix\(0,/)

  const landscape = await shoot()

  expect(portrait.width, `竖屏输出应是横版（实测 ${portrait.width}×${portrait.height}）`)
    .toBeGreaterThan(portrait.height)
  expect(
    { w: portrait.width, h: portrait.height },
    '竖屏与横屏应合成出同一张横版图'
  ).toEqual({ w: landscape.width, h: landscape.height })
  expect(portrait.bbox).toEqual({ minX: 0, minY: 0, maxX: portrait.width - 1, maxY: portrait.height - 1 })
})

/**
 * 🔴 合成器必须**逐值复现** `object-fit`，不能把 `cover` 当成 `contain`。
 *
 * 早先 `drawImageFit()` 只判 `fill`，其余取值一律走 `min` 等比居中（= `contain`）。
 * 结果页背板是 `.result-backdrop__bg { object-fit: cover }`，于是它在分享图里被缩到 `min`
 * 比例居中，**左右两侧留出未着墨的空带**；实时页面走浏览器原生 `cover` 铺满，
 * 所以任何页面级断言（含上面两条 alpha 包围盒用例）都看不到这个缺陷——
 * 那两条守的是「有像素的地方有没有漏」，而这条缺陷的特征恰恰是**两侧被多画了东西**。
 *
 * 用合成夹具而非真实美术：100×100 的「红框蓝心」图放进 400×200 的盒子，
 * `cover` 取 `max`=4 → 铺满 400 宽，最左/最右列必为源图最外圈（红）；
 * `contain` 取 `min`=2 → 只画 200 宽居中，最左列**没有任何像素**（alpha 0）。
 * 两个盒子的对照把「cover 被缩成 contain」钉死，且不依赖游戏素材与视口尺寸。
 */
test('分享图合成器按 object-fit 取值铺图（cover 不缩成 contain）', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const mod = await import('/src/utils/gachaShareImage.js')

    const src = document.createElement('canvas')
    src.width = 100
    src.height = 100
    const sctx = src.getContext('2d')
    sctx.fillStyle = '#ff0000'
    sctx.fillRect(0, 0, 100, 100)
    sctx.fillStyle = '#0000ff'
    sctx.fillRect(20, 20, 60, 60)
    const url = src.toDataURL('image/png')

    const build = fit => {
      const stage = document.createElement('div')
      stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:200px'
      // 合成器要求舞台内含招募结果，否则按空舞台拒绝
      const marker = document.createElement('div')
      marker.className = 'result-diamond'
      marker.style.cssText = 'position:absolute;left:0;top:0;width:10px;height:10px'
      const img = document.createElement('img')
      img.style.cssText = `position:absolute;left:0;top:0;width:400px;height:200px;object-fit:${fit}`
      img.src = url
      stage.append(marker, img)
      document.body.append(stage)
      return stage
    }

    const readEdges = async stage => {
      const out = await mod.renderGachaResultImage(stage)
      const ctx = out.getContext('2d')
      const mid = Math.floor(out.height / 2)
      const left = ctx.getImageData(0, mid, 1, 1).data
      const right = ctx.getImageData(out.width - 1, mid, 1, 1).data
      return {
        width: out.width,
        height: out.height,
        left: [left[0], left[1], left[2], left[3]],
        right: [right[0], right[1], right[2], right[3]]
      }
    }

    const coverStage = build('cover')
    const containStage = build('contain')
    try {
      return { cover: await readEdges(coverStage), contain: await readEdges(containStage) }
    } finally {
      coverStage.remove()
      containStage.remove()
    }
  })

  // 前置条件自检：夹具几何没变，下面两条判据才成立
  expect(result.cover.width, '夹具输出宽应为 400×2 倍率').toBe(800)
  expect(result.cover.height).toBe(400)
  expect(result.contain.width).toBe(800)

  // cover：左右两侧都必须着墨，且落在源图最外圈的红框上
  expect(result.cover.left[3], `cover 左边缘应已着墨，实测 ${JSON.stringify(result.cover.left)}`)
    .toBeGreaterThan(200)
  expect(result.cover.right[3], `cover 右边缘应已着墨，实测 ${JSON.stringify(result.cover.right)}`)
    .toBeGreaterThan(200)
  expect(result.cover.left[0], 'cover 左边缘应取源图最左列（红）').toBeGreaterThan(200)
  expect(result.cover.left[2], 'cover 左边缘不应是蓝心').toBeLessThan(60)

  // 负向对照：同一盒子改用 contain 就应左右留白——证明本用例能区分两种取值
  expect(result.contain.left[3], 'contain 左边缘应留白（未着墨），否则本用例失去鉴别力')
    .toBeLessThan(10)
})

/**
 * 🔴 分享图合成器必须画 `border-image` 与「非白名单标签」的 `background-image`。
 *
 * 缺陷现象：结果页的「招募十次」按钮**只剩文字、底板丢失**；右上角资源槽的底牌也消失。
 *
 * 两个独立根因，都是合成器的「这一层要不要画」判断错了：
 * 1. 收集器只读 `background-image`，**没读 `border-image`**。资源槽底牌
 *    `.g-slice--top-item` 只挂 `border-image`（`com_top_item.webp`），于是被判成
 *    「无背景 → 当文字画」，该 div 无文本 → 什么都没画。
 * 2. 收集器的选择器是标签白名单 `img, canvas, p, span, em, div`，**`<button>` 不在其中**。
 *    抽取按钮是 `button.g-slice.result-btn`，背景图挂在其 `.g-slice--btn-y` 上，
 *    整个元素没被枚举 → 底板丢失。
 *
 * 为什么既有用例守不住：三条既有分享用例量的都是**输出 alpha 包围盒**。
 * 这两处缺陷发生在画面**内部**，背板仍铺满全幅，包围盒一直是满的 → 测不出来。
 * 所以本用例断言的是**具体位置的像素内容**，而不是包围盒。
 *
 * 夹具（不依赖游戏素材）：`border-image` 底板用纯绿源图，按钮背景用纯品红源图，
 * 再取一处空白对照。空白对照必须透明——否则说明采样本身有问题，判据不成立。
 */
test('分享图合成器画 border-image 底板与 button 背景图', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const mod = await import('/src/utils/gachaShareImage.js')

    // 造一张纯色源图（尺寸取真实切片的量级：底牌 64×28）
    const solid = (color, w, h) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const x = c.getContext('2d')
      x.fillStyle = color
      x.fillRect(0, 0, w, h)
      return c.toDataURL('image/png')
    }
    const plateSrc = solid('#00ff00', 64, 28)
    const btnSrc = solid('#ff00ff', 292, 72)

    const stage = document.createElement('div')
    stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:200px'
    // 合成器要求舞台内含招募结果，否则按空舞台拒绝
    const marker = document.createElement('div')
    marker.className = 'result-diamond'
    marker.style.cssText = 'position:absolute;left:0;top:0;width:10px;height:10px'

    // ① 只挂 border-image 的底牌（与 .g-slice--top-item 同形：0 20 0 20 fill / 0 20px stretch）
    const plate = document.createElement('div')
    plate.className = 'currency-slot__bg'
    plate.style.cssText = [
      'position:absolute', 'left:0', 'top:0', 'width:300px', 'height:28px',
      'border-style:solid', 'border-width:0', 'border-color:transparent',
      `border-image:url("${plateSrc}") 0 20 0 20 fill / 0 20px stretch`
    ].join(';')

    // ② 背景图挂在 <button> 上（旧白名单不含 button）
    const btn = document.createElement('button')
    btn.className = 'g-slice result-btn'
    btn.style.cssText = [
      'position:absolute', 'left:0', 'top:40px', 'width:292px', 'height:72px',
      'border:0', 'padding:0',
      `background:url("${btnSrc}") no-repeat center / 100% 100%`
    ].join(';')

    stage.append(marker, plate, btn)
    document.body.append(stage)

    const readRect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    const box = { plate: readRect(plate), btn: readRect(btn) }

    try {
      const out = await mod.renderGachaResultImage(stage)
      const ctx = out.getContext('2d')
      const stageRect = stage.getBoundingClientRect()
      // 无缩放无旋转：输出像素 = (视觉像素 − 舞台原点) × OUT_SCALE(2)
      const sample = (b) => {
        const pts = [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]]
        return pts.map(([fx, fy]) => {
          const px = Math.round((b.x - stageRect.left + b.w * fx) * 2)
          const py = Math.round((b.y - stageRect.top + b.h * fy) * 2)
          const d = ctx.getImageData(px, py, 1, 1).data
          return [d[0], d[1], d[2], d[3]]
        })
      }
      // 空白对照：舞台右下角，没有任何元素覆盖
      const blank = (() => {
        const px = Math.round(out.width - 8)
        const py = Math.round(out.height - 8)
        const d = ctx.getImageData(px, py, 1, 1).data
        return [d[0], d[1], d[2], d[3]]
      })()
      return {
        size: [out.width, out.height],
        plate: sample(box.plate),
        btn: sample(box.btn),
        blank
      }
    } finally {
      stage.remove()
    }
  })

  // 前置条件自检：夹具几何没变，下面的判据才成立
  expect(result.size, '夹具输出尺寸应为舞台 400×200 的 2 倍率').toEqual([800, 400])

  // 空白对照必须先自证：采样点确实没被任何东西覆盖，否则后面的「有像素」判据无鉴别力
  expect(result.blank[3], `空白对照应透明，实测 ${JSON.stringify(result.blank)}`).toBeLessThan(10)

  // ① border-image 底牌：整条都要着绿（含 fill 的中心切片）
  for (const [i, px] of result.plate.entries()) {
    expect(px[3], `底牌采样点 ${i} 应已着墨（border-image 未被采集），实测 ${JSON.stringify(px)}`)
      .toBeGreaterThan(200)
    expect(px[1], `底牌采样点 ${i} 应取绿色源图，实测 ${JSON.stringify(px)}`).toBeGreaterThan(200)
    expect(px[0], `底牌采样点 ${i} 不应偏红，实测 ${JSON.stringify(px)}`).toBeLessThan(60)
  }

  // ② button 背景图：整块都要着品红
  for (const [i, px] of result.btn.entries()) {
    expect(px[3], `按钮采样点 ${i} 应已着墨（button 未被枚举），实测 ${JSON.stringify(px)}`)
      .toBeGreaterThan(200)
    expect(px[0], `按钮采样点 ${i} 应取品红源图，实测 ${JSON.stringify(px)}`).toBeGreaterThan(200)
    expect(px[1], `按钮采样点 ${i} 不应偏绿，实测 ${JSON.stringify(px)}`).toBeLessThan(60)
  }
})

/*
 * 为什么既有用例守不住「渐变 / background-color / border-radius」：
 *
 * 分享图用例此前只断言**整幅 alpha 包围盒**。背板已把画面铺满，包围盒必然满幅，
 * 中间少画几层它照样通过——本项目已三次出现同类漏画（`object-fit` 只认 `fill`、
 * `border-image` 未采集、`button` 未枚举）。故本用例改为**在元素所在位置采样像素**，
 * 并用「空白对照必须透明」自证采样点确有鉴别力。
 *
 * 夹具全部是合成元素，不依赖任何游戏素材：素材被替换不该让本用例变红，
 * 只有合成器漏画渐变 / 底色 / 圆角裁切才该变红。
 */
test('分享图合成器画 background-color、渐变与圆角裁切', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const mod = await import('/src/utils/gachaShareImage.js')

    const stage = document.createElement('div')
    stage.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:200px'
    // 合成器要求舞台内含招募结果，否则按空舞台拒绝
    const marker = document.createElement('div')
    marker.className = 'result-diamond'
    marker.style.cssText = 'position:absolute;left:0;top:0;width:10px;height:10px'

    const make = (cls, css) => {
      const el = document.createElement('div')
      el.className = cls
      el.style.cssText = css
      return el
    }
    // ① 只有 background-color，完全没有 background-image
    const flat = make(
      'fx-flat',
      'position:absolute;left:0;top:0;width:100px;height:100px;background-color:#0000ff'
    )
    // ② 径向渐变（蛋池星光辉光 .pet-diamond__glow 同形）
    const radial = make(
      'fx-radial',
      'position:absolute;left:100px;top:0;width:100px;height:100px;' +
        'background-image:radial-gradient(circle, #ff0000 0%, #0000ff 100%)'
    )
    // ③ 线向渐变：左绿右黑，方向错了也守得住
    const linear = make(
      'fx-linear',
      'position:absolute;left:200px;top:0;width:100px;height:100px;' +
        'background-image:linear-gradient(to right, #00ff00 0%, #000000 100%)'
    )
    // ④ 圆角裁切：圆心有着墨、圆外四角必须透明
    const round = make(
      'fx-round',
      'position:absolute;left:300px;top:0;width:100px;height:100px;' +
        'background-color:#ffff00;border-radius:50%'
    )

    stage.append(marker, flat, radial, linear, round)
    document.body.append(stage)

    const readRect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    const box = {
      flat: readRect(flat),
      radial: readRect(radial),
      linear: readRect(linear),
      round: readRect(round)
    }

    try {
      const out = await mod.renderGachaResultImage(stage)
      const ctx = out.getContext('2d')
      const stageRect = stage.getBoundingClientRect()
      // 无缩放无旋转：输出像素 = (视觉像素 − 舞台原点) × OUT_SCALE(2)
      const at = (b, fx, fy) => {
        const px = Math.round((b.x - stageRect.left + b.w * fx) * 2)
        const py = Math.round((b.y - stageRect.top + b.h * fy) * 2)
        const d = ctx.getImageData(px, py, 1, 1).data
        return [d[0], d[1], d[2], d[3]]
      }
      // 空白对照：舞台右下角，四个夹具都没覆盖
      const blank = (() => {
        const d = ctx.getImageData(out.width - 8, out.height - 8, 1, 1).data
        return [d[0], d[1], d[2], d[3]]
      })()
      return {
        size: [out.width, out.height],
        flat: at(box.flat, 0.5, 0.5),
        radialCore: at(box.radial, 0.5, 0.5),
        radialEdge: at(box.radial, 0.9, 0.9),
        linearLeft: at(box.linear, 0.1, 0.5),
        linearRight: at(box.linear, 0.9, 0.5),
        roundCore: at(box.round, 0.5, 0.5),
        roundCorner: at(box.round, 0.03, 0.03),
        blank
      }
    } finally {
      stage.remove()
    }
  })

  // 前置条件自检：夹具几何没变，下面的判据才成立
  expect(result.size, '夹具输出尺寸应为舞台 400×200 的 2 倍率').toEqual([800, 400])
  expect(result.blank[3], `空白对照应透明，实测 ${JSON.stringify(result.blank)}`).toBeLessThan(10)

  // ① 只有 background-color 的元素也要铺底（收集器此前只认 background-image）
  expect(result.flat[3], `纯 background-color 未绘制，实测 ${JSON.stringify(result.flat)}`)
    .toBeGreaterThan(200)
  expect(result.flat[2], `底色应为蓝，实测 ${JSON.stringify(result.flat)}`).toBeGreaterThan(200)
  expect(result.flat[0], `底色不应偏红，实测 ${JSON.stringify(result.flat)}`).toBeLessThan(60)

  // ② 径向渐变：既要有像素，也要有中心→外缘的色变（只判「有像素」守不住画成纯色）
  expect(result.radialCore[3], `径向渐变未绘制，实测 ${JSON.stringify(result.radialCore)}`)
    .toBeGreaterThan(200)
  expect(result.radialCore[0], `渐变中心应偏红，实测 ${JSON.stringify(result.radialCore)}`)
    .toBeGreaterThan(180)
  expect(result.radialEdge[2], `渐变外缘应偏蓝，实测 ${JSON.stringify(result.radialEdge)}`)
    .toBeGreaterThan(150)
  expect(result.radialEdge[0], `渐变外缘不应偏红，实测 ${JSON.stringify(result.radialEdge)}`)
    .toBeLessThan(110)

  // ③ 线向渐变：方向也要对（左绿 → 右黑）
  expect(result.linearLeft[1], `线向渐变左侧应偏绿，实测 ${JSON.stringify(result.linearLeft)}`)
    .toBeGreaterThan(200)
  expect(result.linearRight[1], `线向渐变右侧应为黑，实测 ${JSON.stringify(result.linearRight)}`)
    .toBeLessThan(60)

  // ④ border-radius：圆角只裁背景，圆心有着墨、圆外必须透明
  expect(result.roundCore[3], `圆角元素中心应已着墨，实测 ${JSON.stringify(result.roundCore)}`)
    .toBeGreaterThan(200)
  expect(result.roundCore[1], `圆角元素应取黄色底，实测 ${JSON.stringify(result.roundCore)}`)
    .toBeGreaterThan(200)
  expect(result.roundCorner[3], `border-radius 外的四角应透明，实测 ${JSON.stringify(result.roundCorner)}`)
    .toBeLessThan(10)
})

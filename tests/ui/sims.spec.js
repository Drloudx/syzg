import { expect, test } from '@playwright/test'

/**
 * `/sims`（相关模拟 · 魔物出战）回归。
 *
 * ## 为什么要有这个文件
 *
 * 这一页此前**没有任何自动化覆盖**，改动全靠手动查验。实际已经漏过一个
 * 语义错误：「全队适配魔物候选：55 只」把「各角色可吃到数」相加，
 * 同一只魔物满足多个角色条件时被重复计数，结果超过魔物总数（32）。
 *
 * ## 守什么
 *
 *   1. 候选魔物数是**去重**后的数量，且不超过魔物总数
 *   2. 筛选面板结构符合吸顶裁切三件套（`UiFilterPanel` 是根直接子级 + `data-main-scroll`）
 *   3. 筛选行之间有一致的纵向间距（`.sim-filters` 必须自带 gap）
 *   4. 选满 4 人 → 点亮标记、最优组合、推荐结果都能正常产出
 */

test.beforeEach(async ({ page }) => {
  await page.route('**/data/notice.json*', (route) => route.fulfill({ json: { notices: [] } }))
})

const ROUTE = '/sims?tab=monster-team'

async function open(page) {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`/#${ROUTE}`)
  await page.waitForFunction(
    () => {
      const p = document.querySelector('.page-view-container')
      return p && !p.querySelector('.ui-empty-state--loading')
    },
    { timeout: 25_000 }
  )
  await page.waitForTimeout(500)
}

/** 点开第 slot 个槽位，选第 index 张卡 */
async function pickHero(page, slot, index) {
  await page.locator('.sim-slot').nth(slot).click()
  await expect(page.locator('.ui-modal-overlay')).toBeVisible({ timeout: 10_000 })
  const cards = page.locator('.ui-modal-overlay .sim-picker > *')
  await expect(cards.first()).toBeVisible({ timeout: 10_000 })
  const count = await cards.count()
  await cards.nth(index % count).click()
  await expect(page.locator('.ui-modal-overlay')).toBeHidden({ timeout: 10_000 })
}

test('页面无运行时错误', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('sticky-clip')) errors.push(msg.text())
  })

  await open(page)
  expect(errors, `${ROUTE} 出现运行时错误`).toEqual([])
})

test('吸顶裁切三件套结构正确', async ({ page }) => {
  await open(page)

  const state = await page.evaluate(() => {
    const pv = document.querySelector('.page-view-container')
    return {
      hasFilterAsDirectChild: !!pv?.querySelector(':scope > [data-sticky-filter]'),
      scrollerCount: pv?.querySelectorAll('[data-main-scroll]').length ?? 0,
    }
  })

  expect(state.hasFilterAsDirectChild, 'UiFilterPanel 不是页面根的直接子级，整页不会裁切').toBe(true)
  expect(state.scrollerCount, '找不到 [data-main-scroll] 容器，正文会滚到筛选框上方').toBeGreaterThan(0)
})

test('筛选行纵向间距一致（.sim-filters 必须自带 gap）', async ({ page }) => {
  await open(page)

  /*
   * `.filter-panel` 的 `gap: 10px` 只作用于**直接子元素**。
   * 本页把多行筛选包在 `.sim-filters` 里，若该容器没写 gap，
   * 相邻行间隙会变成 `10, 0, 0` —— 后几行挤在一起。
   */
  const gaps = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-sticky-filter] .ui-filter-row')]
    const out = []
    for (let i = 1; i < rows.length; i++) {
      out.push(Math.round(rows[i].getBoundingClientRect().top - rows[i - 1].getBoundingClientRect().bottom))
    }
    return out
  })

  expect(gaps.length, '筛选行不足两行，测不出间距').toBeGreaterThan(0)
  for (const [i, gap] of gaps.entries()) {
    expect(gap, `第 ${i + 1} 与第 ${i + 2} 行的间隙为 ${gap}px（应为 10px），检查 .sim-filters 的 gap`).toBe(10)
  }
})

test('候选魔物数是去重值，且不超过魔物总数', async ({ page }) => {
  await open(page)

  const petTotal = await page.evaluate(async () => {
    const res = await fetch('/data/parsed/sims.json')
    const data = await res.json()
    return data.pets.length
  })
  expect(petTotal, '魔物数据异常').toBeGreaterThan(0)

  const readCount = async () => {
    const el = page.locator('.sim-team__summary strong')
    if (!(await el.count())) return null
    return Number.parseInt((await el.textContent()).trim(), 10)
  }

  let prev = 0
  for (let slot = 0; slot < 4; slot++) {
    await pickHero(page, slot, slot)
    const count = await readCount()

    expect(Number.isFinite(count), `第 ${slot + 1} 人时读不到候选数`).toBe(true)
    /*
     * 🔴 核心断言：候选数不能超过魔物总数。
     * 旧实现把各角色可吃到数相加（4 人 = 55 > 32），这里会直接红。
     */
    expect(
      count,
      `第 ${slot + 1} 人时候选数 ${count} 超过魔物总数 ${petTotal} —— 又是把各角色数量相加了（会重复计数）。\n` +
        '  正确做法：pets.filter(pet => team.some(hero => matchesPassive(hero, pet.passive))).length'
    ).toBeLessThanOrEqual(petTotal)

    // 加人只会引入更多候选，不应变少
    expect(count, `加人后候选数不增反减（${prev} → ${count}）`).toBeGreaterThanOrEqual(prev)
    prev = count
  }

  // 4 人时应有实际候选（避免算成 0 也算"不超过总数"）
  expect(prev, '选满 4 人后候选数为 0，匹配逻辑可能失效').toBeGreaterThan(0)
})

test('选满 4 人后点亮标记与推荐结果完整', async ({ page }) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  await open(page)
  for (let slot = 0; slot < 4; slot++) await pickHero(page, slot, slot)
  await page.waitForTimeout(800)

  const state = await page.evaluate(() => ({
    filledSlots: document.querySelectorAll('.sim-slot.is-filled').length,
    markImgs: document.querySelectorAll('.sim-slot__marks img').length,
    bestPets: document.querySelectorAll('.sim-best__pet').length,
    bestSum: document.querySelector('.sim-best__sum')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    // 推荐结果里的魔物图必须真的加载出来（src 拼错时 naturalWidth 为 0）
    bestImagesOk: [...document.querySelectorAll('.sim-best__pet img')].every(
      (img) => img.complete && img.naturalWidth > 0
    ),
  }))

  expect(state.filledSlots, '4 个槽位没有全部填上').toBe(4)
  expect(state.markImgs, '点亮标记数量不对（4 人 × 3 位 = 12）').toBe(12)
  expect(state.bestPets, '智能推荐没有给出 3 只魔物').toBe(3)
  expect(state.bestSum, '最优组合的计数文案缺失').toMatch(/共点亮 \d+ \/ \d+ 个词条/)
  expect(state.bestImagesOk, '推荐结果的魔物图没加载出来（src 可能拼错）').toBe(true)
  expect(errors, '选人与推荐过程中出现运行时错误').toEqual([])
})

test('自组查看受「通用被动」开关约束，两种模式口径一致', async ({ page }) => {
  await open(page)
  for (let slot = 0; slot < 4; slot++) await pickHero(page, slot, slot)

  await page.getByRole('button', { name: '自组查看', exact: true }).click()
  await page.waitForTimeout(700)

  /*
   * 数据侧基准：通用被动 = 不带任何属性/职业限定的队伍被动。
   * 这里不写死「7 只」，而是从数据现算，数据更新后测试不会假红。
   */
  const data = await page.evaluate(async () => {
    const res = await fetch('/data/parsed/sims.json')
    const json = await res.json()
    const isGeneric = (p) => !(p?.elements?.length || p?.jobs?.length)
    return {
      total: json.pets.length,
      genericNames: json.pets.filter((p) => isGeneric(p.passive)).map((p) => p.name),
    }
  })
  expect(data.genericNames.length, '数据里没有通用被动魔物，本条无法验证').toBeGreaterThan(0)

  const readList = () =>
    page.evaluate(() => ({
      names: [...document.querySelectorAll('.sim-pet__name')].map((e) => e.textContent.trim()),
      count: document.querySelectorAll('.sim-pet').length,
      pickButtons: document.querySelectorAll('.sim-pet__pick-btn').length,
    }))

  /* ── 默认：排除通用被动 ── */
  const excluded = await readList()
  expect(
    excluded.count,
    `默认应排除通用被动：期望 ${data.total - data.genericNames.length} 只，实际 ${excluded.count}`
  ).toBe(data.total - data.genericNames.length)

  const leaked = excluded.names.filter((n) => data.genericNames.includes(n))
  expect(
    leaked,
    `「排除通用被动」开启时，自组查看仍列出通用魔物：${leaked.join('、')}\n` +
      '  该开关必须同时作用于智能推荐与自组查看；判定统一用 simsData.isGenericPassive()'
  ).toEqual([])

  expect(excluded.pickButtons, '被列出的每只魔物都应带「+ 出战」按钮').toBe(excluded.count)

  /* ── 切到「包含通用被动」：全部出现 ── */
  await page.getByRole('button', { name: '包含通用被动', exact: true }).click()
  await page.waitForTimeout(800)

  const included = await readList()
  expect(included.count, `「包含通用被动」应列出全部 ${data.total} 只`).toBe(data.total)
  for (const name of data.genericNames) {
    expect(included.names, `「包含通用被动」时缺少通用魔物「${name}」`).toContain(name)
  }

  /* ── 再切回排除：恢复 ── */
  await page.getByRole('button', { name: '排除通用被动', exact: true }).click()
  await page.waitForTimeout(800)

  const back = await readList()
  expect(back.count, '切回「排除通用被动」后数量未恢复').toBe(data.total - data.genericNames.length)
})

test('智能推荐与自组查看的通用被动口径一致', async ({ page }) => {
  await open(page)
  for (let slot = 0; slot < 4; slot++) await pickHero(page, slot, slot)
  await page.waitForTimeout(600)

  const genericNames = await page.evaluate(async () => {
    const res = await fetch('/data/parsed/sims.json')
    const json = await res.json()
    const isGeneric = (p) => !(p?.elements?.length || p?.jobs?.length)
    return json.pets.filter((p) => isGeneric(p.passive)).map((p) => p.name)
  })

  // 默认排除：智能推荐的组合里不应出现通用魔物
  const smartNames = await page.evaluate(() =>
    [...document.querySelectorAll('.sim-best__pet .sim-best__name')].map((e) => e.textContent.trim())
  )
  expect(smartNames.length, '智能推荐没有给出结果').toBeGreaterThan(0)

  const badInSmart = smartNames.filter((n) => genericNames.includes(n))
  expect(
    badInSmart,
    `智能推荐组合里出现通用被动魔物：${badInSmart.join('、')}（默认应排除）`
  ).toEqual([])
})

/**
 * 筛选后列表不得留白：卡片高度恒定、列表高度随条目数收缩。
 *
 * ## 这条测试的来历
 *
 * 曾经为了「切换筛选时页面不跳」给 `.sim-pets` 加了
 * `min-height: 一屏 + 已滚距离`，结果适得其反：
 *   - 筛到只剩 1 只时列表被撑到整屏，页面中间出现**一大片空白**；
 *   - 补偿定时释放后高度又缩回去，形成**第二次跳动**。
 *
 * 正确做法是不撑高度 —— 浏览器把 `scrollTop` 夹到上限是规范行为，
 * 左右两栏是 sticky 独立布局、相对视口位置全程不变。
 *
 * 所以这里只守「列表高度跟着条目数走，卡片不被拉伸」。
 */
test('筛选后列表高度随条目收缩，卡片不被 grid 拉伸', async ({ page }) => {
  await open(page)
  for (let slot = 0; slot < 4; slot++) await pickHero(page, slot, slot)
  await page.getByRole('button', { name: '自组查看', exact: true }).click()
  await page.waitForTimeout(700)

  const statRow = page.locator('.ui-filter-row').filter({
    has: page.locator('.ui-filter-row__label', { hasText: '加成筛选' }),
  })

  const measure = () =>
    page.evaluate(() => {
      const pets = document.querySelector('.sim-pets')
      const card = document.querySelector('.sim-pet')
      return {
        cards: document.querySelectorAll('.sim-pet').length,
        listH: pets ? Math.round(pets.getBoundingClientRect().height) : null,
        cardH: card ? Math.round(card.getBoundingClientRect().height) : null,
        minHeight: pets ? getComputedStyle(pets).minHeight : null,
      }
    })

  const full = await measure()
  expect(full.cards, '「全部」状态下没有魔物').toBeGreaterThan(1)

  // 找一个能把结果筛少的条件
  const pills = statRow.locator('.ui-filter-pill')
  const count = await pills.count()
  let narrow = null
  for (let i = 1; i < count; i++) {
    await pills.nth(i).click()
    await page.waitForTimeout(600)
    const s = await measure()
    if (s.cards > 0 && s.cards < full.cards) { narrow = s; break }
  }
  expect(narrow, '找不到能把结果筛到更少的条件，本条无法验证').not.toBeNull()

  // ① 卡片高度不得被拉伸（104px 这类内容高度，不该变成整屏）
  expect(
    Math.abs(narrow.cardH - full.cardH),
    `筛到 ${narrow.cards} 只后卡片高度从 ${full.cardH}px 变成 ${narrow.cardH}px —— ` +
      'grid 行被 stretch 拉满了容器'
  ).toBeLessThanOrEqual(2)

  // ② 列表高度必须跟着条目数收缩，不能被撑成一屏（那会留下大片空白）
  expect(
    narrow.listH,
    `筛到 ${narrow.cards} 只后列表高度 ${narrow.listH}px，远超单行所需（卡片 ${narrow.cardH}px）—— ` +
      '不要把 .sim-pets 的 min-height 撑到一屏'
  ).toBeLessThanOrEqual(narrow.cardH * 2)

  // ③ min-height 不得被设成撑满视口的值
  const minH = Number.parseFloat(narrow.minHeight)
  if (Number.isFinite(minH)) {
    expect(minH, `.sim-pets 的 min-height 被设成了 ${narrow.minHeight}，会在内容少时留下空白`).toBeLessThanOrEqual(1)
  }
})
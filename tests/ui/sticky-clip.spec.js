import { expect, test } from '@playwright/test'

/**
 * 桌面端页面级吸顶裁切（sticky-clip）回归。
 *
 * ## 这个文件守什么
 *
 * 桌面端（≥1025px）滚动发生在整个 `.app-container`，而正文容器
 * `[data-main-scroll]` 被强制 `overflow-y: visible`。于是正文上滑时会经过
 * 吸顶筛选框所在的区域——必须按筛选框底边把它裁掉，否则内容会**盖到筛选框上方**。
 * 裁切量写进 `--sticky-clip-top`，由 `clip-path: inset(... 0 0)` 消费。
 *
 * 这条链路**失败时完全静默**：不报错、不抛异常，只是内容跑到筛选框上面去。
 * 所以必须逐路由实测，不能靠读代码或看截图判断。
 *
 * ## 三条不许省的约定（破坏任一条都会静默失效）
 *
 *   1. 筛选框必须是 `UiFilterPanel`（带 `data-sticky-filter` 标记），
 *      且是 `.page-view-container` 的**直接子级**——`App.vue` 用 `:scope >` 取它。
 *   2. 正文滚动容器必须带 `data-main-scroll`。`UiCardGrid` / `UiVirtualGrid` 自带；
 *      自建容器（如 `.dungeon-scroll`、`#petTableGrid`）必须自己加。
 *   3. 两者必须在**同一个** `.page-view-container` 内。
 *
 * ## 为什么用「实测 = 期望」而不是写死像素
 *
 * 裁切量 = 筛选框底边 − 容器顶边，随筛选框高度与滚动位置变化。
 * 断言**计算出的期望值等于实际写入值**，比写死数字更稳，
 * 也能同时抓出「根本没写」「写错容器」「基线取错元素」三类问题。
 */

const ROUTES = [
  '/items', '/furniture', '/equip', '/heroes', '/pets', '/monsters', '/tasks',
  '/events', '/exchange', '/recipes', '/achievement', '/petseggs',
  '/dungeons', '/runes', '/rewards', '/facilities',
  '/facilities?facility=camp&mode=building',
  '/facilities?facility=camp&mode=research',
  '/chapters?view=list'
]

// 有意豁免的页面：邮件阅读器是固定阅读区布局（.app-container.is-mail-reader
// 设 overflow:hidden），没有页面级滚动，因此不需要裁切。
const EXEMPT = ['/partner-mails']

test.beforeEach(async ({ page }) => {
  await page.route('**/data/notice.json*', route => route.fulfill({ json: { notices: [] } }))
})

async function clipState(page) {
  return page.evaluate(() => {
    const pv = document.querySelector('.page-view-container')
    if (!pv) return { noPage: true }
    const filter = pv.querySelector(':scope > [data-sticky-filter]')
    const scrollers = [...pv.querySelectorAll('[data-main-scroll]')]
    const s = scrollers[0] || null
    return {
      hasFilter: !!filter,
      scrollerCount: scrollers.length,
      filterBottom: filter ? Math.round(filter.getBoundingClientRect().bottom) : null,
      scrollerTop: s ? Math.round(s.getBoundingClientRect().top) : null,
      clipVar: s ? getComputedStyle(s).getPropertyValue('--sticky-clip-top').trim() : null
    }
  })
}

for (const route of ROUTES) {
  test(`吸顶裁切生效：${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/#${route}`)

    // 等页面真正渲染出内容容器
    await expect(page.locator('.page-view-container [data-main-scroll]').first()).toBeAttached({
      timeout: 20_000
    })
    await page.waitForTimeout(400)

    // 🔴 约定 1：筛选框必须在页面根的直接子级（App.vue 用 :scope > 取）
    const initial = await clipState(page)
    expect(initial.hasFilter, `${route} 的 UiFilterPanel 不是 .page-view-container 直接子级`).toBe(true)
    expect(initial.scrollerCount, `${route} 找不到 [data-main-scroll] 容器`).toBeGreaterThan(0)

    // 🔴 约定 2：滚动必须真的发生（否则裁切量本就是 0，测不出问题）
    const scrollTop = await page.evaluate(() => {
      const app = document.querySelector('.app-container')
      app.scrollTop = 400
      return app.scrollTop
    })
    expect(scrollTop, `${route} 页面不可滚动，无法验证吸顶裁切`).toBeGreaterThan(0)
    await page.waitForTimeout(400)

    // 🔴 约定 3：写入值 == 期望值（筛选框底边 − 容器顶边）
    const s = await clipState(page)
    const expected = Math.max(0, s.filterBottom - s.scrollerTop)
    const actual = Number.parseFloat(s.clipVar)

    expect(Number.isFinite(actual), `${route} 未写入 --sticky-clip-top（值=${s.clipVar}）`).toBe(true)
    expect(
      Math.abs(actual - expected),
      `${route} 裁切量不符：期望 ${expected}px，实际 ${s.clipVar}\n` +
        `  筛选框底边=${s.filterBottom} 容器顶边=${s.scrollerTop}\n` +
        '  检查：筛选框是否 UiFilterPanel 且为页面根直接子级；内容容器是否带 data-main-scroll'
    ).toBeLessThanOrEqual(1)
  })
}

for (const route of EXEMPT) {
  test(`有意豁免（无页面级滚动，不需裁切）：${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/#${route}`)
    await expect(page.locator('.page-view-container')).toBeAttached({ timeout: 20_000 })
    await page.waitForTimeout(400)

    const state = await page.evaluate(() => {
      const app = document.querySelector('.app-container')
      const pv = document.querySelector('.page-view-container')
      return {
        isMailReader: app.classList.contains('is-mail-reader'),
        overflow: getComputedStyle(app).overflowY,
        scrollerCount: pv.querySelectorAll('[data-main-scroll]').length
      }
    })

    // 豁免的前提必须同时成立：确实是邮件阅读器布局、外层确实不滚、确实没有页面级滚动容器
    expect(state.isMailReader, `${route} 不再是 is-mail-reader 布局，豁免不再适用`).toBe(true)
    expect(state.overflow, `${route} 外层恢复可滚，豁免不再适用`).toBe('hidden')
    expect(state.scrollerCount, `${route} 出现页面级滚动容器，豁免不再适用`).toBe(0)
  })
}

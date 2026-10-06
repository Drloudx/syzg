/**
 * 后台的真浏览器验收测试。
 *
 * 覆盖 M7 的核心：**令牌闸门 → 概览 → 评论 → 用户**。
 *
 * 这里不只是"页面有没有崩"：
 *   - 令牌闸门要能**真的挡住错令牌**（不是填了就放行）；
 *   - 概览里的数字要来自**真实接口**（所以先造一条评论 + 一个用户）；
 *   - 评论列表要真的列出刚造的那条；
 *   - 用户列表要能按编号搜到刚造的那个人（用户反馈时报的就是编号）。
 *
 * 前置：Playwright 的 webServer 会起 Vite 与 API（见 `playwright.config.js`）。
 */

import { expect, test } from '@playwright/test'

import { createAccount, postComment } from '../helpers/accountApi.mjs'
import { createCodeReader, readDevVars } from '../helpers/localD1.mjs'

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8788'

const reader = createCodeReader()
const devVars = readDevVars()
const ADMIN_TOKEN = devVars.ADMIN_TOKEN

test.afterAll(() => {
  reader.close()
})

const stamp = Date.now().toString(36)
/** 每次调用都不同：`stamp` 是模块级的，同一轮里几次搜索会撞车 */
let uniq = 0
const nextTag = () => `${stamp}-${++uniq}`

test.beforeAll(() => {
  if (!ADMIN_TOKEN) throw new Error('.dev.vars 里没有 ADMIN_TOKEN，后台测试无法进行')
})

/**
 * 打开后台。
 *
 * ## 为什么只 `goto` 一次
 *
 * 原来是「先 `goto('/')` → 清 localStorage → 再 `goto('/#/admin')`」。
 * 第二步是**同文档的 hash 变化**，不会重新加载页面 —— 于是它要等首页
 * （物品图鉴，主线程忙着加载一大堆数据）先跑完，路由才轮得到切换。
 * 表现是偶发地等不到 `.admin-shell`（实测两条测试挂在这里）。
 *
 * 而且那步清理**本来就是多余的**：Playwright 给每个测试一个全新 context，
 * `localStorage` 从一开始就是空的。
 */
async function openAdmin(page, path = '/#/admin') {
  await page.goto(path)
  await expect(page.locator('.admin-shell')).toBeVisible({ timeout: 30_000 })
}

/** 填令牌并进入 */
async function enterToken(page, token = ADMIN_TOKEN) {
  await page.locator('.admin-gate input').fill(token)
  await page.locator('.admin-gate .admin-btn').click()
}

test('后台是独立外壳：盖住站点头部与侧栏', async ({ page }) => {
  await openAdmin(page)

  // 外壳铺满视口，且 z-index 要高于站点顶栏（10000）、低于全局弹窗（12000）
  const shell = page.locator('.admin-shell')
  const box = await shell.boundingBox()
  const viewport = page.viewportSize()
  expect(Math.round(box.width)).toBe(viewport.width)
  expect(Math.round(box.height)).toBe(viewport.height)

  const z = await shell.evaluate((el) => Number(getComputedStyle(el).zIndex))
  expect(z).toBe(11000)

  // 站点的头部仍在 DOM 里，但被外壳盖住 —— 用命中测试确认它点不到
  const headerCovered = await page.evaluate(() => {
    const header = document.querySelector('.app-header')
    if (!header) return true
    const r = header.getBoundingClientRect()
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return !header.contains(hit)
  })
  expect(headerCovered, '站点顶栏不该还能被点到').toBe(true)

  await expect(page.locator('.admin-brand')).toContainText('后台')
})

test('令牌闸门：错令牌进不去，且不会把错的留下来', async ({ page }) => {
  await openAdmin(page)

  // 闸门页只该有输入框，不该露出页签
  await expect(page.locator('.admin-gate')).toBeVisible()
  await expect(page.locator('.admin-tabs')).toHaveCount(0)

  await enterToken(page, 'definitely-not-the-token')
  await expect(page.locator('.admin-error')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.admin-gate')).toBeVisible()

  // 错令牌不能被持久化（否则下次进来会带着一个错的）
  const stored = await page.evaluate(() => localStorage.getItem('myrzg:admin-token'))
  expect(stored).toBeNull()

  // 换对的就能进
  await enterToken(page)
  await expect(page.locator('.admin-tabs')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.admin-gate')).toHaveCount(0)
})

test('概览：数字与图表来自真实接口', async ({ page }) => {
  // 先造点数据，否则"今日评论 0"也能通过，测不出接口是否真的被读
  const who = await createAccount(API_BASE, reader)
  const body = `后台概览测试 ${stamp}`
  await postComment(API_BASE, who.token, { body })

  await openAdmin(page)
  await enterToken(page)

  const cards = page.locator('.stat-card')
  await expect(cards).toHaveCount(4, { timeout: 20_000 })

  // 「注册用户」的今日数至少是 1（刚造了一个）
  await expect(page.locator('.stat-card', { hasText: '注册用户' })).toBeVisible()
  const usersToday = await page.locator('.stat-card', { hasText: '注册用户' }).innerText()
  expect(usersToday).toMatch(/今日 \+[1-9]\d*/)

  // 近 7 天有 7 根柱子
  await expect(page.locator('.chart-col')).toHaveCount(7)

  // 待审那张卡应该能点进去（有待审时才有链接）
  const alertCard = page.locator('.stat-card.is-alert')
  if (await alertCard.count()) {
    await expect(alertCard.locator('.stat-link')).toHaveAttribute('href', /#\/admin\/comments/)
  }
})

test('评论页：列出真实评论，能切筛选', async ({ page }) => {
  const who = await createAccount(API_BASE, reader)
  /*
   * 🔴 正文里带一个**本轮唯一**的标记。
   *
   * 原来只用了模块级的 `stamp`，而它是 `Date.now().toString(36)` ——
   * 同一时间窗内跑过的其它测试（真机流程、上一次跑）会产生**同样的前缀**，
   * 于是"搜这一条"会搜出两条来（实测收到 2，断言写的 1）。
   * 搜索类断言必须拿一个**只可能属于这一条**的串。
   */
  const tag = nextTag()
  const body = `后台评论测试 ${tag}`
  await postComment(API_BASE, who.token, { body })

  await openAdmin(page, '/#/admin/comments')
  await enterToken(page)

  // 默认在「待审」档 —— 刚发的这条是正常评论（status=1），不该出现在这里
  await expect(page.locator('.admin-chip.is-on')).toHaveText(/待审/)

  // 切到「全部」才该看到它
  await page.locator('.admin-chip', { hasText: '全部' }).click()
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.admin-table')).toContainText(body)

  // 搜索：搜那个只属于这一条的串
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn', { hasText: '搜索' }).click()
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1, { timeout: 20_000 })
  await expect(page.locator('.admin-table')).toContainText(body)
})

test('用户页：按对外编号能搜到，能切状态档', async ({ page }) => {
  const who = await createAccount(API_BASE, reader)

  await openAdmin(page, '/#/admin/users')
  await enterToken(page)

  // 默认「正常」档
  await expect(page.locator('.admin-chip.is-on')).toHaveText('正常')
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible({ timeout: 20_000 })

  /*
   * 🔴 按**对外编号**搜 —— 用户来反馈时报的就是这 5 位，不是内部 id。
   *
   * ⚠️ 字段名是 `user.id` 而**不是** `user.publicNo`：公开接口里
   * `toPublicUser()` 把 `id` 映射成了 `public_no`（内部自增 id 刻意不外露）。
   * 管理端接口才另外给 `publicNo`。这里读的是注册接口的返回值，所以用 `id`。
   */
  const publicNo = who.user.id
  expect(String(publicNo), '公开接口的 user.id 应当就是 5 位对外编号').toMatch(/^\d{5}$/)

  await page.locator('.admin-search').fill(String(publicNo))
  await page.locator('.admin-btn', { hasText: '搜索' }).click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText(who.nick)
  await expect(row).toContainText(String(publicNo))
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)

  // 操作按钮在位（封禁 / 彻底删除）—— 都在 confirm 后面，这里只确认入口存在
  await expect(row.locator('.admin-btn', { hasText: '封禁' })).toBeVisible()
  await expect(row.locator('.admin-btn', { hasText: '彻底删除' })).toBeVisible()
})

test('三个页签是子路由：刷新与直达都正常', async ({ page }) => {
  await openAdmin(page)
  await enterToken(page)

  await page.locator('.admin-tab', { hasText: '用户' }).click()
  await expect(page).toHaveURL(/#\/admin\/users/)
  await expect(page.locator('.admin-chip.is-on')).toHaveText('正常')

  // 直接刷新：令牌已存，不该再回闸门
  await page.reload()
  await expect(page.locator('.admin-table')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.admin-gate')).toHaveCount(0)

  await page.locator('.admin-tab', { hasText: '评论' }).click()
  await expect(page).toHaveURL(/#\/admin\/comments/)

  // 点标题回概览
  await page.locator('.admin-tab', { hasText: '概览' }).click()
  await expect(page).toHaveURL(/#\/admin$/)
  await expect(page.locator('.stat-card')).toHaveCount(4, { timeout: 20_000 })
})

test('退出后台：清掉令牌并回到闸门', async ({ page }) => {
  await openAdmin(page)
  await enterToken(page)
  await expect(page.locator('.admin-tabs')).toBeVisible({ timeout: 20_000 })

  await page.locator('.admin-quiet-btn', { hasText: '退出' }).click()
  await expect(page.locator('.admin-gate')).toBeVisible()
  await expect(page.locator('.admin-tabs')).toHaveCount(0)

  const stored = await page.evaluate(() => localStorage.getItem('myrzg:admin-token'))
  expect(stored).toBeNull()
})

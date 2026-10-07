/**
 * 后台的真浏览器验收测试。
 *
 * 覆盖 M7 的核心：**权限闸门 → 概览 → 评论 → 用户 → 审计**。
 *
 * 这里不只是"页面有没有崩"：
 *   - 权限闸门要能**真的挡住非管理员**（不是有会话就放行）；
 *   - 概览里的数字要来自**真实接口**（所以先造一条评论 + 一个用户）；
 *   - 评论列表要真的列出刚造的那条；
 *   - 用户列表要能按编号搜到刚造的那个人（用户反馈时报的就是编号）。
 *
 * ## 鉴权（2026-10-07 改）
 *
 * 旧实现是"填管理令牌 → localStorage"。现在是**看登录账号的 `users.role`**，
 * 所以测试不再"填令牌"，而是**注入一个管理员会话**到 `localStorage`：
 * 先经 API 建号 → 直接把库里 role 改成超管 → 把 `{token, user}` 写进
 * `myrzg:auth`（与 `authSession.persist()` 同一形状）。
 *
 * 前置：Playwright 的 webServer 会起 Vite 与 API（见 `playwright.config.js`）。
 */

import { expect, test } from '@playwright/test'

import { createAccount, postComment } from '../helpers/accountApi.mjs'
import { createCodeReader, openLocalD1Writable } from '../helpers/localD1.mjs'

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8788'

const reader = createCodeReader()

test.afterAll(() => {
  reader.close()
})

const stamp = Date.now().toString(36)
/** 每次调用都不同：`stamp` 是模块级的，同一轮里几次搜索会撞车 */
let uniq = 0
const nextTag = () => `${stamp}-${++uniq}`

/** 把某个账号的角色直接写进库（生产上超管只能这样产生，接口拒绝 role=2） */
function setRoleDirect(email, role) {
  const db = openLocalD1Writable()
  try {
    const row = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email)
    if (!row) throw new Error(`找不到账号 ${email}`)
    db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, row.id)
    return row.id
  } finally {
    db.close()
  }
}

/**
 * 造一个管理员账号并返回它的会话（供注入浏览器）。
 *
 * `role` 默认 2（超管）—— 因为绝大多数用例要验"能改角色"这类超管专属能力。
 * 需要验"管理员看不到角色按钮"时传 1。
 */
async function makeAdmin(role = 2) {
  const acc = await createAccount(API_BASE, reader, { nick: `后台${nextTag().slice(-6)}` })
  setRoleDirect(acc.email, role)
  /*
   * ⚠️ `createAccount` 返回的 `user` 是**注册那一刻**的形状，里面 `role` 还是 0。
   * 注入 localStorage 后前端会拿它判断"显不显示审计页签"，所以这里必须**同步改掉**，
   * 否则超管登录后看不到审计入口（而服务端其实允许）。
   */
  return { ...acc, user: { ...acc.user, role } }
}

/**
 * 打开后台，并把会话注入 localStorage。
 *
 * 🔴 **必须用 `addInitScript`，不能"先 goto 再 evaluate 写 localStorage"**：
 * `page.goto('/')` 之后再 `goto('/#/admin')` 只是**同文档的 hash 变化**，
 * 页面不会重新加载 —— 应用早在那之前就 `restoreSession()` 过了（当时 localStorage 是空的），
 * 于是注入的会话永远读不到，表现为"管理员却进不去后台"。
 *
 * `addInitScript` 会在**每次导航、页面脚本之前**执行，所以无论后续怎么跳都能生效。
 * 这也让它对 reload / 前进后退都稳定。
 */
async function openAdminAs(page, admin, path = '/#/admin') {
  await page.addInitScript(
    ({ token, user }) => {
      try {
        localStorage.setItem('myrzg:auth', JSON.stringify({ token, user }))
      } catch {
        /* 隐私模式下写不了，测试会以闸门未通过的形式失败 */
      }
    },
    { token: admin.token, user: admin.user }
  )
  await page.goto(path)
  await expect(page.locator('.admin-shell')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.admin-tabs')).toBeVisible({ timeout: 20_000 })
}

/** 打开后台但**不注入会话**（用来验闸门） */
async function openAdminAnon(page, path = '/#/admin') {
  await page.goto(path)
  await expect(page.locator('.admin-shell')).toBeVisible({ timeout: 30_000 })
}

test('后台是独立外壳：盖住站点头部与侧栏', async ({ page }) => {
  const admin = await makeAdmin()
  await openAdminAs(page, admin)

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

test('权限闸门：未登录 / 非管理员都进不去，管理员能进', async ({ page }) => {
  // 1) 完全没登录 → 闸门显示，且不露出页签
  await openAdminAnon(page)
  await expect(page.locator('.admin-gate')).toBeVisible()
  await expect(page.locator('.admin-tabs')).toHaveCount(0)
  await expect(page.locator('.admin-gate-title')).toContainText('需要先登录')

  /*
   * 2) 🔴 **登录了但不是管理员** —— 这是最容易漏的一条。
   * 鉴权写成"有会话就放行"时，未登录仍会 401（看起来是对的），
   * 但任何登录用户都能进后台。这里专门用普通账号验一遍。
   *
   * 用 `addInitScript` 注入（见 openAdminAs 的说明：hash 跳转不会重载页面）。
   */
  const plain = await createAccount(API_BASE, reader)
  /*
   * ⚠️ 注入普通用户的会话后**必须 `reload`**。
   *
   * 上一步 `openAdminAnon` 已经 `goto('/#/admin')` 过一次 —— 应用那时已跑完
   * `restoreSession()`（当时未登录），闸门标题停在「需要先登录」。
   * 之后 `goto('/#/admin')` 是**同文档 hash 变化**，不会重新加载，
   * 闸门不会重算，标题自然还是旧的。用 `addInitScript` + `reload` 才生效。
   */
  await page.addInitScript(
    ({ token, user }) => localStorage.setItem('myrzg:auth', JSON.stringify({ token, user })),
    { token: plain.token, user: plain.user }
  )
  await page.reload()
  await expect(page.locator('.admin-gate-title')).toContainText('不是管理员', { timeout: 20_000 })
  await expect(page.locator('.admin-tabs')).toHaveCount(0)

  // 3) 换成管理员会话 → 直接进（无需任何"填令牌"步骤）
  const admin = await makeAdmin()
  await page.addInitScript(
    ({ token, user }) => localStorage.setItem('myrzg:auth', JSON.stringify({ token, user })),
    { token: admin.token, user: admin.user }
  )
  await page.reload()
  await expect(page.locator('.admin-tabs')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.admin-gate')).toHaveCount(0)
})

test('概览：数字与图表来自真实接口', async ({ page }) => {
  // 先造点数据，否则"今日评论 0"也能通过，测不出接口是否真的被读
  const who = await createAccount(API_BASE, reader)
  const body = `后台概览测试 ${stamp}`
  await postComment(API_BASE, who.token, { body })

  const admin = await makeAdmin()
  await openAdminAs(page, admin)

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

  const adminComments = await makeAdmin()
  await openAdminAs(page, adminComments, '/#/admin/comments')

  // 默认在「待审」档 —— 刚发的这条是正常评论（status=1），不该出现在这里
  await expect(page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip.is-on').first()).toHaveText(/待审/)

  // 切到「全部」才该看到它
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '全部' }).click()
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

  const adminUsers = await makeAdmin()
  await openAdminAs(page, adminUsers, '/#/admin/users')

  // 默认「正常」档
  await expect(page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip.is-on').first()).toHaveText('正常')
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

  // 超管能看到「设为管理员」（该用户是普通用户）
  await expect(row.locator('.admin-btn', { hasText: '设为管理员' })).toBeVisible()
})

test('🔴 角色按钮只有超管看得见（管理员看不到，不是禁用）', async ({ page }) => {
  /*
   * 这条守的是"权限不可见性"：普通管理员**根本不该看到**设/撤管理员按钮，
   * 而不是看到灰色按钮。看到即等于知道"这里能提权"，会诱发试探。
   *
   * ⚠️ 服务端同样会 403（见 tests/api/admin-roles.mjs）——前端隐藏只是体验。
   */
  const target = await createAccount(API_BASE, reader)

  const plainAdmin = await makeAdmin(1)
  await openAdminAs(page, plainAdmin, '/#/admin/users')

  await page.locator('.admin-search').fill(String(target.user.id))
  await page.locator('.admin-btn', { hasText: '搜索' }).click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })

  await expect(row.locator('.admin-btn', { hasText: '设为管理员' })).toHaveCount(0)
  await expect(row.locator('.admin-btn', { hasText: '撤销管理员' })).toHaveCount(0)
  // 但常规管理按钮要在（否则说明是整行没渲染，而不是"角色按钮被藏了"）
  await expect(row.locator('.admin-btn', { hasText: '封禁' })).toBeVisible()

  // 审计页签也只给超管
  await expect(page.locator('.admin-tab', { hasText: '审计' })).toHaveCount(0)
})

test('🔴 自己那一行不给操作按钮（防手滑自锁）', async ({ page }) => {
  /*
   * 这条守的是一个**量纲不一致**的坑：管理端列表的 `u.id` 是**内部自增 id**，
   * 而 `currentUser.id` 是**对外编号**（`toPublicUser` 把 `public_no` 映射成 `id`）。
   * 两者直接比较永远不相等 —— 于是"不能操作自己"在界面上完全失效：
   * 超管会看到自己那行也有「封禁/彻底删除」，点了才被服务端 403 拦下。
   *
   * 后端是稳的（没有安全问题），但界面在骗人，所以这条断在 UI 层。
   */
  const admin = await makeAdmin(2)
  await openAdminAs(page, admin, '/#/admin/users')

  await page.locator('.admin-search').fill(String(admin.user.id))
  await page.locator('.admin-btn', { hasText: '搜索' }).click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText(admin.user.nick)

  /*
   * 自己那一行的常规按钮是**禁用**（`disabled`）而不是不渲染 —— 这是刻意的：
   * 行内其它信息（状态、角色）对自己仍有参考价值，整行藏掉反而看不出"我是谁"。
   * 关键是它们**点不动**，所以断 `disabled`。
   *
   * ⚠️ 角色按钮（设为/撤销管理员）则是**不渲染** —— 那属于"不该看到的权限设置"，
   * 与"看得到但点不动"是两种不同的处理，别混。
   */
  await expect(row.locator('.admin-btn', { hasText: '封禁' })).toBeDisabled()
  await expect(row.locator('.admin-btn', { hasText: '彻底删除' })).toBeDisabled()
  await expect(row.locator('.admin-btn', { hasText: '设为管理员' })).toHaveCount(0)
  await expect(row.locator('.admin-btn', { hasText: '撤销管理员' })).toHaveCount(0)
})

test('超管能把普通用户设为管理员，并记入审计', async ({ page }) => {
  const target = await createAccount(API_BASE, reader)
  const admin = await makeAdmin(2)
  await openAdminAs(page, admin, '/#/admin/users')

  await page.locator('.admin-search').fill(String(target.user.id))
  await page.locator('.admin-btn', { hasText: '搜索' }).click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText('普通用户')

  // 确认框会自动接受
  page.once('dialog', (d) => d.accept())
  await row.locator('.admin-btn', { hasText: '设为管理员' }).click()

  // 列表重拉后该行应显示「管理员」，且按钮变成「撤销管理员」
  await expect(row).toContainText('管理员', { timeout: 20_000 })
  await expect(row.locator('.admin-btn', { hasText: '撤销管理员' })).toBeVisible()

  // 审计里应出现这条记录
  await page.goto('/#/admin/audit')
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.admin-table')).toContainText('变更角色')
})

test('评论页：能按页面类型筛选', async ({ page }) => {
  const who = await createAccount(API_BASE, reader)
  const tag = nextTag()
  await postComment(API_BASE, who.token, { body: `讨论区筛选 ${tag}` })

  const admin = await makeAdmin()
  await openAdminAs(page, admin, '/#/admin/comments')

  // 切到「已显示」档才能看到刚发的这条
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '已显示' }).click()
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible({ timeout: 20_000 })

  // 页面类型那一排是横排按钮（不是下拉）
  const kindChips = page.locator('.admin-toolbar--kinds .admin-chip')
  await expect(kindChips.first()).toHaveText('全部页面')
  await expect(page.locator('.admin-toolbar--kinds select')).toHaveCount(0)

  // 筛「物品」时，站内讨论区那条不该出现
  await page.locator('.admin-toolbar--kinds .admin-chip', { hasText: '物品' }).click()
  await page.waitForTimeout(1500)
  const bodyText = await page.locator('.admin-card').innerText()
  expect(bodyText, '筛物品时不该出现站内讨论区的评论').not.toContain(`讨论区筛选 ${tag}`)

  // 筛回「站内讨论区」时它应该在
  await page.locator('.admin-toolbar--kinds .admin-chip', { hasText: '站内讨论区' }).click()
  await expect(page.locator('.admin-card')).toContainText(`讨论区筛选 ${tag}`, { timeout: 20_000 })
})

test('三个页签是子路由：刷新与直达都正常', async ({ page }) => {
  const adminX = await makeAdmin()
  await openAdminAs(page, adminX)

  await page.locator('.admin-tab', { hasText: '用户' }).click()
  await expect(page).toHaveURL(/#\/admin\/users/)
  await expect(page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip.is-on').first()).toHaveText('正常')

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

test('退出后台：离开后台视图，但不动用户登录态', async ({ page }) => {
  const adminX = await makeAdmin()
  await openAdminAs(page, adminX)
  await expect(page.locator('.admin-tabs')).toBeVisible({ timeout: 20_000 })

  await page.locator('.admin-quiet-btn', { hasText: '退出' }).click()

  /*
   * 🔴 "退出后台"与"退出登录"是**两件事**：
   * 前者只是离开 /admin（用户可能还要继续用图鉴、发评论），
   * 后者才清会话。所以这里断言**会话仍在**，而不是被清掉。
   *
   * 不用 `toHaveURL` 断具体路径：`onLogout` 走的是 `router.replace('/')`，
   * 而 hash 路由下根路径可能表现为 `#/` 或 `#/`（尾斜杠差异），
   * 断"后台外壳已消失"比断 URL 字符串更贴近真正要验的东西。
   */
  await expect(page.locator('.admin-shell')).toHaveCount(0, { timeout: 15_000 })
  const stored = await page.evaluate(() => localStorage.getItem('myrzg:auth'))
  expect(stored, '退出后台不该清掉登录态').not.toBeNull()

  // 再进后台仍能直接进（因为会话还在、角色还在）
  await page.goto('/#/admin')
  await expect(page.locator('.admin-tabs')).toBeVisible({ timeout: 20_000 })
})

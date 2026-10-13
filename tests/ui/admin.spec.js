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

import { api, createAccount, postComment } from '../helpers/accountApi.mjs'
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
  /*
   * 断言导航**已存在**（`attached`），不是 `visible`。
   *
   * 🔴 为什么不能用 `toBeVisible`：手机端（≤900px）导航是**抽屉** ——
   * `.admin-side-nav` 用 `transform: translateX(-105%)` 移出视口，
   * 等展开才滑入。元素确实在 DOM 里、也确实可用（点汉堡展开即可），
   * 但 Playwright 的 `visible` 判据要求"有非空包围盒并且不被移出"，
   * 于是手机项目下必然超时。
   *
   * 测试关心的语义是「后台已就绪、权限闸门已通过」，与导航放顶部、
   * 放左侧、还是收进抽屉无关 —— 所以判 `attached`。
   */
  await expect(page.locator('[data-admin-nav]')).toBeAttached({ timeout: 20_000 })
}

/**
 * 点后台导航项。
 *
 * 🔴 手机端（≤900px）导航收在**汉堡抽屉**里（`.admin-side-nav` 用
 * `transform: translateX(-105%)` 移出视口），必须先点汉堡展开才能点到链接；
 * 桌面端侧栏常驻，没有汉堡。所以这里按「汉堡可见就点它」自适应，
 * 让同一段用例在两种布局下都走**真实交互路径**。
 */
async function clickNav(page, label) {
  const burger = page.locator('.admin-menu-toggle-btn')
  if (await burger.isVisible().catch(() => false)) {
    await burger.click()
    await expect(page.locator('.admin-side-nav')).toHaveClass(/is-mobile-open/, { timeout: 10_000 })
  }
  await page.locator('.nav-item', { hasText: label }).click()
}

/** 打开后台但**不注入会话**（用来验闸门） */
async function openAdminAnon(page, path = '/#/admin') {
  await page.goto(path)
  await expect(page.locator('.admin-shell')).toBeVisible({ timeout: 30_000 })
}

test('🔴 设置菜单里的「后台管理」只对管理员显示', async ({ page }) => {
  /*
   * 此前进后台**必须手输 `#/admin`** —— 没有任何界面入口。
   * 有了角色概念后就该让管理员点得到，而普通用户根本不该看到这一项。
   *
   * ⚠️ 这只是入口可见性，不是权限：真正的准入在服务端（`adminSession`）。
   */
  const plain = await createAccount(API_BASE, reader)
  await page.addInitScript(
    ({ token, user }) => localStorage.setItem('myrzg:auth', JSON.stringify({ token, user })),
    { token: plain.token, user: plain.user }
  )
  await page.goto('/#/items')
  await page.locator('button[title="设置"]').click()
  await expect(page.locator('.settings-dropdown')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.dropdown-item', { hasText: '后台管理' })).toHaveCount(0)

  // 换管理员：入口应出现，且点得进后台
  const admin = await makeAdmin(1)
  await page.addInitScript(
    ({ token, user }) => localStorage.setItem('myrzg:auth', JSON.stringify({ token, user })),
    { token: admin.token, user: admin.user }
  )
  await page.reload()
  await page.locator('button[title="设置"]').click()
  const entry = page.locator('.dropdown-item', { hasText: '后台管理' })
  await expect(entry).toBeVisible({ timeout: 15_000 })
  await entry.click()
  await expect(page.locator('[data-admin-nav]')).toBeAttached({ timeout: 20_000 })
})

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

  // 品牌区：改版后标题与徽章是两个元素（原 `.admin-brand` 已不存在）
  await expect(page.locator('.brand-title')).toContainText('Admin')
  await expect(page.locator('.brand-badge')).toContainText('深渊大书院')
})

test('权限闸门：未登录 / 非管理员都进不去，管理员能进', async ({ page }) => {
  // 1) 完全没登录 → 闸门显示，且不露出页签
  await openAdminAnon(page)
  await expect(page.locator('.admin-gate')).toBeVisible()
  await expect(page.locator('[data-admin-nav]')).toHaveCount(0)
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
  await expect(page.locator('[data-admin-nav]')).toHaveCount(0)

  // 3) 换成管理员会话 → 直接进（无需任何"填令牌"步骤）
  const admin = await makeAdmin()
  await page.addInitScript(
    ({ token, user }) => localStorage.setItem('myrzg:auth', JSON.stringify({ token, user })),
    { token: admin.token, user: admin.user }
  )
  await page.reload()
  await expect(page.locator('[data-admin-nav]')).toBeAttached({ timeout: 20_000 })
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
  /*
   * 「注册用户」那张卡的今日新增至少是 1（刚造了一个）。
   *
   * ⚠️ 手机端 `.stat-sub`（含「今日 +N」）被 CSS 隐藏以省空间，
   *    `innerText` 只返回可见文本，于是取不到那串。这里改读
   *    `textContent`（不受可见性影响），mobile / desktop 都能断言同一件事。
   */
  const usersToday = await page.locator('.stat-card', { hasText: '注册用户' }).evaluate(el => el.textContent)
  expect(usersToday).toMatch(/今日 \+[1-9]\d*/)

  // 近 7 天有 7 根柱子
  await expect(page.locator('.chart-col')).toHaveCount(7)

  /*
   * 待审那张卡应该能点进去（有待审时整卡变 RouterLink）。
   *
   * ⚠️ 改版后卡片本身就是链接（`.stat-card--clickable`），不再有内嵌的
   *  `.stat-link` 元素；提示文案改成 `.stat-link-text`（span，无 href）。
   * 所以断言对象从「内层链接的 href」换成「整卡是 a 且 href 指向评论页」。
   */
  const alertCard = page.locator('.stat-card.stat-card--alert')
  if (await alertCard.count()) {
    await expect(alertCard).toHaveAttribute('href', /#\/admin\/comments/)
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
    /*
   * ⚠️ 评论面板的「搜索」与「清除」**共用** `.admin-btn--search` 类，
   * 只写类名会命中两个元素（strict mode violation）。按文案收窄到「搜索」。
   */
await page.locator('.admin-btn--search', { hasText: '搜索' }).click()
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1, { timeout: 20_000 })
  await expect(page.locator('.admin-table')).toContainText(body)
})

test('用户页：按对外编号能搜到，能切状态档', async ({ page }) => {
  const who = await createAccount(API_BASE, reader)

  const adminUsers = await makeAdmin()
  await openAdminAs(page, adminUsers, '/#/admin/users')

  /*
   * 🔴 状态档从「胶囊按钮」改成了 `<select>` 下拉（2026-10-13 改版），
   * 且**默认值是空（全部状态）**，不再是原来的「正常」档。
   *
   * 判据相应改为「下拉存在、默认选中全部状态」，并显式切到「正常」再断言列表。
   */
  const statusSelect0 = page.locator('.toolbar-filter-row select.select-dropdown').first()
  await expect(statusSelect0).toHaveValue('')
  await statusSelect0.selectOption('1')
  await expect(statusSelect0).toHaveValue('1')
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
  await page.locator('.btn-search').click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText(who.nick)
  await expect(row).toContainText(String(publicNo))
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)

  // 操作按钮在位（封禁 / 彻底删除）—— 都在 confirm 后面，这里只确认入口存在
  await expect(row.locator('.action-link', { hasText: '封禁' })).toBeVisible()
  await expect(row.locator('.action-link', { hasText: '删除' })).toBeVisible()

  // 超管能看到「设为管理员」（该用户是普通用户）
  await expect(row.locator('.action-link', { hasText: '设为管理员' })).toBeVisible()
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
  await page.locator('.btn-search').click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })

  await expect(row.locator('.action-link', { hasText: '设为管理员' })).toHaveCount(0)
  await expect(row.locator('.action-link', { hasText: '撤销管理' })).toHaveCount(0)
  // 但常规管理按钮要在（否则说明是整行没渲染，而不是"角色按钮被藏了"）
  await expect(row.locator('.action-link', { hasText: '封禁' })).toBeVisible()

  // 审计页签也只给超管
  await expect(page.locator('.nav-item', { hasText: '审计' })).toHaveCount(0)
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
  await page.locator('.btn-search').click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText(admin.user.nick)

  /*
   * 自己那一行的常规操作**存在但点不动** —— 这是刻意的：
   * 行内其它信息（状态、角色）对自己仍有参考价值，整行藏掉反而看不出"我是谁"。
   *
   * ⚠️ 2026-10-13 改版后行内操作从 `<button disabled>` 换成了
   * `<span class="action-link action-link--disabled">`（不是表单控件，
   * 没有 `disabled` 属性），故判据从 `toBeDisabled()` 换成**断言 disabled 类**。
   * 这仍是"存在但不可用"的等价判据 —— 点了不会有任何动作（`@click` 里
   * `canModerate(u) &&` 短路）。
   *
   * ⚠️ 角色操作（设为/撤销管理员）则是**不渲染** —— 那属于"不该看到的权限设置"，
   * 与"看得到但点不动"是两种不同的处理，别混。
   */
  await expect(row.locator('.action-link', { hasText: '封禁' })).toHaveClass(/action-link--disabled/)
  await expect(row.locator('.action-link', { hasText: '删除' })).toHaveClass(/action-link--disabled/)
  await expect(row.locator('.action-link', { hasText: '设为管理员' })).toHaveCount(0)
  await expect(row.locator('.action-link', { hasText: '撤销管理' })).toHaveCount(0)
})

test('超管能把普通用户设为管理员，并记入审计', async ({ page }) => {
  const target = await createAccount(API_BASE, reader)
  const admin = await makeAdmin(2)
  await openAdminAs(page, admin, '/#/admin/users')

  await page.locator('.admin-search').fill(String(target.user.id))
  await page.locator('.btn-search').click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText('普通用户')

  /*
   * 🔴 角色变更现在走 UiModal 自定义确认（2026-10-13 起不再用原生 window.confirm）。
   * 原先挂 `page.once('dialog')` 是不够的 —— 没有原生弹窗，点击后
   * 只是打开了确认框，`onConfirmAccept` 从未触发，列表也不会重拉。
   * 确认按钮文案来自 `confirmText`：设为管理员时为「设为管理员」。
   */
  await row.locator('.action-link', { hasText: '设为管理员' }).click()
  await page.locator('.admin-modal-window, .ui-modal-window').locator('.admin-btn', { hasText: '设为管理员' }).last().click()

  // 列表重拉后该行应显示「管理员」，且按钮变成「撤销管理员」
  await expect(row).toContainText('管理员', { timeout: 20_000 })
  await expect(row.locator('.action-link', { hasText: '撤销管理' })).toBeVisible()

  // 审计里应出现这条记录
  // ⚠️ 标签文案：`role_set` 的显示名是「变更权限角色」（不是「变更角色」）
  await page.goto('/#/admin/audit')
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.admin-table')).toContainText('变更权限角色')
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
  const bodyText = await page.locator('.admin-workshop').innerText()
  expect(bodyText, '筛物品时不该出现站内讨论区的评论').not.toContain(`讨论区筛选 ${tag}`)

  // 筛回「站内讨论区」时它应该在
  await page.locator('.admin-toolbar--kinds .admin-chip', { hasText: '站内讨论区' }).click()
  await expect(page.locator('.admin-workshop')).toContainText(`讨论区筛选 ${tag}`, { timeout: 20_000 })
})

test('🔴 「转待审」把已处理的评论放回待办队列', async ({ page }) => {
  /*
   * 为什么要有这个按钮：「待审」与「已隐藏」**对外都是不可见**，唯一区别是
   * **算不算进待办**（概览页 `pending > 0` 会描红）。而手动发的评论
   * 之前**没有任何办法进入待审** —— 只有词表命中的会自动进。
   * 于是"这条我拿不准，先挂起"这个动作做不到。
   *
   * 这条测试要验的是**双向**：
   *   1. 已显示的评论能「转待审」；
   *   2. 转过去之后，它**出现在「待审」档**、且**不再出现在「已显示」档**；
   *   3. 概览页的待处理计数**真的 +1**（这是这个状态唯一的实际作用）。
   */
  const who = await createAccount(API_BASE, reader)
  const tag = nextTag()
  await postComment(API_BASE, who.token, { body: `转待审测试 ${tag}` })

  const admin = await makeAdmin()
  await openAdminAs(page, admin, '/#/admin/comments')

  // 先记下当前的待处理数（概览页）
  await page.goto('/#/admin')
  await expect(page.locator('.stat-card').first()).toBeVisible({ timeout: 20_000 })
  const pendingBefore = Number(
    (await page.locator('.stat-card', { hasText: '待审核' }).locator('.stat-value').innerText()).trim()
  )
  expect(Number.isFinite(pendingBefore)).toBe(true)

  // 到「已显示」档找到刚发的那条
  await page.goto('/#/admin/comments')
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '已显示' }).click()
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText(`转待审测试 ${tag}`)
  await expect(row).toContainText('已显示')

  // 点「转待审」→ 弹出原因输入框（不再是 window.confirm）
  await row.locator('.admin-btn', { hasText: '转待审' }).click()
  const noteModal = page.locator('.ui-modal-window', { hasText: '转为待审' })
  await expect(noteModal).toBeVisible({ timeout: 10_000 })
  await noteModal.locator('.admin-btn', { hasText: '确认转待审' }).click()
  await expect(noteModal).toBeHidden({ timeout: 10_000 })

  /*
   * ⚠️ 断言"它不在这一档了"不能写成 `.admin-card` 不含文本：
   * 列表为空时 `.admin-card` **整个不存在**（页面渲染的是「没有匹配的评论。」），
   * 于是 `not.toContainText` 会因为"找不到元素"而失败 —— 明明行为是对的。
   * 改成**数行**：不该有任何一行含这个标记。
   */
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()
  await expect
    .poll(async () => page.locator('.admin-table tbody tr', { hasText: `转待审测试 ${tag}` }).count(), {
      timeout: 20_000
    })
    .toBe(0)

  // 在「待审」档里能找到它，状态显示为待审
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '待审' }).click()
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()
  const pendingRow = page.locator('.admin-table tbody tr').first()
  await expect(pendingRow).toBeVisible({ timeout: 20_000 })
  await expect(pendingRow).toContainText(`转待审测试 ${tag}`)
  await expect(pendingRow).toContainText('待审')

  // 🔴 概览的待处理计数应 +1（这是「待审」唯一的实际作用）
  await page.goto('/#/admin')
  await expect(page.locator('.stat-card').first()).toBeVisible({ timeout: 20_000 })
  const pendingAfter = Number(
    (await page.locator('.stat-card', { hasText: '待审核' }).locator('.stat-value').innerText()).trim()
  )
  expect(pendingAfter, '转待审后待处理计数应 +1').toBe(pendingBefore + 1)
})

test('🔴 「转待审」可填原因，其他管理员能看到', async ({ page }) => {
  /*
   * 这个功能的目的就是**让接手的人不必重新判断一遍**：
   * 甲把一条挂起并写"重复发帖"，乙打开待审档时能直接看到这句话。
   *
   * 所以这里验的是一条完整链路（写进去 → 另一个管理员读出来），
   * 而不只是"弹窗能打开"。
   */
  const who = await createAccount(API_BASE, reader)
  const tag = nextTag()
  const note = `重复发帖，等作者确认 ${tag}`
  await postComment(API_BASE, who.token, { body: `带原因转待审 ${tag}` })

  // 甲：转待审并填原因
  const adminA = await makeAdmin()
  await openAdminAs(page, adminA, '/#/admin/comments')
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '已显示' }).click()
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  // ⚠️ 评论面板的行内操作**仍是** `<button class="admin-btn">`；
  //    改成 `.action-link` 文字链的只有**用户管理面板**，两者别混。
  await row.locator('.admin-btn', { hasText: '转待审' }).click()

  const modal = page.locator('.ui-modal-window', { hasText: '转为待审' })
  await expect(modal).toBeVisible({ timeout: 10_000 })
  // 弹窗里要能看到正文，管理员需要对着原文写原因
  await expect(modal).toContainText(`带原因转待审 ${tag}`)
  await modal.locator('#pending-note').fill(note)
  await modal.locator('.admin-btn', { hasText: '确认转待审' }).click()
  /*
   * 🔴 必须等**遮罩本身**消失，不能只等窗口 hidden。
   * 改版后弹窗用 UiModal + teleport，关闭有过渡动画；`.ui-modal-overlay`
   * 在动画期间仍拦截指针事件，于是紧接着的点击会超时
   * （实测报错：`ui-modal-overlay ... intercepts pointer events`）。
   */
  await expect(modal).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('.ui-modal-overlay')).toHaveCount(0, { timeout: 10_000 })

  /*
   * 乙：**另一个管理员**打开待审档，应当看到这条 + 原因。
   * 用不同的账号是为了确认"原因存在服务端、不是本地状态"。
   */
  const adminB = await makeAdmin()
  const pageB = await page.context().newPage()
  await openAdminAs(pageB, adminB, '/#/admin/comments')
  await pageB.locator('.admin-search').fill(tag)
  await pageB.locator('.admin-btn', { hasText: '搜索' }).click()

  const rowB = pageB.locator('.admin-table tbody tr').first()
  await expect(rowB).toBeVisible({ timeout: 20_000 })
  await expect(rowB).toContainText(`带原因转待审 ${tag}`)
  await expect(rowB).toContainText(`待审原因：${note}`)
  await pageB.close()

  // 原因可留空 & 放行后清空
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '待审' }).click()
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()
  const rowAgain = page.locator('.admin-table tbody tr').first()
  await expect(rowAgain).toBeVisible({ timeout: 20_000 })
  // ⚠️ 放行现在走 UiModal 自定义确认（不再用原生 window.confirm）
  await rowAgain.locator('.admin-btn', { hasText: '放行' }).click()
  await page.locator('.admin-btn', { hasText: '确认放行' }).click()

  // 放行后原因应被清空（状态已定论，留着旧备注会误导后来人）
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '已显示' }).click()
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()
  const rowShown = page.locator('.admin-table tbody tr').first()
  await expect(rowShown).toBeVisible({ timeout: 20_000 })
  await expect(rowShown).not.toContainText('待审原因：')
})

test('🔴 超管可在设置里维护常用选项，管理员转待审时点一下就填', async ({ page }) => {
  /*
   * 完整链路：超管在「设置」里配好常用选项 → **另一个管理员**打开转待审弹窗时
   * 就能看到这些选项、点一下填进输入框。
   *
   * 用两个不同账号是为了确认配置**存在服务端**（不是超管本地的状态）。
   */
  const tag = nextTag()
  const optionA = `重复发帖${tag}`
  const optionB = `外链待确认${tag}`

  // 超管：改常用选项
  //
  // ⚠️ 设置页现在有**两个** `.admin-section-title`（常用选项 + 评论审核词表），
  //    所以这里必须锁定具体那一个，否则 strict mode 会因为匹配到 2 个元素而失败。
  const superA = await makeAdmin(2)
  await openAdminAs(page, superA, '/#/admin/settings')
  await expect(page.locator('.admin-section-title', { hasText: '常用选项' })).toBeVisible({ timeout: 20_000 })

  // 清掉现有行，换成我们这两条
  await page.locator('.admin-preset-line .admin-btn', { hasText: '删除' }).first().click()
  await page.waitForTimeout(200)
  // 逐行删光
  for (let i = 0; i < 25; i++) {
    const del = page.locator('.admin-preset-line .admin-btn', { hasText: '删除' })
    if ((await del.count()) === 0) break
    await del.first().click()
    await page.waitForTimeout(120)
  }
  await page.locator('.admin-btn', { hasText: '添加一项' }).click()
  await page.locator('.admin-preset-line input').first().fill(optionA)
  await page.locator('.admin-btn', { hasText: '添加一项' }).click()
  await page.locator('.admin-preset-line input').nth(1).fill(optionB)
  // ⚠️ 必须用 exact：设置页还有个「保存词表」，子串匹配会命中 2 个按钮
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.admin-saved')).toContainText('已保存', { timeout: 20_000 })

  // 管理员（role=1）：打开转待审弹窗，应看到这两条常用选项
  const who = await createAccount(API_BASE, reader)
  const commentTag = nextTag()
  await postComment(API_BASE, who.token, { body: `常用选项测试 ${commentTag}` })

  const plainAdmin = await makeAdmin(1)
  const page2 = await page.context().newPage()
  await openAdminAs(page2, plainAdmin, '/#/admin/comments')
  await page2.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '已显示' }).click()
  await page2.locator('.admin-search').fill(commentTag)
  await page2.locator('.admin-btn--search').click()

  const row = page2.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.locator('.admin-btn', { hasText: '转待审' }).click()

  const modal = page2.locator('.ui-modal-window', { hasText: '转为待审' })
  await expect(modal).toBeVisible({ timeout: 10_000 })
  // 超管配的两条应当出现
  await expect(modal.locator('.admin-preset-row')).toContainText(optionA)
  await expect(modal.locator('.admin-preset-row')).toContainText(optionB)

  // 点一下 → 填进输入框（仍可自由编辑）
  await modal.locator('.admin-preset-row .admin-chip', { hasText: optionA }).click()
  await expect(modal.locator('#pending-note')).toHaveValue(optionA)

  await modal.locator('.admin-btn', { hasText: '确认转待审' }).click()
  await expect(modal).toBeHidden({ timeout: 10_000 })
  await page2.close()
})

test('🔴 普通管理员看不到「设置」页签', async ({ page }) => {
  // 服务端对写操作强校验（见 tests/api/admin-roles.mjs），前端隐藏只是体验
  const plainAdmin = await makeAdmin(1)
  await openAdminAs(page, plainAdmin)
  await expect(page.locator('.nav-item', { hasText: '审计' })).toHaveCount(0)
  await expect(page.locator('.nav-item', { hasText: '设置' })).toHaveCount(0)

  const superAdmin = await makeAdmin(2)
  const page2 = await page.context().newPage()
  await openAdminAs(page2, superAdmin)
  await expect(page2.locator('.nav-item', { hasText: '设置' })).toHaveCount(1)
  await page2.close()
})

test('🔴 超管可按「只看管理员」筛选用户', async ({ page }) => {
  /*
   * 需求：超管要能一眼看出"我有哪些同事、权限对不对"。
   *
   * 断言用**点名核对**而不是比总数：本地库里用户上千，列表被 limit 截断，
   * 比总数会得到一个与功能无关的结论。
   */
  const admin = await makeAdmin(2)
  await openAdminAs(page, admin, '/#/admin/users')

  /*
   * 🔴 角色筛从「胶囊按钮」改成了第二个 `<select>`（2026-10-13 改版）。
   * 第一个 select 是状态档，第二个才是角色档。
   */
  const selects = page.locator('.toolbar-filter-row select.select-dropdown')
  await expect(selects).toHaveCount(2, { timeout: 20_000 })
  const roleSelect = selects.nth(1)
  await expect(roleSelect.locator('option').first()).toHaveText('全部角色')

  // 切到「只看管理员」（option 值 = 'admin'）
  await roleSelect.selectOption('admin')
  await page.waitForTimeout(1200)

  // 列表里每一行的「角色」列都不该是"普通"
  const rows = page.locator('.admin-table tbody tr')
  await expect(rows.first()).toBeVisible({ timeout: 20_000 })
  const count = await rows.count()
  expect(count, '应当至少列出几个管理员（测试自己就建了账号）').toBeGreaterThan(0)
  for (let i = 0; i < Math.min(count, 8); i++) {
    const roleText = (await rows.nth(i).locator('td').nth(5).innerText()).trim()
    expect(roleText, `第 ${i + 1} 行的角色不该是普通`).not.toBe('普通')
  }
})

test('普通管理员看不到「只看管理员」筛选', async ({ page }) => {
  // 看同事名单本身不需要超管（接口也允许），但普通管理员没有可做的操作，
  // 给一个点了没用的筛选只会让人困惑 —— 所以对他隐藏
  const plainAdmin = await makeAdmin(1)
  await openAdminAs(page, plainAdmin, '/#/admin/users')
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible({ timeout: 20_000 })
  // 角色档（第二个 select）只给超管 —— 普通管理员那里整个筛选行只有一个 select
  await expect(page.locator('.toolbar-filter-row select.select-dropdown')).toHaveCount(1)
})

test('🔴 评论列表多选批量隐藏/放行', async ({ page }) => {
  /*
   * 需求：误伤批量命中时，一条条点太慢。
   *
   * 验的是"多选真的贯通到后端"：选 3 条 → 批量隐藏 → 三条**都**变隐藏。
   * 只验"按钮出现"是不够的 —— 那连不上后端也能过。
   */
  const who = await createAccount(API_BASE, reader)
  const tag = nextTag()
  for (let i = 0; i < 3; i++) {
    await postComment(API_BASE, who.token, { body: `批量多选 ${tag}-${i}` })
  }

  const admin = await makeAdmin()
  await openAdminAs(page, admin, '/#/admin/comments')
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '已显示' }).click()
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()

  const rows = page.locator('.admin-table tbody tr')
  /*
   * 🔴 必须**等到搜索结果回来**再数行数。
   *
   * 改版后表格在请求期间**保留上一页内容**（原先的加载遮罩被移除了），
   * 于是「点搜索 → 立刻数」会数到上一档的 50 行（实测 50 而不是 3）。
   * 用 `expect.poll` 等到稳定值，避免把"还没加载完"当成"搜错了"。
   */
  await expect
    .poll(async () => rows.count(), { timeout: 20_000, message: '搜索结果应当只剩这 3 条' })
    .toBe(3)

  // 批量栏初始不存在（没选东西时不占空间）
  await expect(page.locator('.admin-batch-bar')).toHaveCount(0)

  // 全选本页
  await page.locator('.admin-table thead .admin-check').check()
  await expect(page.locator('.admin-batch-bar')).toContainText('已选 3 条', { timeout: 10_000 })

  // 批量隐藏（现在走 UiModal 自定义确认，不再是原生 window.confirm）
  await page.locator('.admin-batch-bar .admin-btn', { hasText: '批量隐藏' }).click()
  await page.locator('.admin-btn', { hasText: '确认批量隐藏' }).click()

  // 选完就清空选择
  await expect(page.locator('.admin-batch-bar')).toHaveCount(0, { timeout: 20_000 })

  // 🔴 三条都该从「已显示」档消失
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()
  await expect
    .poll(async () => page.locator('.admin-table tbody tr').count(), { timeout: 20_000 })
    .toBe(0)

  // 在「已隐藏」档能找到这 3 条
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '已隐藏' }).click()
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()
  await expect
    .poll(async () => page.locator('.admin-table tbody tr').count(), { timeout: 20_000 })
    .toBe(3)
})

test('🔴 批量转待审：原因对整批生效', async ({ page }) => {
  const who = await createAccount(API_BASE, reader)
  const tag = nextTag()
  for (let i = 0; i < 2; i++) {
    await postComment(API_BASE, who.token, { body: `批量待审 ${tag}-${i}` })
  }

  const admin = await makeAdmin()
  await openAdminAs(page, admin, '/#/admin/comments')
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '已显示' }).click()
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()

  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible({ timeout: 20_000 })
  await page.locator('.admin-table thead .admin-check').check()
  await expect(page.locator('.admin-batch-bar')).toContainText('已选 2 条', { timeout: 10_000 })

  const note = `批量打回${tag}`
  await page.locator('.admin-batch-bar .admin-btn', { hasText: '批量转待审' }).click()

  const modal = page.locator('.ui-modal-window', { hasText: '转为待审' })
  await expect(modal).toBeVisible({ timeout: 10_000 })
  // 批量时不该显示单条正文，而该说明原因对整批生效
  await expect(modal).toContainText('全部选中的评论')
  await modal.locator('#pending-note').fill(note)
  await modal.locator('.admin-btn', { hasText: '确认转待审' }).click()
  await expect(modal).toBeHidden({ timeout: 10_000 })

  // 两条都进待审档，且都带同一条原因
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '待审' }).click()
  await page.locator('.admin-search').fill(tag)
  await page.locator('.admin-btn--search', { hasText: '搜索' }).click()

  const pendingRows = page.locator('.admin-table tbody tr')
  await expect(pendingRows.first()).toBeVisible({ timeout: 20_000 })
  expect(await pendingRows.count(), '两条都该在待审档').toBe(2)
  const body = await page.locator('.admin-workshop').innerText()
  // 两条各显示一次原因
  expect(body.split(`待审原因：${note}`).length - 1, '两条都该显示这条原因').toBe(2)
})

test('多选「取消选择」清空选中', async ({ page }) => {
  const admin = await makeAdmin()
  await openAdminAs(page, admin, '/#/admin/comments')
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible({ timeout: 20_000 })

  await page.locator('.admin-table tbody tr').first().locator('.admin-check').check()
  await expect(page.locator('.admin-batch-bar')).toContainText('已选 1 条', { timeout: 10_000 })

  await page.locator('.admin-batch-bar .admin-btn', { hasText: '取消选择' }).click()
  await expect(page.locator('.admin-batch-bar')).toHaveCount(0)
})

test('🔴 超管可维护审核词表，自定义词真的会拦评论', async ({ page }) => {
  /*
   * 完整链路：超管在设置里加一个词 → 有人发含该词的评论 → **立刻进待审**。
   * 这是这个功能存在的意义，只验"界面能保存"是不够的。
   */
  const stamp2 = nextTag()
  const word = `拦测词${stamp2}`

  const admin = await makeAdmin(2)
  await openAdminAs(page, admin, '/#/admin/settings')
  await expect(page.locator('.admin-section-title', { hasText: '评论审核词表' })).toBeVisible({ timeout: 20_000 })

  // 内置类别应当列出来（赌博是基线里的）
  const gamblingRow = page.locator('.admin-kw-cat', { hasText: '赌博' }).first()
  await expect(gamblingRow).toBeVisible()

  // 往「赌博」里加一个词
  await gamblingRow.locator('.admin-kw-input').fill(word)
  await gamblingRow.locator('.admin-kw-input').press('Enter')
  await expect(gamblingRow).toContainText(word)

  await page.locator('.admin-btn', { hasText: '保存词表' }).click()
  await expect(page.locator('.admin-saved')).toContainText('词表已保存', { timeout: 20_000 })

  // 🔴 发一条含该词的评论 → 应当进待审
  //
  // ⚠️ `postComment` 助手的返回值是 `r.json.comment`（评论对象），
  //    **`pending` 在响应顶层**，不在这里面 —— 要判断是否进待审得直接打接口。
  const who = await createAccount(API_BASE, reader)
  const posted = await api(API_BASE, 'POST', '/api/comments', {
    token: who.token,
    body: { page: 'site:general', pageLabel: '站内讨论区', body: `这里出现${word}的字样`, hp: '' }
  })
  expect(posted.status, `发评论应当成功（201），实际 ${posted.status} ${posted.text.slice(0, 80)}`).toBe(201)
  expect(posted.json?.pending, '自定义词命中后应当进待审').toBe(true)

  // 管理端能看到它、并显示命中原因
  const page2 = await page.context().newPage()
  await openAdminAs(page2, admin, '/#/admin/comments')
  await page2.locator('.admin-search').fill(word)
  await page2.locator('.admin-btn--search').click()
  const row = page2.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText('命中：')
  await page2.close()

  // 收拾干净：把这个词删掉并保存（别污染其它测试）
  await gamblingRow.locator('.admin-kw-chip', { hasText: word }).locator('.admin-kw-del').click()
  await page.locator('.admin-btn', { hasText: '保存词表' }).click()
  await expect(page.locator('.admin-saved')).toContainText('词表已保存', { timeout: 20_000 })
})

test('🔴 停用整个类别后该类别的词不再拦', async ({ page }) => {
  const admin = await makeAdmin(2)
  await openAdminAs(page, admin, '/#/admin/settings')
  await expect(page.locator('.admin-section-title', { hasText: '评论审核词表' })).toBeVisible({ timeout: 20_000 })

  // 停用「引流」（基线里有「加微信」这类词）
  const row = page.locator('.admin-kw-cat', { hasText: '引流' }).first()
  await row.locator('input[type="checkbox"]').uncheck()
  await expect(row).toContainText('已停用')

  await page.locator('.admin-btn', { hasText: '保存词表' }).click()
  await expect(page.locator('.admin-saved')).toContainText('词表已保存', { timeout: 20_000 })

  // 停用后，「加微信」不该再让评论进待审
  const who = await createAccount(API_BASE, reader)
  const posted = await api(API_BASE, 'POST', '/api/comments', {
    token: who.token,
    body: { page: 'site:general', pageLabel: '站内讨论区', body: `加微信${nextTag()} 找我`, hp: '' }
  })
  expect(posted.status, `发评论应当成功（201），实际 ${posted.status} ${posted.text.slice(0, 80)}`).toBe(201)
  expect(posted.json?.pending, '停用类别后不该再命中').toBe(false)

  // 复原，别让其它测试受影响
  await row.locator('input[type="checkbox"]').check()
  await page.locator('.admin-btn', { hasText: '保存词表' }).click()
  await expect(page.locator('.admin-saved')).toContainText('词表已保存', { timeout: 20_000 })
})

test('🔴 词表导出 / 导入（导入只填界面、不直接写库）', async ({ page }) => {
  /*
   * 用途：本地配好一套词搬到线上，不必手敲两遍。
   *
   * 关键行为：**导入不直接写库** —— 必须再点「保存词表」才生效。
   * 选错文件直接覆盖线上词表是最坏后果，所以这条必须守。
   */
  const stamp3 = nextTag()
  const wordA = `导入词A${stamp3}`
  const wordB = `导入词B${stamp3}`

  const admin = await makeAdmin(2)

  /*
   * 🔴 先清空服务端的自定义词表。
   *
   * 为什么必须做：这条断言"导入后未保存时服务端不该有变化"，
   * 而上一轮若在清理前失败中断，库里会残留上次的词 ——
   * 断言就会因为**前置污染**而失败（实际踩过一次，收到 3 组历史残留）。
   * 自己把前置状态摆正，不依赖上一轮跑干净。
   */
  await api(API_BASE, 'PUT', '/api/admin/review-keywords', {
    token: admin.token,
    body: { keywords: [], disabled: [] }
  })

  await openAdminAs(page, admin, '/#/admin/settings')
  await expect(page.locator('.admin-section-title', { hasText: '评论审核词表' })).toBeVisible({ timeout: 20_000 })

  // 先放两个词进「赌博」并保存，作为导出源
  const gamblingRow = page.locator('.admin-kw-cat', { hasText: '赌博' }).first()
  for (const w of [wordA, wordB]) {
    await gamblingRow.locator('.admin-kw-input').fill(w)
    await gamblingRow.locator('.admin-kw-input').press('Enter')
  }
  await page.getByRole('button', { name: '保存词表' }).click()
  await expect(page.locator('.admin-saved')).toContainText('词表已保存', { timeout: 20_000 })

  // 导出 → 应触发下载且文件名可辨
  const dl = page.waitForEvent('download', { timeout: 20_000 })
  await page.getByRole('button', { name: '导出 JSON' }).click()
  const download = await dl
  expect(download.suggestedFilename()).toMatch(/审核词表.*\.json$/)

  // 读回导出的内容，确认包含刚才那两个词
  const path = await download.path()
  const fs = await import('node:fs')
  const exported = JSON.parse(fs.readFileSync(path, 'utf8'))
  expect(exported.format).toBe('myrzg-review-keywords')
  const texts = exported.keywords.map((k) => k.text)
  expect(texts).toContain(wordA)
  expect(texts).toContain(wordB)

  // 从界面删掉 wordA **并保存** → 服务端此时确实没有它了
  await gamblingRow.locator('.admin-kw-chip', { hasText: wordA }).locator('.admin-kw-del').click()
  await expect(gamblingRow).not.toContainText(wordA)
  await page.getByRole('button', { name: '保存词表' }).click()
  await expect(page.locator('.admin-saved')).toContainText('词表已保存', { timeout: 20_000 })

  // 前置确认：服务端此刻**确实**没有 wordA（否则下面的断言没有意义）
  const beforeImport = await api(API_BASE, 'GET', '/api/admin/review-keywords', { token: admin.token })
  expect(
    (beforeImport.json?.keywords || []).map((k) => k.text),
    '前置：删掉并保存后，服务端不该还有 wordA'
  ).not.toContain(wordA)

  // 导入导出的文件 → 只填进界面
  await page.locator('input.admin-sr-only[type="file"]').setInputFiles(path)
  await expect(page.locator('.admin-import-hint')).toContainText('确认无误后点「保存词表」', { timeout: 20_000 })
  await expect(gamblingRow).toContainText(wordA, { timeout: 10_000 })

  /*
   * 🔴 核心断言：导入后**还没保存**，服务端必须仍然没有 wordA。
   *
   * ⚠️ 这里必须先"删掉并保存"再导入，否则断言的前提就不成立 ——
   *    最初漏了那次保存，服务端本来就有 wordA，断言必然失败（实际踩过）。
   */
  const beforeSave = await api(API_BASE, 'GET', '/api/admin/review-keywords', { token: admin.token })
  const kwTexts = (beforeSave.json?.keywords || []).map((k) => k.text)
  expect(kwTexts, '导入后未保存时服务端不该有变化').not.toContain(wordA)

  // 保存后才真正写库
  await page.getByRole('button', { name: '保存词表' }).click()
  await expect(page.locator('.admin-saved')).toContainText('词表已保存', { timeout: 20_000 })
  const afterSave = await api(API_BASE, 'GET', '/api/admin/review-keywords', { token: admin.token })
  const savedTexts = (afterSave.json?.keywords || []).map((k) => k.text)
  expect(savedTexts, '保存后应当写入').toContain(wordA)

  // 导入别处的 JSON → 应当拒绝（否则会静默清空线上配置）
  const bogus = path.replace(/\.json$/, '') + '-bogus.json'
  fs.writeFileSync(bogus, JSON.stringify({ hello: 'world' }))
  await page.locator('input.admin-sr-only[type="file"]').setInputFiles(bogus)
  await expect(page.locator('.admin-error')).toContainText('不是本页导出的词表文件', { timeout: 10_000 })

  // 收拾：清空自定义词
  for (const w of [wordA, wordB]) {
    const chip = gamblingRow.locator('.admin-kw-chip', { hasText: w })
    if (await chip.count()) await chip.locator('.admin-kw-del').click()
  }
  await page.getByRole('button', { name: '保存词表' }).click()
  await expect(page.locator('.admin-saved')).toContainText('词表已保存', { timeout: 20_000 })
})

test('🔴 封禁可填理由，其他管理员能看到；解封后清空', async ({ page }) => {
  /*
   * 与评论的「转待审原因」同一套交互：处理某人时说明为什么，
   * 让接手的人不必重新判断一遍。
   *
   * 结构上照抄那条测试：甲封禁 → 乙读出来 → 解封后应清空。
   */
  const who = await createAccount(API_BASE, reader, { nick: `待封${nextTag().slice(-5)}` })
  const note = `连续发广告，已警告过一次 ${nextTag()}`

  // 甲：带理由封禁
  const adminA = await makeAdmin(2)
  await openAdminAs(page, adminA, '/#/admin/users')
  await page.locator('.admin-search').fill(who.nick)
  await page.locator('.btn-search').click()

  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText(who.nick)
  await row.locator('.action-link', { hasText: '封禁' }).click()

  const modal = page.locator('.ui-modal-window', { hasText: '封禁账号' })
  await expect(modal).toBeVisible({ timeout: 10_000 })
  // 弹窗里要说清"理由只有管理员能看到"
  await expect(modal).toContainText('只有管理员能看到')
  await modal.locator('#ban-note-input').fill(note)
  await modal.locator('.admin-btn', { hasText: '确认封禁' }).click()
  await expect(modal).toBeHidden({ timeout: 10_000 })

  /*
   * ⚠️ 封禁后该行会从「正常」档**消失**（用户页默认筛「正常」）——
   *    这是正确行为，所以要去「已停用」档找他，而不是原地断言。
   */
  await page.locator('.toolbar-filter-row select.select-dropdown').first().selectOption('2')
  await page.locator('.admin-search').fill(who.nick)
  await page.locator('.btn-search').click()
  const rowBanned = page.locator('.admin-table tbody tr').first()
  await expect(rowBanned).toContainText('已停用', { timeout: 20_000 })
  // ⚠️ 行内徽标的文案是「封禁：」而不是「封禁理由：」（2026-10-13 改版收紧了措辞）
  await expect(rowBanned).toContainText(`封禁：${note}`)

  // 乙：**另一个管理员**也能看到（理由存在服务端，不是本地状态）
  const adminB = await makeAdmin(2)
  const page2 = await page.context().newPage()
  await openAdminAs(page2, adminB, '/#/admin/users')
  await page2.locator('.toolbar-filter-row select.select-dropdown').first().selectOption('2')
  await page2.locator('.admin-search').fill(who.nick)
  await page2.locator('.btn-search').click()
  const rowB = page2.locator('.admin-table tbody tr').first()
  await expect(rowB).toContainText(`封禁：${note}`, { timeout: 20_000 })
  await page2.close()

  // 解封（走 UiModal 自定义确认，替代原生 window.confirm）→ 理由应清空
  await rowBanned.locator('.action-link', { hasText: '解封' }).click()
  await page.locator('.admin-btn', { hasText: '确认解封' }).click()

  // 解封后回到「正常」档，且不该再有理由行
  await page.locator('.toolbar-filter-row select.select-dropdown').first().selectOption('1')
  await page.locator('.admin-search').fill(who.nick)
  await page.locator('.btn-search').click()
  const rowUnbanned = page.locator('.admin-table tbody tr').first()
  await expect(rowUnbanned).toContainText('正常', { timeout: 20_000 })
  await expect(rowUnbanned).not.toContainText('封禁：')
})

test('🔴 评论被处理后，作者在「我的评论」看到红点', async ({ page }) => {
  /*
   * 要解决的问题：作者的评论被隐藏/打回待审后**他并不知道** ——
   * 「我的评论」里其实一直有「待审核 / 已隐藏」标签，但他没有理由主动去看。
   *
   * 这里验的是完整链路：管理员隐藏 → 作者打开账号弹窗看到红点 →
   * 点进「我的评论」→ 红点消失。
   */
  const who = await createAccount(API_BASE, reader, { nick: `被处理${nextTag().slice(-5)}` })
  const posted = await postComment(API_BASE, who.token, { body: `会被隐藏的评论 ${nextTag()}` })

  // 作者先登录并打开账号弹窗 —— 此时不该有红点
  await page.addInitScript(
    ({ token, user }) => {
      try {
        localStorage.setItem('myrzg:auth', JSON.stringify({ token, user }))
      } catch { /* 隐私模式 */ }
    },
    { token: who.token, user: who.user }
  )
  await page.goto('/')
  await page.waitForTimeout(1500)

  // 管理员隐藏那条评论
  const admin = await makeAdmin(2)
  const hideRes = await api(API_BASE, 'PATCH', '/api/admin/comments', {
    token: admin.token,
    body: { id: posted.id, status: 2 }
  })
  expect(hideRes.status, `隐藏应当成功，实际 ${hideRes.status}`).toBe(200)

  // 作者重新打开页面 → 账号入口应带红点
  await page.reload()
  await page.waitForTimeout(2000)
  // 与 account-modal.spec.js 用同一个入口选择器
  await page.locator('button[title="账号"]').first().click()
  await page.waitForTimeout(2500)

  const mineRow = page.locator('.acct-row', { hasText: '我的评论' })
  await expect(mineRow).toBeVisible({ timeout: 20_000 })
  // 🔴 红点应当出现
  await expect(mineRow.locator('.acct-badge')).toBeVisible({ timeout: 20_000 })
  await expect(mineRow.locator('.acct-badge')).toHaveText('1')

  // 点进去 → 列表里能看到那条「已隐藏」标签
  await mineRow.click()
  await expect(page.locator('.acct-mine-tag--hidden').first()).toBeVisible({ timeout: 20_000 })

  // 返回中心：红点应当已被标记为已读
  await page.locator('.acct-back').click()
  await page.waitForTimeout(1500)
  const badgeAfter = page.locator('.acct-row', { hasText: '我的评论' }).locator('.acct-badge')
  await expect(badgeAfter).toHaveCount(0, { timeout: 20_000 })
})

test('🔴 用户列表点评论数 → 只看该用户的评论（改名后仍找得到）', async ({ page }) => {
  /*
   * 这个入口比"手打昵称去搜"准在哪：`comments.nick` 是**发表时的快照**。
   *
   * ⚠️ 注意别把它说成"防重名"：`users.nick` 是 UNIQUE，当前不存在重名
   *    （实测确认过）。真正的价值是**不受改名影响** —— 用户改名后，
   *    按旧昵称搜会找不到自己的评论，按内部 id 筛不会。
   */
  const oldNick = `曾用名${nextTag().slice(-5)}`
  const who = await createAccount(API_BASE, reader, { nick: oldNick })
  const tag = `改名前后${nextTag()}`
  await postComment(API_BASE, who.token, { body: `${tag} 的评论` })

  // 用户改昵称 —— 评论里的 `nick` 保持发表时的快照
  const newNick = `新名${nextTag().slice(-5)}`
  const renamed = await api(API_BASE, 'PATCH', '/api/auth/me', {
    token: who.token,
    body: { nick: newNick }
  })
  expect(renamed.status, `改昵称应当成功，实际 ${renamed.status} ${renamed.text.slice(0, 80)}`).toBe(200)

  const admin = await makeAdmin(2)
  await openAdminAs(page, admin, '/#/admin/users')

  // 用**新**昵称搜到该账号
  await page.locator('.admin-search').fill(newNick)
  await page.locator('.btn-search').click()
  const row = page.locator('.admin-table tbody tr').first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect(row).toContainText(newNick)

  /*
   * 点评论数 → 应当能看到他**改名之前**发的那条（按昵称搜是搜不到的）
   *
   * ⚠️ 「评论数」列在手机端是 `col-hide-mobile`（**刻意隐藏**：手机屏宽放不下
   * 这一列，横滑体验也差）。所以这条**只在桌面项目**验真实点击路径；
   * 手机端改验"该列确实按设计隐藏"，避免把"设计如此"误判成"功能坏了"。
   */
  const link = row.locator('.comment-count-link')
  if (test.info().project.use.hasTouch) {
    await expect(link).toBeHidden()
    return
  }
  await expect(link).toBeVisible({ timeout: 10_000 })
  await link.click()
  await expect(page).toHaveURL(/#\/admin\/comments\?.*userId=/, { timeout: 20_000 })
  await expect(page.locator('.admin-user-filter')).toContainText('只看', { timeout: 20_000 })

  /*
   * ⚠️ 评论页默认停在「待审」档，而刚发的评论是 status=1（已显示）——
   *    必须先切到「已显示」才看得到它（这是既定默认，不是 bug）。
   */
  await page.locator('.admin-toolbar:not(.admin-toolbar--kinds) .admin-chip', { hasText: '已显示' }).click()
  await expect(page.locator('.admin-workshop')).toContainText(`${tag} 的评论`, { timeout: 20_000 })

  // 取消筛选 → 回到全部
  await page.locator('.admin-user-filter .admin-btn', { hasText: '取消' }).click()
  await expect(page.locator('.admin-user-filter')).toHaveCount(0, { timeout: 20_000 })
  await expect(page).not.toHaveURL(/userId=/)
})

test('三个页签是子路由：刷新与直达都正常', async ({ page }) => {
  const adminX = await makeAdmin()
  await openAdminAs(page, adminX)

  await clickNav(page, '用户')
  await expect(page).toHaveURL(/#\/admin\/users/)
  // 状态档现在是 <select>，默认空值（全部状态）
  await expect(page.locator('.toolbar-filter-row select.select-dropdown').first()).toHaveValue('')

  // 直接刷新：令牌已存，不该再回闸门
  await page.reload()
  await expect(page.locator('.admin-table')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.admin-gate')).toHaveCount(0)

  await clickNav(page, '评论')
  await expect(page).toHaveURL(/#\/admin\/comments/)

  // 点标题回概览
  await clickNav(page, '概览')
  await expect(page).toHaveURL(/#\/admin$/)
  await expect(page.locator('.stat-card')).toHaveCount(4, { timeout: 20_000 })
})

test('退出后台：离开后台视图，但不动用户登录态', async ({ page }) => {
  const adminX = await makeAdmin()
  await openAdminAs(page, adminX)
  await expect(page.locator('[data-admin-nav]')).toBeAttached({ timeout: 20_000 })

  await page.locator('.admin-exit-btn').click()

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
  await expect(page.locator('[data-admin-nav]')).toBeAttached({ timeout: 20_000 })
})

test('🔴 回首页入口：品牌区可点，重复入口已收掉', async ({ page }) => {
  /*
   * 2026-10-14 的入口收敛：
   *   · 删掉顶栏「前台」文字链 —— 它与「退出」完全同效（都 `router.replace('/')`）；
   *   · 删掉侧栏底部「前往首页」—— 与新的品牌区入口重复；
   *   · 「回首页」语义搬到顶部品牌区（标题那一块），那是用户最自然会点的地方。
   *
   * 这条守两端：**重复入口不许回来**（否则又出现"两个按钮一个效果"），
   * 且**品牌区真的能回首页**（否则等于把回首页能力删了）。
   */
  const adminX = await makeAdmin()
  await openAdminAs(page, adminX)

  // ① 重复入口已消失
  await expect(page.locator('.admin-head-link')).toHaveCount(0)
  await expect(page.locator('.admin-head-right')).not.toContainText('前台')
  await expect(page.locator('.side-footer-actions')).not.toContainText('前往首页')
  // 「前往讨论区」仍在（底部只留差异化动作）
  await expect(page.locator('.side-footer-actions')).toContainText('前往讨论区')

  // ② 品牌区具备可点语义（role/tabindex 保证键盘也能用）
  const brand = page.locator('.brand-group--home')
  await expect(brand).toBeAttached()
  await expect(brand).toHaveAttribute('role', 'link')
  await expect(brand).toHaveAttribute('tabindex', '0')

  // ③ 点了真的回首页
  await brand.click()
  await expect(page.locator('.admin-shell')).toHaveCount(0, { timeout: 15_000 })
  await expect(page).toHaveURL(/#\/items/)
})

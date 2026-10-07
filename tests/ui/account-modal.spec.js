import { expect, test } from '@playwright/test'

import { emailLookupHash } from '../../src/utils/authCrypto.js'
import { createCodeReader } from '../helpers/localD1.mjs'
import { createAccount, postComment } from '../helpers/accountApi.mjs'

/**
 * 服务端直连地址。
 *
 * 测试里有些准备工作用界面做太慢也太脆（比如"造一个别人来回复我"），
 * 直接调接口更快；而**被验证的那部分仍然走真实界面**。
 * 端口与 `playwright.config.js` 的 webServer 一致。
 */
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8788'

/**
 * 账号弹窗的真浏览器验收测试。
 *
 * 覆盖 M3 的核心：**注册 → 自动登录 → 个人中心 → 退出 → 登录**。
 * 这里不是"渲染一下看看有没有崩"，而是**真的建出一个账号**：
 * 填表 → 展开蛋点选 → 按 base64 反推正解并点击 → 从本地 D1 反解验证码 → 提交。
 *
 * 前置：Playwright 的 webServer 会同时起 Vite(4174) 与 API(8788)，
 * 见 `playwright.config.js`。
 */

const reader = createCodeReader()

test.afterAll(() => {
  reader.close()
})

const stamp = Date.now().toString(36)
const EMAIL = `ui-${stamp}@example.com`
const NICK = `界面${stamp.slice(-4)}`
const PASSWORD = 'Correct-Horse-Battery-9'

async function openAccountModal(page) {
  await page.goto('/')
  await page.locator('button[title="账号"]').first().click()
  await expect(page.locator('.acct-switch')).toBeVisible()
}

/** 按 DOM 里蛋图的 base64 反推正解，再点对应的热区 —— 等价于"一个能看懂图的用户"。 */
async function solveCaptcha(page) {
  const stage = page.locator('.captcha-stage').last()
  await expect(stage).toBeVisible()

  // 8 张蛋图（3 提示 + 5 画布）；站点主背景图不是 data URI，要剔掉
  const picks = await stage.evaluate((el) => {
    const hrefs = [...el.querySelectorAll('svg image')]
      .map((i) => i.getAttribute('href'))
      .filter((h) => h.startsWith('data:'))
    const prompt = hrefs.slice(0, 3)
    const canvas = hrefs.slice(3)
    return prompt.map((h) => canvas.indexOf(h))
  })
  expect(picks.every((i) => i >= 0)).toBe(true)

  for (const i of picks) {
    await stage.locator(`.hit[data-i="${i}"]`).click({ force: true })
  }
  return picks
}

/*
 * 🔴 **每次注册都用全新的昵称与邮箱**。
 *
 * 昵称在服务端是**全站唯一**的，所以"所有测试共用一个 NICK 常量"必然出问题：
 * 谁先注册谁赢，其余全部卡在"昵称已被使用"——
 * 实测 10 条里挂了 2 条，而且**挂哪两条取决于并行调度的顺序**。
 * 这类"跑一次绿、再跑一次红"的测试比没有测试更糟。
 */
let registerSeq = 0

async function registerAccount(page, overrides = {}) {
  registerSeq += 1
  const nick = overrides.nick || `界面${stamp.slice(-3)}${registerSeq}`
  const email = overrides.email || `ui-${stamp}-${registerSeq}@example.com`

  await page.locator('.acct-switch-btn', { hasText: '注册' }).click()

  await page.locator('.acct-input[autocomplete="nickname"]').fill(nick)
  const pwds = page.locator('.acct-input[autocomplete="new-password"]')
  await pwds.nth(0).fill(PASSWORD)
  await pwds.nth(1).fill(PASSWORD)
  await page.locator('.acct-input[autocomplete="email"]').fill(email)

  // 发送验证码 → 展开人机验证
  await page.locator('button', { hasText: '发送验证码' }).click()
  const picks = await solveCaptcha(page)

  // 等真实发码完成（MAIL_STUB 会把码打到服务端日志，我们从本地 D1 反解）
  await expect(page.locator('.acct-hint', { hasText: '验证码已发出' })).toBeVisible({ timeout: 20_000 })

  const emailHash = await emailLookupHash(email, reader.saltSecret)
  const code = reader.readCode(emailHash, 'register')
  expect(code, '没能从本地 D1 反解出验证码').toMatch(/^\d{6}$/)

  await page.locator('.acct-input[autocomplete="one-time-code"]').fill(code)
  await page.locator('.acct-agree input[type="checkbox"]').check()
  await page.locator('button[type="submit"]', { hasText: '注册并登录' }).click()

  return { picks, code, nick, email }
}

// ============================================================

test('账号弹窗：未登录时显示登录/注册两个页签', async ({ page }) => {
  await openAccountModal(page)
  await expect(page.locator('.acct-switch-btn.is-on')).toHaveText('登录')
  await expect(page.locator('.acct-switch-btn', { hasText: '注册' })).toBeVisible()
  // 登录表单的两个字段
  await expect(page.locator('.acct-input[autocomplete="email"]')).toBeVisible()
  await expect(page.locator('.acct-input[autocomplete="current-password"]')).toBeVisible()
})

test('注册表单字段顺序符合要求：昵称→头像→密码→确认→邮箱→验证码', async ({ page }) => {
  await openAccountModal(page)
  await page.locator('.acct-switch-btn', { hasText: '注册' }).click()

  const labels = await page.locator('.acct-label').allInnerTexts()
  const joined = labels.join('|')
  expect(joined).toContain('昵称')
  expect(joined).toContain('头像')
  expect(joined).toContain('密码')
  expect(joined).toContain('确认密码')
  expect(joined).toContain('邮箱')
  expect(joined).toContain('邮箱验证码')

  // 顺序断言（用文本首次出现的下标）
  const idx = (kw) => joined.indexOf(kw)
  expect(idx('昵称')).toBeLessThan(idx('头像'))
  expect(idx('头像')).toBeLessThan(idx('密码'))
  // 「密码」是「确认密码」的子串，所以要找「确认密码」在「密码」之后
  expect(idx('确认密码')).toBeGreaterThan(idx('密码'))
  expect(idx('邮箱验证码')).toBeGreaterThan(idx('确认密码'))
})

test('客户端校验：弱密码 / 两次不一致 / 非法邮箱 都不会误发验证码', async ({ page }) => {
  await openAccountModal(page)
  await page.locator('.acct-switch-btn', { hasText: '注册' }).click()

  await page.locator('.acct-input[autocomplete="nickname"]').fill(NICK + 'x')
  const pwds = page.locator('.acct-input[autocomplete="new-password"]')
  await pwds.nth(0).fill('12345678') // 弱密码
  await pwds.nth(1).fill('12345678')
  await page.locator('.acct-input[autocomplete="email"]').fill('someone@example.com')
  await page.locator('button', { hasText: '发送验证码' }).click()

  await expect(page.locator('.acct-error')).toBeVisible()
  // 关键：人机验证**不该**被展开（否则白白消耗一次出题与一道额度）
  await expect(page.locator('.captcha-stage')).toHaveCount(0)

  // 换成合法密码但两次不一致
  await pwds.nth(0).fill(PASSWORD)
  await pwds.nth(1).fill(PASSWORD + 'x')
  await page.locator('button', { hasText: '发送验证码' }).click()
  await expect(page.locator('.acct-error')).toContainText('不一样')
  await expect(page.locator('.captcha-stage')).toHaveCount(0)

  // 一次性邮箱：本地就该被挡（服务端还会再挡一次）
  await pwds.nth(1).fill(PASSWORD)
  await page.locator('.acct-input[autocomplete="email"]').fill('someone@mailinator.com')
  await page.locator('button', { hasText: '发送验证码' }).click()
  await expect(page.locator('.acct-error')).toContainText('常用邮箱')
  await expect(page.locator('.captcha-stage')).toHaveCount(0)
})

test('人机验证：出题后蛋图真的画出来了（8 张内联 data URI + 5 个热区）', async ({ page }) => {
  await openAccountModal(page)
  await page.locator('.acct-switch-btn', { hasText: '注册' }).click()

  await page.locator('.acct-input[autocomplete="nickname"]').fill(NICK + 'y')
  const pwds = page.locator('.acct-input[autocomplete="new-password"]')
  await pwds.nth(0).fill(PASSWORD)
  await pwds.nth(1).fill(PASSWORD)
  await page.locator('.acct-input[autocomplete="email"]').fill(`cap-${stamp}@example.com`)
  await page.locator('button', { hasText: '发送验证码' }).click()

  const stage = page.locator('.captcha-stage')
  await expect(stage).toBeVisible({ timeout: 20_000 })

  const info = await stage.evaluate((el) => {
    const images = [...el.querySelectorAll('svg image')]
    const inline = images.filter((i) => (i.getAttribute('href') || '').startsWith('data:'))
    const bg = images.filter((i) => (i.getAttribute('href') || '').includes('map_w1_bg'))
    const hits = [...el.querySelectorAll('.hit')]
    const box = el.querySelector('svg').getBoundingClientRect()
    const hitBox = hits[0]?.getBoundingClientRect()
    return {
      inlineCount: inline.length,
      bgCount: bg.length,
      hitCount: hits.length,
      // 蛋图是否真的解码了（真机/真浏览器上 WebP 必须能解）
      decoded: inline.every((i) => i.getBoundingClientRect().width > 0),
      svgW: Math.round(box.width),
      hitW: Math.round(hitBox?.width || 0)
    }
  })

  expect(info.inlineCount).toBe(8)
  expect(info.bgCount).toBe(1)
  expect(info.hitCount).toBe(5)
  expect(info.decoded).toBe(true)
  expect(info.svgW).toBeGreaterThan(200)
  // 触摸热区要够大（服务端用 54 SVG 单位，缩放后仍是几十像素）
  expect(info.hitW).toBeGreaterThanOrEqual(40)
})

test('答错人机验证 → 提示并自动换新题', async ({ page }) => {
  await openAccountModal(page)
  await page.locator('.acct-switch-btn', { hasText: '注册' }).click()

  await page.locator('.acct-input[autocomplete="nickname"]').fill(NICK + 'z')
  const pwds = page.locator('.acct-input[autocomplete="new-password"]')
  await pwds.nth(0).fill(PASSWORD)
  await pwds.nth(1).fill(PASSWORD)
  await page.locator('.acct-input[autocomplete="email"]').fill(`wrong-${stamp}@example.com`)
  await page.locator('button', { hasText: '发送验证码' }).click()

  const stage = page.locator('.captcha-stage')
  await expect(stage).toBeVisible({ timeout: 20_000 })

  // 故意点一个必定不对的组合（正解几乎不可能是 0,1,2）
  for (const i of [0, 1, 2]) {
    await stage.locator(`.hit[data-i="${i}"]`).click({ force: true })
  }

  await expect(page.locator('.acct-error', { hasText: '换了新题' })).toBeVisible({ timeout: 20_000 })
  // 换题后进度应归零，且热区仍在（是**新**题而不是卡死）
  await expect(page.locator('.captcha-progress')).toHaveText('0 / 3')
  await expect(stage.locator('.hit')).toHaveCount(5)
})

test('完整注册 → 自动登录 → 个人中心显示编号在上、昵称在下', async ({ page }) => {
  await openAccountModal(page)
  const me = await registerAccount(page)

  // 注册成功即登录，弹窗切到个人中心
  const card = page.locator('.acct-id-card')
  await expect(card).toBeVisible({ timeout: 20_000 })

  const no = await page.locator('.acct-no').innerText()
  expect(no).toMatch(/编号\s*1\d{4}/)
  await expect(page.locator('.acct-nick')).toHaveText(me.nick)
  await expect(page.locator('.acct-mail')).toHaveText(me.email)

  // 编号必须在昵称**上面**（用户明确要求）
  const noBox = await page.locator('.acct-no').boundingBox()
  const nickBox = await page.locator('.acct-nick').boundingBox()
  expect(noBox.y).toBeLessThan(nickBox.y)

  // 刷新后仍保持登录（会话恢复）
  await page.reload()
  await page.locator('button[title="账号"]').first().click()
  await expect(page.locator('.acct-nick')).toHaveText(me.nick, { timeout: 20_000 })
})

test('退出登录 → 回到登录页', async ({ page }) => {
  await openAccountModal(page)
  await registerAccount(page)
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  await page.locator('button', { hasText: '退出登录' }).click()
  // 弹窗关闭；重新打开应该是登录页
  await page.locator('button[title="账号"]').first().click()
  await expect(page.locator('.acct-switch-btn.is-on')).toHaveText('登录')
})

test('注册页的「隐私说明」链接真的打得开（必勾项不能指向空白页）', async ({ page, context }) => {
  await openAccountModal(page)
  await page.locator('.acct-switch-btn', { hasText: '注册' }).click()

  // 这个链接所在的那一行是**必勾**的同意项 —— 它必须真的能读到内容
  const link = page.locator('.acct-agree a')
  await expect(link).toHaveText('隐私说明')
  await expect(link).toHaveAttribute('href', '#/privacy')

  /*
   * ⚠️ 它是 `target="_blank"` 打开的**新标签页**，当前页不会跳转。
   * 这是有意的：用户正在填注册表单，点"隐私说明"看一眼不该把已填的内容弄丢。
   * （第一版测试直接断言当前页跳转，于是收到 `#/items` 而失败。）
   */
  await expect(link).toHaveAttribute('target', '_blank')

  const [popup] = await Promise.all([context.waitForEvent('page'), link.click()])
  await popup.waitForLoadState('domcontentloaded')
  await expect(popup).toHaveURL(/#\/privacy/)
  await expect(popup.locator('.privacy')).toBeVisible({ timeout: 15_000 })

  // 内容要点：这三个是最该让用户看到的（也是本站的真实行为，不是模板话）
  const text = await popup.locator('.privacy').innerText()
  expect(text).toContain('密码不会被上传')
  expect(text).toContain('评论会保留')
  expect(text).toContain('腾讯云')

  await popup.close()
  // 原来那个页面还在，表单没被弄丢
  await expect(page.locator('.acct-form')).toBeVisible()
})

test('直接访问 /#/privacy 也能看到内容', async ({ page }) => {
  await page.goto('/#/privacy')
  await expect(page.locator('.privacy')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.privacy-back')).toBeVisible()
})

test('没匹配上的 hash 回首页，而不是空白页', async ({ page }) => {
  await page.goto('/#/definitely-not-a-route')
  // 兜底重定向之后应该是首页（物品图鉴）
  await expect(page.locator('.app-container')).toBeVisible({ timeout: 20_000 })
  await expect(page).not.toHaveURL(/#\/definitely-not-a-route/)
})

// ---------- 头像 / 人机验证改到弹窗里 ----------

test('头像在弹窗里选：主表单只留一行，选完写回预览', async ({ page }) => {
  await openAccountModal(page)
  await page.locator('.acct-switch-btn', { hasText: '注册' }).click()

  // 🔴 主表单里**不该**有头像网格 —— 这正是"太占空间"的根源
  await expect(page.locator('.avatar-grid')).toHaveCount(0)

  // 🔴 默认就是女主「希尔」（用户要求：别再让用户从"未选择"开始）
  await expect(page.locator('.acct-avatar-row-title')).toHaveText('希尔（女主）')

  // 点那一行 → 选择器弹窗
  await page.locator('.acct-avatar-row').click()
  const pickerGrid = page.locator('.avatar-grid').first()
  await expect(pickerGrid).toBeVisible({ timeout: 20_000 })

  // 展开第一个分组再挑一张（默认全收起，否则一屏全是头像）
  await page.locator('.ui-accordion__head').first().click()
  const firstCell = page.locator('.avatar-cell').first()
  await expect(firstCell).toBeVisible()
  const pickedName = await firstCell.getAttribute('title')
  await firstCell.click()

  // 关窗后预览行要显示选中的那个
  await page.locator('button', { hasText: '完成' }).click()
  await expect(page.locator('.acct-avatar-row-title')).toHaveText(pickedName, { timeout: 10_000 })
  await expect(page.locator('.acct-avatar-thumb')).toBeVisible()
})

test('人机验证在弹窗里，不再把注册表单撑长', async ({ page }) => {
  await openAccountModal(page)
  await page.locator('.acct-switch-btn', { hasText: '注册' }).click()

  const nick = page.locator('.acct-input[autocomplete="nickname"]')
  await nick.fill(`弹窗${stamp.slice(-3)}`)
  const pwds = page.locator('.acct-input[autocomplete="new-password"]')
  await pwds.nth(0).fill(PASSWORD)
  await pwds.nth(1).fill(PASSWORD)
  await page.locator('.acct-input[autocomplete="email"]').fill(`dlg-${stamp}@example.com`)

  // 记下"没点发送"时的表单高度
  const before = await page.locator('.ui-modal-body').first().evaluate((el) => el.scrollHeight)

  await page.locator('button', { hasText: '发送验证码' }).click()

  // 题目出现在**弹窗**里
  const stage = page.locator('.captcha-stage')
  await expect(stage).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('h3', { hasText: '人机验证' })).toBeVisible()
  // 弹窗模式不再重复画一遍标题
  await expect(page.locator('.captcha-title')).toHaveCount(0)

  // 表单里没有内联题目（题目在另一层弹窗里，不属于 .ui-modal-body 的第一个）
  const innerCaptcha = await page.locator('.ui-modal-body').first().locator('.captcha-stage').count()
  expect(innerCaptcha).toBe(0)

  await page.locator('.ui-modal-overlay').last().locator('button[title="关闭"]').click()
  await expect(stage).toHaveCount(0)

  const after = await page.locator('.ui-modal-body').first().evaluate((el) => el.scrollHeight)
  // 关掉题目后表单高度应回到原样（±几个像素的渲染抖动）
  expect(Math.abs(after - before)).toBeLessThan(24)
})

test('换绑邮箱：新/旧两个入口各自唤起自己的人机验证弹窗', async ({ page }) => {
  await openAccountModal(page)
  await registerAccount(page)
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  await page.locator('.acct-row', { hasText: '换绑邮箱' }).click()

  const send = page.locator('button', { hasText: '发送验证码' })
  await expect(send).toHaveCount(2)

  // 点"新邮箱"那个（第一个）
  await page.locator('.acct-input[autocomplete="email"]').first().fill(`new-${stamp}@example.com`)
  await send.first().click()
  await expect(page.locator('.captcha-stage')).toHaveCount(1, { timeout: 20_000 })

  // 关掉它，再点"旧邮箱"那个：应该是同一套弹窗、能被再次唤起
  await page.locator('.ui-modal-overlay').last().locator('button[title="关闭"]').click()
  await expect(page.locator('.captcha-stage')).toHaveCount(0)

  await send.nth(1).click()
  await expect(page.locator('.captcha-stage')).toHaveCount(1, { timeout: 20_000 })
})

// ---------- M6：谁回复了我 ----------

test('谁回复了我：未读红点 → 列表 → 点开后红点清掉', async ({ page }) => {
  await openAccountModal(page)
  const me = await registerAccount(page)
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  // 我自己先发一条（用页面自己的令牌，等价于"我在评论区发过言"）
  const root = await page.evaluate(async () => {
    const token = JSON.parse(localStorage.getItem('myrzg:auth')).token
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ page: 'site:general', pageLabel: '站内讨论区', body: 'M6 我的原评论', hp: '' })
    })
    const j = await res.json()
    return j?.comment?.id
  })
  expect(root).toBeTruthy()

  // 造一个"别人"来回复我（界面走两遍注册太慢，这里直接调接口）
  const other = await createAccount(API_BASE, reader)
  const replyBody = `M6 我来回复你 ${stamp}`
  await postComment(API_BASE, other.token, { body: replyBody, parentId: root })

  // 关掉再打开：让未读数重新取一次（红点是在打开弹窗时拉的）
  await page.locator('button[title="关闭"]').click()
  await page.waitForTimeout(400)
  await page.locator('button[title="账号"]').first().click()
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  // 🔴 红点出现，且数字是 1
  const badge = page.locator('.acct-badge')
  await expect(badge).toBeVisible({ timeout: 15_000 })
  await expect(badge).toHaveText('1')

  // 进列表
  await page.locator('.acct-row', { hasText: '谁回复了我' }).click()
  const item = page.locator('.acct-mine-item').first()
  await expect(item).toBeVisible({ timeout: 20_000 })
  await expect(item).toContainText(replyBody)
  await expect(item.locator('.acct-reply-nick')).toHaveText(other.nick)
  await expect(item).toContainText('站内讨论区')
  await expect(item.locator('.acct-mine-link')).toHaveText('去看看')

  // 🔴 进去后红点应该清掉（进页面即标已读）
  // 列表页比个人中心深一层，先返回（这两个页面本来没有返回入口，
  // 是这条测试撞出来的死角，已补上「‹ 返回个人中心」）
  await page.locator('.acct-back').click()
  await expect(page.locator('.acct-id-card')).toBeVisible()
  await expect(page.locator('.acct-badge')).toHaveCount(0, { timeout: 10_000 })

  // 我自己的原评论不会被当成"别人回复我"
  await page.locator('.acct-row', { hasText: '谁回复了我' }).click()
  await expect(page.locator('.acct-mine-item')).toHaveCount(1)
})

test('谁回复了我：没有回复时是空态（不是空白）', async ({ page }) => {
  await openAccountModal(page)
  await registerAccount(page)
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  await page.locator('.acct-row', { hasText: '谁回复了我' }).click()
  await expect(page.locator('.acct-mine')).toBeVisible()
  await expect(page.locator('.acct-hint', { hasText: '还没有人回复你' })).toBeVisible()
  // 一条都没有时不该有红点
  await expect(page.locator('.acct-badge')).toHaveCount(0)
})

test('谁回复了我：「去看看」跳到讨论区并把那条带上', async ({ page }) => {
  await openAccountModal(page)
  await registerAccount(page)
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  const root = await page.evaluate(async () => {
    const token = JSON.parse(localStorage.getItem('myrzg:auth')).token
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ page: 'site:general', pageLabel: '站内讨论区', body: 'M6 定位用原评论', hp: '' })
    })
    return (await res.json())?.comment?.id
  })

  const other = await createAccount(API_BASE, reader)
  const reply = await postComment(API_BASE, other.token, { body: '定位用回复', parentId: root })

  await page.locator('button[title="关闭"]').click()
  await page.waitForTimeout(400)
  await page.locator('button[title="账号"]').first().click()
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  await page.locator('.acct-row', { hasText: '谁回复了我' }).click()
  await expect(page.locator('.acct-mine-item').first()).toBeVisible({ timeout: 20_000 })

  await page.locator('.acct-mine-link', { hasText: '去看看' }).first().click()

  // 弹窗关掉、落到讨论区
  await expect(page.locator('.ui-modal-overlay')).toHaveCount(0, { timeout: 10_000 })
  await expect(page).toHaveURL(/#\/discussions/)
  await expect(page.locator('.discussions-page')).toBeVisible({ timeout: 20_000 })

  // 🔴 定位：跳到的那条会短暂带一个闪烁类；地址栏里的 ?c= 已被抹掉
  await expect(page.locator(`[data-comment-id="${reply.id}"]`)).toBeVisible({ timeout: 20_000 })
  await expect(page).not.toHaveURL(/[?&]c=/)
})

test('🔴 「去看看」定位到不在首屏的评论时显示定位卡片', async ({ page }) => {
  /*
   * 讨论区只加载第一页（50 条）。当那条回复已经是几百条之前时，
   * 列表里根本没有它 —— 早先的实现**静默什么都不做**：页面跳过来了、
   * 但没定位、也没提示，用户以为坏了。
   *
   * 现在的处理：不逐页往回翻（代价随"多老"增长，最坏几十次请求），
   * 而是调 `/api/comments/context` 取「被回复的那条 + 回复本身」，
   * 在列表上方显示一张卡片。**恒定 1 次请求。**
   *
   * 这里造 60 条填充把回复挤出首屏，然后直接带 `?c=` 进讨论区。
   */
  /*
   * ⚠️ `tag` 里必须带**每次运行都不同**的部分：昵称是全站唯一的，
   * 而 `stamp` 是模块级常量（同一次运行内不变）—— 只用它会让
   * **重跑时撞上上一轮留下的账号**，报 409「这个名字已经有人用了」。
   * 那个失败看起来像功能坏了，其实是测试自己的数据没隔离。
   */
  const tag = `${stamp}-${Math.random().toString(36).slice(2, 6)}`
  const alice = await createAccount(API_BASE, reader, { nick: `卡${tag.slice(-3)}` })
  const bob = await createAccount(API_BASE, reader, { nick: `片${tag.slice(-3)}` })

  const parent = await postComment(API_BASE, alice.token, { body: `父评论 ${tag}` })
  const reply = await postComment(API_BASE, bob.token, { body: `回复 ${tag}`, parentId: parent.id })

  // 挤出首屏（首页 50 条）
  for (let i = 0; i < 58; i++) {
    await postComment(API_BASE, alice.token, { body: `填充 ${tag} #${i}` })
  }

  await page.goto(`/#/discussions?c=${reply.id}`)
  await expect(page.locator('.discussions-page')).toBeVisible({ timeout: 25_000 })

  // 卡片出现，且**在视野内**（不能只是渲染了却被滚到下面去）
  const card = page.locator('.discussion-pinned')
  await expect(card).toBeVisible({ timeout: 25_000 })
  await expect(card).toContainText(`父评论 ${tag}`)
  await expect(card).toContainText(`回复 ${tag}`)

  /*
   * 🔴 关键：卡片必须**真的可见**。
   *
   * 踩过的坑：卡片曾放在 `.discussion-scroll` **里面**、位于列表上方，
   * 而首屏默认"滚到最新"（最下方）→ 卡片被顶出视野，用户看到的还是列表底部，
   * **与修复前观感完全一样**（东西渲染了，但看不见）。
   * 现在卡片移到了滚动容器**之外**，天然常驻可见 —— 这条断言就是守它。
   */
  const visibleBox = await card.boundingBox()
  expect(visibleBox, '卡片应当有实际可见区域').not.toBeNull()
  const viewport = page.viewportSize()
  expect(visibleBox.y, '卡片顶部要在视口内').toBeGreaterThanOrEqual(0)
  expect(visibleBox.y + visibleBox.height, '卡片底部也要落在视口内').toBeLessThanOrEqual(viewport.height)

  // 关掉卡片后应该消失
  await page.locator('.discussion-pinned-close').click()
  await expect(page.locator('.discussion-pinned')).toHaveCount(0)
})

// ---------- M5：我的评论 ----------

/** 用页面自己的会话令牌调接口（模拟"在别处发过评论"） */
async function postAsLoggedIn(page, body) {
  return page.evaluate(async (text) => {
    const token = JSON.parse(localStorage.getItem('myrzg:auth')).token
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ page: 'site:general', pageLabel: '站内讨论区', body: text, hp: '' })
    })
    const j = await res.json()
    return { status: res.status, id: j?.comment?.id, mine: j?.comment?.mine }
  }, body)
}

test('我的评论：没有评论时显示空态', async ({ page }) => {
  await openAccountModal(page)
  await registerAccount(page)
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  await page.locator('.acct-row', { hasText: '我的评论' }).click()
  await expect(page.locator('.acct-mine')).toBeVisible()
  await expect(page.locator('.acct-hint', { hasText: '你还没有发过评论' })).toBeVisible()
})

test('我的评论：列出、带页面名与状态，并能删除', async ({ page }) => {
  await openAccountModal(page)
  await registerAccount(page)
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  // 发两条：一条普通、一条带回复目标（验证「回复」标签）
  const text = `M5 测试评论 ${stamp}`
  const first = await postAsLoggedIn(page, text)
  expect(first.status).toBe(201)
  expect(first.mine).toBe(true)

  await page.locator('.acct-row', { hasText: '我的评论' }).click()
  const items = page.locator('.acct-mine-item')
  await expect(items).toHaveCount(1, { timeout: 20_000 })

  // 页面名 + 正文 + 「去看看」入口
  await expect(items.first().locator('.acct-mine-page')).toHaveText('站内讨论区')
  await expect(items.first()).toContainText(text)
  await expect(items.first().locator('.acct-mine-link')).toBeVisible()

  // 删除：列表立刻少一条（不整页重拉）
  await items.first().locator('.acct-mine-del').click()
  await expect(items).toHaveCount(0, { timeout: 20_000 })
  await expect(page.locator('.acct-hint', { hasText: '你还没有发过评论' })).toBeVisible()

  // 服务端也真的没了
  const gone = await page.evaluate(async () => {
    const token = JSON.parse(localStorage.getItem('myrzg:auth')).token
    const res = await fetch('/api/auth/comments', { headers: { authorization: 'Bearer ' + token } })
    const j = await res.json()
    return (j.comments || []).length
  })
  expect(gone).toBe(0)
})

test('我的评论：待审核的也要列出来（否则作者以为发丢了）', async ({ page }) => {
  await openAccountModal(page)
  await registerAccount(page)
  await expect(page.locator('.acct-id-card')).toBeVisible({ timeout: 20_000 })

  // 命中审核词表 → status=0（待审），公开列表里看不到，但作者自己必须看得见
  const pending = await page.evaluate(async () => {
    const token = JSON.parse(localStorage.getItem('myrzg:auth')).token
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({
        page: 'site:general',
        pageLabel: '站内讨论区',
        body: '加微信免费送代练',
        hp: ''
      })
    })
    const j = await res.json()
    return { status: res.status, pending: j?.pending, reviewReason: j?.comment?.reviewReason }
  })

  // 词表命中才继续（没命中就跳过这条断言，避免依赖词表内容）
  test.skip(!pending.pending, '这条正文没有命中审核词表，跳过')

  await page.locator('.acct-row', { hasText: '我的评论' }).click()
  const item = page.locator('.acct-mine-item').first()
  await expect(item).toBeVisible({ timeout: 20_000 })
  await expect(item.locator('.acct-mine-tag--pending')).toHaveText('待审核')

  // 公开列表里看不到它
  const inPublic = await page.evaluate(async () => {
    const res = await fetch('/api/comments?page=site:general&limit=50')
    const j = await res.json()
    return (j.comments || []).some((c) => c.body.includes('加微信'))
  })
  expect(inPublic).toBe(false)
})

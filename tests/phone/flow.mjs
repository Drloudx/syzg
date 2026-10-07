/**
 * 真机全流程走查：**在手机上真的注册一个账号，然后发一条评论**。
 *
 * 这是 M3+M4 的验收：不是"页面能打开"，而是"能注册、能发言、能删自己的评论"。
 *
 * 前置：
 *   1. `npm run dev:api`（8788）与 `npm run dev`（5173）都跑着；
 *   2. `adb -s <设备> reverse tcp:5173 tcp:5173`
 *      `adb -s <设备> forward tcp:9222 localabstract:chrome_devtools_remote`
 *
 * 用法：node --no-warnings tests/phone/flow.mjs
 *
 * ## 怎么填表单
 *
 * Vue 的 `v-model` 只认原生 `input` 事件，直接改 `el.value` 不会更新状态。
 * 所以统一用"设值 + 派发 input 事件"的方式，并让 Vue 完成一次 tick 再继续。
 */

import { Cdp, listTargets, pickTarget } from '../../scripts/dev/phone-cdp.mjs'
import { emailLookupHash } from '../../src/utils/authCrypto.js'
import { createCodeReader } from '../helpers/localD1.mjs'

const SITE = 'http://localhost:5173/'
const reader = createCodeReader()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? '  [' + detail + ']' : ''}`)
  }
}

const stamp = Date.now().toString(36)
const EMAIL = `phone-${stamp}@example.com`
const NICK = `手机${stamp.slice(-4)}`
const PASSWORD = 'Correct-Horse-Battery-9'

const targets = await listTargets()
const target = pickTarget(targets, 'localhost:5173')
const cdp = await new Cdp(target.webSocketDebuggerUrl).connect()

/*
 * 🔴 必须**先提到前台**再驱动。
 *
 * Chrome 会冻结后台标签：连接照样能建、`/json/list` 里照样列出来，
 * 但 `Page.navigate` / `Runtime.evaluate` **永远不返回** ——
 * 表现为 `CDP 超时: Page.navigate`，很容易误判成"CDP 坏了"或"手机没醒"。
 *
 * 手机上常年开着几个调试残留标签，挑中冻结的那个就会一上来超时。
 */
await cdp.bringToFront()

/** 在页面里求值 */
const ev = (expr) => cdp.eval(expr)

/** 设值并让 Vue 感知（v-model 只认原生 input 事件） */
async function setInput(selector, value) {
  return ev(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return 'no-element'
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set
    setter.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return 'ok'
  })()`)
}

/** 点一个元素（用 CDP 真实触摸，不是 JS click） */
async function tapSelector(selector) {
  /*
   * 🔴 **先滚动到可见再取坐标**。
   *
   * `getBoundingClientRect()` 给的是**视口坐标**；弹窗里的表单很长，
   * 目标常常在折叠线以下（y > 视口高度），这时 CDP 派发的触摸会落在空处 ——
   * 表现是"点了没反应"，且**不报任何错**。
   * 这个坑先让注册流程的验证码点击全部落空过（表现为"服务端没收到发码请求"）。
   */
  const box = await ev(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
      w: Math.round(r.width), h: Math.round(r.height),
      inView: r.top >= 0 && r.bottom <= innerHeight
    }
  })()`)
  if (!box) return false
  await sleep(250)
  await cdp.tap(box.x, box.y)
  return true
}

async function waitFor(expr, { timeout = 20000, label = expr } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await ev(expr)) return true
    await sleep(400)
  }
  throw new Error('等待超时: ' + label)
}

try {
  console.log('\n================ 真机全流程：注册 → 发评论 → 删评论 ================')
  console.log(`  邮箱 ${EMAIL}\n  昵称 ${NICK}\n`)

  // ---- 1. 打开站点 ----
  console.log('【1】打开站点')
  /*
   * ⚠️ **先清 localStorage 再跑**。
   *
   * 真机的 localStorage 是持久的：上一次跑留下的会话会让页面直接进"已登录"状态，
   * 于是"未登录引导"与"注册"两段全部对不上（第一次跑就栽在这：
   * 身份条显示的是**上一轮**注册的账号，弹窗打开的是个人中心而不是注册页）。
   * 测试要的是**确定的初始状态**，不能依赖上一次跑完剩下什么。
   */
  await cdp.send('Page.navigate', { url: SITE })
  await sleep(2500)
  await ev(`(() => { try { localStorage.clear() } catch {} ; return 'ok' })()`)
  await sleep(300)

  /*
   * 缓存参数必须在 **hash 之前**：本站是哈希路由，
   * 写成 `#/discussions&t=123` 会让路由路径变成 `/discussions&t=123`，
   * 匹配不上任何路由 → 页面空白、评论框不存在。
   */
  await cdp.send('Page.navigate', { url: `${SITE}?t=${Date.now()}#/discussions` })
  await sleep(3000)
  await waitFor(`document.readyState === 'complete'`, { label: '页面加载完成' })
  await sleep(2500)
  await ev(`scrollTo(0,0)`)
  await sleep(800)
  check('讨论区已加载（有评论输入框）', await ev(`!!document.querySelector('.comment-form')`))
  check('顶部「账号」按钮在位', await ev(`!!document.querySelector('button[title="账号"]')`))

  // ---- 2. 未登录时评论区是登录引导 ----
  console.log('\n【2】未登录时评论区显示登录引导')
  const guestHint = await ev(
    `document.querySelector('.comment-identity-text')?.textContent?.trim() || '(没找到)'`
  )
  check('身份条提示"登录后才能发表评论"', /登录后才能发表评论/.test(guestHint), guestHint)

  const guestDeleteVisible = await ev(
    `[...document.querySelectorAll('.comment-actions button')].some(b => b.textContent.includes('删除'))`
  )
  check('🔴 未登录时**看不到任何删除按钮**', guestDeleteVisible === false, `实际 ${guestDeleteVisible}`)

  // ---- 3. 打开账号弹窗并注册 ----
  console.log('\n【3】注册账号')
  await tapSelector('button[title="账号"]')
  await waitFor(`!!document.querySelector('.acct-switch')`, { label: '账号弹窗打开' })
  check('账号弹窗已打开', true)

  await tapSelector('.acct-switch-btn:nth-child(2)')
  await sleep(600)
  check('切到注册页签', /注册/.test(await ev(`document.querySelector('.acct-switch-btn.is-on')?.textContent || ''`)))

  await setInput('.acct-input[autocomplete="nickname"]', NICK)
  await setInput('.acct-input[autocomplete="new-password"]', PASSWORD)
  await ev(`(() => {
    const els = [...document.querySelectorAll('.acct-input[autocomplete="new-password"]')]
    const el = els[1]
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(PASSWORD)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return 'ok'
  })()`)
  await setInput('.acct-input[autocomplete="email"]', EMAIL)
  await sleep(300)

  // 点「发送验证码」→ 展开蛋点选
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('发送验证码'))
    b?.click()
    return 'ok'
  })()`)
  await waitFor(`!!document.querySelector('.captcha-stage')`, { timeout: 30000, label: '人机验证出题' })
  check('人机验证已出题', true)

  // 按 base64 反推正解，再用真实触摸点击
  // ⚠️ 先把题滚进视口，否则坐标在折叠线以下、触摸落空
  await ev(`document.querySelector('.captcha-stage')?.scrollIntoView({ block: 'center' })`)
  await sleep(400)
  const capInfo = await ev(`(() => {
    const stage = document.querySelector('.captcha-stage')
    const hrefs = [...stage.querySelectorAll('svg image')].map(i => i.getAttribute('href')).filter(h => h.startsWith('data:'))
    const prompt = hrefs.slice(0, 3)
    const canvas = hrefs.slice(3)
    const picks = prompt.map(h => canvas.indexOf(h))
    const hits = [...stage.querySelectorAll('.hit')].map(el => {
      const r = el.getBoundingClientRect()
      return { i: Number(el.dataset.i), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), top: Math.round(r.top) }
    })
    return { picks, hits, imgs: hrefs.length, innerH: innerHeight }
  })()`)
  check('题目含 8 张内联蛋图', capInfo.imgs === 8, `实际 ${capInfo.imgs}`)
  check('正解三个序号都有效', capInfo.picks.every((i) => i >= 0), JSON.stringify(capInfo.picks))
  check('热区都在视口内（否则触摸会落空）', capInfo.hits.every((h) => h.top > 0 && h.top < capInfo.innerH), JSON.stringify(capInfo.hits.map((h) => h.top)))

  const byIndex = new Map(capInfo.hits.map((h) => [h.i, h]))
  const touched = []
  for (const p of capInfo.picks) {
    const h = byIndex.get(p)
    if (!h) {
      touched.push(`#${p}?`)
      continue
    }
    await cdp.tap(h.x, h.y)
    touched.push('#' + p)
  }
  await sleep(500)
  /*
   * 这里**不**断言界面上的 "3 / 3"：那条进度文字在发码成功后会被收起，
   * 时序稍慢就抓不到，属于典型的"测界面瞬时状态"式脆弱断言。
   * 真正要证明的是"这三次触摸被记住了" —— 那由后面"服务端已发码"来证（点错就发不出码）。
   */
  console.log(`     已触摸 ${touched.join(' → ')}（正解 ${capInfo.picks.map((i) => '#' + i).join(' → ')}）`)

  // 等发码成功，再从本地 D1 反解验证码
  await waitFor(
    `[...document.querySelectorAll('.acct-hint')].some(e => e.textContent.includes('验证码已发出'))`,
    { timeout: 30000, label: '验证码已发出' }
  )
  check('服务端已发码（MAIL_STUB 打桩）', true)

  const { readDevVars } = await import('../helpers/localD1.mjs')
  const saltSecret = readDevVars().SALT_SECRET
  const realCode = reader.readCode(await emailLookupHash(EMAIL, saltSecret), 'register')
  check('能从本地 D1 反解出 6 位验证码', /^\d{6}$/.test(realCode || ''), String(realCode))

  await setInput('.acct-input[autocomplete="one-time-code"]', realCode)
  await ev(`(() => { const c = document.querySelector('.acct-agree input[type=checkbox]'); if (c && !c.checked) c.click(); return 'ok' })()`)
  await sleep(300)

  await ev(`(() => { const b = [...document.querySelectorAll('button[type=submit]')].find(x => x.textContent.includes('注册并登录')); b?.click(); return 'ok' })()`)
  await waitFor(`!!document.querySelector('.acct-id-card') || !!document.querySelector('.acct-nick')`, {
    timeout: 30000,
    label: '注册后进入个人中心'
  })
  const no = await ev(`document.querySelector('.acct-no')?.textContent?.trim() || ''`)
  const nickShown = await ev(`document.querySelector('.acct-nick')?.textContent?.trim() || ''`)
  check('注册成功并自动登录', !!nickShown, nickShown)
  check('🔴 个人中心显示编号（在昵称上方）', /编号\s*\d+/.test(no), no)

  // 会话有没有真的落到 localStorage（决定"刷新后还在不在"）
  const persisted = await ev(`(() => {
    const raw = localStorage.getItem('myrzg:auth')
    if (!raw) return { persisted: false, keys: Object.keys(localStorage) }
    try { const j = JSON.parse(raw); return { persisted: !!j.token, nick: j.user?.nick, keys: Object.keys(localStorage) } }
    catch { return { persisted: false, broken: true, keys: Object.keys(localStorage) } }
  })()`)
  check('🔴 会话已写入 localStorage（刷新后仍登录）', persisted.persisted === true, JSON.stringify(persisted))

  // 关掉弹窗
  await ev(`(() => { const b = document.querySelector('.acct-switch')?.closest('.ui-modal')?.querySelector('button[title=关闭], .ui-modal-close'); b?.click(); return 'ok' })()`)
  await sleep(800)

  // ---- 4. 发评论 ----
  console.log('\n【4】以登录身份发评论')
  const identity = await ev(`document.querySelector('.comment-identity-text')?.textContent?.trim() || ''`)
  // 2026-10-07 起身份条**只显示昵称**（去掉了「以…的身份发表」与其下的编号）
  check('身份条显示当前昵称', identity.includes(NICK), identity)

  const bodyText = `手机端测试评论 ${stamp}`
  await ev(`(() => {
    const el = document.querySelector('.comment-editor')
    if (!el) return 'no-editor'
    el.focus()
    el.textContent = ${JSON.stringify(bodyText)}
    el.dispatchEvent(new InputEvent('input', { bubbles: true }))
    return 'ok'
  })()`)
  await sleep(500)
  check('正文已进入编辑器', (await ev(`document.querySelector('.comment-editor')?.textContent || ''`)).includes(stamp))

  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '发布'); b?.click(); return 'ok' })()`)

  // 等"评论出现"或"出现报错"——两者取先到的，失败时把报错一并打出来
  let landed = false
  let composerError = ''
  for (let i = 0; i < 40; i++) {
    landed = await ev(
      `[...document.querySelectorAll('.comment-body, .comment-item, .comment-nested-body')].some(e => e.textContent.includes('${stamp}'))`
    )
    if (landed) break
    composerError = await ev(
      `[...document.querySelectorAll('.comment-form .comment-error, .comment-form .comment-notice, .comment-form [class*=error], .comment-form [class*=notice]')].map(e => e.textContent.trim()).join(' | ')`
    )
    if (composerError) break
    await sleep(600)
  }

  check('🔴 评论已出现在列表', landed === true, composerError ? '页面报错: ' + composerError : '既没出现也没报错')

  // ---- 5. 服务端确实把这条标成了"我的" ----
  console.log('\n【5】服务端正确标记了归属')
  /*
   * ⚠️ **不要在讨论区列表里找「删除」按钮** —— `DiscussionsView` 给
   * `CommentsPanel` 传了 `read-only`（源码里本来就有），所以列表里
   * **从来就不显示删除按钮**；删除入口按设计在「我的评论」里（M5）。
   * 第一版这条断言就是错在这里，白查了很久。
   *
   * 这一层要证的是 M4 的核心：**服务端按会话把这条认成"我的"**。
   * 用页面自己的令牌打一次接口，看 `mine`。
   */
  const mineInfo = await ev(`(async () => {
    const token = (() => { try { return JSON.parse(localStorage.getItem('myrzg:auth'))?.token || '' } catch { return '' } })()
    const res = await fetch('/api/comments?page=site:general&limit=10', {
      headers: token ? { authorization: 'Bearer ' + token } : {}
    })
    const j = await res.json()
    const mine = (j.comments || []).filter(c => c.mine)
    return {
      hasToken: !!token,
      mineCount: mine.length,
      mineNicks: mine.map(c => c.nick),
      // 刚发的那条是不是 mine
      justMine: (j.comments || []).some(c => c.mine && c.nick === ${JSON.stringify(NICK)})
    }
  })()`)
  check('页面持有会话令牌', mineInfo.hasToken === true)
  check('🔴 接口按会话标出 `mine`（自己发的那条认得出）', mineInfo.justMine === true, JSON.stringify(mineInfo))

  // 顺带确认服务端真的记住了归属（不是只靠客户端）
  const persistedMine = await ev(`(async () => {
    const token = JSON.parse(localStorage.getItem('myrzg:auth')).token
    const res = await fetch('/api/auth/comments?limit=5', { headers: { authorization: 'Bearer ' + token } })
    const j = await res.json()
    return { count: (j.comments || []).length }
  })()`)
  check('🔴 「我的评论」接口能按 user_id 查到它（跨设备可用）', persistedMine.count >= 1, JSON.stringify(persistedMine))

  // ---- 6. M5：个人中心里的「我的评论」能看到并删掉 ----
  console.log('\n【6】个人中心 →「我的评论」→ 删除')
  await ev(`scrollTo(0,0)`)
  await sleep(400)
  await tapSelector('button[title="账号"]')
  await waitFor(`!!document.querySelector('.acct-id-card')`, { timeout: 20_000, label: '个人中心打开' })

  // 按**文字**找那一行，不要按位置：个人中心的入口会增减，
  // 「点第一个 .acct-row」在加了「谁回复了我」之后就点错了（这一版就是这么挂的）
  await ev(`(() => {
    const b = [...document.querySelectorAll('.acct-row')].find(x => x.textContent.includes('我的评论'))
    b?.click(); return 'ok'
  })()`)
  /*
   * ⚠️ 等的是**条目**（`.acct-mine-item`），不是容器（`.acct-mine`）——
   * 容器一渲染就显示"正在加载…"，那时列表还是空的。
   * 上一版就是等在容器上，于是读到一个空数组（表现为"删除前 0 → 删除后 1"）。
   */
  await waitFor(`document.querySelectorAll('.acct-mine-item').length > 0`, {
    timeout: 20_000,
    label: '我的评论列表加载完成'
  })

  const listed = await ev(`(() => {
    const items = [...document.querySelectorAll('.acct-mine-item')]
    return {
      count: items.length,
      texts: items.slice(0, 3).map(el => el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60)),
      hasMineText: items.some(el => el.textContent.includes(${JSON.stringify(stamp)}))
    }
  })()`)
  check('🔴 列表里能看到自己刚发的那条', listed.hasMineText === true, JSON.stringify(listed.texts))
  check('每条都带页面名', /站内讨论区/.test(JSON.stringify(listed.texts)), JSON.stringify(listed.texts))

  const before = listed.count
  await tapSelector('.acct-mine-del')
  await sleep(2500)
  const after = await ev(`document.querySelectorAll('.acct-mine-item').length`)
  check('🔴 点删除后从列表消失', after < before, `删除前 ${before} → 删除后 ${after}`)

  // ---- 7. M6：谁回复了我 ----
  console.log('\n【7】谁回复了我（红点 → 列表 → 去看看）')
  {
    /*
     * 用接口造一个"别人"来回复 —— 真机上注册第二个账号要退出登录、走完整套
     * 人机验证，慢且没必要。**被验证的部分仍然在真机界面上**：
     * 红点、列表、跳转都是真的点出来的。
     */
    const { createAccount, postComment } = await import('../helpers/accountApi.mjs')
    const API = 'http://127.0.0.1:8788'

    // 先让手机再发一条评论当"被回复的原评论"
    const rootId = await ev(`(async () => {
      const token = JSON.parse(localStorage.getItem('myrzg:auth')).token
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ page: 'site:general', pageLabel: '站内讨论区', body: '手机 M6 原评论 ${stamp}', hp: '' })
      })
      return (await res.json())?.comment?.id
    })()`)
    check('手机端发出被回复的原评论', Boolean(rootId), String(rootId))

    const other = await createAccount(API, reader)
    const replyBody = `手机 M6 回复 ${stamp}`
    const reply = await postComment(API, other.token, { body: replyBody, parentId: rootId })
    check('造出"别人"的回复', Boolean(reply?.id), String(reply?.id))

    // 关掉再打开弹窗 → 未读数才会重新取一次
    await ev(`(() => { const m = document.querySelector('.ui-modal-close, button[title=关闭]'); m?.click(); return 'ok' })()`)
    await sleep(1200)
    await tapSelector('button[title="账号"]')
    await waitFor(`!!document.querySelector('.acct-id-card')`, { timeout: 20_000, label: '个人中心重开' })

    const badge = await ev(`document.querySelector('.acct-badge')?.textContent?.trim() || ''`)
    check('🔴 未读红点出现且为 1', badge === '1', `实际 "${badge}"`)

    // 进列表看回复
    const rows = await ev(`[...document.querySelectorAll('.acct-row')].map(el => el.textContent.replace(/\\s+/g,' ').trim())`)
    await ev(`(() => {
      const b = [...document.querySelectorAll('.acct-row')].find(x => x.textContent.includes('谁回复了我'))
      b?.click(); return 'ok'
    })()`)
    // 同「我的评论」：等条目而不是等容器
    await waitFor(`document.querySelectorAll('.acct-mine-item').length > 0`, {
      timeout: 20_000,
      label: '回复列表加载完成'
    })

    const got = await ev(`(() => {
      const items = [...document.querySelectorAll('.acct-mine-item')]
      return {
        count: items.length,
        hasReply: items.some(el => el.textContent.includes(${JSON.stringify(replyBody)})),
        nick: items[0]?.querySelector('.acct-reply-nick')?.textContent?.trim() || '',
        texts: items.slice(0, 2).map(el => el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70))
      }
    })()`)
    check('🔴 列表里能看到别人的回复', got.hasReply === true, JSON.stringify(got.texts))
    check('带上回复者昵称', got.nick === other.nick, `实际 "${got.nick}" / 期望 "${other.nick}"`)

    // 返回后红点应已清掉（进页面即标已读）
    await tapSelector('.acct-back')
    await waitFor(`!!document.querySelector('.acct-id-card')`, { timeout: 20_000, label: '回到个人中心' })
    const badgeAfter = await ev(`document.querySelectorAll('.acct-badge').length`)
    check('🔴 看过之后红点消失', badgeAfter === 0, `还剩 ${badgeAfter} 个`)

    // 「去看看」：关弹窗并落到讨论区
    await ev(`(() => {
      const b = [...document.querySelectorAll('.acct-row')].find(x => x.textContent.includes('谁回复了我'))
      b?.click(); return 'ok'
    })()`)
    await waitFor(`!!document.querySelector('.acct-mine-link')`, { timeout: 20_000, label: '回复列表就绪' })
    await tapSelector('.acct-mine-link')
    await sleep(3000)

    const landed = await ev(`({
      modalGone: document.querySelectorAll('.ui-modal-overlay').length === 0,
      hash: location.hash,
      hasPanel: !!document.querySelector('.discussions-panel, .comments-panel, .discussion-scroll')
    })`)
    check('🔴 「去看看」关掉弹窗并落到讨论区', landed.modalGone && /discussions/.test(landed.hash), JSON.stringify(landed))
  }

  // ---- 8. M7：后台在手机上也能用 ----
  console.log('\n【8】后台（独立外壳 + 三个页签）')
  {
    /*
     * 后台是给站长用的、以桌面为主，但"手机上能不能打开、能不能看"仍要过一遍：
     * 站长多半是在手机上收到反馈、顺手就要去处理。
     */
    const { readDevVars } = await import('../helpers/localD1.mjs')
    const adminToken = readDevVars().ADMIN_TOKEN

    /*
     * 🔴 先把令牌**在当前页**清掉，再用带 cache-buster 的地址**整页加载**一次。
     *
     * 第一版写的是「navigate 到 #/admin → 清令牌 → Page.reload → 等 .admin-shell」，
     * 结果 `waitFor` 判到的是**重载前那个旧文档**（`Page.navigate` 只改 hash
     * 不重新加载，所以旧文档里 .admin-shell 已经在了），而紧随其后的
     * `check` 求值时文档**已经被 reload 换掉** —— 于是"等到了"却"查不到"，
     * 报出 `❌ 后台是独立外壳` 这种自相矛盾的结果。
     *
     * 一次干净导航就没有这个窗口期 ✅
     * （cache-buster 必须放在 `#` **之前**，否则它会被当成 hash 的一部分。）
     */
    await ev(`(() => { try { localStorage.removeItem('myrzg:admin-token') } catch {} ; return 'ok' })()`)
    await cdp.send('Page.navigate', { url: `${SITE}?t=${Date.now()}#/admin` })
    await waitFor(
      `document.readyState === 'complete' && !!document.querySelector('.admin-shell')`,
      { timeout: 30_000, label: '后台外壳' }
    )
    check('🔴 后台是独立外壳（盖住站点头部）', await ev(`!!document.querySelector('.admin-shell')`))

    // 闸门：没令牌时不该露出页签
    check('未填令牌时不露页签', (await ev(`document.querySelectorAll('.admin-tabs').length`)) === 0)

    await ev(`(() => {
      const el = document.querySelector('.admin-gate input')
      if (!el) return 'no-input'
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(el, ${JSON.stringify(adminToken)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return 'ok'
    })()`)
    await sleep(300)
    await tapSelector('.admin-gate .admin-btn')
    await waitFor(`!!document.querySelector('.admin-tabs')`, { timeout: 30_000, label: '进入后台' })
    check('🔴 令牌校验通过、页签出现', true)

    await waitFor(`document.querySelectorAll('.stat-card').length === 4`, { timeout: 30_000, label: '概览数字' })
    check('概览显示 4 张统计卡', true)
    check('近 7 天有 7 根柱子', (await ev(`document.querySelectorAll('.chart-col').length`)) === 7)

    // 切到评论页
    await ev(`(() => {
      const t = [...document.querySelectorAll('.admin-tab')].find(x => x.textContent.includes('评论'))
      t?.click(); return 'ok'
    })()`)
    await waitFor(`location.hash === '#/admin/comments'`, { timeout: 20_000, label: '评论页' })
    await waitFor(`document.querySelectorAll('.admin-table tbody tr').length > 0`, {
      timeout: 30_000,
      label: '评论表格'
    })
    check('🔴 评论页在手机上列出了真实数据', true)

    // 切到用户页，并按对外编号搜
    await ev(`(() => {
      const t = [...document.querySelectorAll('.admin-tab')].find(x => x.textContent.includes('用户'))
      t?.click(); return 'ok'
    })()`)
    await waitFor(`location.hash === '#/admin/users'`, { timeout: 20_000, label: '用户页' })
    await waitFor(`document.querySelectorAll('.admin-table tbody tr').length > 0`, {
      timeout: 30_000,
      label: '用户表格'
    })
    check('🔴 用户页在手机上列出了真实数据', true)
  }

  console.log(`\n================ 真机结果：通过 ${pass} / 失败 ${fail} ================`)
} finally {
  cdp.close()
  reader.close()
}

process.exit(fail ? 1 : 0)

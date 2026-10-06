/**
 * 测试用的"直接调接口建账号"助手。
 *
 * ## 为什么需要它
 *
 * 端到端（`tests/api/*.mjs`）与 Playwright（`tests/ui/*.spec.js`）都经常需要
 * **造出第二个用户** —— 比如「谁回复了我」必须有人来回复你，
 * 而用界面走两遍注册（还要退出登录）又慢又脆。
 *
 * 这里把"建账号"这件事收成一个函数：出题 → 按 base64 反推正解 →
 * 从本地 D1 反解验证码 → 注册。等价于一个看懂图的真人，但快得多。
 *
 * ## 用法
 *
 * ```js
 * import { createCodeReader } from './localD1.mjs'
 * import { api, createAccount, postComment } from './accountApi.mjs'
 *
 * const reader = createCodeReader()
 * const alice = await createAccount('http://127.0.0.1:8788', reader, { nick: '甲' })
 * const bob = await createAccount('http://127.0.0.1:8788', reader, { nick: '乙' })
 * const c = await postComment(base, alice.token, { page: 'site:general', body: '在吗' })
 * await postComment(base, bob.token, { page: 'site:general', body: '在', parentId: c.id })
 * ```
 */

import { CAPTCHA_EGGS } from '../../src/config/captchaEggs.js'
import { emailLookupHash } from '../../src/utils/authCrypto.js'
import { deriveVerifier, generatePasswordSalt } from '../../src/utils/passwordKdf.js'

/** 蛋图 base64 → 蛋 id（用来把服务端 SVG 里的图还原成"题目要哪几个"） */
const B64_TO_ID = new Map(CAPTCHA_EGGS.map((e) => [e.b64, e.id]))

/** 统一的请求包装：返回 `{status, json, text}`，**不抛错**（断言由调用方做） */
export async function api(base, method, path, { body, token } = {}) {  const init = { method, headers: {} }
  if (token) init.headers.authorization = 'Bearer ' + token
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(base + path, init)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 非 JSON 响应（如 502 HTML），保持 null 让调用方按 text 判断 */
  }
  return { status: res.status, json, text }
}

/**
 * 解一道人机验证题 —— **不需要看得懂图**：
 * SVG 里的蛋图是内联 base64，把它换回蛋 id，再在画布里找出同 id 的下标即可。
 */
export async function solveCaptcha(base) {
  const c = await api(base, 'GET', '/api/auth/captcha')
  if (c.status !== 200 || !c.json?.svg) throw new Error('取人机验证题失败: ' + c.status + ' ' + c.text.slice(0, 80))
  // 站点主背景图不是 data URI，要按前缀剔掉（它也算一个 <image>）
  const images = [...c.json.svg.matchAll(/<image href="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((h) => h.startsWith('data:'))
  const prompt = images.slice(0, 3).map((b) => B64_TO_ID.get(b))
  const canvas = images.slice(3).map((b) => B64_TO_ID.get(b))
  return { captchaId: c.json.captchaId, picks: prompt.map((id) => canvas.indexOf(id)) }
}

/**
 * 建一个账号并返回会话。
 *
 * 昵称**必须唯一**（服务端全站唯一），所以默认带时间戳；
 * 调用方传 `nick` 时自己保证唯一，否则会 409。
 */
export async function createAccount(base, reader, { nick, avatar = 'at001_0', password = 'Correct-Horse-Battery-9' } = {}) {
  const stamp = Math.random().toString(36).slice(2, 8)
  const email = `t-${stamp}@example.com`
  const finalNick = nick || `测${stamp.slice(-4)}`

  const cap = await solveCaptcha(base)
  const sent = await api(base, 'POST', '/api/auth/code', {
    body: {
      email,
      purpose: 'register',
      captchaId: cap.captchaId,
      picks: cap.picks
    }
  })
  if (sent.status !== 200) throw new Error('发码失败: ' + sent.status + ' ' + sent.text.slice(0, 100))

  const { saltSecret } = reader
  const code = reader.readCode(await emailLookupHash(email, saltSecret), 'register')
  if (!/^\d{6}$/.test(code || '')) throw new Error('没能从本地 D1 反解出验证码')

  /*
   * 盐由**客户端随机生成**（2026-10-07 起），注册时随请求一起提交。
   * 不能再去 `GET /api/auth/salt` 取 —— 未注册邮箱那时返回的是**占位盐**，
   * 用它派生的 verifier 与存下来的随机盐对不上，注册成功但**永远登不上**。
   * 这里必须与 `authSession.registerAccount` 的真实流程一致。
   */
  const salt = generatePasswordSalt()
  const verifier = await deriveVerifier(password, salt)

  const reg = await api(base, 'POST', '/api/auth/register', {
    body: { email, code, verifier, salt, nick: finalNick, avatar }
  })
  if (reg.status !== 200) throw new Error('注册失败: ' + reg.status + ' ' + reg.text.slice(0, 120))

  return { token: reg.json.token, user: reg.json.user, email, nick: finalNick, password }
}

/** 以某个账号发一条评论（`parentId` 有值就是回复） */
export async function postComment(base, token, { page = 'site:general', pageLabel = '站内讨论区', body, parentId } = {}) {
  const r = await api(base, 'POST', '/api/comments', {
    token,
    body: { page, pageLabel, body, hp: '', parentId }
  })
  if (r.status !== 201) throw new Error('发评论失败: ' + r.status + ' ' + r.text.slice(0, 120))
  return r.json.comment
}

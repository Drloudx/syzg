/**
 * 账号体系端到端实测（跑在**本地 wrangler pages dev** 上）。
 *
 * 用法：
 *   1. 另开一个终端跑 `npm run dev:api`（占 8788）
 *   2. `npm run test:api`
 *
 * ## 为什么能自动拿到验证码与验证码答案
 *
 * 两样东西都是**服务端才该知道的秘密**，所以测试脚本用"从本地 D1 反解"的方式拿：
 * - 人机验证答案：从 SVG 里按 base64 反推出用户会点哪三个 → 这是**模拟真人**；
 *   再拿它去和 D1 里存的 pepper 哈希做 60 次穷举比对 → 顺便验证了哈希链没写错；
 * - 邮箱验证码：拿 `code_hash` 暴力枚举 000000~999999（本地 pepper 已知）→
 *   约 1~2 秒。**这恰好从反面证明了"裸 SHA-256 不可用"**：6 位码的空间太小，
 *   拿到哈希就能瞬间反解 —— 所以生产必须带 `AUTH_PEPPER`。
 *
 * ## 这个套件已经抓到过两个单测抓不到的 bug
 *
 * 1. **换邮箱会让密码失效**（盐是按邮箱派生的，换邮箱后盐变了，而库里存的是旧盐算的 verifier）；
 * 2. **换邮箱时不会给"新邮箱"发码**（新邮箱通常尚未注册，被"非注册用户不发信"的规则误杀）。
 *
 * 两个都是"每个函数单独都对、连起来才错"的类型 —— 所以这一层不能省。
 */

import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

import { CAPTCHA_EGGS } from '../../src/config/captchaEggs.js'
import { emailLookupHash } from '../../src/utils/authCrypto.js'
import { deriveVerifier, generatePasswordSalt } from '../../src/utils/passwordKdf.js'

const BASE = 'http://127.0.0.1:8788'
const ROOT = path.resolve(import.meta.dirname, '../..')

// ---- 从 .dev.vars 读本地密钥（脚本不硬编码，避免与配置漂移）----
const devVars = Object.fromEntries(
  readFileSync(path.join(ROOT, '.dev.vars'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const PEPPER = devVars.AUTH_PEPPER
const SALT_SECRET = devVars.SALT_SECRET
if (!PEPPER || !SALT_SECRET) throw new Error('.dev.vars 缺 AUTH_PEPPER / SALT_SECRET')

// ---- 本地 D1（只读）----
const d1Dir = path.join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
const d1File = readdirSync(d1Dir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
const db = new DatabaseSync(path.join(d1Dir, d1File), { readOnly: true })

/*
 * 崩了也要先把 SQLite 关掉。
 * 不关的话 Node 退出时会多抛一句 libuv 断言
 * （`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`），
 * 把真正的错误盖在后面，排查时白绕一圈。
 */
process.on('uncaughtException', (err) => {
  console.error('\n  ❌ 未捕获错误: ' + (err?.stack || err))
  try { db.close() } catch {}
  process.exit(1)
})

const pepperHashSync = (v) => createHmac('sha256', PEPPER).update(String(v)).digest('hex')
const q = (sql, ...args) => db.prepare(sql).all(...args)

// ============================================================
// 断言与计数
// ============================================================
let pass = 0
let fail = 0
const failures = []

function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    failures.push(name + (detail ? ' — ' + detail : ''))
    console.log(`  ❌ ${name}${detail ? '  [' + detail + ']' : ''}`)
  }
}

async function api(method, p, body, token) {
  const init = { method, headers: {} }
  if (token) init.headers.authorization = 'Bearer ' + token
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(BASE + p, init)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, text }
}

/** 管理端走 `x-admin-token`（与用户令牌是不同的认证头）。 */
async function adminApi(method, p, body, token = devVars.ADMIN_TOKEN) {
  const init = { method, headers: { 'x-admin-token': token } }
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(BASE + p, init)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, text }
}

// ============================================================
// 取人机验证答案：从 SVG 反推（= 模拟真人看图）
// ============================================================
const b64ToId = new Map(CAPTCHA_EGGS.map((e) => [e.b64, e.id]))

async function freshCaptcha() {
  const r = await api('GET', '/api/auth/captcha')
  if (r.status !== 200) throw new Error('取验证码失败: ' + r.text)
  const { captchaId, svg } = r.json
  /*
   * ⚠️ 必须先剔掉**站点主背景图**：SVG 里现在有 9 张 `<image>`
   * （1 张背景 URL + 8 张蛋图 base64）。不剔的话切片整体错位一位，
   * 算出来的 picks 全是 -1。
   * M3 前端凡是按序号取图的地方同理。
   */
  const images = [...svg.matchAll(/<image href="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((h) => h.startsWith('data:'))
  if (images.length !== 8) throw new Error('SVG 里蛋图数量不是 8，实际 ' + images.length)
  const promptIds = images.slice(0, 3).map((b) => b64ToId.get(b))
  const canvasIds = images.slice(3).map((b) => b64ToId.get(b))
  if (promptIds.some((x) => !x) || canvasIds.some((x) => !x)) throw new Error('SVG 里有认不出的蛋图')
  const picks = promptIds.map((id) => canvasIds.indexOf(id))
  if (picks.some((i) => i < 0)) throw new Error('提示里的蛋不在画布上')
  return { captchaId, svg, picks, promptIds, canvasIds }
}

/** 校验 D1 里存的答案哈希确实对应 picks（穷举 5×4×3=60 种）。 */
function bruteForceCaptchaAnswer(storedHash) {
  const perms = []
  for (let a = 0; a < 5; a++)
    for (let b = 0; b < 5; b++)
      for (let c = 0; c < 5; c++) {
        if (a === b || a === c || b === c) continue
        perms.push(`${a},${b},${c}`)
      }
  return perms.find((p) => pepperHashSync(p) === storedHash) || null
}

/** 从 D1 反解 6 位验证码。 */
function bruteForceCode(storedHash) {
  for (let i = 0; i < 1_000_000; i++) {
    const code = String(i).padStart(6, '0')
    if (pepperHashSync(code) === storedHash) return code
  }
  return null
}

async function readCode(email, purpose) {
  const eh = await emailLookupHash(email, SALT_SECRET)
  const rows = q(
    `SELECT code_hash FROM auth_codes WHERE email_hash = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1`,
    eh,
    purpose
  )
  if (!rows.length) return null
  return bruteForceCode(rows[0].code_hash)
}

/** 走一遍"出新题 → 自动答对 → 发码 → 反解验证码"。 */
async function sendCode(email, purpose) {
  const cap = await freshCaptcha()
  const r = await api('POST', '/api/auth/code', {
    email,
    purpose,
    captchaId: cap.captchaId,
    picks: cap.picks
  })
  if (r.status !== 200 || !r.json?.ok) throw new Error(`发码失败(${purpose}): ${r.status} ${r.text}`)
  const code = await readCode(email, purpose)
  if (!code) throw new Error(`反解验证码失败(${purpose})`)
  return { code, cap }
}

// ============================================================
// 正式开跑
// ============================================================
const stamp = Date.now().toString(36)
const EMAIL = `e2e-${stamp}@example.com`
const NICK = `测试${stamp.slice(-4)}`
const PASSWORD = 'Correct-Horse-Battery-9'
const PASSWORD2 = 'Another-Passphrase-77'

console.log('\n================ 账号体系端到端实测 ================')
console.log(`  邮箱: ${EMAIL}`)
console.log(`  昵称: ${NICK}\n`)

// ---- 1. 探活与 fail-closed ----
console.log('【1】基础探活')
{
  const h = await api('GET', '/api/health')
  check('GET /api/health 返回 200', h.status === 200, `实际 ${h.status}`)

  const c = await api('GET', '/api/auth/captcha')
  check('GET /api/auth/captcha 返回 200（密钥已配，非 503）', c.status === 200, `实际 ${c.status} ${c.text.slice(0, 80)}`)
  check('响应里有 captchaId', typeof c.json?.captchaId === 'string' && c.json.captchaId.length === 64)
  check('响应里有 SVG', typeof c.json?.svg === 'string' && c.json.svg.startsWith('<svg'))
  check('🔴 响应里**没有** answer/picks 字段（不泄漏答案）', !('answer' in c.json) && !('picks' in c.json))
}

// ---- 2. 人机验证答案与 D1 哈希一致 ----
console.log('\n【2】人机验证：SVG 反推的答案必须与库里哈希一致')
{
  const cap = await freshCaptcha()
  const row = q(`SELECT answer FROM captchas WHERE id = ?`, cap.captchaId)
  check('题目已入库', row.length === 1)
  const recovered = bruteForceCaptchaAnswer(row[0].answer)
  check('🔴 库里哈希 == SVG 反推的答案（排除掉 60 种里唯一命中）', recovered === cap.picks.join(','), `库=${recovered} 推断=${cap.picks.join(',')}`)
  check('答案是 3 个互不相同的 0~4 序号', new Set(cap.picks).size === 3 && cap.picks.every((p) => p >= 0 && p < 5))
}

// ---- 3. 答错人机验证 → 拒绝，且题目作废 ----
console.log('\n【3】答错一次即整题作废')
{
  const cap = await freshCaptcha()
  const wrong = [0, 1, 2].join(',') === cap.picks.join(',') ? [4, 3, 2] : [0, 1, 2]
  const r1 = await api('POST', '/api/auth/code', { email: EMAIL, purpose: 'register', captchaId: cap.captchaId, picks: wrong })
  check('答错 → 403', r1.status === 403, `实际 ${r1.status}`)
  const r2 = await api('POST', '/api/auth/code', { email: EMAIL, purpose: 'register', captchaId: cap.captchaId, picks: cap.picks })
  check('🔴 同一题再答对也无效（题目已作废）', r2.status === 403, `实际 ${r2.status}`)
  check('作废后库里该题已删除', q(`SELECT id FROM captchas WHERE id = ?`, cap.captchaId).length === 0)
}

// ---- 4. 输入校验 ----
console.log('\n【4】输入校验')
{
  const cap = await freshCaptcha()
  const bad = await api('POST', '/api/auth/code', { email: 'not-an-email', purpose: 'register', captchaId: cap.captchaId, picks: cap.picks })
  check('非法邮箱 → 400', bad.status === 400, `实际 ${bad.status}`)

  const cap2 = await freshCaptcha()
  const disp = await api('POST', '/api/auth/code', { email: 'x@mailinator.com', purpose: 'register', captchaId: cap2.captchaId, picks: cap2.picks })
  check('一次性邮箱 → 400 且给出专门文案', disp.status === 400 && /临时邮箱/.test(disp.json?.error || ''), disp.json?.error)

  const cap3 = await freshCaptcha()
  const badPurpose = await api('POST', '/api/auth/code', { email: EMAIL, purpose: 'hack', captchaId: cap3.captchaId, picks: cap3.picks })
  check('非法 purpose → 400', badPurpose.status === 400, `实际 ${badPurpose.status}`)
}

// ---- 5. 取盐 + 注册 ----
console.log('\n【5】取盐与注册（真跑客户端 KDF）')
let token = null
let publicNo = null
{
  const s = await api('GET', `/api/auth/salt?email=${encodeURIComponent(EMAIL)}`)
  check('GET /api/auth/salt 返回 200', s.status === 200)
  check('未注册邮箱返回占位盐（64 位 hex）', /^[a-f0-9]{64}$/.test(s.json?.salt || ''))
  check('返回 iters=600000', s.json?.iters === 600000)

  /*
   * 🔴 注册用的盐**必须客户端随机生成**，不能用上面那个占位盐。
   *
   * 占位盐是 `HMAC(SALT_SECRET, 'placeholder:'+邮箱)`，它不等于注册时存进
   * `pw_salt` 的随机盐 —— 拿它派生 verifier 会注册成功、**之后永远登不上**。
   * 这条断言（下面的"注册后用存下来的盐登录"）就是用来兜住这种不一致的。
   */
  const salt = generatePasswordSalt()
  check('随机盐是 64 位 hex', /^[a-f0-9]{64}$/.test(salt))
  check('🔴 随机盐与占位盐不同（证明不是派生值）', salt !== s.json.salt)

  const t0 = Date.now()
  const verifier = await deriveVerifier(PASSWORD, salt)
  const kdfMs = Date.now() - t0
  check('客户端 KDF 产出 64 位 hex verifier', /^[a-f0-9]{64}$/.test(verifier), verifier?.slice(0, 16))
  console.log(`     （本次 KDF 耗时 ${kdfMs}ms）`)

  // 先试试用错的验证码注册
  const wrongCode = await api('POST', '/api/auth/register', {
    email: EMAIL, code: '000000', verifier, salt, nick: NICK, avatar: 'at001_0'
  })
  check('验证码错 → 400', wrongCode.status === 400, `实际 ${wrongCode.status} ${wrongCode.text.slice(0, 60)}`)

  // 盐形状不对必须被拒（否则是一道免费的 CPU/存储放大口子）
  const { code: codeForSaltTest } = await sendCode(EMAIL, 'register')
  const badSalt = await api('POST', '/api/auth/register', {
    email: EMAIL, code: codeForSaltTest, verifier, salt: 'not-a-valid-salt', nick: NICK, avatar: 'at001_0'
  })
  check('🔴 盐形状不对 → 400', badSalt.status === 400, `实际 ${badSalt.status}`)

  const { code } = await sendCode(EMAIL, 'register')
  check('能从 D1 反解出 6 位验证码（证明 pepper 链路一致）', /^\d{6}$/.test(code))

  const reg = await api('POST', '/api/auth/register', { email: EMAIL, code, verifier, salt, nick: NICK, avatar: 'at001_0' })
  check('注册成功 → 200', reg.status === 200, `实际 ${reg.status} ${reg.text.slice(0, 120)}`)
  check('返回会话令牌（64 hex）', /^[a-f0-9]{64}$/.test(reg.json?.token || ''))
  check('返回用户对象', Boolean(reg.json?.user))
  check('🔴 对外编号从 10000 起', reg.json?.user?.id >= 10000, `实际 ${reg.json?.user?.id}`)
  check('🔴 响应里**不含**内部自增 id / verifier_hash', !('verifierHash' in (reg.json?.user || {})) && !('verifier_hash' in (reg.json?.user || {})))
  token = reg.json?.token
  publicNo = reg.json?.user?.id

  // 验证码一次性
  const reuse = await api('POST', '/api/auth/register', { email: EMAIL, code, verifier, salt, nick: NICK + 'x', avatar: 'at001_0' })
  check('🔴 同一验证码不能复用', reuse.status !== 200, `实际 ${reuse.status}`)

  // 昵称唯一
  const { code: code2 } = await sendCode(`other-${stamp}@example.com`, 'register')
  const otherSalt = generatePasswordSalt()
  const dupNick = await api('POST', '/api/auth/register', {
    email: `other-${stamp}@example.com`, code: code2,
    verifier: await deriveVerifier(PASSWORD, otherSalt), salt: otherSalt, nick: NICK, avatar: 'at001_0'
  })
  check('昵称重复 → 409', dupNick.status === 409, `实际 ${dupNick.status} ${dupNick.text.slice(0, 60)}`)
}

// ---- 6. 登录与防枚举 ----
console.log('\n【6】登录与防枚举')
let token2 = null
{
  const me = await api('GET', '/api/auth/me', undefined, token)
  check('GET /api/auth/me 带令牌 → 200', me.status === 200, `实际 ${me.status}`)
  check('me 返回同一个对外编号', me.json?.user?.id === publicNo)

  const noToken = await api('GET', '/api/auth/me')
  check('不带令牌 → 401', noToken.status === 401, `实际 ${noToken.status}`)

  const good = await api('POST', '/api/auth/login', { email: EMAIL, verifier: await deriveVerifier(PASSWORD, (await api('GET', `/api/auth/salt?email=${encodeURIComponent(EMAIL)}`)).json.salt) })
  check('正确密码登录 → 200', good.status === 200, `实际 ${good.status} ${good.text.slice(0, 80)}`)
  token2 = good.json?.token

  const badPw = await api('POST', '/api/auth/login', { email: EMAIL, verifier: 'f'.repeat(64) })
  const unknownEmail = await api('POST', '/api/auth/login', { email: `nobody-${stamp}@example.com`, verifier: 'f'.repeat(64) })
  check('密码错 → 401', badPw.status === 401, `实际 ${badPw.status}`)
  check('未注册邮箱 → 也是 401', unknownEmail.status === 401, `实际 ${unknownEmail.status}`)
  check('🔴 两种失败的文案完全相同（防账号枚举）', badPw.json?.error === unknownEmail.json?.error, `密码错="${badPw.json?.error}" 不存在="${unknownEmail.json?.error}"`)
}

// ---- 7. 改密码 ----
console.log('\n【7】改密码（只用邮箱验证码授权）')
{
  const { code } = await sendCode(EMAIL, 'password')
  const newVerifier = await deriveVerifier(PASSWORD2, (await api('GET', `/api/auth/salt?email=${encodeURIComponent(EMAIL)}`)).json.salt)
  const r = await api('POST', '/api/auth/password', { code, verifier: newVerifier }, token)
  check('改密码成功 → 200', r.status === 200, `实际 ${r.status} ${r.text.slice(0, 80)}`)

  const oldPw = await api('POST', '/api/auth/login', { email: EMAIL, verifier: await deriveVerifier(PASSWORD, (await api('GET', `/api/auth/salt?email=${encodeURIComponent(EMAIL)}`)).json.salt) })
  check('旧密码已失效 → 401', oldPw.status === 401, `实际 ${oldPw.status}`)

  const newPw = await api('POST', '/api/auth/login', { email: EMAIL, verifier: newVerifier })
  check('新密码可登录 → 200', newPw.status === 200, `实际 ${newPw.status}`)

  // 改密码应作废"其余"会话，保留当前这台
  const oldSession = await api('GET', '/api/auth/me', undefined, token2)
  check('旧会话已被踢下线 → 401', oldSession.status === 401, `实际 ${oldSession.status}`)
  const keptSession = await api('GET', '/api/auth/me', undefined, token)
  check('当前会话仍有效（保留自己）', keptSession.status === 200, `实际 ${keptSession.status}`)
}

// ---- 8. 换邮箱（旧+新双验证）----
console.log('\n【8】换邮箱（旧+新双验证）')
const NEW_EMAIL = `e2e-new-${stamp}@example.com`
{
  // 换邮箱**之前**的盐（后面要断言它没变）
  const saltBefore = (await api('GET', `/api/auth/salt?email=${encodeURIComponent(EMAIL)}`)).json?.salt

  const onlyNew = await sendCode(NEW_EMAIL, 'email_change')
  const r1 = await api('POST', '/api/auth/email', { newEmail: NEW_EMAIL, oldCode: '000000', newCode: onlyNew.code }, token)
  check('只给对新邮箱的码、旧码乱填 → 400（旧验证必须过）', r1.status === 400, `实际 ${r1.status} ${r1.text.slice(0, 60)}`)

  const cap = await freshCaptcha()
  check('（换邮箱的第二个码要用新题）', cap.picks.length === 3)
  const oldSide = await sendCode(EMAIL, 'email_change')
  const r2 = await api('POST', '/api/auth/email', { newEmail: NEW_EMAIL, oldCode: oldSide.code, newCode: onlyNew.code }, token)
  check('两个码都对 → 200', r2.status === 200, `实际 ${r2.status} ${r2.text.slice(0, 80)}`)
  check('返回的邮箱已更新', r2.json?.user?.email === NEW_EMAIL, r2.json?.user?.email)

  const oldLogin = await api('POST', '/api/auth/login', { email: EMAIL, verifier: await deriveVerifier(PASSWORD2, (await api('GET', `/api/auth/salt?email=${encodeURIComponent(EMAIL)}`)).json.salt) })
  check('旧邮箱无法再登录 → 401', oldLogin.status === 401, `实际 ${oldLogin.status}`)

  const same = await api('POST', '/api/auth/email', { newEmail: NEW_EMAIL, oldCode: 'x', newCode: 'y' }, token)
  check('换成同一个邮箱 → 400 且提示"不用改"', same.status === 400 && /不用改/.test(same.json?.error || ''), same.json?.error)

  /*
   * 🔴 回归守卫：换邮箱**绝不能改变密码盐**。
   *
   * 盐是按邮箱派生的（salt = HMAC(SALT_SECRET,'salt:'+邮箱)），
   * 而库里存的是按旧盐算的 verifier_hash。如果实现成"每次从当前邮箱现算盐"，
   * 换完邮箱盐就变了 → **用户再也登不上**，且症状是"密码明明是对的"。
   * 这个 bug 单测发现不了（每个函数单独都对），只有把流程连起来跑才暴露。
   * 修法是**把盐存进 users.pw_salt**。
   */
  const saltAfter = (await api('GET', `/api/auth/salt?email=${encodeURIComponent(NEW_EMAIL)}`)).json?.salt
  check('🔴 换邮箱后盐**没变**（否则旧密码会失效）', saltAfter === saltBefore, `前=${saltBefore?.slice(0, 12)} 后=${saltAfter?.slice(0, 12)}`)
  check('🔴 换邮箱后仍能用原密码登录（盐不变的直接后果）',
    (await api('POST', '/api/auth/login', {
      email: NEW_EMAIL,
      verifier: await deriveVerifier(PASSWORD2, saltAfter)
    })).status === 200)
}

// ---- 9. 我的评论 / 回复我的 ----
console.log('\n【9】我的评论与"回复我的"')
{
  const c = await api('GET', '/api/auth/comments', undefined, token)
  check('GET /api/auth/comments → 200', c.status === 200, `实际 ${c.status}`)
  check('返回数组', Array.isArray(c.json?.comments))
  check('新账号评论数为 0', c.json?.comments?.length === 0)

  const r = await api('GET', '/api/auth/replies', undefined, token)
  check('GET /api/auth/replies → 200', r.status === 200, `实际 ${r.status}`)
  check('返回 unread 字段', typeof r.json?.unread === 'number')
  check('新账号未读为 0', r.json?.unread === 0)

  const markRead = await api('POST', '/api/auth/replies/read', {}, token)
  check('POST /api/auth/replies/read → 200', markRead.status === 200, `实际 ${markRead.status}`)

  const noAuth = await api('GET', '/api/auth/comments')
  check('不带令牌查我的评论 → 401', noAuth.status === 401, `实际 ${noAuth.status}`)
}

// ---- 10. 退出登录 ----
console.log('\n【10】退出登录')
{
  const out = await api('POST', '/api/auth/logout', {}, token)
  check('POST /api/auth/logout → 200', out.status === 200, `实际 ${out.status}`)
  const after = await api('GET', '/api/auth/me', undefined, token)
  check('退出后令牌失效 → 401', after.status === 401, `实际 ${after.status}`)
}

// ---- 11. 软删除账号 ----
console.log('\n【11】注销账号（软删除）')
{
  const cap = await freshCaptcha()
  const login2 = await api('POST', '/api/auth/login', { email: NEW_EMAIL, verifier: await deriveVerifier(PASSWORD2, (await api('GET', `/api/auth/salt?email=${encodeURIComponent(NEW_EMAIL)}`)).json.salt) })
  check('注销前能登录', login2.status === 200, `实际 ${login2.status}`)
  const t = login2.json?.token

  const del = await api('DELETE', '/api/auth/me', undefined, t)
  check('DELETE /api/auth/me → 200', del.status === 200, `实际 ${del.status} ${del.text.slice(0, 80)}`)

  const afterDel = await api('GET', '/api/auth/me', undefined, t)
  check('注销后令牌立即失效 → 401', afterDel.status === 401, `实际 ${afterDel.status}`)

  const relogin = await api('POST', '/api/auth/login', { email: NEW_EMAIL, verifier: await deriveVerifier(PASSWORD2, (await api('GET', `/api/auth/salt?email=${encodeURIComponent(NEW_EMAIL)}`)).json.salt) })
  check('注销后无法再登录 → 401', relogin.status === 401, `实际 ${relogin.status}`)

  const rows = q(`SELECT status, email, verifier_hash, nick FROM users WHERE public_no = ?`, publicNo)
  check('库里 status=3', rows[0]?.status === 3, `实际 ${rows[0]?.status}`)
  check('库里邮箱已清空', rows[0]?.email === '', `实际 "${rows[0]?.email}"`)
  check('库里密码哈希已清空', rows[0]?.verifier_hash === '', `实际 "${rows[0]?.verifier_hash}"`)

  const { code: code3 } = await sendCode(NEW_EMAIL, 'register')
  // 盐必须合法，否则会先被「盐形状不对 → 400」挡下，测不到这里想验的 409
  const reclaimSalt = generatePasswordSalt()
  const reclaim = await api('POST', '/api/auth/register', {
    email: NEW_EMAIL, code: code3, verifier: 'a'.repeat(64), salt: reclaimSalt, nick: NICK + 'z', avatar: 'at001_0'
  })
  check('🔴 该邮箱不可被重新注册（防冒用历史评论）', reclaim.status === 409, `实际 ${reclaim.status} ${reclaim.text.slice(0, 60)}`)
}

// ---- 12. 管理端：概览 / 用户 / 封禁踢下线 ----
console.log('\n【12】管理端接口')
{
  // 12.1 认证边界
  for (const p of ['/api/admin/stats', '/api/admin/users', '/api/admin/comments']) {
    const r = await adminApi('GET', p, undefined, '')
    check(`无令牌 GET ${p} → 401`, r.status === 401, `实际 ${r.status}`)
  }
  const wrong = await adminApi('GET', '/api/admin/stats', undefined, 'definitely-wrong-token')
  check('错令牌 → 401（不发 200）', wrong.status === 401, `实际 ${wrong.status}`)
  const unknown = await adminApi('GET', '/api/admin/definitely-not-a-route')
  check('未知管理路径 → 404', unknown.status === 404, `实际 ${unknown.status}`)
  const wrongMethod = await adminApi('POST', '/api/admin/stats', {})
  check('管理端错方法 → 405', wrongMethod.status === 405, `实际 ${wrongMethod.status}`)

  // 12.2 概览
  const stats = await adminApi('GET', '/api/admin/stats')
  check('GET /api/admin/stats → 200', stats.status === 200, `实际 ${stats.status}`)
  check('概览含 comments/users/sessions 三块', Boolean(stats.json?.comments && stats.json?.users && stats.json?.sessions))
  check('评论分状态计数齐全', ['total', 'today', 'replies', 'pending', 'visible', 'hidden'].every((k) => typeof stats.json?.comments?.[k] === 'number'))
  check('用户分状态计数齐全', ['total', 'active', 'banned', 'deleted', 'today'].every((k) => typeof stats.json?.users?.[k] === 'number'))
  check('近 7 天序列是 7 项', stats.json?.comments?.last7d?.length === 7 && stats.json?.users?.last7d?.length === 7)
  check('计数关系自洽（总数 = 正常+封禁+已注销）',
    stats.json?.users?.total === stats.json.users.active + stats.json.users.banned + stats.json.users.deleted)

  // 12.3 建一个新账号，专门用来测封禁
  const banEmail = `e2e-ban-${stamp}@example.com`
  const banNick = `禁测${stamp.slice(-4)}`
  const { code: banCode } = await sendCode(banEmail, 'register')
  // 注册用随机盐（客户端生成），不能用 /api/auth/salt 的占位盐
  const banSalt = generatePasswordSalt()
  const banVerifier = await deriveVerifier(PASSWORD, banSalt)
  const reg = await api('POST', '/api/auth/register', {
    email: banEmail, code: banCode, verifier: banVerifier, salt: banSalt, nick: banNick, avatar: 'at001_0'
  })
  check('为封禁测试建号成功', reg.status === 200, `实际 ${reg.status} ${reg.text.slice(0, 80)}`)
  const banToken = reg.json?.token
  const banPublicNo = reg.json?.user?.id
  const banUserId = q(`SELECT id FROM users WHERE public_no = ?`, banPublicNo)[0]?.id

  // 12.4 列表 / 搜索 / 筛选
  const list = await adminApi('GET', '/api/admin/users?limit=50')
  check('GET /api/admin/users → 200', list.status === 200, `实际 ${list.status}`)
  check('列表里能找到刚建的号', (list.json?.users || []).some((u) => u.publicNo === banPublicNo))
  const byNo = await adminApi('GET', `/api/admin/users?q=${banPublicNo}`)
  check('按对外编号搜得到', (byNo.json?.users || []).some((u) => u.publicNo === banPublicNo), `搜到 ${byNo.json?.users?.length} 条`)
  const byNick = await adminApi('GET', `/api/admin/users?q=${encodeURIComponent(banNick)}`)
  check('按昵称搜得到', (byNick.json?.users || []).some((u) => u.nick === banNick))
  const byStatus = await adminApi('GET', '/api/admin/users?status=2')
  check('按状态筛（封禁=2）→ 全是 2', (byStatus.json?.users || []).every((u) => u.status === 2))
  check('管理端用户行含 commentCount', typeof list.json?.users?.[0]?.commentCount === 'number')

  // 12.5 按 userId 查评论
  const byUser = await adminApi('GET', `/api/admin/comments?userId=${banUserId}`)
  check('GET /api/admin/comments?userId= → 200', byUser.status === 200, `实际 ${byUser.status}`)
  check('管理端评论行带 userId 字段', (byUser.json?.comments || []).every((c) => 'userId' in c))
  check('新账号还没有评论 → 0 条', byUser.json?.comments?.length === 0)

  // 12.6 🔴 封禁必须立即踢下线
  const before = await api('GET', '/api/auth/me', undefined, banToken)
  check('封禁前该账号能访问 /api/auth/me', before.status === 200, `实际 ${before.status}`)

  const ban = await adminApi('PATCH', '/api/admin/users', { id: banUserId, status: 2 })
  check('PATCH 封禁 → 200', ban.status === 200, `实际 ${ban.status} ${ban.text.slice(0, 60)}`)

  const after = await api('GET', '/api/auth/me', undefined, banToken)
  check('🔴 封禁后**原令牌立即失效**（否则就是"封了没封住"）', after.status === 401, `实际 ${after.status}`)

  const banLogin = await api('POST', '/api/auth/login', { email: banEmail, verifier: banVerifier })
  check('🔴 封禁后无法重新登录 → 403 且文案是「已被停用」', banLogin.status === 403 && /停用/.test(banLogin.json?.error || ''), `${banLogin.status} ${banLogin.json?.error}`)

  const sessLeft = q(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`, banUserId)[0]?.n
  check('库里该用户会话已清空', sessLeft === 0, `剩余 ${sessLeft}`)

  // 12.7 解封
  const unban = await adminApi('PATCH', '/api/admin/users', { id: banUserId, status: 1 })
  check('PATCH 解封 → 200', unban.status === 200, `实际 ${unban.status}`)
  const relogin = await api('POST', '/api/auth/login', { email: banEmail, verifier: banVerifier })
  check('解封后可以正常登录', relogin.status === 200, `实际 ${relogin.status}`)

  // 12.8 参数校验
  const badStatus = await adminApi('PATCH', '/api/admin/users', { id: banUserId, status: 3 })
  check('不允许把状态改成 3（注销是用户自己的动作）→ 400', badStatus.status === 400, `实际 ${badStatus.status}`)
  const notFound = await adminApi('PATCH', '/api/admin/users', { id: 99999999, status: 2 })
  check('改不存在的用户 → 404', notFound.status === 404, `实际 ${notFound.status}`)

  // 12.9 彻底删除
  const delUser = await adminApi('DELETE', '/api/admin/users', { id: banUserId })
  check('DELETE 彻底删除 → 200', delUser.status === 200, `实际 ${delUser.status} ${delUser.text.slice(0, 60)}`)
  check('库里用户行已消失', q(`SELECT id FROM users WHERE id = ?`, banUserId).length === 0)
  const gone = await api('POST', '/api/auth/login', { email: banEmail, verifier: banVerifier })
  check('删除后无法登录 → 401', gone.status === 401, `实际 ${gone.status}`)

  // 与"用户自助注销（软删除）"的关键区别：彻底删除会**释放邮箱**
  const { code: reCode } = await sendCode(banEmail, 'register')
  const reReg = await api('POST', '/api/auth/register', {
    email: banEmail, code: reCode, verifier: banVerifier, salt: banSalt, nick: banNick + 'x', avatar: 'at001_0'
  })
  check('🔴 彻底删除后该邮箱可重新注册（软删除则永远不可）', reReg.status === 200, `实际 ${reReg.status} ${reReg.text.slice(0, 80)}`)
}

// ============================================================
console.log('\n================ 结果 ================')
console.log(`  通过 ${pass}   失败 ${fail}`)
if (failures.length) {
  console.log('\n  失败项：')
  failures.forEach((f) => console.log('    · ' + f))
}
db.close()
process.exit(fail ? 1 : 0)

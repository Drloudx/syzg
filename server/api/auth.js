/**
 * 账号注册、登录、验证码、会话资料及个人评论/回复消息接口。
 */
import {
  CAPTCHA_TTL_MS, CODE_COOLDOWN_SEC, CODE_DIGITS, CODE_EMAIL_DAILY_MAX,
  CODE_IP_DAILY_MAX, CODE_IP_HOURLY_MAX, CODE_MAX_ACTIVE, CODE_MAX_ATTEMPTS,
  CODE_TTL_MS, DEFAULT_AVATAR, LOGIN_MAX_FAILS, NICK_MAX, NICK_MIN, PBKDF2_ITERS
} from '../../src/config/auth.js'
import { BLOCKED_EMAIL_DOMAINS } from '../../src/config/disposableEmails.js'
import { invalidateAdminStatsCache } from '../../src/config/adminStatsCache.js'
import { buildCaptcha } from '../../src/utils/authCaptcha.js'
import {
  emailLookupHash, generateNumericCode, generateSessionToken, isDisposableEmail,
  isPlausibleEmail, normalizeEmail, pepperHash, placeholderPasswordSalt, sha256Hex, timingSafeEqualHex
} from '../../src/utils/authCrypto.js'
import { sendVerifyCode } from '../../src/utils/authMail.js'
import {
  AERR, AVATAR_ID_RE, MAX_LIMIT, bad, bump, clientIp, cooldownMessage,
  dayBucket, envLimit, hourBucket, invalidateRecentCache, json, nowSec, positiveInt,
  readBucket, sanitize, writeBucket
} from './shared.js'
import { issueSession, loadSession, revokeSessions, toPublicUser } from './session.js'

/**
 * 发码冷却秒数。可用**环境变量** `AUTH_CODE_COOLDOWN_SEC` 覆盖。
 *
 * 为什么做成可注入（与评论的 `RATE_LIMIT_PER_HOUR` 同一理由）：
 * 端到端测试要在**同一个邮箱**上连发好几个码（注册码 → 改密码码 → 换邮箱码），
 * 生产用的 60 秒会让测试每次都干等一分钟。本地把它设成 0 即可稳定重复运行，
 * **不必在生产代码里塞"测试专用旁路"**。
 *
 * 🔴 **生产不要设置这一项**，用默认 60 秒。
 */
function codeCooldownSeconds(env) {
  if (env.AUTH_CODE_COOLDOWN_SEC === undefined) return CODE_COOLDOWN_SEC
  const n = Number(env.AUTH_CODE_COOLDOWN_SEC)
  return Number.isFinite(n) && n >= 0 ? n : CODE_COOLDOWN_SEC
}

/** 发码冷却：同一邮箱默认 60 秒 1 次。返回 `{ retryAfter }` 或 null。 */
async function checkSendCooldown(env, emailHash, ts) {
  const cooldown = codeCooldownSeconds(env)
  if (cooldown <= 0) return null
  const last = await readBucket(env, `authcd:${emailHash}`)
  if (last != null && ts - last < cooldown) {
    return { retryAfter: cooldown - (ts - last) }
  }
  return null
}

/**
 * 发码限流：**主防线是同邮箱，IP 只做兜底**。
 *
 * 注意阈值不能照搬评论的 5 条/小时 —— 评论是"一个人发内容"，
 * 而注册是**多人共用一个出口**（宿舍/公司/学校的 NAT）。
 * 5 次/小时会让第 6 个真实用户被误伤；被刷只是浪费额度，误伤是真人注册不了。
 *
 * 三个阈值都可用环境变量覆盖（与 `AUTH_CODE_COOLDOWN_SEC` 同一理由：
 * 端到端测试要连跑多轮，必然撞上生产阈值）。**生产不要设置这些项。**
 */
async function checkSendQuota(env, emailHash, ipHash, ts) {
  const emailMax = envLimit(env.AUTH_EMAIL_DAILY_MAX, CODE_EMAIL_DAILY_MAX)
  const ipHourMax = envLimit(env.AUTH_IP_HOURLY_MAX, CODE_IP_HOURLY_MAX)
  const ipDayMax = envLimit(env.AUTH_IP_DAILY_MAX, CODE_IP_DAILY_MAX)

  const emailDay = await bump(env, `authd:${emailHash}:${dayBucket(ts)}`, ts)
  if (emailDay > emailMax) return { message: AERR.tooFrequent, status: 429 }

  if (ipHash) {
    const ipHour = await bump(env, `authh:${ipHash}:${hourBucket(ts)}`, ts)
    if (ipHour > ipHourMax) return { message: AERR.tooFrequent, status: 429 }
    const ipDay = await bump(env, `authd:ip:${ipHash}:${dayBucket(ts)}`, ts)
    if (ipDay > ipDayMax) return { message: AERR.tooFrequent, status: 429 }
  }
  return null
}

// ---------- 邮箱验证码 ----------

/**
 * 生成并入库一个验证码，返回明文（**明文只在这一刻存在**）。
 *
 * 入库的是 `HMAC(AUTH_PEPPER, code)`，不是明文：6 位数字只有 100 万种可能，
 * 裸哈希在毫秒内就能被穷举，等于没哈希。
 *
 * 同时做两件清理：
 *  1. 删掉该 (邮箱, 用途) 的**过期**行；
 *  2. 只保留**最新 `CODE_MAX_ACTIVE` 条**（应对"重发导致乱序到达"）。
 */
async function storeCode(env, emailHash, purpose, ts) {
  const code = generateNumericCode(CODE_DIGITS)
  await env.DB.prepare(
    `INSERT INTO auth_codes (email_hash, purpose, code_hash, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(emailHash, purpose, await pepperHash(code, env.AUTH_PEPPER), ts + Math.floor(CODE_TTL_MS / 1000), ts)
    .run()

  await env.DB.prepare(`DELETE FROM auth_codes WHERE email_hash = ?1 AND purpose = ?2 AND expires_at <= ?3`)
    .bind(emailHash, purpose, ts)
    .run()
  await env.DB.prepare(
    `DELETE FROM auth_codes
     WHERE email_hash = ?1 AND purpose = ?2
       AND id NOT IN (SELECT id FROM auth_codes WHERE email_hash = ?1 AND purpose = ?2
                      ORDER BY created_at DESC, id DESC LIMIT ?3)`
  )
    .bind(emailHash, purpose, CODE_MAX_ACTIVE)
    .run()

  return code
}

/**
 * 校验验证码。**命中即删除该 (邮箱, 用途) 的全部记录**（一次性）。
 *
 * 为什么删"全部"而不是只删命中的那条：同一邮箱可能并存最多 3 个有效码。
 * 若只删一条，**更早那两封邮件里的码仍然有效** —— 于是"改密码已经完成，
 * 但旧邮件里的码还能再改一次密码"。
 */
async function consumeCode(env, emailHash, purpose, code, ts) {
  const failBucket = `authfail:${emailHash}:${purpose}`
  const fails = await bump(env, failBucket, ts)
  if (fails > CODE_MAX_ATTEMPTS) {
    await env.DB.prepare(`DELETE FROM auth_codes WHERE email_hash = ?1 AND purpose = ?2`)
      .bind(emailHash, purpose)
      .run()
    return { ok: false, error: AERR.codeVoid }
  }

  const rows = await env.DB.prepare(
    `SELECT id, code_hash FROM auth_codes
     WHERE email_hash = ?1 AND purpose = ?2 AND expires_at > ?3
     ORDER BY created_at DESC, id DESC LIMIT ?4`
  )
    .bind(emailHash, purpose, ts, CODE_MAX_ACTIVE)
    .all()

  const provided = await pepperHash(String(code || ''), env.AUTH_PEPPER)
  const hit = (rows.results || []).some((r) => timingSafeEqualHex(r.code_hash, provided))

  if (!hit) return { ok: false, error: AERR.codeWrong }

  await env.DB.prepare(`DELETE FROM auth_codes WHERE email_hash = ?1 AND purpose = ?2`)
    .bind(emailHash, purpose)
    .run()
  // 顺手清掉失败计数，避免下次同邮箱发码时被历史失败拖累
  await env.DB.prepare(`DELETE FROM rate_limits WHERE bucket = ?1`).bind(failBucket).run()
  return { ok: true }
}

// ---------- 人机验证（蛋点选） ----------

/** 出题：入库答案（带 pepper 哈希）并把 SVG 返回前端。 */
async function createCaptcha(env, ts) {
  const { svg, answer } = buildCaptcha()
  const id = generateSessionToken() // 复用：32 字节随机 hex
  await env.DB.prepare(
    `INSERT INTO captchas (id, answer, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)`
  )
    .bind(id, await pepperHash(answer, env.AUTH_PEPPER), ts + Math.floor(CAPTCHA_TTL_MS / 1000), ts)
    .run()
  // 顺手清过期题（答题量很小，这里不需要更复杂的清理策略）
  await env.DB.prepare(`DELETE FROM captchas WHERE expires_at <= ?1`).bind(ts).run()
  return { id, svg }
}

/**
 * 校验人机验证。**无论对错都立即删行**（一次性）。
 *
 * 「错 1 次即整题作废」是刻意的：`picks` 只有 5×4×3 = 60 种可能，
 * 若允许同题内重试，脚本几十次就能撞对。
 */
async function consumeCaptcha(env, captchaId, picks, ts) {
  if (!captchaId || !Array.isArray(picks)) return false
  const row = await env.DB.prepare(`SELECT answer, expires_at FROM captchas WHERE id = ?1`)
    .bind(String(captchaId))
    .first()
  if (!row) return false

  // 先删再判：避免校验过程中出现异常导致"可重试"
  await env.DB.prepare(`DELETE FROM captchas WHERE id = ?1`).bind(String(captchaId)).run()
  if (row.expires_at <= ts) return false

  const provided = await pepperHash(picks.map((n) => Number(n)).join(','), env.AUTH_PEPPER)
  return timingSafeEqualHex(row.answer, provided)
}

// ---------- 各接口 ----------

/** `GET /api/auth/captcha` —— 只回 `{ captchaId, svg }`，**绝不回答案**。 */
export async function authCaptcha(env, ts) {
  const { id, svg } = await createCaptcha(env, ts)
  return json({ ok: true, captchaId: id, svg })
}

/**
 * `POST /api/auth/code` —— 发验证码。
 *
 * 🔴 **防枚举的关键**：对"已注册"与"未注册"邮箱**返回完全相同的响应**，
 * 且用 `ctx.waitUntil()` **把真发信挪到响应之后** —— 否则"已注册"那条会慢几百毫秒，
 * 攻击者靠计时就能反推哪些邮箱注册过。
 *
 * 真正"该不该发"的判断也是安全的：`purpose='register'` 时两种邮箱都发
 * （反正注册要验码）；`purpose='password'` 时只给已注册的发信 ——
 * 但响应一模一样，所以**试了也白试**。
 */
export async function authRequestCode(env, request, context) {
  const ts = nowSec()
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad(AERR.badRequest, 400)

  const email = normalizeEmail(body.email)
  const purpose = String(body.purpose || '')
  const ALLOWED = ['register', 'password', 'email_change']
  if (!ALLOWED.includes(purpose)) return bad(AERR.badRequest, 400)
  if (!isPlausibleEmail(email)) return bad(AERR.emailFormat, 400)
  if (isDisposableEmail(email, BLOCKED_EMAIL_DOMAINS)) return bad(AERR.disposableEmail, 400)

  const ip = clientIp(request)
  const ipHash = await sha256Hex(ip + (env.IP_HASH_SALT || ''))
  const emailHash = await emailLookupHash(email, env.SALT_SECRET)

  // 1) 人机验证（最前面：它挡的是"连题目都不做"的脚本，且不消耗任何额度）
  const captchaOk = await consumeCaptcha(env, body.captchaId, body.picks, ts)
  if (!captchaOk) return bad(AERR.captchaFailed, 403)

  // 2) 同邮箱冷却
  const cool = await checkSendCooldown(env, emailHash, ts)
  if (cool) return json({ ok: false, error: cooldownMessage(cool.retryAfter), retryAfter: cool.retryAfter }, 429)

  // 3) 同邮箱日额 + 同 IP 兜底
  const quota = await checkSendQuota(env, emailHash, ipHash, ts)
  if (quota) return bad(quota.message, quota.status)

  // 4) 决定是否真的发信（**这个分支不影响响应内容**）
  const user = await env.DB.prepare(`SELECT id, status FROM users WHERE email_hash = ?1`)
    .bind(emailHash)
    .first()

  /*
   * 只有 `password` 是"非注册用户就不发"：
   *   · `register`     —— 本来就可能是新邮箱，**必须发**；
   *   · `email_change` —— 🔴 **也必须发**：换邮箱是给"旧邮箱 + 新邮箱"各发一个码，
   *                       而**新邮箱通常还没注册过**。按 `password` 那条规则走会把
   *                       新邮箱那半个流程直接掐死，整个"换邮箱"功能不可用。
   *                       （这个 bug 是端到端测试跑出来的，见开发日志。）
   *   · `password`     —— 改密码必然是已登录用户，邮箱一定在库里；
   *                       对不存在的邮箱不发信，少给别人发垃圾邮件。
   */
  const shouldSend = purpose !== 'password' || Boolean(user)
  let sent = false
  if (shouldSend) {
    const code = await storeCode(env, emailHash, purpose, ts)
    await writeBucket(env, `authcd:${emailHash}`, ts)
    // ⚠️ 真发信必须异步：否则"发没发"会体现在响应耗时上，等于给了枚举计时器
    context.waitUntil(
      sendVerifyCode(env, { to: email, code, minutes: CODE_TTL_MS / 60000 }).then((r) => {
        if (!r.ok) console.error('[auth] 发信失败:', r.error)
      })
    )
    sent = true
  } else {
    // 未注册 + 非注册用途：什么都不发，但**冷却照样写入**（否则这个分支能被无限试）
    await writeBucket(env, `authcd:${emailHash}`, ts)
  }

  return json({ ok: true, cooldown: codeCooldownSeconds(env), sent })
}

/**
 * `GET /api/auth/salt` —— 取密码盐。
 *
 * ## 盐现在**每用户独立随机**（2026-10-07 改成对齐主流）
 *
 * 已注册：返回库里存的 `pw_salt`（注册时客户端随机生成、服务端原样存下）。
 * 未注册：返回一个**确定性占位盐**（`placeholderPasswordSalt`），让登录流程
 * 照常走到"邮箱或密码不对"，而不是在取盐这一步就抛错。
 *
 * 🔴 顺带说明：**返回库里的值这一步是必须的**，不能"每次按邮箱现算"。
 * 盐是注册时随机的，现算出来的与注册时那个不同 → 用户**再也登不上**。
 * （老实现是派生盐，现算等于存下来的值，所以没这个问题；改随机后这条就成了硬约束。）
 */
export async function authSalt(env, url) {
  const email = normalizeEmail(url.searchParams.get('email'))
  if (!isPlausibleEmail(email)) return bad(AERR.emailFormat, 400)

  const emailHash = await emailLookupHash(email, env.SALT_SECRET)
  const row = await env.DB.prepare(`SELECT pw_salt FROM users WHERE email_hash = ?1`)
    .bind(emailHash)
    .first()
  // 已注册用库里的随机盐；未注册给确定性占位盐（见 placeholderPasswordSalt 注释）
  const salt = row?.pw_salt || (await placeholderPasswordSalt(email, env.SALT_SECRET))

  return json({ ok: true, salt, iters: PBKDF2_ITERS, algo: 'client-pbkdf2-sha256' })
}

/** `POST /api/auth/register` */
export async function authRegister(env, request, ts) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad(AERR.badRequest, 400)

  const email = normalizeEmail(body.email)
  const nick = sanitize(body.nick, NICK_MAX)
  const avatar = AVATAR_ID_RE.test(String(body.avatar || '')) ? String(body.avatar) : DEFAULT_AVATAR
  const verifier = String(body.verifier || '')
  /*
   * 盐由**客户端随机生成**并随注册请求提交（2026-10-07 起）。
   *
   * 为什么让客户端生成：派生 `verifier` 必须先有盐，而注册时服务端还没见过这个用户。
   * 服务端只做两件事：**校验格式**（64 位小写 hex）与**原样存下**。
   *
   * 🔴 必须校验：盐会参与 PBKDF2，塞进任意长的字符串会变成一道免费的
   *    CPU/存储放大口子；形状不对就直接拒。
   */
  const pwSalt = String(body.salt || '')

  if (!isPlausibleEmail(email)) return bad(AERR.emailFormat, 400)
  if (nick.length < NICK_MIN) return bad(AERR.nickShort, 400)
  if (!/^[a-f0-9]{64}$/.test(verifier)) return bad(AERR.badRequest, 400)
  if (!/^[a-f0-9]{64}$/.test(pwSalt)) return bad(AERR.badRequest, 400)

  const emailHash = await emailLookupHash(email, env.SALT_SECRET)

  // 🔴 先验码：这一步之后才允许出现"该邮箱已注册"这类提示，
  //    否则注册接口本身就成了账号枚举器（验证码只有邮箱主人拿得到）。
  const codeOk = await consumeCode(env, emailHash, 'register', body.code, ts)
  if (!codeOk.ok) return bad(codeOk.error, 400)

  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email_hash = ?1`)
    .bind(emailHash)
    .first()
  if (existing) return bad(AERR.emailTaken, 409)

  const nickTaken = await env.DB.prepare(`SELECT id FROM users WHERE nick = ?1`).bind(nick).first()
  if (nickTaken) return bad(AERR.nickTaken, 409)

  const verifierHash = await pepperHash(verifier, env.AUTH_PEPPER)
  // 盐已在上面校验过格式，这里直接存客户端提交的那个（每用户独立随机）
  try {
    // public_no = 9999 + id 的等价写法：MAX+1，起始 10000。UNIQUE 兜住并发撞号。
    await env.DB.prepare(
      `INSERT INTO users (public_no, email, email_hash, nick, avatar, verifier_hash,
                          pw_salt, pw_algo, pw_iters, status, created_at, last_login_at)
       VALUES ((SELECT COALESCE(MAX(public_no), 9999) + 1 FROM users), ?1, ?2, ?3, ?4, ?5,
               ?6, 'client-pbkdf2-sha256', ?7, 1, ?8, ?8)`
    )
      .bind(email, emailHash, nick, avatar, verifierHash, pwSalt, PBKDF2_ITERS, ts)
      .run()
  } catch (err) {
    // 并发下可能撞 UNIQUE（public_no / nick / email_hash），给出对应的友好文案
    const msg = String(err?.message || '')
    if (msg.includes('users.nick')) return bad(AERR.nickTaken, 409)
    if (msg.includes('users.email_hash')) return bad(AERR.emailTaken, 409)
    throw err
  }

  const row = await env.DB.prepare(`SELECT * FROM users WHERE email_hash = ?1`).bind(emailHash).first()
  const token = await issueSession(env, row.id, request, ts, await sha256Hex(clientIp(request) + (env.IP_HASH_SALT || '')))
  // 新用户改变「注册用户 / 今日新增」计数 → 失效概览缓存
  invalidateAdminStatsCache()
  return json({ ok: true, token, user: toPublicUser(row) })
}

/** `POST /api/auth/login` */
export async function authLogin(env, request, ts) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad(AERR.badRequest, 400)

  const email = normalizeEmail(body.email)
  const verifier = String(body.verifier || '')
  if (!isPlausibleEmail(email)) return bad(AERR.loginFailed, 400)

  const ip = clientIp(request)
  const ipHash = await sha256Hex(ip + (env.IP_HASH_SALT || ''))
  const failBucket = `loginfail:${await emailLookupHash(email, env.SALT_SECRET)}:${hourBucket(ts)}`
  const ipFailBucket = `loginfail:ip:${ipHash}:${hourBucket(ts)}`
  const [emailFails, ipFails] = await Promise.all([readBucket(env, failBucket), readBucket(env, ipFailBucket)])

  /*
   * 阈值可用 `AUTH_LOGIN_MAX_FAILS` 覆盖 —— 与其它限流（`RATE_LIMIT_PER_HOUR` 等）
   * 同样的理由：**端到端测试要反复跑负向用例**（错密码 / 未注册邮箱 / 已封禁），
   * 同 IP 每小时 20 次失败一会儿就打满，之后所有登录都变成 429 假失败。
   *
   * 生产环境**不要**设这个变量，用默认值（5 次失败 / 邮箱，20 次 / IP）。
   */
  const loginMaxFails = positiveInt(env.AUTH_LOGIN_MAX_FAILS, LOGIN_MAX_FAILS)
  if ((emailFails ?? 0) >= loginMaxFails || (ipFails ?? 0) >= loginMaxFails * 4) {
    return bad(AERR.tooFrequent, 429)
  }

  const emailHash = await emailLookupHash(email, env.SALT_SECRET)
  const row = await env.DB.prepare(`SELECT * FROM users WHERE email_hash = ?1`).bind(emailHash).first()

  // 🔴 三种失败（邮箱不存在 / 已注销 / 密码错）必须是**同一句话、同一个状态码**，
  //    否则响应差异就是账号枚举器。
  const provided = await pepperHash(verifier, env.AUTH_PEPPER)
  const ok = row && row.status !== 3 && timingSafeEqualHex(row.verifier_hash, provided)

  if (!ok) {
    await Promise.all([
      bump(env, failBucket, ts),
      bump(env, ipFailBucket, ts)
    ])
    return bad(AERR.loginFailed, 401)
  }

  if (row.status === 2) return bad(AERR.banned, 403)

  await Promise.all([
    env.DB.prepare(`DELETE FROM rate_limits WHERE bucket = ?1`).bind(failBucket).run(),
    env.DB.prepare(`UPDATE users SET last_login_at = ?1 WHERE id = ?2`).bind(ts, row.id).run()
  ])

  const token = await issueSession(env, row.id, request, ts, ipHash)
  /*
   * 登录会**新建会话** → 改变「活跃会话数」与「今日活跃用户（DAU）」，
   * 因此必须失效概览缓存；漏掉这处会让登录后概览的活跃数滞后到最多一个 TTL。
   */
  invalidateAdminStatsCache()
  return json({ ok: true, token, user: toPublicUser(row) })
}

/** `GET /api/auth/me` */
export async function authMe(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)
  return json({ ok: true, user: toPublicUser(session.row) })
}

/** `PATCH /api/auth/me` —— 只允许改昵称与头像。 */
export async function authUpdateMe(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad(AERR.badRequest, 400)

  const sets = []
  const binds = []
  if (body.nick !== undefined) {
    const nick = sanitize(body.nick, NICK_MAX)
    if (nick.length < NICK_MIN) return bad(AERR.nickShort, 400)
    const taken = await env.DB.prepare(`SELECT id FROM users WHERE nick = ?1 AND id <> ?2`)
      .bind(nick, session.row.id)
      .first()
    if (taken) return bad(AERR.nickTaken, 409)
    sets.push(`nick = ?${binds.length + 1}`)
    binds.push(nick)
  }
  if (body.avatar !== undefined) {
    const avatar = AVATAR_ID_RE.test(String(body.avatar)) ? String(body.avatar) : DEFAULT_AVATAR
    sets.push(`avatar = ?${binds.length + 1}`)
    binds.push(avatar)
  }
  if (!sets.length) return bad(AERR.badRequest, 400)

  binds.push(session.row.id)
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?${binds.length}`)
    .bind(...binds)
    .run()

  const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(session.row.id).first()
  return json({ ok: true, user: toPublicUser(row) })
}

/** `POST /api/auth/password` —— 只用邮箱验证码授权，**不校验旧密码**（已定决策）。 */
export async function authChangePassword(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad(AERR.badRequest, 400)
  const verifier = String(body.verifier || '')
  if (!/^[a-f0-9]{64}$/.test(verifier)) return bad(AERR.badRequest, 400)

  const emailHash = await emailLookupHash(session.row.email, env.SALT_SECRET)
  const codeOk = await consumeCode(env, emailHash, 'password', body.code, ts)
  if (!codeOk.ok) return bad(codeOk.error, 400)

  await env.DB.prepare(
    `UPDATE users SET verifier_hash = ?1, pw_algo = 'client-pbkdf2-sha256', pw_iters = ?2, pw_changed_at = ?3
     WHERE id = ?4`
  )
    .bind(await pepperHash(verifier, env.AUTH_PEPPER), PBKDF2_ITERS, ts, session.row.id)
    .run()

  // 改密码后作废**其余**会话（保留当前这台），把可能被盗的登录态踢下线
  await revokeSessions(env, session.row.id, session.tokenHash)
  return json({ ok: true })
}

/**
 * `POST /api/auth/reset-password` —— 未登录用户找回密码（用邮箱验证码重置密码）。
 *
 * 流程：
 *   1. 客户端提交 email, code, verifier, [salt]；
 *   2. 验证 email 格式及 verifier 格式；
 *   3. 验证邮箱验证码（purpose = 'password'）；
 *   4. 查找对应账号，若不存在或被禁用返回对应错误；
 *   5. 更新密码哈希（及新盐，若有），重设 pw_changed_at；
 *   6. 吊销该用户所有活跃登录态（踢下线旧会话）。
 */
export async function authResetPassword(env, request, ts) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad(AERR.badRequest, 400)

  const email = normalizeEmail(body.email)
  if (!isPlausibleEmail(email)) return bad(AERR.emailFormat, 400)

  const verifier = String(body.verifier || '')
  if (!/^[a-f0-9]{64}$/.test(verifier)) return bad(AERR.badRequest, 400)

  const pwSalt = body.salt ? String(body.salt) : ''
  if (pwSalt && !/^[a-f0-9]{64}$/.test(pwSalt)) return bad(AERR.badRequest, 400)

  const emailHash = await emailLookupHash(email, env.SALT_SECRET)
  // 必须先验码，防枚举
  const codeOk = await consumeCode(env, emailHash, 'password', body.code, ts)
  if (!codeOk.ok) return bad(codeOk.error, 400)

  const user = await env.DB.prepare(`SELECT id, status FROM users WHERE email_hash = ?1`)
    .bind(emailHash)
    .first()
  if (!user) return bad('该邮箱未注册账号', 404)
  if (user.status !== 1) return bad(AERR.accountDisabled, 403)

  const verifierHash = await pepperHash(verifier, env.AUTH_PEPPER)
  if (pwSalt) {
    await env.DB.prepare(
      `UPDATE users SET verifier_hash = ?1, pw_salt = ?2, pw_algo = 'client-pbkdf2-sha256', pw_iters = ?3, pw_changed_at = ?4
       WHERE id = ?5`
    )
      .bind(verifierHash, pwSalt, PBKDF2_ITERS, ts, user.id)
      .run()
  } else {
    await env.DB.prepare(
      `UPDATE users SET verifier_hash = ?1, pw_algo = 'client-pbkdf2-sha256', pw_iters = ?2, pw_changed_at = ?3
       WHERE id = ?4`
    )
      .bind(verifierHash, PBKDF2_ITERS, ts, user.id)
      .run()
  }

  // 重置密码后作废所有设备的既有会话
  await revokeSessions(env, user.id, '')
  return json({ ok: true })
}

/**
 * `POST /api/auth/email` —— 换邮箱，**旧 + 新双验证**（已定决策）。
 *
 * 前端分两步收集两个码，**最终一次提交**，服务端一次把两个都验掉 ——
 * 这样不会出现"第一步已通过、第二步半途而废"的中间态。
 *
 * 🔴 "新邮箱是否被占用"的检查放在**验证通过之后**：
 *    否则一个已注册用户能拿这个接口枚举"某邮箱是否注册"。
 */
export async function authChangeEmail(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return bad(AERR.badRequest, 400)

  const newEmail = normalizeEmail(body.newEmail)
  if (!isPlausibleEmail(newEmail)) return bad(AERR.emailFormat, 400)
  if (isDisposableEmail(newEmail, BLOCKED_EMAIL_DOMAINS)) return bad(AERR.disposableEmail, 400)
  if (newEmail === normalizeEmail(session.row.email)) return bad(AERR.emailSame, 400)

  const newHash = await emailLookupHash(newEmail, env.SALT_SECRET)
  const oldEmail = normalizeEmail(session.row.email)
  if (newHash === (await emailLookupHash(oldEmail, env.SALT_SECRET))) return bad(AERR.emailSame, 400)

  // 两个码归属不同邮箱 → 天然是两行，用途都用 email_change
  const oldOk = await consumeCode(env, await emailLookupHash(oldEmail, env.SALT_SECRET), 'email_change', body.oldCode, ts)
  if (!oldOk.ok) return bad(oldOk.error, 400)
  const newOk = await consumeCode(env, newHash, 'email_change', body.newCode, ts)
  if (!newOk.ok) return bad(newOk.error, 400)

  // 验证通过后才检查占用
  const taken = await env.DB.prepare(`SELECT id FROM users WHERE email_hash = ?1 AND id <> ?2`)
    .bind(newHash, session.row.id)
    .first()
  if (taken) return bad(AERR.emailInUse, 409)

  await env.DB.prepare(`UPDATE users SET email = ?1, email_hash = ?2 WHERE id = ?3`)
    .bind(newEmail, newHash, session.row.id)
    .run()

  const row = await env.DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(session.row.id).first()
  return json({ ok: true, user: toPublicUser(row) })
}

/**
 * `GET /api/auth/comments` —— 「我的评论」跨设备列表（只按 `user_id` 查，不再用浏览器令牌）。
 *
 * 顺带返回 `moderatedUnread`：**有多少条评论被管理员处理后作者还没看过**。
 * 机制与「谁回复了我」完全对称 —— 只用一个时间戳当基准（`users.moderation_read_at`），
 * 不建通知表；两个 COUNT 合成一条 SQL。
 */
export async function authMyComments(env, request, url, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)

  const limit = Math.min(positiveInt(url.searchParams.get('limit'), 20), MAX_LIMIT)
  const cursor = positiveInt(url.searchParams.get('cursor'), 0)
  const rows = await env.DB.prepare(
    `SELECT id, page_key, page_label, body, status, created_at, parent_id
     FROM comments
     WHERE user_id = ?1 AND id < ?2
     ORDER BY id DESC LIMIT ?3`
  )
    .bind(session.row.id, cursor || Number.MAX_SAFE_INTEGER, limit + 1)
    .all()

  const list = rows.results || []
  const hasMore = list.length > limit
  const page = hasMore ? list.slice(0, limit) : list

  /*
   * 未读数：被处理后还没看过的条数。
   *
   * ⚠️ 只在**第一页**算（`!cursor`）—— 翻页时不必重算，省一次查询。
   *    `moderated_at IS NOT NULL` 不能少：`NULL > x` 在 SQL 里是 NULL（不为真），
   *    但显式写出来意图更清楚，也避免将来换实现时踩空。
   */
  let moderatedUnread = 0
  if (!cursor) {
    const readAt = session.row.moderation_read_at || 0
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM comments
       WHERE user_id = ?1 AND moderated_at IS NOT NULL AND moderated_at > ?2`
    )
      .bind(session.row.id, readAt)
      .first()
    moderatedUnread = row?.n ?? 0
  }

  return json({
    ok: true,
    comments: page.map((r) => ({
      id: r.id,
      pageKey: r.page_key,
      pageLabel: r.page_label || null,
      body: r.body,
      status: r.status,
      createdAt: r.created_at,
      parentId: r.parent_id || null
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    moderatedUnread
  })
}

/**
 * `POST /api/auth/comments/read` —— 把「评论被处理」的未读基准推到当前时刻。
 *
 * 🔴 用**毫秒**（`Date.now()`）而不是秒，与 `comments.moderated_at` 配对。
 *
 * 未读判定是 `moderated_at > moderation_read_at`。秒级时间戳下，"同一秒内先标已读、
 * 又被处理"会落到 `S > S`（假）→ **通知被静默吞掉**；
 * 而若把基准退 1 秒（`S-1`）来避开，又会变成 `S > S-1` 恒真 → **红点清不掉**。
 * 两个方向各错一半，根因都是**秒级精度不足以区分先后**。
 *
 * 毫秒把冲突窗口从 1 秒压到 1 毫秒 —— 两次请求相隔不到 1 毫秒几乎不可能。
 */
export async function authMarkModerationRead(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)
  await env.DB.prepare(`UPDATE users SET moderation_read_at = ?1 WHERE id = ?2`)
    .bind(Date.now(), session.row.id)
    .run()
  return json({ ok: true })
}

/**
 * `GET /api/auth/replies` —— 「谁回复了我」。
 *
 * 未读数**不建已读表**：只用一个基准，一条 SQL 同时给出列表与未读数，
 * 省一张表也省写入。
 *
 * 基准是 `users.replies_read_id`（**评论 id**，不是时间戳）—— 理由见
 * `authMarkRepliesRead` 的注释：`comments.created_at` 只有秒级精度，
 * 同一秒内的"标已读 / 收到回复"无法区分先后，会**静默吞掉提醒**。
 * `comments.id` 是 AUTOINCREMENT、严格单调，用它当基准没有这个问题。
 */
export async function authMyReplies(env, request, url, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)

  const limit = Math.min(positiveInt(url.searchParams.get('limit'), 20), MAX_LIMIT)
  const cursor = positiveInt(url.searchParams.get('cursor'), 0)
  const readId = session.row.replies_read_id || 0

  const rows = await env.DB.prepare(
    /*
     * 「谁回复了我」＝ **别人**在我发的评论下面留的话。两个条件缺一不可：
     *
     *   1. `p.user_id = ?1` —— 被回复的那条是我的；
     *   2. `c.user_id <> ?1` —— 回复本身**不是我发的**。
     *
     * 🔴 第 2 条不能省：只判"父评论是我的"会让**自己回复自己**也出现在
     * "谁回复了我"里，既莫名其妙、又会把未读数顶起来。
     *
     * `c.user_id IS NULL` 要保留：那是**账号体系之前**的老评论（没有归属），
     * 它们不可能是"我"发的（我有 id），所以该照常算作别人的回复。
     */
    `SELECT c.id, c.page_key, c.page_label, c.body, c.nick, c.avatar, c.created_at, c.parent_id
     FROM comments c
     JOIN comments p ON p.id = c.parent_id
     WHERE p.user_id = ?1
       AND (c.user_id IS NULL OR c.user_id <> ?1)
       AND c.status = 1 AND c.id < ?2
     ORDER BY c.id DESC LIMIT ?3`
  )
    .bind(session.row.id, cursor || Number.MAX_SAFE_INTEGER, limit + 1)
    .all()

  const unreadRow = await env.DB.prepare(
    /*
     * 未读数的条件必须与列表**逐字一致**，否则会出现"红点显示 3、点进去只有 1 条"。
     *
     * 🔴 比较的是 `c.id > ?2`（**评论 id**），与列表的 `c.id < ?2` 游标是同一个键。
     *    用 `c.created_at > 时间戳` 会同时踩两个问题：同秒无法区分先后（丢通知），
     *    以及"未读口径"与"分页口径"不一致。
     */
    `SELECT COUNT(*) AS n FROM comments c
     JOIN comments p ON p.id = c.parent_id
     WHERE p.user_id = ?1
       AND (c.user_id IS NULL OR c.user_id <> ?1)
       AND c.status = 1 AND c.id > ?2`
  )
    .bind(session.row.id, readId)
    .first()

  const list = rows.results || []
  const hasMore = list.length > limit
  const page = hasMore ? list.slice(0, limit) : list
  return json({
    ok: true,
    unread: unreadRow?.n || 0,
    replies: page.map((r) => ({
      id: r.id,
      pageKey: r.page_key,
      pageLabel: r.page_label || null,
      body: r.body,
      nick: r.nick,
      avatar: r.avatar || null,
      createdAt: r.created_at,
      parentId: r.parent_id
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null
  })
}

/**
 * `POST /api/auth/replies/read` —— 把未读基准推到"我此刻能看到的最新回复"。
 *
 * 🔴 基准是 `users.replies_read_id`（**评论 id**），不是时间戳。
 *
 * 用时间戳（`replies_read_at = ts`）配合 `created_at > read_at` 不行：两边都只有
 * **秒**精度，「标已读」与「收到回复」落在同一秒时 `S > S` 为假 → **提醒被静默吞掉**。
 *
 * 为什么不用毫秒（那是「评论被处理通知」的做法）：
 *   · 那边 `moderated_at` / `moderation_read_at` 都是新列、都由本文件控制，可直接用毫秒；
 *   · 这边 `comments.created_at` 是既有的**秒**列，全站都在用（列表排序、时间显示、
 *     限流……）。改它会波及全站；而**只把基准改成毫秒更糟** ——
 *     `S > S_000` 恒真 → **红点永远清不掉**。两个方向各错一半。
 *
 * 用 `comments.id` 则两个问题同时消失：
 *   · `id` 是 `INTEGER PRIMARY KEY AUTOINCREMENT`，**严格单调递增**，
 *     整数比较没有精度、没有时钟回拨问题；
 *   · 语义也更准 —— 表达的是"这些回复我看过了"，而不是"某个时刻之前的都算看过"。
 *
 * 写入值是**当前可见回复的最大 id**，不是"现在"：`ts` 无法表达"哪些回复"，
 * 而"推到当前时刻"在 id 语义下就是"把所有已存在的回复都算读过"。
 * 取 MAX 而不是 `last_insert_rowid()`：后者是**全库**最后插入的 id，
 * 包含别人的评论与我自己发的评论，会把基准顶到超出我的回复范围。
 * 子查询带 `p.user_id = ?1` 等全套过滤，与列表/未读数的口径一致。
 */
export async function authMarkRepliesRead(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)
  await env.DB.prepare(
    `UPDATE users SET replies_read_id = COALESCE((
       SELECT MAX(c.id) FROM comments c
       JOIN comments p ON p.id = c.parent_id
       WHERE p.user_id = ?1
         AND (c.user_id IS NULL OR c.user_id <> ?1)
         AND c.status = 1
     ), 0)
     WHERE id = ?1`
  )
    .bind(session.row.id)
    .run()
  return json({ ok: true })
}

/** `POST /api/auth/logout` —— 只退当前会话（幂等）。 */
export async function authLogout(env, request, ts) {
  const token = readBearer(request)
  if (token) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?1`).bind(await sha256Hex(token)).run()
  }
  return json({ ok: true })
}

/**
 * `DELETE /api/auth/me` —— **软删除**（已定决策）。
 *
 * 三件事一起做：
 * 1. `status = 3` 并**清空个人数据**（邮箱、密码哈希）—— 满足隐私诉求；
 * 2. 把其评论的昵称快照改写成「账号已注销」—— 读评论时**不用 JOIN** 就能显示；
 * 3. **邮箱不可再注册**（`email_hash` 保留占位）—— 防止有人抢注该邮箱冒用历史评论。
 */
export async function authDeleteAccount(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)

  const uid = session.row.id
  // 清空个人数据，但**保留 email_hash 占位**（见下面第 3 条）
  await env.DB.prepare(
    `UPDATE users SET status = 3, email = '', verifier_hash = '', pw_algo = 'retired',
                      pw_changed_at = ?1 WHERE id = ?2`
  )
    .bind(ts, uid)
    .run()

  await env.DB.prepare(`UPDATE comments SET nick = '账号已注销', avatar = NULL WHERE user_id = ?1`)
    .bind(uid)
    .run()
  await revokeSessions(env, uid)
  await env.DB.prepare(`DELETE FROM auth_codes WHERE email_hash = ?1`).bind(session.row.email_hash).run()

  // 注销把用户计入「已注销」并清空会话 → 用户构成与活跃数都变
  invalidateAdminStatsCache()
  invalidateRecentCache()

  return json({ ok: true })
}

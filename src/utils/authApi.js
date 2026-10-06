/**
 * 账号 API 客户端。
 *
 * 与 `commentApi.js` 同一套约定：
 * - 超时 / 断网 / 非 JSON 响应 → 本地给出**用户能看懂的中文**，技术原因写控制台；
 * - 服务端已按"对外文案契约"返回可直接展示的中文 → **原样透传，不再拼技术细节**；
 * - 原生端（Capacitor）走 `CLOUD_URL` 绝对地址。
 *
 * ## 密码从来不经过这里
 *
 * 这个模块**只发 `verifier`，不发密码**。密码 → `verifier` 的推导在
 * `src/utils/passwordKdf.js`（PBKDF2-SHA256 60 万轮，跑在用户设备上），
 * 服务端只收到推导结果，再由 `HMAC(AUTH_PEPPER, verifier)` 入库。
 * 详见 `docs/technical/ACCOUNT_SYSTEM.md` §四。
 */

import { CLOUD_URL, isNative } from './env.js'

const TIMEOUT_MS = 20000 // 比评论长一点：注册/登录前后要跑 60 万轮 PBKDF2（真机实测约 400ms，留足余量）

const CONNECT_ERROR = '无法连接账号服务器'
const TIMEOUT_ERROR = '网络连接超时，请稍后再试'
const NETWORK_ERROR = '当前没有网络连接'
const GENERIC_ERROR = '操作失败，请稍后再试'

export class AuthApiError extends Error {
  /**
   * @param {string} message 可直接展示给用户的中文
   * @param {number} status HTTP 状态码（0 = 压根没连上）
   * @param {number} [retryAfter] 429 时服务端给的等待秒数
   */
  constructor(message, status = 0, retryAfter = 0) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
    this.retryAfter = retryAfter
  }

  /** 会话失效：调用方据此清本地登录态并回到登录页 */
  get isUnauthorized() {
    return this.status === 401
  }
}

function apiBase() {
  if (isNative) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new AuthApiError(NETWORK_ERROR, 0)
    }
    return CLOUD_URL
  }
  return ''
}

async function request(path, { method = 'GET', body, token } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    })
  } catch (err) {
    if (err instanceof AuthApiError) throw err
    if (err?.name === 'AbortError') throw new AuthApiError(TIMEOUT_ERROR, 0)
    throw new AuthApiError(CONNECT_ERROR, 0)
  } finally {
    clearTimeout(timer)
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    // 非 JSON：本地只跑了 `npm run dev` 没开 `npm run dev:api`（502/504），
    // 或线上 Functions 没生效、/api/* 被 SPA 兜底成 index.html
    if ([502, 503, 504].includes(response.status)) {
      console.warn('[auth] API 不可达（本地请确认已运行 npm run dev:api）')
    } else {
      console.warn('[auth] 响应不是 JSON，可能被 SPA 兜底或边缘缓存改写')
    }
    throw new AuthApiError(CONNECT_ERROR, response.status)
  }

  if (!response.ok) {
    const retryAfter = Number(data?.retryAfter) || 0
    throw new AuthApiError(data?.error || GENERIC_ERROR, response.status, retryAfter)
  }
  return data
}

// ============================================================
// 接口
// ============================================================

/** 取一道人机验证题。返回 `{ captchaId, svg }` —— **响应里没有答案**。 */
export function fetchCaptcha() {
  return request('/api/auth/captcha')
}

/**
 * 发验证码。
 *
 * @param {'register'|'password'|'email_change'} purpose
 *
 * 🔴 服务端对"已注册"与"未注册"邮箱**返回完全相同的响应**（防账号枚举），
 * 所以这里的 `sent` 字段**不代表这个邮箱一定存在或一定收到信**，
 * 界面不要基于它做任何判断。
 */
export function sendAuthCode({ email, purpose, captchaId, picks }) {
  return request('/api/auth/code', {
    method: 'POST',
    body: { email, purpose, captchaId, picks }
  })
}

/**
 * 取密码盐。
 *
 * ⚠️ **每次登录/改密前都要重新取**，不要缓存 —— 已注册用户返回的是
 * 库里存的**随机盐**（每人不同），未注册返回的是确定性占位盐。
 *
 * 注意：**注册不走这里**。注册时用户还没入库、没有盐可取，
 * 由客户端本地随机生成一个盐随注册请求提交（见 `authSession.registerAccount`）。
 */
export function fetchPasswordSalt(email) {
  return request(`/api/auth/salt?email=${encodeURIComponent(email)}`)
}

/** 注册：`salt` 由客户端随机生成，服务端校验形状后原样存下 */
export function register({ email, code, verifier, salt, nick, avatar }) {
  return request('/api/auth/register', {
    method: 'POST',
    body: { email, code, verifier, salt, nick, avatar }
  })
}

export function login({ email, verifier }) {
  return request('/api/auth/login', { method: 'POST', body: { email, verifier } })
}

export function fetchMe(token) {
  return request('/api/auth/me', { token })
}

export function updateMe(token, patch) {
  return request('/api/auth/me', { method: 'PATCH', token, body: patch })
}

/** 改密码：只用邮箱验证码授权，**不校验旧密码**（已定决策）。 */
export function changePassword(token, { code, verifier }) {
  return request('/api/auth/password', { method: 'POST', token, body: { code, verifier } })
}

/** 换邮箱：**旧 + 新两个码都要**，服务端一次把两个都验掉。 */
export function changeEmail(token, { newEmail, oldCode, newCode }) {
  return request('/api/auth/email', {
    method: 'POST',
    token,
    body: { newEmail, oldCode, newCode }
  })
}

export function fetchMyComments(token, { cursor, limit = 20 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', String(cursor))
  return request(`/api/auth/comments?${params.toString()}`, { token })
}

export function fetchMyReplies(token, { cursor, limit = 20 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', String(cursor))
  return request(`/api/auth/replies?${params.toString()}`, { token })
}

export function markRepliesRead(token) {
  return request('/api/auth/replies/read', { method: 'POST', token, body: {} })
}

export function logout(token) {
  return request('/api/auth/logout', { method: 'POST', token, body: {} })
}

export function deleteAccount(token) {
  return request('/api/auth/me', { method: 'DELETE', token })
}

/** 供 UI 在"压根没连上"时兜底用（正常情况下服务端文案已经够用）。 */
export const AUTH_NETWORK_ERRORS = Object.freeze({
  connect: CONNECT_ERROR,
  timeout: TIMEOUT_ERROR,
  offline: NETWORK_ERROR,
  generic: GENERIC_ERROR
})

/**
 * 后台管理接口客户端。
 *
 * ## 与 `commentApi.js` 的关系
 *
 * 管理端评论接口原先挤在 `commentApi.js` 里（`fetchAdminComments` 等三个）。
 * 后台改版后管理端有了自己的概览/评论/用户三块，再留在那边会让
 * "面向访客的评论接口"与"面向管理员的接口"混在一个文件里 ——
 * 两者的鉴权方式、错误语义、调用方都不一样，所以整块搬到这里。
 *
 * ## 令牌怎么放
 *
 * 管理令牌与**用户会话完全不同**：它不过期、不轮换、只有一个人用，
 * 所以单独存在 `myrzg:admin-token`，与 `myrzg:auth` 互不影响 ——
 * 管理员可以同时是普通登录用户，两个身份不打架。
 *
 * 传输走 `x-admin-token` 请求头（不是 Authorization，避免与用户会话串味）。
 */

/** 本地存管理令牌的键。与用户会话 `myrzg:auth` 刻意分开 */
const TOKEN_KEY = 'myrzg:admin-token'

/** 网络/超时（与 `commentApi` 同量级：5 秒够本地与边缘节点往返） */
const TIMEOUT_MS = 10_000

export class AdminApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }

  /** 令牌不对 / 没配 ADMIN_TOKEN（服务端此时直接 404） */
  get isUnauthorized() {
    return this.status === 401 || this.status === 404
  }
}

// ── 令牌存取 ──────────────────────────────────────────────────────

export function getAdminToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setAdminToken(value) {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* 隐私模式下不可用：令牌只活在内存里，刷新要重填，功能不降级 */
  }
}

// ── 请求 ─────────────────────────────────────────────────────────

async function request(path, { method = 'GET', body } = {}) {
  const token = getAdminToken()
  if (!token) throw new AdminApiError('请先填写管理令牌', 401)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const headers = { 'x-admin-token': token }
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'

  let res
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    })
  } catch (err) {
    clearTimeout(timer)
    throw new AdminApiError(err?.name === 'AbortError' ? '请求超时，请重试' : '网络异常，请检查连接')
  }
  clearTimeout(timer)

  let data = null
  try {
    data = await res.json()
  } catch {
    /* 非 JSON（如网关错误页） */
  }

  if (!res.ok || data?.ok === false) {
    // 服务端未配 ADMIN_TOKEN 时整段管理路由返回 404 —— 对管理员来说
    // "接口不存在"与"令牌不对"是同一个要处理的状况：先去看令牌与环境变量
    throw new AdminApiError(data?.error || `请求失败（${res.status}）`, res.status)
  }
  return data
}

// ── 概览 ─────────────────────────────────────────────────────────

export function fetchAdminStats() {
  return request('/api/admin/stats')
}

// ── 评论 ─────────────────────────────────────────────────────────

/**
 * @param {{status?: string|number, q?: string, cursor?: number, limit?: number}} options
 *   `q` 在服务端匹配正文/昵称/页面标识（评论会持续增长，不该拉到前端再筛）
 */
export function fetchAdminComments({ status, q, cursor, limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (status !== undefined && status !== null && status !== '') params.set('status', String(status))
  if (q) params.set('q', String(q))
  if (cursor) params.set('cursor', String(cursor))
  return request(`/api/admin/comments?${params.toString()}`)
}

/** 改状态：0 待审 / 1 显示（放行）/ 2 隐藏 */
export function setCommentStatus(id, status) {
  return request('/api/admin/comments', { method: 'PATCH', body: { id, status } })
}

/** 彻底删除（隐私删除请求用；只想下架请用 setCommentStatus(id, 2)） */
export function deleteCommentPermanently(id) {
  return request('/api/admin/comments', { method: 'DELETE', body: { id } })
}

// ── 用户 ─────────────────────────────────────────────────────────

/**
 * @param {{status?: string|number, q?: string, cursor?: number, limit?: number}} options
 *   `q` 匹配昵称/邮箱；**纯数字**时还按对外编号精确匹配
 *   （用户来反馈时通常报的是那 5 位编号）
 */
export function fetchAdminUsers({ status, q, cursor, limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (status !== undefined && status !== null && status !== '') params.set('status', String(status))
  if (q) params.set('q', String(q))
  if (cursor) params.set('cursor', String(cursor))
  return request(`/api/admin/users?${params.toString()}`)
}

/**
 * 封禁 / 解封。
 *
 * ⚠️ 服务端**只允许在 1（正常）与 2（停用）之间切**，永远不能改成 3（已注销）：
 * 3 是用户自己注销留下的标记，管理员不该伪造它（那会让"这个邮箱不能再注册"
 * 之类的语义被绕过）。
 */
export function setUserStatus(id, status) {
  return request('/api/admin/users', { method: 'PATCH', body: { id, status } })
}

/**
 * 彻底删除账号（隐私删除请求用）。
 *
 * 与"停用"的区别：删除会**释放邮箱**（那个人可以重新注册），
 * 并把他的评论 `user_id` 置空（评论保留，但不再挂在账号上）。
 * 停用则只是不让登录，一切都留着。
 */
export function deleteUserPermanently(id) {
  return request('/api/admin/users', { method: 'DELETE', body: { id } })
}

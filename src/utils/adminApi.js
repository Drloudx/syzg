/**
 * 后台管理接口客户端。
 *
 * ## 与 `commentApi.js` 的关系
 *
 * 管理端评论接口原先挤在 `commentApi.js` 里（`fetchAdminComments` 等三个）。
 * 后台改版后管理端有了自己的概览/评论/用户三块，再留在那边会让
 * "面向访客的评论接口"与"面向管理员的接口"混在一个文件里 ——
 * 两者的错误语义、调用方都不一样，所以整块搬到这里。
 *
 * ## 鉴权（2026-10-07 改）
 *
 * **不再有独立的管理令牌**。后台与普通接口一样走**用户会话**：
 * 请求带 `Authorization: Bearer <会话令牌>`，服务端查该账号的 `users.role`
 * 是否 >= 1（管理员）。
 *
 * 为什么删掉旧的环境变量令牌：
 *   1. **永不过期** —— 泄露即长期有效，改密码也没用；
 *   2. **明文存 localStorage** —— 任何 XSS 可直接读走；
 *   3. **无法追溯身份** —— 谁都能用同一个令牌，审计里看不出是谁做的。
 *
 * 会话令牌存在 `myrzg:auth`（与普通登录共用同一份），有 30 天滑动过期、
 * 改密码/封号即失效。所以本模块**不再自己管令牌**，只负责把会话令牌带上。
 */

/** 网络/超时（与 `commentApi` 同量级：5 秒够本地与边缘节点往返） */
const TIMEOUT_MS = 10_000

export class AdminApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }

  /**
   * 未登录 / 不是管理员。
   *
   * 403 也算：它是"角色不够"（如管理员访问仅超管的审计页），
   * 对调用方来说与"没权限进后台"是同一类要处理的状况 —— 引导去登录或说明权限不足。
   */
  get isUnauthorized() {
    return this.status === 401 || this.status === 403
  }
}

// ── 请求 ─────────────────────────────────────────────────────────

/**
 * 读当前会话令牌。
 *
 * 🔴 **直接读 localStorage，不 import `authSession`**：后者会拉起整条
 * 账号模块依赖链（KDF、API、Pinia 状态），而这里只需要一个字符串。
 * 键名 `myrzg:auth` 必须与 `authSession.js` 保持一致 —— 有单测守着这个约定。
 */
function readSessionToken() {
  try {
    const raw = localStorage.getItem('myrzg:auth')
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return typeof parsed?.token === 'string' ? parsed.token : ''
  } catch {
    return ''
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const token = readSessionToken()
  if (!token) throw new AdminApiError('请先登录管理员账号', 401)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const headers = { Authorization: `Bearer ${token}` }
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
 * @param {{status?: string|number, q?: string, pageKind?: string, cursor?: number, limit?: number}} options
 *   `q` 在服务端匹配正文/昵称/页面标识（评论会持续增长，不该拉到前端再筛）
 *   `pageKind` 按页面类型筛（`site` / `item` / `hero` …），空串或未知值 = 不筛
 */
export function fetchAdminComments({ status, q, pageKind, cursor, limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (status !== undefined && status !== null && status !== '') params.set('status', String(status))
  if (q) params.set('q', String(q))
  if (pageKind) params.set('pageKind', String(pageKind))
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
 *
 * ⚠️ 服务端还会做**层级校验**：只能操作角色比自己低的账号，且不能操作自己。
 * 权限不够时返回 403。
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
 *
 * ⚠️ 同样受层级校验约束 —— 不能删除同级或更高级的账号。
 */
export function deleteUserPermanently(id) {
  return request('/api/admin/users', { method: 'DELETE', body: { id } })
}

/**
 * 设为 / 撤销管理员。**仅超管可用**（服务端强校验，不是靠前端隐藏）。
 *
 * @param {number} id   目标的**内部 id**（管理端列表里的 `u.id`）
 * @param {number} role 0 = 普通用户，1 = 管理员。**超管档位（2）无法通过接口产生**
 *                      —— 那需要直接改数据库，避免"你给了某人超管、他把你降级"。
 */
export function setUserRole(id, role) {
  return request('/api/admin/users/role', { method: 'PATCH', body: { id, role } })
}

// ── 审计 ─────────────────────────────────────────────────────────

/**
 * 管理操作审计列表（**仅超管**）。
 *
 * @param {{cursor?: number, limit?: number}} options
 */
export function fetchAdminAudit({ cursor, limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', String(cursor))
  return request(`/api/admin/audit?${params.toString()}`)
}

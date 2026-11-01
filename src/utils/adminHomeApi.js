/**
 * 后台 API 封装：首页内容管理。
 *
 * 鉴权与 `adminApi.js` 完全一致：`Authorization: Bearer <会话令牌>`，
 * 会话令牌存在 localStorage 的 `myrzg:auth`。这里不 import 那个模块的
 * 私有 `request`（它是文件内函数），而是照同一套语义实现 —— 两边必须同步改。
 *
 * 🔴 所有写操作要求**超管**（role >= 2），服务端强校验；前端隐藏只是体验优化。
 */
import { AdminApiError } from './adminApi.js'

/** 与 adminApi.js 同量级（5~10 秒够本地与边缘节点往返） */
const TIMEOUT_MS = 10_000

/** 读会话令牌。键名 `myrzg:auth` 与 authSession.js 保持一致（有单测守着）。 */
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
  if (!token) throw new AdminApiError('请先登录超管账号', 401)

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
    /* 非 JSON（网关错误页等） */
  }

  if (!res.ok || data?.ok === false) {
    // 服务端对校验失败返回 { ok:false, message }，对鉴权失败返回 { ok:false, error }
    throw new AdminApiError(data?.message || data?.error || `请求失败（${res.status}）`, res.status)
  }
  return data
}

/** 读后台全量（含已停用项） */
export function fetchHomeAdmin() {
  return request('/api/admin/home')
}

/* ---------- 公告：单条 CRUD ---------- */

export function createNotice(body) {
  return request('/api/admin/home/notices', { method: 'POST', body })
}

export function updateNotice(body) {
  return request('/api/admin/home/notices', { method: 'PATCH', body })
}

export function deleteNotice(id) {
  return request('/api/admin/home/notices', { method: 'DELETE', body: { id } })
}

/* ---------- 四块整组 PUT ---------- */

export function saveBanners(banners) {
  return request('/api/admin/home/banners', { method: 'PUT', body: { banners } })
}

export function saveLinks(section, links) {
  return request('/api/admin/home/links', { method: 'PUT', body: { section, links } })
}

export function saveHeroes(heroes) {
  return request('/api/admin/home/heroes', { method: 'PUT', body: { heroes } })
}

export function saveBlocks(blocks) {
  return request('/api/admin/home/blocks', { method: 'PUT', body: { blocks } })
}

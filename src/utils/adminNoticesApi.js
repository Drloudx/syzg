/**
 * 后台 API：公告管理（独立模块）。
 *
 * 与 `adminHomeApi.js` 分开：那边管首页 5 块内容，这边管公告的增删改查与列表。
 * 两者共用同一套会话令牌读取与错误语义。
 */
import { AdminApiError } from './adminApi.js'

const TIMEOUT_MS = 10_000

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
    /* 非 JSON */
  }

  if (!res.ok || data?.ok === false) {
    throw new AdminApiError(data?.message || data?.error || `请求失败（${res.status}）`, res.status)
  }
  return data
}

/**
 * 公告列表（分页 + 搜索 + 状态过滤）。
 * @param {{ channel?: 'site'|'official', q?: string, status?: string|number, page?: number, size?: number }} opts
 */
export function fetchNotices({ channel, q, status, page = 1, size = 20 } = {}) {
  const p = new URLSearchParams()
  if (channel) p.set('channel', channel)
  if (q) p.set('q', q)
  if (status !== undefined && status !== null && status !== '') p.set('status', String(status))
  p.set('page', String(page))
  p.set('size', String(size))
  return request(`/api/admin/notices?${p.toString()}`)
}

/**
 * 首页选择器用的精简列表。
 * 默认最近 10 条；带 q 时放宽到 50 条（能搜到老公告）。
 */
export function fetchNoticePicker({ channel, q, limit = 10 } = {}) {
  const p = new URLSearchParams()
  if (channel) p.set('channel', channel)
  if (q) p.set('q', q)
  p.set('limit', String(limit))
  return request(`/api/admin/notices/pick?${p.toString()}`)
}

/** 读单条（列表里已含全部字段，编辑页可直接用，这个备用） */
export async function fetchNoticeById(id) {
  const data = await fetchNotices({ size: 50 })
  const hit = (data.notices || []).find((n) => n.id === id)
  if (!hit) throw new AdminApiError('公告不存在或已被删除', 404)
  return hit
}

export function createNotice(body) {
  return request('/api/admin/notices', { method: 'POST', body })
}

export function updateNotice(body) {
  return request('/api/admin/notices', { method: 'PATCH', body })
}

export function deleteNotice(id) {
  return request('/api/admin/notices', { method: 'DELETE', body: { id } })
}

/** 保存首页 8 个插槽的选择 */
export function saveNoticeSlots(slots) {
  return request('/api/admin/home/notice-slots', { method: 'PUT', body: { slots } })
}

/**
 * 会话鉴权、Bearer 解析与管理员权限判定。
 */
import { SESSION_TTL_MS } from '../../src/config/auth.js'
import { generateSessionToken, sha256Hex } from '../../src/utils/authCrypto.js'
import { ROLE_ADMIN } from './shared.js'

/**
 * 管理端鉴权：**看登录账号的 `role`**。
 *
 * 为什么不用环境变量令牌：令牌永不过期（泄露即长期有效，只能去控制台换）、
 * 需明文存 localStorage（任何 XSS 可直接读走）、无法追溯身份（日志看不出是谁做的）。
 *
 * 会话方案：30 天滑动过期、可随时吊销（改密码/封号即失效）、
 * 每个操作都能落到具体账号（配合 `admin_audit`）。
 *
 * 🔴 **进不去后台时的后路**是数据库，不是这个函数：
 *    `UPDATE users SET role = 2, status = 1 WHERE email = '...'`
 *    （迁移文件末尾有这条；删令牌通路时已确认接受这个代价。）
 *
 * @returns {Promise<{row: object}|null>} 管理员会话行（含 `role`），非管理员返回 null
 */
export async function adminSession(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return null
  const role = Number(session.row?.role) || 0
  if (role < ROLE_ADMIN) return null
  // 封禁/注销的账号即便 role 还在也不能进（loadSession 已挡 status=3，这里补 status=2）
  if (session.row?.status !== 1) return null
  return session
}

/**
 * 清理**已过期**的会话。
 *
 * 🔴 为什么需要：`auth_codes` 与 `captchas` 都有过期清理，**`sessions` 漏了** ——
 * 过期行只被查询时的 `WHERE expires_at > ?` 过滤掉，**永远留在表里**。
 * 单用户时无感，但每次登录都插一行、从不清，长期会累积成垃圾。
 *
 * 挂在登录时顺手跑（登录也要写 sessions，多一条 DELETE 成本可忽略），
 * 不额外引入定时任务。
 */
export async function pruneExpiredSessions(env, ts) {
  try {
    await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= ?1`).bind(ts * 1000).run()
  } catch (err) {
    console.error('session prune failed:', err)
  }
}

/**
 * 用户对外形状。🔴 **不暴露内部自增 id**，对外只用公开编号。
 *
 * `role` 会一并返回 —— 这是**安全的**，因为本函数的 5 个调用点
 * （注册 / 登录 / me / 改资料 / 改密码）**全都是"返回请求者本人"**，
 * 不存在"把别人的角色发给某人"的路径。前端据此决定顶栏显不显示后台入口。
 *
 * ⚠️ 若将来有人用本函数序列化**他人**信息，必须先把 `role` 摘掉。
 */
export function toPublicUser(row) {
  return {
    id: row.public_no,
    nick: row.nick,
    avatar: row.avatar || null,
    email: row.email,
    status: row.status,
    role: Number(row.role) || 0,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  }
}

export function readBearer(request) {
  const h = request.headers.get('authorization') || ''
  const m = /^Bearer\s+([A-Za-z0-9_-]{16,200})$/i.exec(h.trim())
  return m ? m[1] : null
}

// ---------- 会话 ----------

export async function issueSession(env, userId, request, ts, ipHash) {
  /*
   * 顺手清理过期会话（见 pruneExpiredSessions 的说明）。
   * 挂在这里而不是定时任务：登录时本来就要写 sessions，多一条 DELETE 成本可忽略，
   * 且不引入额外的调度依赖。
   */
  await pruneExpiredSessions(env, ts)

  const token = generateSessionToken()
  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at, ua_hash, ip_hash)
     VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)`
  )
    .bind(
      await sha256Hex(token),
      userId,
      ts * 1000 + SESSION_TTL_MS,
      ts,
      await sha256Hex(request.headers.get('user-agent') || ''),
      ipHash || null
    )
    .run()
  return token
}

/**
 * 用 Bearer 令牌换用户行。
 *
 * **滑动过期**：每次使用把有效期往后推 30 天，所以"只要还在用就不会被踢"。
 * 但 `last_seen_at` 的写入**最多每小时一次** —— 每次请求都写会让 D1 写入量
 * 随访问量线性上涨（免费版 10 万行/天），而"最后活跃时间"精确到小时足够用。
 */
export async function loadSession(env, request, ts) {
  const token = readBearer(request)
  if (!token) return null
  const tokenHash = await sha256Hex(token)

  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.expires_at, s.last_seen_at, u.*
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`
  )
    .bind(tokenHash, ts * 1000)
    .first()

  if (!row) return null
  if (row.status === 3) return null // 已注销：令牌立即失效

  const newExpiry = ts * 1000 + SESSION_TTL_MS
  const stale = !row.last_seen_at || ts - row.last_seen_at >= 3600
  if (stale) {
    await env.DB.prepare(
      `UPDATE sessions SET expires_at = ?1, last_seen_at = ?2 WHERE token_hash = ?3`
    )
      .bind(newExpiry, ts, tokenHash)
      .run()
  }
  return { tokenHash, row }
}

/** 作废某用户的会话。`keepTokenHash` 为 null 表示全部作废。 */
export async function revokeSessions(env, userId, keepTokenHash = null) {
  if (keepTokenHash) {
    return env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1 AND token_hash <> ?2`)
      .bind(userId, keepTokenHash)
      .run()
  }
  return env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(userId).run()
}

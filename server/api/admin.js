/**
 * 后台概览统计、用户管理、审计日志、审核词表与常用选项接口。
 */
import {
  BLOCKLIST_CATEGORY_NAMES, invalidateReviewMatcher, listBaselineWords
} from '../../src/config/commentBlocklist.js'
import { getAdminStats, invalidateAdminStatsCache } from '../../src/config/adminStatsCache.js'
import {
  ERR, KEYWORD_COUNT_MAX, KEYWORD_MAX, MAX_LIMIT, REVIEW_NOTE_MAX,
  ROLE_ADMIN, ROLE_LABELS, ROLE_SUPER, ROLE_USER,
  bad, canActOn, invalidateRecentCache, json, normalizeReviewNote,
  nowSec, sanitize, writeAudit
} from './shared.js'

/** 把 `status → count` 的行集合折成固定键的对象，缺的补 0。 */
function countsByStatus(rows, keys) {
  const out = {}
  for (const k of keys) out[k] = 0
  for (const r of rows || []) out[r.status] = r.n
  return out
}

/** 最近 N 天（含今天）按 UTC 日界线的逐日计数，缺失的日子补 0。 */
function dailySeries(rows, days, dayStart) {
  const map = new Map((rows || []).map((r) => [r.d, r.n]))
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date((dayStart - i * 86400) * 1000).toISOString().slice(0, 10)
    out.push({ day: d, n: map.get(d) || 0 })
  }
  return out
}

/**
 * 真算一次概览（**不做缓存**，只被 `getAdminStats` 调用）。
 *
 * 刻意**只用几条聚合查询**：管理端低频，但仍然避免"每个数字一条查询"
 * （那样一屏要点十几次 D1，免费额度是有限的）。
 *
 * ⚠️ 这 9 条里 7 条是"计数一遍"（`COUNT(*)` / `GROUP BY` / `SUM(CASE …)`），
 * **索引无法优化** —— 数一遍就得把相关行读一遍。这就是它必须走缓存的原因
 * （见 `src/config/adminStatsCache.js`）。
 */
async function computeAdminStats(env) {
  const ts = nowSec()
  // UTC 日界线，与限流的 `dayBucket()` 口径一致 —— 否则"今天的数"与
  // "今天的限额"会对不上，排查时容易怀疑人生
  const dayStart = ts - (ts % 86400)
  const dayEnd = dayStart + 86400
  const yesterdayStart = dayStart - 86400
  const weekStart = dayStart - 6 * 86400

  const [cmtTotals, cmtByStatus, cmtDaily, usrByStatus, usrToday, usrDaily, sessionCount, usrActiveToday, usrActiveYesterday] =
    await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) AS today,
                SUM(CASE WHEN parent_id IS NOT NULL THEN 1 ELSE 0 END) AS replies
         FROM comments`
      ).bind(dayStart).first(),
      env.DB.prepare(`SELECT status, COUNT(*) AS n FROM comments GROUP BY status`).all(),
      env.DB.prepare(
        `SELECT date(created_at, 'unixepoch') AS d, COUNT(*) AS n
         FROM comments WHERE created_at >= ?1 GROUP BY d`
      ).bind(weekStart).all(),
      env.DB.prepare(`SELECT status, COUNT(*) AS n FROM users GROUP BY status`).all(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE created_at >= ?1`).bind(dayStart).first(),
      env.DB.prepare(
        `SELECT date(created_at, 'unixepoch') AS d, COUNT(*) AS n
         FROM users WHERE created_at >= ?1 GROUP BY d`
      ).bind(weekStart).all(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?1`).bind(ts * 1000).first(),
      /*
       * 今日 DAU。
       *
       * 🔴 必须写成**双边区间** `>= dayStart AND < 次日`，不能只写 `>= dayStart`。
       * 原因：SQLite 只有在 OR 两侧**都带上界**时才能用 `MULTI-INDEX OR` 各自定位；
       * 单边 `>=` 会让它退回 `SCAN sessions`（扫全部会话）。
       * 实测（本地 ~3.1k sessions）：单边 → `SCAN sessions USING INDEX idx_sessions_user`；
       * 双边 → `MULTI-INDEX OR` + 两个 `SEARCH ... idx_sessions_last_seen / idx_sessions_created`。
       * 语义完全等价（未来时间的 last_seen_at / created_at 不存在），但读行数差一个量级。
       */
      env.DB.prepare(
        `SELECT COUNT(DISTINCT user_id) AS n FROM sessions
         WHERE (last_seen_at >= ?1 AND last_seen_at < ?2) OR (created_at >= ?1 AND created_at < ?2)`
      ).bind(dayStart, dayEnd).first(),
      env.DB.prepare(
        `SELECT COUNT(DISTINCT user_id) AS n FROM sessions
         WHERE (last_seen_at >= ?1 AND last_seen_at < ?2) OR (created_at >= ?1 AND created_at < ?2)`
      ).bind(yesterdayStart, dayStart).first()
    ])

  const cmt = countsByStatus(cmtByStatus.results, [0, 1, 2])
  const usr = countsByStatus(usrByStatus.results, [1, 2, 3])
  const cmt7d = dailySeries(cmtDaily.results, 7, dayStart)
  const cmtYesterday = cmt7d.length >= 2 ? cmt7d[cmt7d.length - 2].n : 0

  /*
   * 🔴 返回**纯数据对象**，不返回 `json(...)` 的 Response。
   *
   * 这个函数的结果会被模块级缓存复用多次，而 Response 的 body **只能读一次**：
   * 缓存 Response 后第二次返回会抛
   * `TypeError: Can't read from request stream after it has been used`（实测 500）。
   * 序列化交给路由层的 `json()` —— 每次现序列化，成本可忽略。
   */
  return {
    ok: true,
    ts,
    comments: {
      total: cmtTotals?.total ?? 0,
      today: cmtTotals?.today ?? 0,
      yesterday: cmtYesterday,
      replies: cmtTotals?.replies ?? 0,
      pending: cmt[0],
      visible: cmt[1],
      hidden: cmt[2],
      last7d: cmt7d
    },
    users: {
      total: usr[1] + usr[2] + usr[3],
      active: usr[1],
      banned: usr[2],
      deleted: usr[3],
      today: usrToday?.n ?? 0,
      activeToday: usrActiveToday?.n ?? 0,
      activeYesterday: usrActiveYesterday?.n ?? 0,
      last7d: dailySeries(usrDaily.results, 7, dayStart)
    },
    sessions: { active: sessionCount?.n ?? 0 }
  }
}

/**
 * `GET /api/admin/stats` —— 后台概览（**带 30 秒模块级缓存**）。
 *
 * 🔴 缓存是必需的，不是优化项：`computeAdminStats` 要跑 9 条聚合，
 * 其中 7 条是"计数一遍"，**索引无法优化**（实测加索引后仍约 2.2 万行读/次）。
 * D1 免费额度按 rows read 计（5M/天），不缓存则 229 次/天打满。
 *
 * 滞后可接受（用户已确认）：概览是只读仪表盘，看的是量级与趋势。
 * 但**写侧主动失效**，所以"处理完待审 → 回概览"不会看到旧数字。
 *
 * 缓存的是**纯数据对象**（不是 Response）：Response body 只能读一次，
 * 缓存 Response 就得每次 `clone()`，徒增复杂度。序列化交给路由层的 `json()`。
 * 载荷里的 `ts` 是**算出来的时刻**，正好用来显示"数据统计于 …"。
 */
export async function adminStats(env) {
  return json(await getAdminStats(() => computeAdminStats(env)))
}

/** `GET /api/admin/users` —— 用户列表（可按状态筛、按编号/昵称/邮箱搜）。 */
export async function adminUsers(env, url) {
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), MAX_LIMIT)
  const rawPage = Number.parseInt(url.searchParams.get('page') || '', 10)
  const isPageMode = Number.isFinite(rawPage) && rawPage >= 1
  const pageNum = isPageMode ? rawPage : 1

  const cursor = Number.parseInt(url.searchParams.get('cursor') || '', 10)
  const hasCursor = !isPageMode && Number.isFinite(cursor)

  const statusParam = url.searchParams.get('status')
  const hasStatus = ['1', '2', '3'].includes(statusParam)
  const status = hasStatus ? Number.parseInt(statusParam, 10) : null

  /*
   * 角色筛选：`admin` = 管理员及以上（role >= 1）。
   *
   * 刻意**只提供"看管理员"这一个方向**，不做 `role=0/1/2` 的逐档筛：
   * 管理端的实际需求是"我有哪些同事、权限对不对"，而普通用户是绝大多数，
   * 按普通用户筛等于没筛（那才是默认视图）。
   *
   * 服务端这里**不校验调用者角色**：谁能看用户列表谁就能看这份名单
   * （普通管理员本来就该知道有哪些同事）。改角色才是超管专属。
   */
  const roleParam = url.searchParams.get('role')
  const adminOnly = roleParam === 'admin'
  const userOnly = roleParam === 'user'

  const q = sanitize(url.searchParams.get('q') || '', 60)
  const hasQ = q.length > 0
  const likeParam = hasQ ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : ''

  const where = []
  const binds = []
  if (hasStatus) {
    binds.push(status)
    where.push(`u.status = ?${binds.length}`)
  }
  if (adminOnly) {
    where.push(`u.role >= 1`)
  } else if (userOnly) {
    where.push(`u.role = 0`)
  }
  if (hasQ) {
    binds.push(likeParam)
    const likeIdx = binds.length
    const parts = [
      `u.nick LIKE ?${likeIdx} ESCAPE '\\'`,
      `u.email LIKE ?${likeIdx} ESCAPE '\\'`
    ]
    // 纯数字时也按**对外编号**精确匹配 —— 用户来反馈时通常报的是那 5 位编号
    if (/^\d{4,6}$/.test(q)) {
      binds.push(Number.parseInt(q, 10))
      parts.push(`u.public_no = ?${binds.length}`)
    }
    where.push('(' + parts.join(' OR ') + ')')
  }

  if (isPageMode) {
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const passedTotal = Number.parseInt(url.searchParams.get('total') || '', 10)
    let total = Number.isFinite(passedTotal) && passedTotal >= 0 ? passedTotal : null

    if (total === null || pageNum === 1) {
      const countSql = `SELECT COUNT(*) AS total FROM users u ${whereClause}`
      const stmt = binds.length ? env.DB.prepare(countSql).bind(...binds) : env.DB.prepare(countSql)
      const countRes = await stmt.first()
      total = countRes?.total ?? 0
    }
    const totalPages = Math.max(1, Math.ceil(total / limit))

    const offset = (pageNum - 1) * limit
    const queryBinds = [...binds, limit, offset]
    const sql = `SELECT u.id, u.public_no, u.nick, u.email, u.avatar, u.status, u.role,
                        u.created_at, u.last_login_at, u.ban_note,
                        (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id) AS comment_count
      FROM users u
      ${whereClause}
      ORDER BY u.id DESC LIMIT ?${queryBinds.length - 1} OFFSET ?${queryBinds.length}`

    const { results } = await env.DB.prepare(sql).bind(...queryBinds).all()
    const rows = results || []

    return json({
      ok: true,
      users: rows.map((r) => ({
        id: r.id,
        publicNo: r.public_no,
        nick: r.nick,
        email: r.email,
        avatar: r.avatar || null,
        status: r.status,
        role: Number(r.role) || 0,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
        commentCount: r.comment_count ?? 0,
        banNote: r.ban_note || null
      })),
      total,
      totalPages,
      page: pageNum,
      limit,
      hasMore: pageNum < totalPages
    })
  }

  if (hasCursor) {
    binds.push(cursor)
    where.push(`u.id < ?${binds.length}`)
  }
  binds.push(limit + 1)

  const sql = `SELECT u.id, u.public_no, u.nick, u.email, u.avatar, u.status, u.role,
                      u.created_at, u.last_login_at, u.ban_note,
                      (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id) AS comment_count
    FROM users u
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY u.id DESC LIMIT ?${binds.length}`

  const { results } = await env.DB.prepare(sql).bind(...binds).all()
  const rows = results || []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return json({
    ok: true,
    users: page.map((r) => ({
      id: r.id,
      publicNo: r.public_no,
      nick: r.nick,
      email: r.email,
      avatar: r.avatar || null,
      status: r.status,
      // 角色：管理端要据此渲染「设为/撤销管理员」，并判断"这个人我能不能动"
      role: Number(r.role) || 0,
      createdAt: r.created_at,
      lastLoginAt: r.last_login_at,
      commentCount: r.comment_count ?? 0,
      /*
       * 封禁理由：**只加在管理端**，绝不进 `toPublicUser`。
       * 它是给同事看的内部说明；透给用户等于把审核标准公开出去。
       */
      banNote: r.ban_note || null
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore
  })
}

/**
 * `PATCH /api/admin/users` —— 封禁 / 解封（只允许在 1 与 2 之间切）。
 *
 * 🔴 **封禁必须立即作废该用户的全部会话**，否则他手上那个 30 天的令牌
 * 还能继续用 —— "封了但没封住"是最糟的失败方式。
 *
 * 刻意**不允许改成 3（已注销）**：注销是用户自己的动作，且要连带改写评论昵称；
 * 管理端要清账号请用 DELETE（那是明确的"彻底删除"语义）。
 */
/**
 * `PATCH /api/admin/users` —— 封禁 / 解封。
 *
 * 🔴 **层级校验**：只能操作角色严格低于自己的账号。
 * 没有这条，管理员可以封掉超管 —— 而超管被自己授权的人封掉后
 * **进不去后台**，只能改数据库。
 */
export async function adminUserPatch(env, request, actor, ts) {
  const payload = await request.json().catch(() => null)
  const id = Number.parseInt(payload?.id, 10)
  const status = Number.parseInt(payload?.status, 10)
  if (!Number.isFinite(id) || ![1, 2].includes(status)) return bad(ERR.badRequest)

  const target = await env.DB.prepare(`SELECT id, nick, role FROM users WHERE id = ?1`).bind(id).first()
  if (!target) return bad(ERR.notFound, 404)

  const isSelf = Number(target.id) === Number(actor.id)
  if (!canActOn(actor.role, target.role, isSelf)) return bad(ERR.rejected, 403)

  /*
   * 封禁理由：**只在停用（status=2）时有意义**，管理员手填、可空。
   *
   * 🔴 解封（status=1）时**一律清空**：理由描述的是"当前为什么被停用"，
   *    状态已定论还留着旧理由会误导后来人（与评论的 `review_note` 同一条规矩）。
   *    历史另有 `admin_audit`，每次封禁都会写一条。
   */
  const note = status === 2 ? normalizeReviewNote(payload?.note) : null
  if (status === 2 && payload?.note !== undefined && note === null && String(payload.note).trim()) {
    return bad(ERR.reviewNoteTooLong)
  }

  const res = await env.DB.prepare(`UPDATE users SET status = ?1, ban_note = ?2 WHERE id = ?3`)
    .bind(status, note, id)
    .run()
  if (!res.meta?.changes) return bad(ERR.notFound, 404)

  if (status === 2) {
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(id).run()
  }

  await writeAudit(env, actor, {
    action: status === 2 ? 'ban' : 'unban',
    targetType: 'user',
    targetId: id,
    // 理由一并进审计：日后翻账本能看到"当时为什么封"
    detail: `${target.nick}（角色 ${ROLE_LABELS[target.role] ?? target.role}）${
      note ? `（封禁理由：${note}）` : ''
    }`
  }, ts)

  // 封禁/解封改变「正常 / 已封禁」计数，且封禁会踢掉会话（活跃数也变）
  invalidateAdminStatsCache()

  return json({ ok: true })
}

/**
 * `DELETE /api/admin/users` —— **彻底删除**账号（隐私删除请求用）。
 *
 * 与用户自助注销（软删除，`status=3`）的区别：
 * - 软删除**保留** `email_hash` 占位，该邮箱**不可再注册**（防冒用历史评论）；
 * - 彻底删除**释放**该邮箱，且**摘掉评论上的 `user_id`**（评论内容保留、
 *   昵称改写为「账号已注销」）—— 因为用户行没了，留着悬空外键只会让后续查询困惑。
 */
export async function adminUserDelete(env, request, actor, ts) {
  const payload = await request.json().catch(() => null)
  const id = Number.parseInt(payload?.id, 10)
  if (!Number.isFinite(id)) return bad(ERR.badRequest)

  const row = await env.DB.prepare(`SELECT id, nick, role, email_hash FROM users WHERE id = ?1`).bind(id).first()
  if (!row) return bad(ERR.notFound, 404)

  /*
   * 🔴 这一条尤其重要：**彻底删除不可恢复**。
   * 没有层级校验，管理员能把超管连账号带评论归属一起抹掉。
   */
  const isSelf = Number(row.id) === Number(actor.id)
  if (!canActOn(actor.role, row.role, isSelf)) return bad(ERR.rejected, 403)

  await Promise.all([
    env.DB.prepare(
      `UPDATE comments SET nick = '账号已注销', avatar = NULL, user_id = NULL WHERE user_id = ?1`
    ).bind(id).run(),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(id).run(),
    env.DB.prepare(`DELETE FROM auth_codes WHERE email_hash = ?1`).bind(row.email_hash).run()
  ])
  await env.DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(id).run()

  /*
   * 审计里的 `target_id` 指向一个**已经不存在的用户** —— 这是刻意的：
   * 记录必须留下，否则"谁删了谁"就查不到了。昵称快照存在 detail 里，
   * 因为用户行没了、`actor_nick` 那套快照逻辑对目标不适用。
   */
  await writeAudit(env, actor, {
    action: 'user_delete',
    targetType: 'user',
    targetId: id,
    detail: `已彻底删除：${row.nick}（角色 ${ROLE_LABELS[row.role] ?? row.role}）`
  }, ts)

  // 彻底删除用户会改变用户总数/各状态计数，其评论的 user_id 也被清空
  invalidateAdminStatsCache()
  invalidateRecentCache()

  return json({ ok: true })
}

/**
 * `PATCH /api/admin/users/role` —— 设为 / 撤销管理员。**仅超管可用**。
 *
 * 规则（三条，缺一不可）：
 *   1. 调用者必须是**超管**（管理员不能给自己人提权，否则等于绕过超管授权）；
 *   2. 目标角色必须**严格低于**调用者 —— 所以超管改不了超管；
 *   3. 不能改**自己** —— 防手滑把自己降级后进不去后台。
 *
 * 🔴 为什么"超管不能设超管"：只有一个超管，避免"你给了某人超管、他把你降级"
 * 这种内斗。要转移超管身份请直接改数据库（迁移文件末尾有 SQL）。
 */
export async function adminUserSetRole(env, request, actor, ts) {
  if (Number(actor.role) < ROLE_SUPER) return bad(ERR.rejected, 403)

  const payload = await request.json().catch(() => null)
  const id = Number.parseInt(payload?.id, 10)
  const role = Number.parseInt(payload?.role, 10)
  // 只允许在「普通」与「管理员」之间切换；超管档位不能通过接口产生
  if (!Number.isFinite(id) || ![ROLE_USER, ROLE_ADMIN].includes(role)) return bad(ERR.badRequest)

  const target = await env.DB.prepare(`SELECT id, nick, role FROM users WHERE id = ?1`).bind(id).first()
  if (!target) return bad(ERR.notFound, 404)

  const isSelf = Number(target.id) === Number(actor.id)
  if (!canActOn(actor.role, target.role, isSelf)) return bad(ERR.rejected, 403)

  if (Number(target.role) === role) return json({ ok: true, unchanged: true })

  await env.DB.prepare(`UPDATE users SET role = ?1 WHERE id = ?2`).bind(role, id).run()

  await writeAudit(env, actor, {
    action: 'role_set',
    targetType: 'user',
    targetId: id,
    detail: `${target.nick}：${ROLE_LABELS[target.role] ?? target.role} → ${ROLE_LABELS[role]}`
  }, ts)

  // 角色变更影响「普通用户 / 管理员」构成（概览显示停用与活跃构成）
  invalidateAdminStatsCache()

  return json({ ok: true })
}

/**
 * `GET /api/admin/audit` —— 管理操作审计列表（仅超管）。
 *
 * 按时间倒序游标分页，形状与评论列表一致（`cursor` + `hasMore`）。
 */
export async function adminAuditList(env, url) {
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), MAX_LIMIT)
  const rawPage = Number.parseInt(url.searchParams.get('page') || '', 10)
  const isPageMode = Number.isFinite(rawPage) && rawPage >= 1
  const pageNum = isPageMode ? rawPage : 1

  const cursor = Number.parseInt(url.searchParams.get('cursor') || '', 10)
  const hasCursor = !isPageMode && Number.isFinite(cursor)

  if (isPageMode) {
    const passedTotal = Number.parseInt(url.searchParams.get('total') || '', 10)
    let total = Number.isFinite(passedTotal) && passedTotal >= 0 ? passedTotal : null

    if (total === null || pageNum === 1) {
      const countRes = await env.DB.prepare(`SELECT COUNT(*) AS total FROM admin_audit`).first()
      total = countRes?.total ?? 0
    }
    const totalPages = Math.max(1, Math.ceil(total / limit))

    const offset = (pageNum - 1) * limit
    const sql = `SELECT id, actor_id, actor_nick, actor_role, action, target_type, target_id, detail, created_at
                 FROM admin_audit ORDER BY id DESC LIMIT ?1 OFFSET ?2`
    const { results } = await env.DB.prepare(sql).bind(limit, offset).all()
    const rows = results || []

    return json({
      ok: true,
      entries: rows.map((r) => ({
        id: r.id,
        actorNick: r.actor_nick,
        actorRole: r.actor_role,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        detail: r.detail || '',
        createdAt: r.created_at
      })),
      total,
      totalPages,
      page: pageNum,
      limit,
      hasMore: pageNum < totalPages
    })
  }

  const sql = hasCursor
    ? `SELECT id, actor_id, actor_nick, actor_role, action, target_type, target_id, detail, created_at
       FROM admin_audit WHERE id < ?1 ORDER BY id DESC LIMIT ?2`
    : `SELECT id, actor_id, actor_nick, actor_role, action, target_type, target_id, detail, created_at
       FROM admin_audit ORDER BY id DESC LIMIT ?1`

  const stmt = hasCursor ? env.DB.prepare(sql).bind(cursor, limit + 1) : env.DB.prepare(sql).bind(limit + 1)
  const { results } = await stmt.all()
  const rows = results || []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return json({
    ok: true,
    entries: page.map((r) => ({
      id: r.id,
      actorNick: r.actor_nick,
      actorRole: r.actor_role,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail || '',
      createdAt: r.created_at
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore
  })
}

/**
 * `GET /api/admin/review-keywords` —— 生效中的审核词表总览。
 *
 * 返回**合并后的视图**（代码基线 + 库叠加），而不是原始表内容：
 * 管理员要判断"这条评论为什么进待审"，就得看到真正生效的那份。
 */
export async function adminReviewKeywordsGet(env) {
  const [kw, flags] = await Promise.all([
    env.DB.prepare(`SELECT id, text, category FROM review_keywords ORDER BY category ASC, text ASC`).all(),
    env.DB.prepare(`SELECT category FROM review_category_flags`).all()
  ])
  const keywords = (kw.results || []).map((r) => ({ id: r.id, text: r.text, category: r.category }))
  const disabled = (flags.results || []).map((r) => r.category)

  // 各类别下的**自定义词**条数（内置词另算，见下面 baselineWords）
  const customCount = new Map()
  for (const row of keywords) customCount.set(row.category, (customCount.get(row.category) || 0) + 1)

  /*
   * 基线类别（含"启用 / 停用"、内置词数量与**词列表**）。
   *
   * 🔴 必须把内置词**列出来**：只显示"自定义 N 条"会让管理员以为类别是空的
   *    （用户实际就这么反馈过 —— 看到"自定义 0 条"以为没词、必须自己加）。
   *    内置词是真正生效的那部分，不看它就判断不了"这个词表到底拦什么"。
   */
  const categories = BLOCKLIST_CATEGORY_NAMES.map((name) => ({
    name,
    baseline: true,
    disabled: disabled.includes(name),
    custom: customCount.get(name) || 0,
    baselineWords: listBaselineWords(name)
  }))
  // 超管新建的类别（基线里没有，所以只有自定义词）
  for (const [name, count] of customCount) {
    if (BLOCKLIST_CATEGORY_NAMES.includes(name)) continue
    categories.push({ name, baseline: false, disabled: disabled.includes(name), custom: count, baselineWords: [] })
  }

  return json({
    ok: true,
    categories,
    keywords,
    max: { keyword: KEYWORD_MAX, count: KEYWORD_COUNT_MAX },
    // 结构性规则（外链 / HTML 标签）**不让改**：它们是防注入的底线
    structural: BLOCKLIST_STRUCTURAL_HINT
  })
}

/** 给后台展示用的结构性规则说明（只读，不给编辑入口） */
const BLOCKLIST_STRUCTURAL_HINT = [
  { name: '外链', note: '图鉴讨论不需要外链，广告的主要形态' },
  { name: 'HTML 标签', note: '本站一律按纯文本渲染，出现标签基本是攻击或粘贴垃圾' }
]

/**
 * `PUT /api/admin/review-keywords` —— **整表替换**自定义词 + 类别停用标记（仅超管）。
 *
 * 与「常用选项」同一套理由：界面上一串改动 + 一次保存 = 一个整体动作，
 * 逐条增删会产生"删了旧的还没加新的"的中间态。
 * `batch` 在一个事务里执行，读者看不到半截状态。
 *
 * @param {{keywords: {text: string, category: string}[], disabled: string[]}} payload
 */
export async function adminReviewKeywordsPut(env, request, actor, ts) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return bad(ERR.badRequest)
  }
  if (!Array.isArray(payload?.keywords) || !Array.isArray(payload?.disabled)) return bad(ERR.badRequest)
  if (payload.keywords.length > KEYWORD_COUNT_MAX) return bad(ERR.keywordTooMany)

  /*
   * 规范化：trim、丢空串、按 (类别, 词) 去重。
   * 唯一索引会报错，但那是个 500 级错误 —— 不如在这里静默去重（手滑写两遍同样的词，
   * 按一次意思处理即可）。
   */
  const seen = new Set()
  const rows = []
  for (const raw of payload.keywords) {
    const text = String(raw?.text ?? '').trim()
    const category = String(raw?.category ?? '').trim()
    if (!text || !category) continue
    if (text.length > KEYWORD_MAX) return bad(ERR.keywordTooLong)
    if (category.length > KEYWORD_MAX) return bad(ERR.keywordTooLong)
    const key = `${category}\u0000${text}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ text, category })
  }

  /*
   * `disabled` 与 `keywords` **同等校验** —— 两者都进库、都会被读出来拼进匹配。
   *
   * 🔴 只过滤空串是不够的：不限长能塞进超长类别名、不限量能塞进几万条停用项。
   *    后果不是注入（值都走 bind），而是**仓库里存垃圾**：
   *    `review_category_flags` 会攒下永远匹配不到任何类别的行，
   *    而且会在每次 `loadReviewOverlay` 时被读出来、白占内存与匹配开销。
   */
  if (payload.disabled.length > KEYWORD_COUNT_MAX) return bad(ERR.keywordTooMany)
  const disabled = []
  for (const raw of payload.disabled) {
    const name = String(raw ?? '').trim()
    if (!name) continue
    if (name.length > KEYWORD_MAX) return bad(ERR.keywordTooLong)
    if (!disabled.includes(name)) disabled.push(name)
  }

  const statements = [
    env.DB.prepare(`DELETE FROM review_keywords`),
    env.DB.prepare(`DELETE FROM review_category_flags`)
  ]
  for (const row of rows) {
    statements.push(
      env.DB.prepare(`INSERT INTO review_keywords (text, category, created_at) VALUES (?1, ?2, ?3)`)
        .bind(row.text, row.category, ts)
    )
  }
  for (const name of disabled) {
    statements.push(
      env.DB.prepare(`INSERT INTO review_category_flags (category, created_at) VALUES (?1, ?2)`).bind(name, ts)
    )
  }
  await env.DB.batch(statements)

  /*
   * 清本实例的匹配器缓存：让**改的人自己立刻生效**。
   * 其它实例最长 30 秒后到期（见 `CACHE_TTL_MS`），这对审核词表完全可接受。
   */
  invalidateReviewMatcher()

  await writeAudit(env, actor, {
    action: 'review_keywords_set',
    targetType: 'keyword',
    targetId: 0,
    detail: `自定义词 ${rows.length} 条；停用类别 ${
      disabled.length ? disabled.join('、') : '无'
    }；含 ${[...new Set(rows.map((r) => r.category))].join('、') || '无'}`
  }, ts)

  return json({ ok: true, keywords: rows, disabled })
}
/** 常用选项单条文案上限（字符数），与 `REVIEW_NOTE_MAX` 保持一致。 */
const PRESET_TEXT_MAX = REVIEW_NOTE_MAX
/** 常用选项条数上限。够用即可，防止被塞成一本字典把界面撑爆。 */
const PRESET_COUNT_MAX = 20

/**
 * `GET /api/admin/review-presets` —— 转待审「常用选项」列表。
 *
 * 所有管理员都能读（他们要用来填原因），只有超管能改（见 PUT）。
 */
export async function adminReviewPresetsGet(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, text, sort_order FROM review_note_presets ORDER BY sort_order ASC, id ASC`
  ).all()
  return json({
    ok: true,
    presets: (results || []).map((r) => ({ id: r.id, text: r.text }))
  })
}

/**
 * `PUT /api/admin/review-presets` —— **整表替换**（仅超管）。
 *
 * 为什么是整表替换而不是逐条 POST / DELETE：
 *   超管在界面上是"改一串文案 → 保存"的整体动作。逐条增删会产生**中间态**
 *   （删了旧的还没加新的），别的管理员此刻正好打开界面就会读到半截列表。
 *   整表替换是原子的：要么全旧、要么全新。
 *
 * 传 `[]` 合法 —— 表示"不要常用选项，只留自由输入"。
 */
export async function adminReviewPresetsPut(env, request, actor, ts) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return bad(ERR.badRequest)
  }
  if (!Array.isArray(payload?.presets)) return bad(ERR.badRequest)
  if (payload.presets.length > PRESET_COUNT_MAX) return bad(ERR.presetTooMany)

  /*
   * 规范化：逐条 trim、丢掉空串、**去重**（唯一索引会报错，但那是个 500 级错误，
   * 不如在这里静默去重 —— 超管手滑写了两遍同样的文案，按一次意思处理即可）。
   */
  const seen = new Set()
  const texts = []
  for (const raw of payload.presets) {
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (text.length > PRESET_TEXT_MAX) return bad(ERR.presetTooLong)
    if (seen.has(text)) continue
    seen.add(text)
    texts.push(text)
  }

  // 先删后插。D1 的 `batch` 在**一个事务**里执行，不会让读者看到空表中间态。
  const statements = [env.DB.prepare(`DELETE FROM review_note_presets`)]
  texts.forEach((text, index) => {
    statements.push(
      env.DB.prepare(
        `INSERT INTO review_note_presets (text, sort_order, created_at) VALUES (?1, ?2, ?3)`
      ).bind(text, index, ts)
    )
  })
  await env.DB.batch(statements)

  await writeAudit(env, actor, {
    action: 'review_presets_set',
    targetType: 'preset',
    // 这张表没有"单条目标"，用 0 占位（列是 NOT NULL）
    targetId: 0,
    detail: texts.length ? texts.join(' / ') : '（清空）'
  }, ts)

  return json({ ok: true, presets: texts.map((text, i) => ({ id: i + 1, text })) })
}

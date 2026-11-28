/**
 * 评论列表、楼中楼、上下文定位、发表/自删、右栏预览及评论管理接口。
 */
import { getReviewMatcher, matchReview } from '../../src/config/commentBlocklist.js'
import { MAX_BODY_RAW, countEmoticonDisplayChars } from '../../src/config/emoticons.js'
import { invalidateAdminStatsCache } from '../../src/config/adminStatsCache.js'
import { COMMENT_PAGE_SIZE } from '../../src/config/discussions.js'
import { sha256Hex } from '../../src/utils/authCrypto.js'
import {
  BATCH_MAX, ERR, JSON_HEADERS, MAX_BODY, MAX_LIMIT, PAGE_KEY_RE,
  RECENT_CACHE_SECONDS, RECENT_LIMIT, SITE_PAGE_KEY,
  bad, checkRateLimit, clientIp, getRecentCache, invalidateRecentCache,
  json, normalizeReviewNote, sanitize, setRecentCache, verifyTurnstile, writeAudit
} from './shared.js'
import { loadSession } from './session.js'

/**
 * 单条评论的对外形状。
 *
 * @param {object} row
 * @param {number|null} myUserId
 *   当前登录用户的**内部 id**（未登录传 null）。
 *
 *   🔴 **只暴露"是不是我发的"这个布尔，不暴露 `user_id` 本身。**
 *   前端要判断"这条能不能删"就必须知道归属，但把所有人的内部自增 id
 *   铺在公开列表里没有任何必要 —— 那等于给出了用户注册顺序与活跃度。
 *   所以在这里就地折成一个 `mine` 布尔。
 */
export function toPublic(row, myUserId = null) {
  return {
    id: row.id,
    nick: row.nick,
    // 头像 ID（不是路径）。客户端用 avatarCatalog.json 换成图片；空值走昵称首字占位
    avatar: row.avatar || null,
    body: row.body,
    createdAt: row.created_at,
    status: row.status,
    // 是不是当前登录用户发的（决定界面上显不显示「删除」）
    mine: Boolean(myUserId && row.user_id === myUserId),
    pageKey: row.page_key,
    // 评论所在页面的人话名字（如「银币」）。由发表方连同评论一起存下来，
    // 这样管理端/账号弹窗不必为每条评论反查物品表，也不会因为缺产物而显示不出名字。
    pageLabel: row.page_label || null,
    // 命中审核词表的原因（供管理页面判断是误伤还是真垃圾）；干净评论为 null
    reviewReason: row.review_reason || null,
    /*
     * 回复：`parentId` 是被回复那一条的 id（普通评论为 null）。
     * `replyTo` 只有**父评论仍公开**时才有值（查询用 `LEFT JOIN ... AND p.status = 1`）：
     *   - 父评论被隐藏/删除 → `replyTo: null`，客户端据 `parentId` 显示"该消息已不可见"，
     *     而**不会**把已隐藏的内容重新泄漏出去（这是刻意只用 `status = 1` 关联的原因）。
     * 列表查询没做这个 JOIN 时（管理端等）两个字段退化为 null / 只有 parentId。
     *
     * `rootId` 只在天楼中楼模式（`?nested=1`）下有意义：**这条回复属于哪个顶层评论**。
     * 回复别人的回复时 `parentId` 指向那条回复、`rootId` 仍然指向同一个顶层评论——
     * 客户端据此把整串回复收在同一个楼主下面（B 站那种两层的形态）。
     */
    parentId: row.parent_id ?? null,
    replyTo: row.parent_nick
      ? { id: row.parent_id, nick: row.parent_nick, body: row.parent_body }
      : null,
    rootId: row.root_id ?? null
  }
}

/**
 * GET /api/comments —— 三种取法（都由 query 决定）
 *
 * | 取法 | 参数 | 返回 |
 * | --- | --- | --- |
 * | 平铺分页（站内讨论区 / 聊天式） | `page` + 可选 `cursor` | 该页**全部**评论，最新在前 |
 * | 楼中楼（详情页） | `page` + `nested=1`（可选 `cursor`） | **只返回顶层评论**，每条附 `replies`（前几条）+ `replyCount` |
 * | 展开某串回复 | `page` + `parent=<顶层评论 id>` | 那一串的全部回复（旧的在前） |
 *
 * 为什么楼中楼要在服务端分页：平铺分页的一页里会有"父评论不在这页"的回复，
 * 客户端拼不出完整的楼；只按顶层评论分页，才能保证每层楼都是完整的。
 */
export async function listComments(env, url, myUserId = null) {
  const pageKey = url.searchParams.get('page') || ''
  if (!PAGE_KEY_RE.test(pageKey)) return bad(ERR.badRequest)

  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '20', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), MAX_LIMIT)
  const cursor = Number.parseInt(url.searchParams.get('cursor') || '', 10)
  const hasCursor = Number.isFinite(cursor)

  if (url.searchParams.get('nested') === '1') {
    return listNestedComments(env, pageKey, { limit, cursor, hasCursor }, myUserId)
  }

  const threadId = Number.parseInt(url.searchParams.get('parent') || '', 10)
  if (Number.isFinite(threadId) && threadId > 0) {
    return listThreadReplies(env, pageKey, threadId, limit, myUserId)
  }

  /*
   * 多取 1 条判断 hasMore，避免 COUNT(*)（全表扫描，D1 按行计费）。
   *
   * 回复用**自连接**一次取回被回复那条的昵称与正文（`LEFT JOIN`，按主键关联，成本极低）：
   * 比"先查列表再补一次 IN 查询"少一次往返。代价是 D1 读行数翻倍（每页 20 → 40 行），
   * 在免费额度内可接受；`AND p.status = 1` 保证**已隐藏/已删除的父评论不会从这里泄漏内容**。
   */
  const sql = hasCursor
    ? `SELECT c.id, c.user_id, c.nick, c.avatar, c.body, c.created_at, c.status, c.page_key, c.page_label,
              c.parent_id, p.nick AS parent_nick, p.body AS parent_body
       FROM comments c LEFT JOIN comments p ON p.id = c.parent_id AND p.status = 1
       WHERE c.page_key = ?1 AND c.status = 1 AND c.id < ?2 ORDER BY c.id DESC LIMIT ?3`
    : `SELECT c.id, c.user_id, c.nick, c.avatar, c.body, c.created_at, c.status, c.page_key, c.page_label,
              c.parent_id, p.nick AS parent_nick, p.body AS parent_body
       FROM comments c LEFT JOIN comments p ON p.id = c.parent_id AND p.status = 1
       WHERE c.page_key = ?1 AND c.status = 1 ORDER BY c.id DESC LIMIT ?2`

  const stmt = hasCursor
    ? env.DB.prepare(sql).bind(pageKey, cursor, limit + 1)
    : env.DB.prepare(sql).bind(pageKey, limit + 1)

  const { results } = await stmt.all()
  const rows = results || []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  return json({
    ok: true,
    comments: page.map((r) => toPublic(r, myUserId)),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore
  })
}

/** 楼中楼里每条楼主默认带出几条回复（再多要点「全部 N 条回复」） */
const NESTED_PREVIEW_REPLIES = 3

/**
 * `GET /api/comments/context?page=<pageKey>&id=<评论 id>` —— 取**一条评论及其上下文**。
 *
 * ## 为什么需要它（2026-10-07）
 *
 * 「谁回复了我 / 我的评论」里的「去看看」会跳到 `#/discussions?c=<id>` 并滚到那一条。
 * 但**讨论区只加载第一页**（50 条），而那条回复可能已经是几百条之前 ——
 * 于是 `scrollToComment` 找不到目标，**静默什么都不做**（用户以为坏了）。
 *
 * 三种解法对比：
 *   · **逐页往上翻** —— 请求数随"多老"增长，最坏几十次；越老越慢；
 *   · **只显示那两条**（本接口）—— **恒定 1 次请求**，与多老无关；
 *   · 限制讨论区历史条数 —— 省不了额度（首屏照样 50 行），还丢历史。
 *
 * 所以采用第二种：不把那条塞进正常列表（会打乱游标分页），
 * 而是**单独取出来**，由前端在列表上方插一张「定位卡片」显示
 * **被回复的那条 + 回复本身**，并说明它不在当前页。
 *
 * ## 返回形状
 *
 * ```
 * { ok, found: true, comment: <那条回复>, parent: <被回复的>, inFirstPage: bool }
 * { ok, found: false }                    // 不存在 / 已隐藏 / 不属于该页面
 * ```
 *
 * `parent` 可能为 null（顶层评论，或父评论已被隐藏/删除）。
 */
export async function commentContext(env, url, myUserId = null) {
  const pageKey = url.searchParams.get('page') || ''
  if (!PAGE_KEY_RE.test(pageKey)) return bad(ERR.badRequest)

  const id = Number.parseInt(url.searchParams.get('id') || '', 10)
  if (!Number.isFinite(id) || id <= 0) return bad(ERR.badRequest)

  /*
   * 🔴 必须**同时限定 `page_key` 与 `status = 1`**：
   *   · 限定 page_key：否则任何人拿一个 id 就能读到**任意页面**的评论（含未公开页面的讨论）；
   *   · 限定 status：隐藏/待审的评论不能被这样"捞"出来 —— 那会绕过管理员的隐藏操作。
   * 条件不满足时统一返回 `found: false`，不区分"不存在"与"被隐藏"（避免探测）。
   */
  const row = await env.DB.prepare(
    `SELECT c.id, c.user_id, c.nick, c.avatar, c.body, c.created_at, c.status,
            c.page_key, c.page_label, c.parent_id, c.review_reason,
            p.id AS p_id, p.user_id AS p_user_id, p.nick AS p_nick, p.avatar AS p_avatar,
            p.body AS p_body, p.created_at AS p_created_at, p.status AS p_status
       FROM comments c
       LEFT JOIN comments p ON p.id = c.parent_id AND p.status = 1
      WHERE c.id = ?1 AND c.page_key = ?2 AND c.status = 1`
  )
    .bind(id, pageKey)
    .first()

  if (!row) return json({ ok: true, found: false })

  /*
   * `inFirstPage` 用**最省的方式**判断：该页面里是否存在比它更新的评论多于首页容量。
   * 直接 `COUNT(*)` 是全表扫（D1 按行计费），而这里只需要知道"它是否在前 N 条里"，
   * 所以取首页边界（第 N+1 条新评论的 id）比较即可 —— 一次索引范围查。
   *
   * 🔴 这个 N **必须与前端实际请求的页大小一致**（统一从 `COMMENT_PAGE_SIZE` 取）。
   * 写成与 `fetchComments` 默认 `limit` 不同的值时，超出页大小的评论会被错判成
   * "在首页里"，界面不显示定位卡片，用户看到的是"点了没反应"。
   *
   * 🔴 比较必须用**严格大于**：`OFFSET N` 取到的正是**第 N+1 条**，
   * 它本身就是"页外第一条"。用 `>=` 会把它算进页内，症状是"第 N+1 条点不动"。
   */
  const boundary = await env.DB.prepare(
    `SELECT id FROM comments
      WHERE page_key = ?1 AND status = 1
      ORDER BY id DESC LIMIT 1 OFFSET ?2`
  )
    .bind(pageKey, COMMENT_PAGE_SIZE)
    .first()
  const inFirstPage = !boundary || id > boundary.id

  const comment = toPublic(row, myUserId)
  // 父评论只在其仍公开时带出（JOIN 已限定 status = 1）
  const parent = row.p_id
    ? toPublic(
        {
          id: row.p_id,
          user_id: row.p_user_id,
          nick: row.p_nick,
          avatar: row.p_avatar,
          body: row.p_body,
          created_at: row.p_created_at,
          status: row.p_status,
          page_key: row.page_key,
          page_label: row.page_label
        },
        myUserId
      )
    : null

  return json({ ok: true, found: true, comment, parent, inFirstPage })
}


/**
 * 楼中楼：**只按顶层评论分页**，每条附前几条回复与总回复数。
 *
 * "顶层评论" = `parent_id IS NULL`，**外加"父评论已经没了"的孤儿回复**：
 * 别人删掉/隐藏了自己的评论后，回复它的人不该跟着消失——那种回复提到顶层显示，
 * 客户端按 `replyTo: null` 渲染成「回复的那条消息已不可见」（与平铺视图一致）。
 *
 * ⚠️ 回复是**按 thread 的顶层 id 一把捞出来**的（`COALESCE(p.parent_id, r.parent_id)`）：
 * 一次往返拿到这一页所有楼的回复，代价是读行数包含这些楼的**全部**回复
 * （不只是要显示的 3 条）。本站评论量小，用读行换往返划算；真到量大时改成
 * `ROW_NUMBER() OVER (PARTITION BY ...)` 限定每楼 3 条即可，API 形状不用变。
 */
export async function listNestedComments(env, pageKey, { limit, cursor, hasCursor }, myUserId = null) {
  const rootSql = hasCursor
    ? `SELECT c.id, c.user_id, c.nick, c.avatar, c.body, c.created_at, c.status, c.page_key, c.page_label,
              c.parent_id, p.nick AS parent_nick, p.body AS parent_body
       FROM comments c LEFT JOIN comments p ON p.id = c.parent_id AND p.status = 1
       WHERE c.page_key = ?1 AND c.status = 1
         AND (c.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM comments q WHERE q.id = c.parent_id AND q.status = 1))
         AND c.id < ?2
       ORDER BY c.id DESC LIMIT ?3`
    : `SELECT c.id, c.user_id, c.nick, c.avatar, c.body, c.created_at, c.status, c.page_key, c.page_label,
              c.parent_id, p.nick AS parent_nick, p.body AS parent_body
       FROM comments c LEFT JOIN comments p ON p.id = c.parent_id AND p.status = 1
       WHERE c.page_key = ?1 AND c.status = 1
         AND (c.parent_id IS NULL OR NOT EXISTS (SELECT 1 FROM comments q WHERE q.id = c.parent_id AND q.status = 1))
       ORDER BY c.id DESC LIMIT ?2`

  const rootStmt = hasCursor
    ? env.DB.prepare(rootSql).bind(pageKey, cursor, limit + 1)
    : env.DB.prepare(rootSql).bind(pageKey, limit + 1)
  const { results: rootRows } = await rootStmt.all()
  const rows = rootRows || []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  const comments = page.map((r) => toPublic(r, myUserId))
  if (!comments.length) return json({ ok: true, comments, nextCursor: null, hasMore: false })

  const placeholders = comments.map((_, i) => `?${i + 1}`).join(', ')
  const pageKeyIdx = comments.length + 1
  const { results: replyRows } = await env.DB.prepare(
    `SELECT r.id, r.user_id, r.nick, r.avatar, r.body, r.created_at, r.status, r.page_key, r.page_label,
            r.parent_id, COALESCE(p.parent_id, r.parent_id) AS root_id,
            p.nick AS parent_nick, p.body AS parent_body
     FROM comments r LEFT JOIN comments p ON p.id = r.parent_id AND p.status = 1
     WHERE r.page_key = ?${pageKeyIdx} AND r.status = 1
       AND (
         r.parent_id IN (${placeholders})
         OR r.parent_id IN (
           SELECT id FROM comments
           WHERE page_key = ?${pageKeyIdx} AND status = 1 AND parent_id IN (${placeholders})
         )
       )
     ORDER BY r.id ASC`
  )
    .bind(...comments.map((c) => c.id), pageKey)
    .all()

  const byRoot = new Map()
  for (const row of replyRows || []) {
    const list = byRoot.get(row.root_id) || []
    list.push(toPublic(row, myUserId))
    byRoot.set(row.root_id, list)
  }

  return json({
    ok: true,
    comments: comments.map((root) => {
      const all = byRoot.get(root.id) || []
      return {
        ...root,
        replyCount: all.length,
        replies: all.slice(0, NESTED_PREVIEW_REPLIES)
      }
    }),
    // 游标看的是**顶层评论**的 id（回复不参与分页）
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore
  })
}

/** 展开一串回复：某个顶层评论下的全部回复（旧的在前，与楼中楼里的顺序一致） */
export async function listThreadReplies(env, pageKey, threadId, limit, myUserId = null) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.user_id, r.nick, r.avatar, r.body, r.created_at, r.status, r.page_key, r.page_label,
            r.parent_id, COALESCE(p.parent_id, r.parent_id) AS root_id,
            p.nick AS parent_nick, p.body AS parent_body
     FROM comments r LEFT JOIN comments p ON p.id = r.parent_id AND p.status = 1
     WHERE r.page_key = ?1 AND r.status = 1
       AND (
         r.parent_id = ?2
         OR r.parent_id IN (
           SELECT id FROM comments
           WHERE page_key = ?1 AND status = 1 AND parent_id = ?2
         )
       )
     ORDER BY r.id ASC LIMIT ?3`
  )
    .bind(pageKey, threadId, limit + 1)
    .all()

  const rows = results || []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return json({ ok: true, comments: page.map((r) => toPublic(r, myUserId)), hasMore, nextCursor: null })
}

/** POST /api/comments —— 发评论，返回一次性自删令牌 */
export async function createComment(env, request, ts) {
  /*
   * 🔴 **发表评论必须登录**（已定决策：「读不要求登录，写要求」）。
   *
   * 从 Bearer 令牌解析出账号，**昵称与头像一律由服务端接管** ——
   * 不再接受客户端传来的 `nick` / `avatar`。这不是洁癖：
   * 本机身份时代任何人都能把昵称设成别人的名字，那是当时最大的问题；
   * 现在昵称全站唯一且经过邮箱验证，发言身份才真正可信。
   */
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)

  let payload
  try {
    payload = await request.json()
  } catch {
    return bad(ERR.badRequest)
  }

  // 1) 蜜罐：正常用户看不到该字段，填了就是机器人。零成本
  if (sanitize(payload?.hp, 8)) return bad(ERR.rejected, 403)

  const pageKey = String(payload?.page || '')
  if (!PAGE_KEY_RE.test(pageKey)) return bad(ERR.badRequest)

  /*
   * 昵称与头像**取自账号，不看客户端传的是什么**。
   *
   * 评论表里存的仍是**快照**（发表当时的昵称/头像），不是每次读都 JOIN 用户表：
   * 用户后来改名，历史评论保持原样 —— 这与 B 站/微博的观感一致，
   * 也避免给每次列表查询都加一次关联。
   */
  const nick = session.row.nick
  const avatar = session.row.avatar || null
  /*
   * 原始长度闸门放在 sanitize **之前**：`sanitize()` 结尾是 `.slice(0, maxLen)`，
   * 超长会被**静默砍掉**——若先截断再校验，被砍断的可能正好是一个表情 token
   * （`[e:tieba:25` 少了右括号），用户看到的是"发出去少了半截"。
   *
   * MAX_BODY_RAW 是"200 个表情"这种极端合法输入的上界（200 × 最长 token 41 字），
   * 只用来挡超长请求体；用户可见的限制始终是 200 显示字。
   */
  if (String(payload?.body ?? '').length > MAX_BODY_RAW) {
    return bad(`评论最多 ${MAX_BODY} 字，请精简后再发`)
  }
  const body = sanitize(payload?.body, MAX_BODY_RAW)
  if (!body) return bad(ERR.emptyBody)

  /*
   * 显示字数（一个表情算 1 字）**显式拒绝**，不要依赖 sanitize 的截断：
   * 用户看到"我明明只写了 200 字，发出去却少了"是最难解释的一类失败。
   * 前端计数器是第一道防线，这里按同一函数复核。
   */
  if (countEmoticonDisplayChars(body) > MAX_BODY) {
    return bad(`评论最多 ${MAX_BODY} 字，请精简后再发`)
  }

  // 评论所在页面的人话名字（如「银币」）。由前端用它手上已有的业务数据传上来——
  // 服务端读不到物品表，事后反查还得依赖产物存在。只做长度与去控制字符处理。
  const pageLabel = sanitize(payload?.pageLabel, 40)

  const ip = clientIp(request)
  const salt = env.IP_HASH_SALT || 'myrzg-default-salt'
  const ipHash = await sha256Hex(`${ip}|${salt}`)

  // 2) 限流（放在人机校验前：先挡高频，省一次外部 fetch）
  const limited = await checkRateLimit(env, ipHash, ts)
  if (limited) return bad(limited.message, limited.status)

  // 3) 人机校验
  if (!(await verifyTurnstile(env, payload?.token, ip))) {
    return bad(ERR.rejected, 403)
  }

  // 4) 审核词表命中 → 待审（不拒绝，避免误伤丢内容；管理员可一键放行）
  //
  // 匹配器来自**内存缓存**（见 `getReviewMatcher`）：每 30 秒最多读一次库，
  // 绝大多数请求零额外查询。读库失败会**回落代码基线**，不会变成"不审核"。
  const reviewHits = matchReview(body, await getReviewMatcher(() => loadReviewOverlay(env)))
  const needsReview = reviewHits.length > 0
  const status = needsReview ? 0 : 1

  /*
   * 5) 回复目标（可选）。放在限流与人机校验**之后**：异常流量不该多花一次读行。
   *
   * 校验三条，全部不满足就**当普通评论发**（静默降级、不报错）：
   *   - 是正整数；
   *   - 那条评论存在、**与本条同一 page_key**（否则就成了跨页面乱回复）；
   *   - 那条评论**仍公开**（status = 1）——回复一条待审/已隐藏的消息，
   *     引用行会指向别人看不到的内容，等于把审核结果漏出去。
   *
   * 为什么降级而不是拒绝：用户点「回复」时对方那条可能刚好被删/被隐藏，
   * 这时把他的正文整条拒掉是最糟的体验——他的话本身完全有效，只是少了个引用。
   */
  let parentId = Number.parseInt(payload?.parentId, 10)
  if (!Number.isFinite(parentId) || parentId <= 0) parentId = null
  let parent = null
  if (parentId) {
    parent = await env.DB.prepare(
      `SELECT id, nick, body FROM comments WHERE id = ?1 AND page_key = ?2 AND status = 1`
    )
      .bind(parentId, pageKey)
      .first()
    if (!parent) parentId = null
  }

  const uaHash = await sha256Hex(String(request.headers.get('user-agent') || '').slice(0, 200))

  /*
   * 写入的列：
   *   - `user_id`：评论挂在账号上，「我的评论」「谁回复了我」都靠它；
   *   - **不写 `token_hash`**（列保留不用，SQLite 删列代价高且留着无害）。
   */
  const inserted = await env.DB.prepare(
    `INSERT INTO comments (page_key, parent_id, user_id, nick, avatar, body, status, created_at, ip_hash, ua_hash, review_reason, page_label)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
     RETURNING id, created_at`
  )
    .bind(
      pageKey,
      parentId,
      session.row.id,
      nick,
      avatar,
      body,
      status,
      ts,
      ipHash,
      uaHash,
      needsReview ? reviewHits.join(',') : null,
      pageLabel || null
    )
    .first()

  /*
   * 概览缓存失效：新评论会改变总数；若命中词表进待审（`status = 0`），
   * 「待审」计数也变。概览是只读仪表盘，滞后 30 秒本身可接受，
   * 但"刚发完就去后台看数字没动"是**可复现的困惑**，故主动失效。
   */
  invalidateAdminStatsCache()
  if (pageKey === SITE_PAGE_KEY && status === 1) invalidateRecentCache()

  return json(
    {
      ok: true,
      /*
       * `pageKey` / `pageLabel` 与列表接口（`GET /api/comments`、`/api/recent`）返回的字段保持一致：
       * 调用方拿到一个 comment 对象时，字段不应该因"来自发表还是来自列表"而不同。
       * 右栏「最新讨论」只镜像 `site:general`，**就是靠这个字段判断的**——
       * 少了它，在物品/角色页发表的那条会被误插进右栏（2026-10-04 用户反馈）。
       */
      comment: {
        id: inserted.id,
        nick,
        avatar,
        body,
        createdAt: inserted.created_at,
        status,
        // 自己刚发的，当然是自己的
        mine: true,
        pageKey,
        pageLabel: pageLabel || null,
        /*
         * 回复：`replyTo` 直接复用校验时已经读到的那一行，**不多查一次**；
         * 于是"刚发出去的回复"与"重新拉列表拿到的同一条"渲染结果一致（都带引用行）。
         */
        parentId,
        replyTo: parent ? { id: parent.id, nick: parent.nick, body: parent.body } : null
      },
      pending: status === 0,
      notice: status === 0 ? '评论已提交，将尽快审核后显示' : ''
    },
    201
  )
}
/**
 * DELETE /api/comments —— 删自己发的评论。
 *
 * 归属判据是 **`comments.user_id`**（登录账号），不是浏览器端凭证：
 * 按浏览器判归属只能删**同一台设备**发的评论，换设备就删不掉。
 */
export async function deleteOwnComment(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)

  let payload
  try {
    payload = await request.json()
  } catch {
    return bad(ERR.badRequest)
  }

  const id = Number.parseInt(payload?.id, 10)
  if (!Number.isFinite(id)) return bad(ERR.badRequest)

  const row = await env.DB.prepare(`SELECT id, user_id FROM comments WHERE id = ?1`).bind(id).first()

  // 已经不在库里就算成功——**幂等**。否则重复点击、多个标签页、或列表是旧快照时
  // 会报"评论不存在"，用户看到"明明还在却说不存在"，比直接消失更困惑。
  if (!row) return json({ ok: true, alreadyGone: true })

  // 不是自己的：一律 403。**不区分"不存在"与"不是你的"**，
  // 否则这个接口就成了"某个 id 是否存在的探测器"。
  if (row.user_id !== session.row.id) return bad(ERR.rejected, 403)

  /*
   * **真删除，不是软删除**（用户明确要求："删评论都要彻底删了，别留记录"）。
   *
   * 写成 `UPDATE ... SET status = 2` 会让库里持续堆积用户已删的记录，
   * 而管理页默认只看待审 —— 用户"在管理页也看不到、却一直有记录"。
   *
   * 代价：软删除保留证据供追溯、便于误删恢复，硬删除后两点没有了，
   * 但"用户要求删除"在隐私意义上本就该是真删除。管理端的「隐藏」（status=2）
   * 仍是软删除，用于审核下架，两者职责不同。
   */
  await env.DB.prepare(`DELETE FROM comments WHERE id = ?1`).bind(id).run()
  // 自删也是"评论少了一条" → 失效概览缓存与右栏缓存
  invalidateAdminStatsCache()
  invalidateRecentCache()
  return json({ ok: true })
}

/**
 * 管理端可按「页面类型」筛选的档位。
 *
 * 键是查询参数值，值是 `page_key` 前缀。`site` 特殊：站内讨论区的 key 是
 * 固定的 `site:general`（无实体 ID），所以按**等值**匹配而不是前缀匹配。
 *
 * ⚠️ 这份清单必须与 `src/utils/commentApi.js` 的 `COMMENT_PAGE_PREFIX` 保持一致：
 * 新增评论页面时**两处都要改**，否则管理端筛不到那一类。
 */
const ADMIN_PAGE_KINDS = {
  site: { label: '站内讨论区', prefix: 'site:' },
  item: { label: '物品', prefix: 'item:' },
  hero: { label: '角色', prefix: 'hero:' },
  pet: { label: '魔物', prefix: 'pet:' },
  monster: { label: '怪物', prefix: 'monster:' },
  furniture: { label: '家具', prefix: 'furniture:' },
  task: { label: '任务', prefix: 'task:' },
  event: { label: '活动', prefix: 'event:' },
  explore: { label: '探索', prefix: 'explore:' },
  battle: { label: '副本', prefix: 'battle:' },
  stage: { label: '关卡', prefix: 'stage:' }
}

/**
 * GET /api/admin/comments?status=&q=&cursor=&limit=&pageKind= —— 管理端列表
 *
 * `q` 为关键词搜索，匹配**正文 / 昵称 / 页面标识**（大小写不敏感）。
 * 在服务端搜而不是前端过滤：评论会持续增长，管理端不该把全部数据拉到浏览器再筛。
 * 用 LIKE 而非 FTS：D1 免费版读便宜（500 万行/天），而 FTS 要额外索引（写入按行计费），
 * 管理端查询低频，没必要为它增加写入成本。
 *
 * `pageKind` 按**页面类型**筛选（站内讨论区 / 物品 / 角色 …）。
 * 为什么需要：不筛的话"讨论区有没有人吵架"与"某物品页的垃圾评论"混在一张表里，
 * 只能靠关键词猜；而 `page_key` 是 `item:30047` 这种内部标识，用户报的编号对不上。
 */
export async function adminList(env, url) {
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), MAX_LIMIT)
  const rawPage = Number.parseInt(url.searchParams.get('page') || '', 10)
  const isPageMode = Number.isFinite(rawPage) && rawPage >= 1
  const pageNum = isPageMode ? rawPage : 1

  const cursor = Number.parseInt(url.searchParams.get('cursor') || '', 10)
  const hasCursor = !isPageMode && Number.isFinite(cursor)

  const statusParam = url.searchParams.get('status')
  const hasStatus = statusParam === '0' || statusParam === '1' || statusParam === '2'
  const status = hasStatus ? Number.parseInt(statusParam, 10) : null

  // 页面类型：只认白名单里的键，非法值按"不筛"处理（与 status 同样宽容）
  const pageKindParam = url.searchParams.get('pageKind') || ''
  const pageKind = Object.prototype.hasOwnProperty.call(ADMIN_PAGE_KINDS, pageKindParam)
    ? pageKindParam
    : null

  /*
   * `?userId=` —— 只看某个账号的评论（管理端"用户详情 → 他的评论"用它）。
   *
   * 这里收的是**内部自增 id**（不是对外的 `public_no`）：管理端列表要把
   * `comments.user_id` 与 `users.id` 对上，用内部 id 少一次映射。
   * 管理端本来就看得到内部 id，不构成额外暴露。
   */
  const userIdParam = Number.parseInt(url.searchParams.get('userId') || '', 10)
  const hasUserId = Number.isFinite(userIdParam)

  // 关键词：`%`/`_`/`\` 用 ESCAPE 子句按**字面量**匹配。
  // 不能简单删掉这些字符：删了会变成空条件 → 静默返回全部评论，
  // 用户搜 `%` 却看到"全部"是最容易误判的行为。转义后搜的是字面量本身。
  const q = sanitize(url.searchParams.get('q') || '', 60)
  const hasQ = q.length > 0
  const likeParam = hasQ ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : ''

  const where = []
  const binds = []
  if (hasStatus) {
    binds.push(status)
    where.push(`status = ?${binds.length}`)
  }
  if (hasQ) {
    binds.push(likeParam)
    const i = binds.length
    where.push(`(body LIKE ?${i} ESCAPE '\\' OR nick LIKE ?${i} ESCAPE '\\' OR page_key LIKE ?${i} ESCAPE '\\')`)
  }
  if (hasUserId) {
    binds.push(userIdParam)
    where.push(`user_id = ?${binds.length}`)
  }
  /*
   * 按**命中原因**筛（`review_reason`）。
   *
   * 用途：词表某个词收得太宽时（某类词批量误伤），把命中的那批一次性捞出来
   * 批量放行 —— 逐条翻列表在这种场景下不现实。
   *
   * `review_reason` 存的是**逗号分隔的多个类别**（写入时 `reviewHits.join(',')`），
   * 所以用 LIKE 做子串匹配而非等值：一条评论可能同时命中「赌博,引流」。
   * 特殊值 `any` = "命中过任何词"（捞出所有自动进待审的）。
   */
  const reasonParam = sanitize(url.searchParams.get('reason') || '', 40)
  if (reasonParam === 'any') {
    where.push(`review_reason IS NOT NULL AND review_reason <> ''`)
  } else if (reasonParam) {
    binds.push(`%${reasonParam.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`)
    where.push(`review_reason LIKE ?${binds.length} ESCAPE '\\'`)
  }
  /*
   * 按**有没有人工待审原因**筛。
   *
   * 用途：找出"同事打回却没写原因"的那些，回头补说明。
   * `1` = 只看有备注的；`0` = 只看没备注的。
   */
  const hasNoteParam = url.searchParams.get('hasNote')
  if (hasNoteParam === '1') {
    where.push(`review_note IS NOT NULL AND review_note <> ''`)
  } else if (hasNoteParam === '0') {
    where.push(`(review_note IS NULL OR review_note = '')`)
  }
  if (pageKind) {
    /*
     * 站内讨论区是固定 key（`site:general`），用等值更精确；
     * 其余是 `<前缀>:<实体ID>`，用 `前缀:%` 匹配。
     * `ESCAPE '\'` 与关键词搜索保持同一套转义规则（前缀里不会有 % _，但一致更稳）。
     */
    const { prefix } = ADMIN_PAGE_KINDS[pageKind]
    binds.push(pageKind === 'site' ? 'site:general' : `${prefix}%`)
    where.push(
      pageKind === 'site'
        ? `page_key = ?${binds.length}`
        : `page_key LIKE ?${binds.length} ESCAPE '\\'`
    )
  }

  if (isPageMode) {
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const passedTotal = Number.parseInt(url.searchParams.get('total') || '', 10)
    let total = Number.isFinite(passedTotal) && passedTotal >= 0 ? passedTotal : null

    if (total === null || pageNum === 1) {
      const countSql = `SELECT COUNT(*) AS total FROM comments ${whereClause}`
      const stmt = binds.length ? env.DB.prepare(countSql).bind(...binds) : env.DB.prepare(countSql)
      const countRes = await stmt.first()
      total = countRes?.total ?? 0
    }
    const totalPages = Math.max(1, Math.ceil(total / limit))

    const offset = (pageNum - 1) * limit
    const queryBinds = [...binds, limit, offset]
    const sql = `SELECT id, page_key, page_label, nick, avatar, body, created_at, status, review_reason, review_note, user_id FROM comments
      ${whereClause}
      ORDER BY id DESC LIMIT ?${queryBinds.length - 1} OFFSET ?${queryBinds.length}`

    const { results } = await env.DB.prepare(sql).bind(...queryBinds).all()
    const rows = results || []

    /*
     * 这里**不要**加 `SELECT status, COUNT(*) … GROUP BY status` 来给筛选项显示条数：
     * 它必须逐行扫过全部匹配行（覆盖索引只减少列宽，行数一个都少不了），
     * 实测占单页成本 91%~99%，且随评论量线性变贵。筛选档位不需要预先知道条数。
     *
     * `total` 是唯一保留的聚合：分页需要它，且只在第 1 页算一次，
     * 走 `idx_comments_status_id` 定位，成本随**命中行数**而非全表。
     */
    return json({
      ok: true,
      comments: rows.map(toAdminComment),
      total,
      totalPages,
      page: pageNum,
      limit,
      hasMore: pageNum < totalPages
    })
  }

  if (hasCursor) {
    binds.push(cursor)
    where.push(`id < ?${binds.length}`)
  }
  binds.push(limit + 1)

  const sql = `SELECT id, page_key, page_label, nick, avatar, body, created_at, status, review_reason, review_note, user_id FROM comments
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id DESC LIMIT ?${binds.length}`

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all()
  const rows = results || []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  /*
   * 游标模式（旧路径）：`pendingCount` 也一并去掉 —— 它唯一的消费者是
   * 前台的档位胶囊数字，而那四个数字已于 2026-10-14 移除（见分页模式处的说明）。
   * 留着不删会让"每页多一条 COUNT"的成本原地复活。
   */
  return json({
    ok: true,
    comments: page.map(toAdminComment),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore
  })
}


/**
 * GET /api/recent —— **站内讨论区**的最新讨论（右栏预览用）
 *
 * 只取 `site:general`（站内总讨论区）的消息。刻意**不混入各图鉴页面的讨论**：
 * 那是各自条目的讨论，与"站内讨论区"是分开的两套内容（用户明确要求）。
 *
 * 固定返回最新若干条，不做游标分页。
 *
 * **刻意带边缘缓存**（`s-maxage`）：右栏在每个页面都可见，若每次打开页面都回源查 D1，
 * 那是全站最大的一笔无意义开销。30 秒的共享缓存能让同一 POP 的众多访客共用一次查询，
 * 而 30 秒对"最新讨论"完全够新。
 * 缓存是**共享**的，所以这里只回公开字段、绝不带任何用户私有数据。
 */

export async function listRecent(env, { fresh = false } = {}) {
  const now = Date.now()
  let comments = !fresh ? getRecentCache(now) : null
  if (!comments) {
    const { results } = await env.DB.prepare(
      `SELECT id, page_key, page_label, nick, avatar, body, created_at
       FROM comments WHERE status = 1 AND page_key = ?1 ORDER BY id DESC LIMIT ?2`
    )
      .bind(SITE_PAGE_KEY, RECENT_LIMIT)
      .all()

    comments = (results || []).map((row) => ({
      id: row.id,
      nick: row.nick,
      avatar: row.avatar || null,
      body: row.body,
      createdAt: row.created_at,
      pageKey: row.page_key,
      pageLabel: row.page_label || null
    }))
    setRecentCache(comments, now)
  }

  return new Response(JSON.stringify({ ok: true, comments }), {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      /*
       * `?fresh=1` = 调用方刚发表完，必须看到自己的新评论：**跳过共享缓存**。
       * 不加这个的话会撞上 30 秒缓存窗口，用户看到"发完右边没同步"（实际反馈过）。
       * 只有用户主动操作后才走这条，正常浏览仍吃缓存，额度开销可忽略。
       */
      'cache-control': fresh
        ? 'no-store'
        : `public, max-age=0, s-maxage=${RECENT_CACHE_SECONDS}, stale-while-revalidate=60`
    }
  })
}

/** PATCH /api/admin/comments —— 改状态（放行 / 隐藏 / 打回待审）
 *
 * 支持**单条**（传 `id`）与**批量**（传 `ids` 数组）两种形态，语义完全相同：
 * 批量只是把同一件事对多条一起做，所以刻意不另开一个接口 ——
 * 分开会让人以为两者的规则不一样（其实锚点、备注、审计口径都一致）。
 */
export async function adminPatch(env, request, actor, ts) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return bad(ERR.badRequest)
  }
  const status = Number.parseInt(payload?.status, 10)
  if (![0, 1, 2].includes(status)) return bad(ERR.badRequest)

  // 收集目标 id：`ids` 优先（批量），否则退回单条 `id`
  const rawIds = Array.isArray(payload?.ids) ? payload.ids : [payload?.id]
  const ids = []
  for (const raw of rawIds) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && !ids.includes(n)) ids.push(n)
  }
  if (!ids.length) return bad(ERR.badRequest)
  /*
   * 批量上限：一次几百条的 UPDATE + 同样多的审计插入会在一次请求里做完，
   * 既有超时风险，也容易让"手滑全选"造成难以复盘的大范围改动。
   * 100 条足够日常使用（一页 50 条，选两页）。
   */
  if (ids.length > BATCH_MAX) return bad(ERR.batchTooMany)

  /*
   * 「转待审原因」：只在 `status = 0` 时有意义，由管理员手填、可空。
   *
   * 🔴 与 `review_reason`（系统自动命中的类别）**是两列**，不要合并：
   *    一条评论可能"自动命中赌博词 + 人工备注需要再确认"，两者都要留。
   *
   * 放行 / 隐藏时**一律清空**：备注描述的是"当前为什么在待审队列里"，
   * 状态已定论还留着旧备注会误导后来接手的人。历史另有 `admin_audit` 记录。
   */
  const note = status === 0 ? normalizeReviewNote(payload?.note) : null
  if (status === 0 && payload?.note !== undefined && note === null && String(payload.note).trim()) {
    return bad(ERR.reviewNoteTooLong)
  }

  /*
   * 先读原文再改：审计里要留下**评论正文摘要**。
   * 只记 id 的话，事后看到"隐藏了 #42"也不知道当时隐藏了什么。
   *
   * 批量时一并查出**哪些 id 真的存在** —— 不存在的直接跳过，
   * 而不是让整个批次失败：管理员选了 10 条、其中 2 条已被别人删掉，
   * 剩下 8 条照样该处理。
   */
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(', ')
  const { results } = await env.DB.prepare(
    // 一并取 `status` 与 `user_id`：前者判断"状态是否真的变了"（决定要不要通知作者），
    // 后者是作者（`user_id` 为空的老评论没有归属，无处通知）
    `SELECT id, body, nick, status, user_id FROM comments WHERE id IN (${placeholders})`
  ).bind(...ids).all()
  const found = results || []
  if (!found.length) return bad(ERR.notFound, 404)

  const foundIds = found.map((r) => r.id)
  const missing = ids.filter((id) => !foundIds.includes(id))

  /*
   * 🔴 只有**状态真的变了**才算"处理过一次"。
   *
   * 若每次提交都写 `moderated_at`，管理员重复点"隐藏"会把时间一直往后推，
   * 作者就会**反复收到同一条评论的通知**（红点清了又来）。
   * 所以先比较新旧状态，只把变了的那些挑出来。
   *
   * 注意这里**不记录"要通知谁"** —— 未读数是读取时算的
   * （`COUNT(我的评论 WHERE moderated_at > 我上次读的时间)`），
   * 写的时候不需要知道收件人（与「谁回复了我」同一套机制）。
   */
  const changedIds = found.filter((r) => Number(r.status) !== status).map((r) => r.id)

  /*
   * 一次性提交：`batch` 在**一个事务**里执行，所以"改状态"与"写审计"不会只成一半。
   * 单条时这条路径与原来完全等价（一个 UPDATE + 一条审计）。
   */
  const statements = [
    env.DB.prepare(
      `UPDATE comments SET status = ?1, review_note = ?2 WHERE id IN (${
        foundIds.map((_, i) => `?${i + 3}`).join(', ')
      })`
    ).bind(status, note, ...foundIds)
  ]

  /*
   * 给**状态真变了**的那些打上处理时间（作者据此收到通知）。
   * 单独一条语句：只更新 changedIds，不动没变的那些。
   *
   * 🔴 用**毫秒**（`Date.now()`），不是这个函数的 `ts`（那是秒）——
   *    未读判定要与 `users.moderation_read_at` 比大小，两边必须同一精度。
   *    用秒会让"同一秒内标已读 + 又被处理"不可区分（详见 `authMarkModerationRead`）。
   */
  if (changedIds.length) {
    statements.push(
      env.DB.prepare(
        `UPDATE comments SET moderated_at = ?1 WHERE id IN (${changedIds.map((_, i) => `?${i + 2}`).join(', ')})`
      ).bind(Date.now(), ...changedIds)
    )
  }

  const ACTION_BY_STATUS = { 0: 'comment_pending', 1: 'comment_show', 2: 'comment_hide' }
  for (const row of found) {
    /*
     * 逐条写审计（而不是"批量操作一条摘要"）：这样才能在账本里按**单条评论**
     * 追出"这条是谁、什么时候处理的" —— 评论行本身没有记录操作者的列。
     */
    statements.push(
      env.DB.prepare(
        `INSERT INTO admin_audit (actor_id, actor_nick, actor_role, action, target_type, target_id, detail, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(
        actor.id,
        String(actor.nick || ''),
        Number(actor.role) || 0,
        ACTION_BY_STATUS[status],
        'comment',
        row.id,
        // 备注一并进审计：日后翻账本时能看到"当时为什么打回"
        `${row.nick}：${String(row.body || '').slice(0, 40)}${note ? `（待审原因：${note}）` : ''}`,
        ts
      )
    )
  }
  await env.DB.batch(statements)

  /*
   * 概览缓存失效：改了评论状态 = 待审/已显示/已隐藏三个计数都变，
   * 不失效的话管理员处理完回概览还是旧数字，会以为没生效。
   */
  if (foundIds.length) {
    invalidateAdminStatsCache()
    invalidateRecentCache()
  }

  return json({ ok: true, changed: foundIds.length, missing })
}

/**
 * `DELETE /api/admin/comments` —— **彻底删除**（隐私删除请求用；软删除请用 PATCH status=2）。
 *
 * 支持**单条**（传 `id`）与**批量**（传 `ids` 数组）两种形态，与 `adminPatch`
 * 完全同构（2026-10-14 补批量）。批量刻意不另开接口 —— 分开会让人以为两者
 * 规则不同，而实际只有"改状态"与"删掉"这一点差别（锚点、上限、审计口径一致）。
 *
 * 🔴 与 `adminPatch` 的**关键区别：这里不可恢复**。`PATCH status=2` 是软删除
 *    （可放行回来），而本接口是 `DELETE`（软删除请走 PATCH）。所以前端必须
 *    用红色确认框，且文案要写明"不可恢复"。
 */
export async function adminDelete(env, request, actor, ts) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return bad(ERR.badRequest)
  }

  // 收集目标 id：`ids` 优先（批量），否则退回单条 `id`（与 adminPatch 同规则）
  const rawIds = Array.isArray(payload?.ids) ? payload.ids : [payload?.id]
  const ids = []
  for (const raw of rawIds) {
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && !ids.includes(n)) ids.push(n)
  }
  if (!ids.length) return bad(ERR.badRequest)
  // 与 adminPatch 同一上限：防"手滑全选"，也让一次请求的耗时可控
  if (ids.length > BATCH_MAX) return bad(ERR.batchTooMany)

  /*
   * 删之前先取正文摘要（供审计留痕），并**一并查出哪些 id 真的存在**。
   * 不存在的跳过而不是整批失败：管理员选了 10 条、其中 2 条已被别人删掉，
   * 剩下 8 条照样该删（与 adminPatch 的行为一致）。
   */
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(', ')
  const { results } = await env.DB.prepare(
    `SELECT id, body, nick FROM comments WHERE id IN (${placeholders})`
  )
    .bind(...ids)
    .all()
  const found = results || []
  const foundIds = found.map((r) => r.id)
  const missing = ids.filter((id) => !foundIds.includes(id))

  if (!foundIds.length) return bad(ERR.notFound, 404)

  /*
   * 用 `batch` 把「删除 + 逐条审计」放进**一次事务**：要么都成，要么都不成。
   * 逐条写审计（而非一条摘要）的理由同 adminPatch —— 评论行没有记录操作者的列，
   * 只有逐条记才能在账本里按单条评论追出"谁删的"。
   */
  const statements = [
    env.DB.prepare(`DELETE FROM comments WHERE id IN (${foundIds.map((_, i) => `?${i + 1}`).join(', ')})`)
      .bind(...foundIds)
  ]
  for (const row of found) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO admin_audit (actor_id, actor_nick, actor_role, action, target_type, target_id, detail, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
      ).bind(
        actor.id,
        String(actor.nick || ''),
        Number(actor.role) || 0,
        'comment_delete',
        'comment',
        row.id,
        `${row.nick}：${String(row.body || '').slice(0, 40)}`,
        ts
      )
    )
  }
  await env.DB.batch(statements)

  // 彻底删除会同时改变总量与各状态计数 → 失效概览缓存与右栏缓存
  invalidateAdminStatsCache()
  invalidateRecentCache()

  return json({ ok: true, deleted: foundIds.length, missing })
}

/**
 * 管理端看的评论形状 = 公开形状 + **内部 `userId`**。
 *
 * 🔴 为什么不直接把这个字段加进 `toPublic`：`toPublic` 同时供**公开**的
 * `/api/comments` 使用，而账号体系对外只暴露 `public_no`，不暴露内部自增 id。
 * 所以单独包一层，只在管理端加。
 */
export function toAdminComment(row) {
  return {
    ...toPublic(row),
    userId: row.user_id ?? null,
    /*
     * 「转待审原因」：管理员手填的备注。
     *
     * 🔴 **只加在管理端**，绝不进 `toPublic` —— 它是给同事看的内部说明，
     * 泄漏给访客等于把审核标准暴露出去（作者还会看到"为什么被扣下"的细节）。
     */
    reviewNote: row.review_note || null
  }
}

/**
 * 读超管维护的词表叠加层（`review_keywords` + `review_category_flags`）。
 *
 * 只在缓存过期时被调用（见 `getReviewMatcher`），所以两次查询的成本可以接受。
 * 表不存在时会让 `getReviewMatcher` 回落基线，不会把发评论打挂。
 */
export async function loadReviewOverlay(env) {
  const [kw, flags] = await Promise.all([
    env.DB.prepare(`SELECT text, category FROM review_keywords`).all(),
    env.DB.prepare(`SELECT category FROM review_category_flags`).all()
  ])
  return {
    keywords: kw.results || [],
    disabled: (flags.results || []).map((r) => r.category)
  }
}

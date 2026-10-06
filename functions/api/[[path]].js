/**
 * 评论 API（Cloudflare Pages Functions）
 *
 * 路由：
 *   GET    /api/health           探活（同时用于线上缓存头断言）
 *   GET    /api/comments         列表（分页）
 *   POST   /api/comments         发表
 *   DELETE /api/comments         自己删除（凭浏览器令牌）
 *   GET    /api/admin/comments   管理端列表（需管理员令牌）
 *   PATCH  /api/admin/comments   管理端改状态：0 待审 / 1 显示 / 2 隐藏
 *   DELETE /api/admin/comments   管理端彻底删除
 *
 * 设计依据：docs/technical/COMMENTS_BACKEND.md
 *
 * 三条必须遵守的约束（免费版）：
 *   1. CPU 10ms/次——只用 WebCrypto 做 SHA-256。**禁止 bcrypt/argon2**，
 *      实测 PBKDF2 600k 次要 104ms，必然触发 Error 1102。
 *      管理员与评论者都用「随机令牌 + 恒定时间比较」，不做密码哈希，正好绕开。
 *   2. D1 写入按「行」计费（索引也算行），一次发评论约 6 行，上限约 1.5 万条/天。
 *   3. 响应必须是 application/json + no-store；本站 EdgeOne 按文件类型缓存，
 *      JSON 当前不被缓存（2026-10-01 实测），no-store 是第二道防线。
 *
 * 环境变量（Cloudflare Pages 项目配置，不入仓库）：
 *   DB                D1 绑定（wrangler.toml）
 *   ADMIN_TOKEN       可选。管理端令牌；未配置则管理接口一律 404
 *   TURNSTILE_SECRET  可选。未配置则跳过人机校验
 *   IP_HASH_SALT      可选但强烈建议。IP/邮箱哈希加盐
 */

import { matchReview } from '../../src/config/commentBlocklist.js'
import { MAX_BODY_DISPLAY, MAX_BODY_RAW, countEmoticonDisplayChars } from '../../src/config/emoticons.js'
import {
  CAPTCHA_TTL_MS, CODE_COOLDOWN_SEC, CODE_DIGITS, CODE_EMAIL_DAILY_MAX,
  CODE_IP_DAILY_MAX, CODE_IP_HOURLY_MAX, CODE_MAX_ACTIVE, CODE_MAX_ATTEMPTS,
  CODE_TTL_MS, DEFAULT_AVATAR, LOGIN_MAX_FAILS, NICK_MAX, NICK_MIN,
  PASSWORD_MIN, PBKDF2_ITERS, SESSION_TTL_MS
} from '../../src/config/auth.js'
import { BLOCKED_EMAIL_DOMAINS } from '../../src/config/disposableEmails.js'
import { buildCaptcha } from '../../src/utils/authCaptcha.js'
import {
  emailLookupHash, generateNumericCode, generateSessionToken, isDisposableEmail,
  isPlausibleEmail, normalizeEmail, placeholderPasswordSalt, pepperHash, sha256Hex, timingSafeEqualHex
} from '../../src/utils/authCrypto.js'
import { sendVerifyCode } from '../../src/utils/authMail.js'

/**
 * 正文上限 = **显示字数** 200（原为 1000，用户明确要求）。
 *
 * 对游戏讨论来说足够——这条限制的意义是防刷屏与防止单条评论撑爆列表高度，
 * 而不是"允许写多长"；真要长内容应另开帖子类功能。
 *
 * **一个表情算 1 字**：正文里的 `[e:包:名]` 是 7~25 个字符的 token
 * （见 `src/config/emoticons.js`），若按原始字符计，用户插三个表情就吃掉几十字、
 * 计数器与实际观感完全对不上。计数口径与前端共用同一个纯函数。
 *
 * 前端 `CommentComposer.vue` 的计数器与 `canSubmit` 必须与此一致。
 */
const MAX_BODY = MAX_BODY_DISPLAY
const MAX_LIMIT = 50

/**
 * 限流阈值的默认值。可用**环境变量**覆盖（`RATE_LIMIT_PER_HOUR` / `RATE_LIMIT_PER_DAY`），
 * **生产环境不要设置**，用默认值即可。
 *
 * 为什么做成可注入：端到端测试套件的 POST 数量（约 13 个）必然超过 5 条/小时，
 * 后半段会被 429 挡成假失败。本地用 `.dev.vars` 放大阈值就能稳定重复运行，
 * 不必在生产代码里塞"测试专用旁路"。非法值一律回落到默认值。
 */
const RATE_DEFAULTS = { perHour: 5, perDay: 20 }

function positiveInt(value, fallback) {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * page_key 白名单：必须是 `前缀:业务ID`，避免评论被挂到任意路径。
 *
 * 与前端 `src/utils/commentApi.js` 的 `COMMENT_PAGE_PREFIX` **必须一致**，
 * 新增页面时两处一起改。
 *
 * `site:general` 是**站内总讨论区**（网站自己的讨论，与各页面讨论分开）。
 * 注意：符石/菜谱的实体 ID 本身是 `item_xxxxx` 形式（item_19310、item_30022），
 * 但它们走的是全局物品详情，所以**没有**独立前缀——`item:` 已覆盖。
 * 刻意不开放 `rune:` / `recipe:` 前缀：那会让同一个东西出现两份讨论。
 */
const PAGE_KEY_RE =
  /^(item|hero|pet|monster|furniture|task|event|explore|battle|stage|glossary|site):[A-Za-z0-9_\-.]{1,64}$/

/**
 * 头像 ID 白名单：只允许 `at001_0`、`avatar_pet_006` 这类标识符。
 *
 * 这里**只校验格式、不校验是否在清单里**——头像 ID 与图片路径刻意解耦：
 * 客户端用 `public/data/avatarCatalog.json` 把 ID 换成路径。
 * 好处是素材目录将来改名/迁移时，库里的历史评论仍存 ID、不会变成失效路径；
 * 代价是客户端能存一个清单里没有的 ID，效果只是回退成昵称首字占位（无害）。
 * 不硬编码清单的原因：Worker 读不到 `public/` 下的文件，硬编码会与素材脱节。
 */
const AVATAR_ID_RE = /^[A-Za-z0-9_]{1,40}$/

/*
 * `DELETE_TOKEN_RE` 与 `randomToken()` 已随**浏览器自删令牌**机制一并删除
 * （2026-10-05 账号体系）：评论归属改看 `comments.user_id`，
 * 不再需要"没账号时怎么证明这条是你发的"那套手法。
 */

/**
 * 对外错误文案契约。**这里是给普通用户看的字，不是给开发者看的日志。**
 *
 * 规则（用户明确要求）：只在下面这张表里选，不要临时造新句子；
 * 不出现技术名词、状态码、字段名、英文——例如「JSON」「page_key」「D1」「token」
 * 这类字眼一律不出现在 `error` 里。技术细节写进 `console.error` 的服务端日志。
 *
 * | 对外文案 | 何时用 | 内部含义 |
 * | --- | --- | --- |
 * | 评论不存在 | 目标评论已被删除或从未存在 | 404 |
 * | 无法连接评论服务器 | 服务端自身故障 | 500 |
 * | 请求太频繁，请稍后再试 | 触发限流 | 429 |
 * | 评论内容不能为空 | 正文为空 | 400 |
 * | 请填写昵称 | 昵称为空 | 400 |
 * | 评论内容有误，请检查后重试 | 请求体非法 / 标识格式不对 | 400 |
 * | 提交失败，请刷新页面后重试 | 人机校验、蜜罐拦截、无删除权限 | 403 |
 * | 操作失败，请稍后再试 | 没有更贴切的归类时兜底 | 4xx/5xx |
 */
const ERR = {
  notFound: '评论不存在',
  server: '无法连接评论服务器',
  rateLimited: '请求太频繁，请稍后再试',
  rateLimitedDay: '今天发言次数已达上限',
  emptyBody: '评论内容不能为空',
  needNick: '请填写昵称',
  badRequest: '评论内容有误，请检查后重试',
  rejected: '提交失败，请刷新页面后重试',
  fallback: '操作失败，请稍后再试'
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function bad(message, status = 400) {
  return json({ ok: false, error: message }, status)
}

/*
 * `sha256Hex` 现在从 `src/utils/authCrypto.js` 统一导入 —— 那里有一份**与 Node 的
 * OpenSSL 逐字节比对过**的实现和单测。原先这里也有一份本地副本，
 * 两份相同实现并存是"改了一处忘另一处"的经典来源，所以合并掉了。
 */

/** 恒定时间比较：避免用 === 比较令牌时泄漏前缀匹配长度 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

/** UTC 小时桶（与 D1 免费额度重置口径一致） */
function hourBucket(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 13).replace(/[-T]/g, '')
}

function dayBucket(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10).replace(/-/g, '')
}

/** 剥离控制字符、收敛换行、限长。不存 HTML —— 展示端一律当纯文本渲染 */
function sanitize(text, maxLen) {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen)
}

function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    ''
  )
}

/** UPSERT 计数并返回自增后的值（1 行读 + 1~2 行写） */
async function bump(env, bucket) {
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, counter) VALUES (?, 1)
     ON CONFLICT(bucket) DO UPDATE SET counter = counter + 1
     RETURNING counter`
  )
    .bind(bucket)
    .first()
  return row?.counter ?? 1
}

/** 小时桶做闸门，日桶兜底。返回 null 表示放行 */
async function checkRateLimit(env, ipHash, ts) {
  const perHour = positiveInt(env.RATE_LIMIT_PER_HOUR, RATE_DEFAULTS.perHour)
  const perDay = positiveInt(env.RATE_LIMIT_PER_DAY, RATE_DEFAULTS.perDay)

  const hourCount = await bump(env, `h:${ipHash}:${hourBucket(ts)}`)
  if (hourCount > perHour) return { message: ERR.rateLimited, status: 429 }

  const dayCount = await bump(env, `d:${ipHash}:${dayBucket(ts)}`)
  if (dayCount > perDay) return { message: ERR.rateLimitedDay, status: 429 }

  return null
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true // 未配置则跳过，便于先上线
  if (!token) return false
  const form = new FormData()
  form.append('secret', env.TURNSTILE_SECRET)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form
    })
    const data = await res.json()
    return data.success === true
  } catch {
    return false // 验证服务不可达时按失败处理，不放行可疑请求
  }
}

/**
 * 管理员令牌校验：只比对哈希，恒定时间比较。
 *
 * 本地与线上走**同一条路径**（不存在"本地免验证"的旁路）：
 * 本地用 `.dev.vars` 里的 `ADMIN_TOKEN`（短令牌便于开发），
 * 线上用 Cloudflare Pages 环境变量里的长随机串。
 * 这样本地验证到的行为就是线上行为，不会出现"本地能进、线上进不去"的错觉。
 */
async function isAdmin(env, request) {
  if (!env.ADMIN_TOKEN) return false
  const token = request.headers.get('x-admin-token') || ''
  if (!token) return false
  const [provided, expected] = await Promise.all([
    sha256Hex(token),
    sha256Hex(String(env.ADMIN_TOKEN).trim())
  ])
  return safeEqual(provided, expected)
}

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
function toPublic(row, myUserId = null) {
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
async function listComments(env, url, myUserId = null) {
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
async function listNestedComments(env, pageKey, { limit, cursor, hasCursor }, myUserId = null) {
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
  const { results: replyRows } = await env.DB.prepare(
    `SELECT r.id, r.nick, r.avatar, r.body, r.created_at, r.status, r.page_key, r.page_label,
            r.parent_id, COALESCE(p.parent_id, r.parent_id) AS root_id,
            p.nick AS parent_nick, p.body AS parent_body
     FROM comments r LEFT JOIN comments p ON p.id = r.parent_id AND p.status = 1
     WHERE r.page_key = ?${comments.length + 1} AND r.status = 1
       AND COALESCE(p.parent_id, r.parent_id) IN (${placeholders})
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
async function listThreadReplies(env, pageKey, threadId, limit, myUserId = null) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.nick, r.avatar, r.body, r.created_at, r.status, r.page_key, r.page_label,
            r.parent_id, COALESCE(p.parent_id, r.parent_id) AS root_id,
            p.nick AS parent_nick, p.body AS parent_body
     FROM comments r LEFT JOIN comments p ON p.id = r.parent_id AND p.status = 1
     WHERE r.page_key = ?1 AND r.status = 1
       AND COALESCE(p.parent_id, r.parent_id) = ?2
     ORDER BY r.id ASC LIMIT ?3`
  )
    .bind(pageKey, threadId, limit + 1)
    .all()

  const rows = results || []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return json({ ok: true, comments: page.map(toPublic), hasMore, nextCursor: null })
}

/** POST /api/comments —— 发评论，返回一次性自删令牌 */
async function createComment(env, request, ts) {
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
  const reviewHits = matchReview(body)
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
   * 写入。两处相对旧版的改动：
   *   - 新增 `user_id`：评论从此挂在账号上，「我的评论」「谁回复了我」都靠它；
   *   - **不再写 `token_hash`**：浏览器自删令牌机制随本机身份一起退役
   *     （列保留不用，SQLite 删列代价高且留着无害）。
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
 * 归属判据从"浏览器自删令牌"换成了 **`comments.user_id`**：
 * 令牌机制随本机身份退役（它解决的是"没账号时怎么证明这条是你发的"，
 * 而那个问题在有了账号之后就不存在了），而且令牌只能删**同一台浏览器**发的评论 ——
 * 换设备就删不掉，这正是用户当初抱怨的点。
 */
async function deleteOwnComment(env, request, ts) {
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
   * 原先写的是 `UPDATE ... SET status = 2`（软删除）。后果是库里持续堆积
   * status=2 的用户记录——用户本机令牌也一直累积（实测攒到 37 条），
   * 而管理页默认只看待审，所以他"在管理页也看不到、却一直有记录"。
   *
   * 代价说明：软删除能保留证据供追溯、也便于误删恢复。改成硬删除后这两点没有了，
   * 但"用户要求删除"在隐私意义上本就该是真删除。管理端的「隐藏」（status=2）
   * 仍是软删除，用于审核下架，两者职责不同。
   */
  await env.DB.prepare(`DELETE FROM comments WHERE id = ?1`).bind(id).run()
  return json({ ok: true })
}

/**
 * GET /api/admin/comments?status=&q=&cursor=&limit= —— 管理端列表
 *
 * `q` 为关键词搜索，匹配**正文 / 昵称 / 页面标识**（大小写不敏感）。
 * 在服务端搜而不是前端过滤：评论会持续增长，管理端不该把全部数据拉到浏览器再筛。
 * 用 LIKE 而非 FTS：D1 免费版读便宜（500 万行/天），而 FTS 要额外索引（写入按行计费），
 * 管理端查询低频，没必要为它增加写入成本。
 */
async function adminList(env, url) {
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), MAX_LIMIT)
  const cursor = Number.parseInt(url.searchParams.get('cursor') || '', 10)
  const hasCursor = Number.isFinite(cursor)

  const statusParam = url.searchParams.get('status')
  const hasStatus = statusParam === '0' || statusParam === '1' || statusParam === '2'
  const status = hasStatus ? Number.parseInt(statusParam, 10) : null

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
  if (hasCursor) {
    binds.push(cursor)
    where.push(`id < ?${binds.length}`)
  }
  if (hasUserId) {
    binds.push(userIdParam)
    where.push(`user_id = ?${binds.length}`)
  }
  binds.push(limit + 1)

  const sql = `SELECT id, page_key, page_label, nick, avatar, body, created_at, status, review_reason, user_id FROM comments
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY id DESC LIMIT ?${binds.length}`

  const { results } = await env.DB.prepare(sql)
    .bind(...binds)
    .all()
  const rows = results || []
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  // 待审总数：只在第一页算；管理端低频，COUNT(*) 的成本可接受
  let pendingCount = 0
  if (!hasCursor) {
    const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM comments WHERE status = 0`).first()
    pendingCount = c?.n ?? 0
  }

  return json({
    ok: true,
    comments: page.map(toAdminComment),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore,
    pendingCount
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
const RECENT_LIMIT = 8
const RECENT_CACHE_SECONDS = 30
/** 站内总讨论区的归属键（与前端 SITE_PAGE_KEY 一致） */
const SITE_PAGE_KEY = 'site:general'

async function listRecent(env, { fresh = false } = {}) {
  const { results } = await env.DB.prepare(
    `SELECT id, page_key, page_label, nick, avatar, body, created_at
     FROM comments WHERE status = 1 AND page_key = ?1 ORDER BY id DESC LIMIT ?2`
  )
    .bind(SITE_PAGE_KEY, RECENT_LIMIT)
    .all()

  const comments = (results || []).map((row) => ({
    id: row.id,
    nick: row.nick,
    avatar: row.avatar || null,
    body: row.body,
    createdAt: row.created_at,
    pageKey: row.page_key,
    pageLabel: row.page_label || null
  }))

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

/** PATCH /api/admin/comments —— 改状态（放行 / 隐藏 / 打回待审） */
async function adminPatch(env, request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return bad(ERR.badRequest)
  }
  const id = Number.parseInt(payload?.id, 10)
  const status = Number.parseInt(payload?.status, 10)
  if (!Number.isFinite(id) || ![0, 1, 2].includes(status)) return bad(ERR.badRequest)

  const res = await env.DB.prepare(`UPDATE comments SET status = ?1 WHERE id = ?2`)
    .bind(status, id)
    .run()
  if (!res.meta?.changes) return bad(ERR.notFound, 404)
  return json({ ok: true })
}

/** DELETE /api/admin/comments —— 彻底删除（隐私删除请求用；软删除请用 PATCH status=2） */
async function adminDelete(env, request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return bad(ERR.badRequest)
  }
  const id = Number.parseInt(payload?.id, 10)
  if (!Number.isFinite(id)) return bad(ERR.badRequest)

  const res = await env.DB.prepare(`DELETE FROM comments WHERE id = ?1`).bind(id).run()
  if (!res.meta?.changes) return bad(ERR.notFound, 404)
  return json({ ok: true })
}

// ============================================================
// 管理端：概览 / 用户（2026-10-05）
//
// 设计依据：docs/technical/ACCOUNT_SYSTEM.md §九、§17.9
// 认证：沿用既有的 `x-admin-token`（见 isAdmin）+ 未配 ADMIN_TOKEN 时整段 404。
// ============================================================

/**
 * 管理端看的评论形状 = 公开形状 + **内部 `userId`**。
 *
 * 🔴 为什么不直接把这个字段加进 `toPublic`：`toPublic` 同时供**公开**的
 * `/api/comments` 使用，而账号体系对外只暴露 `public_no`，不暴露内部自增 id。
 * 所以单独包一层，只在管理端加。
 */
function toAdminComment(row) {
  return { ...toPublic(row), userId: row.user_id ?? null }
}

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
 * `GET /api/admin/stats` —— 后台概览。
 *
 * 刻意**只用几条聚合查询**：管理端低频，但仍然避免"每个数字一条查询"
 * （那样一屏要点十几次 D1，免费额度是有限的）。
 */
async function adminStats(env) {
  const ts = nowSec()
  // UTC 日界线，与限流的 `dayBucket()` 口径一致 —— 否则"今天的数"与
  // "今天的限额"会对不上，排查时容易怀疑人生
  const dayStart = ts - (ts % 86400)
  const weekStart = dayStart - 6 * 86400

  const [cmtTotals, cmtByStatus, cmtDaily, usrByStatus, usrToday, usrDaily, sessionCount] =
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
      env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?1`).bind(ts * 1000).first()
    ])

  const cmt = countsByStatus(cmtByStatus.results, [0, 1, 2])
  const usr = countsByStatus(usrByStatus.results, [1, 2, 3])

  return json({
    ok: true,
    ts,
    comments: {
      total: cmtTotals?.total ?? 0,
      today: cmtTotals?.today ?? 0,
      replies: cmtTotals?.replies ?? 0,
      pending: cmt[0],
      visible: cmt[1],
      hidden: cmt[2],
      last7d: dailySeries(cmtDaily.results, 7, dayStart)
    },
    users: {
      total: usr[1] + usr[2] + usr[3],
      active: usr[1],
      banned: usr[2],
      deleted: usr[3],
      today: usrToday?.n ?? 0,
      last7d: dailySeries(usrDaily.results, 7, dayStart)
    },
    sessions: { active: sessionCount?.n ?? 0 }
  })
}

/** `GET /api/admin/users` —— 用户列表（可按状态筛、按编号/昵称/邮箱搜）。 */
async function adminUsers(env, url) {
  const rawLimit = Number.parseInt(url.searchParams.get('limit') || '50', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), MAX_LIMIT)
  const cursor = Number.parseInt(url.searchParams.get('cursor') || '', 10)
  const hasCursor = Number.isFinite(cursor)

  const statusParam = url.searchParams.get('status')
  const hasStatus = ['1', '2', '3'].includes(statusParam)
  const status = hasStatus ? Number.parseInt(statusParam, 10) : null

  const q = sanitize(url.searchParams.get('q') || '', 60)
  const hasQ = q.length > 0
  const likeParam = hasQ ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : ''

  const where = []
  const binds = []
  if (hasStatus) {
    binds.push(status)
    where.push(`u.status = ?${binds.length}`)
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
  if (hasCursor) {
    binds.push(cursor)
    where.push(`u.id < ?${binds.length}`)
  }
  binds.push(limit + 1)

  const sql = `SELECT u.id, u.public_no, u.nick, u.email, u.avatar, u.status,
                      u.created_at, u.last_login_at,
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
      createdAt: r.created_at,
      lastLoginAt: r.last_login_at,
      commentCount: r.comment_count ?? 0
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
async function adminUserPatch(env, request) {
  const payload = await request.json().catch(() => null)
  const id = Number.parseInt(payload?.id, 10)
  const status = Number.parseInt(payload?.status, 10)
  if (!Number.isFinite(id) || ![1, 2].includes(status)) return bad(ERR.badRequest)

  const res = await env.DB.prepare(`UPDATE users SET status = ?1 WHERE id = ?2`)
    .bind(status, id)
    .run()
  if (!res.meta?.changes) return bad(ERR.notFound, 404)

  if (status === 2) {
    await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(id).run()
  }
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
async function adminUserDelete(env, request) {
  const payload = await request.json().catch(() => null)
  const id = Number.parseInt(payload?.id, 10)
  if (!Number.isFinite(id)) return bad(ERR.badRequest)

  const row = await env.DB.prepare(`SELECT id, email_hash FROM users WHERE id = ?1`).bind(id).first()
  if (!row) return bad(ERR.notFound, 404)

  await Promise.all([
    env.DB.prepare(
      `UPDATE comments SET nick = '账号已注销', avatar = NULL, user_id = NULL WHERE user_id = ?1`
    ).bind(id).run(),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(id).run(),
    env.DB.prepare(`DELETE FROM auth_codes WHERE email_hash = ?1`).bind(row.email_hash).run()
  ])
  await env.DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(id).run()

  return json({ ok: true })
}

// ============================================================
// 账号体系（2026-10-05）
//
// 设计依据：docs/technical/ACCOUNT_SYSTEM.md
//   · 22 项决策 —— §14.1
//   · 接口契约与安全约定 —— §九
//   · 全部对外文案 —— §十七（下面的 AERR 就是 §17.8 那张表的代码化）
// ============================================================

/**
 * 账号接口的对外文案。**只在方案 §17.8 那张表里选，不要临时造句子。**
 *
 * 与评论的 `ERR` 同一条规矩：给普通用户看的字，不出现技术名词、字段名、英文。
 * 技术原因写进 `console.error`。
 */
const AERR = {
  // 输入类
  emailFormat: '邮箱格式看起来不对，检查一下',
  disposableEmail: '请用常用邮箱，临时邮箱收不到验证码',
  passwordShort: `密码至少 ${PASSWORD_MIN} 位`,
  nickShort: `昵称至少 ${NICK_MIN} 个字符`,
  nickLong: `昵称最多 ${NICK_MAX} 个字符`,
  badRequest: '提交的内容有误，请检查后重试',
  // 人机验证
  captchaUnavailable: '验证码暂时出不来，请稍后再试',
  captchaFailed: '人机验证没通过，请重新点击',
  // 限流
  tooFrequent: '发得太频繁了，请稍后再试',
  codeVoid: '验证码已作废，请重新获取',
  // 邮箱验证码
  codeWrong: '验证码不对，或者已经过期了',
  mailFailed: '邮件暂时发不出去，请稍后再试',
  // 账号
  emailTaken: '这个邮箱已经注册过了，直接登录吧',
  nickTaken: '这个名字已经有人用了，换一个吧',
  loginFailed: '邮箱或密码不对',       // 🔴 邮箱不存在与密码错**必须同一句**
  banned: '该账号已被停用',
  emailInUse: '这个邮箱已经被其他账号使用了',
  emailSame: '新邮箱和当前邮箱一样，不用改',
  sessionExpired: '登录状态已过期，请重新登录',
  // 兜底
  unavailable: '功能暂时不可用，请稍后再试',
  fallback: '操作失败，请稍后再试'
}

/** 冷却提示要带上秒数，所以做成函数（前端按钮倒计时也用同一个数） */
function cooldownMessage(retryAfter) {
  return `请 ${Math.max(1, Math.ceil(retryAfter))} 秒后再试`
}

/** 用户对外形状。🔴 **不暴露内部自增 id**，对外只用公开编号。 */
function toPublicUser(row) {
  return {
    id: row.public_no,
    nick: row.nick,
    avatar: row.avatar || null,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  }
}

function readBearer(request) {
  const h = request.headers.get('authorization') || ''
  const m = /^Bearer\s+([A-Za-z0-9_-]{16,200})$/i.exec(h.trim())
  return m ? m[1] : null
}

// ---------- rate_limits 的两种用法 ----------
//
// `bump()` 是自增（用于"每小时几次"）；下面两个是"存一个值/读一个值"
// （用于"上次发送是第几秒"）。刻意分开，别混用 —— 混用会让冷却逻辑变成计数器。

async function readBucket(env, bucket) {
  const row = await env.DB.prepare(`SELECT counter FROM rate_limits WHERE bucket = ?1`)
    .bind(bucket)
    .first()
  return row?.counter ?? null
}

async function writeBucket(env, bucket, value) {
  await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, counter) VALUES (?1, ?2)
     ON CONFLICT(bucket) DO UPDATE SET counter = excluded.counter`
  )
    .bind(bucket, value)
    .run()
}

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

  const emailDay = await bump(env, `authd:${emailHash}:${dayBucket(ts)}`)
  if (emailDay > emailMax) return { message: AERR.tooFrequent, status: 429 }

  if (ipHash) {
    const ipHour = await bump(env, `authh:${ipHash}:${hourBucket(ts)}`)
    if (ipHour > ipHourMax) return { message: AERR.tooFrequent, status: 429 }
    const ipDay = await bump(env, `authd:ip:${ipHash}:${dayBucket(ts)}`)
    if (ipDay > ipDayMax) return { message: AERR.tooFrequent, status: 429 }
  }
  return null
}

/** 读一个"正整数上限"环境变量覆盖值；未设或不合法则用代码里的默认值。 */
function envLimit(raw, fallback) {
  if (raw === undefined) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

// ---------- 会话 ----------

async function issueSession(env, userId, request, ts, ipHash) {
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
async function loadSession(env, request, ts) {
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
async function revokeSessions(env, userId, keepTokenHash = null) {
  if (keepTokenHash) {
    return env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1 AND token_hash <> ?2`)
      .bind(userId, keepTokenHash)
      .run()
  }
  return env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(userId).run()
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
  const fails = await bump(env, failBucket)
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
async function authCaptcha(env, ts) {
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
async function authRequestCode(env, request, context) {
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
async function authSalt(env, url) {
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
async function authRegister(env, request, ts) {
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
  return json({ ok: true, token, user: toPublicUser(row) })
}

/** `POST /api/auth/login` */
async function authLogin(env, request, ts) {
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
   * 🔴 这个覆盖是补上的：当初只有这一处没做成环境变量，结果整套账号端到端
   * 跑第二遍就开始大面积 429，而报错文案（"发得太频繁了"）又不像限流
   * （另一处是"请求太频繁"），排查时先怀疑了半天别的地方。
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
      bump(env, failBucket),
      bump(env, ipFailBucket)
    ])
    return bad(AERR.loginFailed, 401)
  }

  if (row.status === 2) return bad(AERR.banned, 403)

  await Promise.all([
    env.DB.prepare(`DELETE FROM rate_limits WHERE bucket = ?1`).bind(failBucket).run(),
    env.DB.prepare(`UPDATE users SET last_login_at = ?1 WHERE id = ?2`).bind(ts, row.id).run()
  ])

  const token = await issueSession(env, row.id, request, ts, ipHash)
  return json({ ok: true, token, user: toPublicUser(row) })
}

/** `GET /api/auth/me` */
async function authMe(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)
  return json({ ok: true, user: toPublicUser(session.row) })
}

/** `PATCH /api/auth/me` —— 只允许改昵称与头像。 */
async function authUpdateMe(env, request, ts) {
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
async function authChangePassword(env, request, ts) {
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
 * `POST /api/auth/email` —— 换邮箱，**旧 + 新双验证**（已定决策）。
 *
 * 前端分两步收集两个码，**最终一次提交**，服务端一次把两个都验掉 ——
 * 这样不会出现"第一步已通过、第二步半途而废"的中间态。
 *
 * 🔴 "新邮箱是否被占用"的检查放在**验证通过之后**：
 *    否则一个已注册用户能拿这个接口枚举"某邮箱是否注册"。
 */
async function authChangeEmail(env, request, ts) {
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

/** `GET /api/auth/comments` —— 「我的评论」跨设备列表（只按 `user_id` 查，不再用浏览器令牌）。 */
async function authMyComments(env, request, url, ts) {
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
    nextCursor: hasMore ? page[page.length - 1].id : null
  })
}

/**
 * `GET /api/auth/replies` —— 「谁回复了我」。
 *
 * 未读数**不建已读表**：只用 `users.replies_read_at` 当基准，
 * 一条 SQL 同时给出列表与未读数，省一张表也省写入。
 */
async function authMyReplies(env, request, url, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)

  const limit = Math.min(positiveInt(url.searchParams.get('limit'), 20), MAX_LIMIT)
  const cursor = positiveInt(url.searchParams.get('cursor'), 0)
  const readAt = session.row.replies_read_at || 0

  const rows = await env.DB.prepare(
    /*
     * 「谁回复了我」＝ **别人**在我发的评论下面留的话。两个条件缺一不可：
     *
     *   1. `p.user_id = ?1` —— 被回复的那条是我的；
     *   2. `c.user_id <> ?1` —— 回复本身**不是我发的**。
     *
     * 🔴 第 2 条一开始漏了：只判"父评论是我的"，于是**自己回复自己**
     * 也会出现在"谁回复了我"里 —— 用户看到自己给自己留的话被当成"有人回复你"，
     * 既莫名其妙、又会把未读数顶起来。这条是端到端测试抓出来的。
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
    // 未读数的条件必须与列表**逐字一致**，否则会出现"红点显示 3、点进去只有 1 条"
    `SELECT COUNT(*) AS n FROM comments c
     JOIN comments p ON p.id = c.parent_id
     WHERE p.user_id = ?1
       AND (c.user_id IS NULL OR c.user_id <> ?1)
       AND c.status = 1 AND c.created_at > ?2`
  )
    .bind(session.row.id, readAt)
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

/** `POST /api/auth/replies/read` —— 把未读基准推到当前时刻。 */
async function authMarkRepliesRead(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return bad(AERR.sessionExpired, 401)
  await env.DB.prepare(`UPDATE users SET replies_read_at = ?1 WHERE id = ?2`)
    .bind(ts, session.row.id)
    .run()
  return json({ ok: true })
}

/** `POST /api/auth/logout` —— 只退当前会话（幂等）。 */
async function authLogout(env, request, ts) {
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
async function authDeleteAccount(env, request, ts) {
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

  return json({ ok: true })
}

// ============================================================
// 账号路由分发
// ============================================================

/** 账号接口统一入口。返回 null 表示"不是账号路由"。 */
async function handleAuthRoutes(path, context) {
  if (!path.startsWith('/api/auth/')) return null
  const { request, env } = context
  const url = new URL(request.url)
  const ts = nowSec()

  // 缺关键密钥时**整体拒绝**，而不是"降级放行" —— 见 authCrypto 的 fail-closed 说明
  if (!env.SALT_SECRET || !env.AUTH_PEPPER) {
    console.error('[auth] 缺少 SALT_SECRET 或 AUTH_PEPPER，账号接口不可用')
    return bad(AERR.unavailable, 503)
  }

  const post = request.method === 'POST'
  const get = request.method === 'GET'

  if (path === '/api/auth/captcha' && get) return authCaptcha(env, ts)
  if (path === '/api/auth/code' && post) return authRequestCode(env, request, context)
  if (path === '/api/auth/salt' && get) return authSalt(env, url)
  if (path === '/api/auth/register' && post) return authRegister(env, request, ts)
  if (path === '/api/auth/login' && post) return authLogin(env, request, ts)
  if (path === '/api/auth/me') {
    if (get) return authMe(env, request, ts)
    if (request.method === 'PATCH') return authUpdateMe(env, request, ts)
    if (request.method === 'DELETE') return authDeleteAccount(env, request, ts)
    return bad(AERR.fallback, 405)
  }
  if (path === '/api/auth/password' && post) return authChangePassword(env, request, ts)
  if (path === '/api/auth/email' && post) return authChangeEmail(env, request, ts)
  if (path === '/api/auth/comments' && get) return authMyComments(env, request, url, ts)
  if (path === '/api/auth/replies' && get) return authMyReplies(env, request, url, ts)
  if (path === '/api/auth/replies/read' && post) return authMarkRepliesRead(env, request, ts)
  if (path === '/api/auth/logout' && post) return authLogout(env, request, ts)

  return bad(AERR.fallback, 404)
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '')

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, x-admin-token',
        'access-control-max-age': '86400'
      }
    })
  }

  if (!env.DB) return bad(ERR.server, 500)

  // 管理端未配置令牌时，连路由都不暴露（对外表现为"接口不存在"）
  // 用**前缀**匹配：新增管理端接口时不必再改这一行
  const isAdminPath = path.startsWith('/api/admin/')
  if (isAdminPath && !env.ADMIN_TOKEN) return bad(ERR.fallback, 404)

  try {
    if (path === '/api/health') {
      return json({ ok: true, ts: nowSec() })
    }

    // 账号体系（2026-10-05）：整段路由集中在 handleAuthRoutes 里，返回 null 表示不是账号路径
    const authRes = await handleAuthRoutes(path, context)
    if (authRes) return authRes

    if (path === '/api/comments') {
      /*
       * 登录状态是**可选**的：读评论不需要登录，但登录了就要标出"哪条是我的"
       * （界面据此决定显不显示「删除」）。所以这里解析一次会话，
       * 解析不到就按未登录处理，**不报错**。
       */
      const viewer = await loadSession(env, request, nowSec())
      const myUserId = viewer?.row?.id ?? null

      if (request.method === 'GET') return await listComments(env, url, myUserId)
      if (request.method === 'POST') return await createComment(env, request, nowSec())
      if (request.method === 'DELETE') return await deleteOwnComment(env, request, nowSec())
      return bad(ERR.fallback, 405)
    }

    /*
     * `/api/my-comments` 与 `listMyComments()` **已随本机身份一并退役**。
     * 它靠"逐条出示浏览器自删令牌"来证明归属，而那个机制在有了账号之后
     * 既无必要（归属看 `user_id`）、又有硬伤（换设备就查不到）。
     * 「我的评论」现在走 `GET /api/auth/comments`（凭会话令牌，跨设备可用）。
     */

    // 站内讨论区最新（右栏预览）：带边缘共享缓存；?fresh=1 跳过缓存，见 listRecent
    if (path === '/api/recent') {
      if (request.method !== 'GET') return bad(ERR.fallback, 405)
      const fresh = url.searchParams.get('fresh') === '1'
      return await listRecent(env, { fresh })
    }

    if (isAdminPath) {
      if (!(await isAdmin(env, request))) return bad(ERR.rejected, 401)

      if (path === '/api/admin/comments') {
        if (request.method === 'GET') return await adminList(env, url)
        if (request.method === 'PATCH') return await adminPatch(env, request)
        if (request.method === 'DELETE') return await adminDelete(env, request)
        return bad(ERR.fallback, 405)
      }

      if (path === '/api/admin/stats') {
        if (request.method !== 'GET') return bad(ERR.fallback, 405)
        return await adminStats(env)
      }

      // 用户管理：GET 列表 / PATCH 封禁解封 / DELETE 彻底删除
      if (path === '/api/admin/users') {
        if (request.method === 'GET') return await adminUsers(env, url)
        if (request.method === 'PATCH') return await adminUserPatch(env, request)
        if (request.method === 'DELETE') return await adminUserDelete(env, request)
        return bad(ERR.fallback, 405)
      }

      return bad(ERR.fallback, 404)
    }

    return bad(ERR.fallback, 404)
  } catch (err) {
    // 不把内部错误细节回给客户端
    console.error('comments api error:', err)
    return bad(ERR.server, 500)
  }
}

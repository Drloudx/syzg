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
 *   TURNSTILE_SECRET  可选。未配置则跳过人机校验
 *   IP_HASH_SALT      可选但强烈建议。IP/邮箱哈希加盐
 *
 * 管理端鉴权（2026-10-07 改）：**不再用环境变量令牌**，改为看登录账号的 `users.role`。
 *   0 普通 / 1 管理员 / 2 超级管理员。超管由手工 SQL 设出
 *   （scripts/sql/2026-10-07-admin-role.sql 末尾）。
 *   旧域名时代的 `ADMIN_TOKEN` 通路已删除 —— 它永不过期、明文存 localStorage，
 *   泄露即长期有效；账号会话有 30 天滑动过期且可随时吊销。
 *   🔴 忘了角色时的紧急恢复：`UPDATE users SET role = 2 WHERE email = '...'`
 *      （那条 SQL 也写在迁移文件末尾）。
 */

import {
  BLOCKLIST_CATEGORY_NAMES,
  buildMatcher,
  getReviewMatcher,
  invalidateReviewMatcher,
  listBaselineWords,
  matchReview
} from '../../src/config/commentBlocklist.js'
import { MAX_BODY_DISPLAY, MAX_BODY_RAW, countEmoticonDisplayChars } from '../../src/config/emoticons.js'
import { getAdminStats, invalidateAdminStatsCache } from '../../src/config/adminStatsCache.js'
import {
  CAPTCHA_TTL_MS, CODE_COOLDOWN_SEC, CODE_DIGITS, CODE_EMAIL_DAILY_MAX,
  CODE_IP_DAILY_MAX, CODE_IP_HOURLY_MAX, CODE_MAX_ACTIVE, CODE_MAX_ATTEMPTS,
  CODE_TTL_MS, DEFAULT_AVATAR, LOGIN_MAX_FAILS, NICK_MAX, NICK_MIN,
  PASSWORD_MIN, PBKDF2_ITERS, SESSION_TTL_MS
} from '../../src/config/auth.js'
import { BLOCKED_EMAIL_DOMAINS } from '../../src/config/disposableEmails.js'
import { COMMENT_PAGE_SIZE } from '../../src/config/discussions.js'
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
/**
 * 「转待审原因」的长度上限（字符数）。
 *
 * 它是**一行短备注**（给同事看的"为什么打回"），不是第二段正文；
 * 80 字足够写清"重复发帖 / 与主题无关 / 待确认外链"这类说明。
 *
 * 🔴 必须声明在 `ERR` **之前**：`ERR.reviewNoteTooLong` 在对象字面量里就用了它，
 *    放后面会踩 `const` 的暂时性死区（TDZ），**模块加载即抛错** ——
 *    整个 API 会 500（实测踩过一次）。
 */
const REVIEW_NOTE_MAX = 80

/**
 * 一次批量改状态最多几条评论。
 *
 * 上限的理由不是"数据库扛不住"，而是**防手滑**：全选几百条一次性放行/隐藏
 * 很难复盘，出问题时也没法一条条看回来。100 条 ≈ 两页（每页 50），
 * 日常"扫一遍待审队列"足够用。
 */
const BATCH_MAX = 100

/**
 * 审核词表：单条关键词上限（字符数）与总数上限。
 *
 * 🔴 **必须声明在 `ERR` 之前** —— `ERR.keywordTooLong` / `keywordTooMany` 在
 *    对象字面量里就用了它们，放后面会踩 `const` 的暂时性死区（TDZ），
 *    模块加载即抛 `ReferenceError`，**整个 API 起不来**。
 *    （同一个坑本项目已踩过两次，见 ADR 122 与当日日志。）
 *
 * 总数上限的理由：这些词会拼进**每一条评论**提交路径的正则里，
 * 无节制增长会让单次匹配变慢（免费版只有 10ms CPU）。300 条足够用。
 */
const KEYWORD_MAX = 30
const KEYWORD_COUNT_MAX = 300

const ERR = {
  notFound: '评论不存在',
  server: '无法连接评论服务器',
  rateLimited: '请求太频繁，请稍后再试',
  rateLimitedDay: '今天发言次数已达上限',
  emptyBody: '评论内容不能为空',
  needNick: '请填写昵称',
  badRequest: '评论内容有误，请检查后重试',
  rejected: '提交失败，请刷新页面后重试',
  reviewNoteTooLong: `待审原因不能超过 ${REVIEW_NOTE_MAX} 个字`,
  presetTooLong: `常用选项每一条不能超过 ${REVIEW_NOTE_MAX} 个字`,
  presetTooMany: '常用选项最多 20 条',
  batchTooMany: `一次最多处理 ${BATCH_MAX} 条，请分批操作`,
  keywordTooLong: `关键词不能超过 ${KEYWORD_MAX} 个字`,
  keywordTooMany: `自定义关键词最多 ${KEYWORD_COUNT_MAX} 条`,
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
 *
 * 原先这里还有一个 `safeEqual()`（恒定时间比较），是给环境变量令牌用的。
 * 2026-10-07 令牌通路删除后它没有调用方，一并移除 —— 留着会让人以为
 * "还有别处在比令牌"。账号体系里的恒定时间比较在 `timingSafeEqualHex`
 * （`authCrypto.js`，用于验证码与 verifier 比对）。
 */

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
 * 角色常量。数字便于 `role >= ?` 比较，将来加档位不用改类型。
 *
 * ⚠️ 改这里的数值前先看 `canActOn()`：层级规则建立在"数字越大权限越高"之上。
 */
const ROLE_USER = 0
const ROLE_ADMIN = 1
const ROLE_SUPER = 2

/** 角色对外文案（审计与界面共用）。 */
const ROLE_LABELS = { 0: '普通用户', 1: '管理员', 2: '超级管理员' }

/**
 * 管理端鉴权：**看登录账号的 `role`**（2026-10-07 起）。
 *
 * ## 为什么删掉环境变量令牌
 *
 * 旧实现是 `x-admin-token` 与环境变量 `ADMIN_TOKEN` 比对。它的三个硬伤：
 *   1. **永不过期**：泄露即长期有效，改密码也没用，只能去控制台换环境变量；
 *   2. **明文存 localStorage**：任何 XSS 可直接读走；
 *   3. **无法追溯身份**：谁都能用同一个令牌，日志看不出"是谁做的"。
 *
 * 改用会话后：有 30 天滑动过期、可随时吊销（改密码/封号即失效）、
 * 每个操作都能落到具体账号（配合 `admin_audit`）。
 *
 * 🔴 **进不去后台时的后路**是数据库，不是这个函数：
 *    `UPDATE users SET role = 2, status = 1 WHERE email = '...'`
 *    （迁移文件末尾有这条；删令牌通路时已确认接受这个代价。）
 *
 * @returns {Promise<{row: object}|null>} 管理员会话行（含 `role`），非管理员返回 null
 */
async function adminSession(env, request, ts) {
  const session = await loadSession(env, request, ts)
  if (!session) return null
  const role = Number(session.row?.role) || 0
  if (role < ROLE_ADMIN) return null
  // 封禁/注销的账号即便 role 还在也不能进（loadSession 已挡 status=3，这里补 status=2）
  if (session.row?.status !== 1) return null
  return session
}

/**
 * 层级规则：**只能操作角色严格低于自己的账号**。
 *
 * ```
 *          目标 普通0   目标 管理员1   目标 超管2
 * 超管2       ✅           ✅            ❌
 * 管理员1     ✅           ❌            ❌
 * ```
 *
 * 🔴 为什么必须有这条：没有它，**管理员可以封禁/彻底删除超管** ——
 *    而"彻底删除"不可恢复。给某人管理员就等于把后台交出去了。
 *
 * 另加一条：**谁都不能操作自己**（防手滑把自己封了或降级，那是自杀式操作）。
 */
function canActOn(actorRole, targetRole, isSelf) {
  if (isSelf) return false
  return Number(actorRole) > Number(targetRole)
}

/**
 * 写一条管理操作审计。
 *
 * 🔴 为什么必须有：引入"多个管理员"之后**没有账本就无法追责** ——
 * 谁能封号、谁能删用户、谁能改角色，出问题时必须能查出是谁做的。
 *
 * **不阻断主流程**：审计写入失败只记日志、不让操作失败。
 * 理由：把审计做成强一致会让"数据库抖动"变成"管理操作不可用"，
 * 而漏记一条审计的代价远小于后台瘫掉。（若将来需要强一致再改。）
 */
async function writeAudit(env, actor, { action, targetType, targetId, detail = null }, ts) {
  try {
    await env.DB.prepare(
      `INSERT INTO admin_audit (actor_id, actor_nick, actor_role, action, target_type, target_id, detail, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
      .bind(actor.id, String(actor.nick || ''), Number(actor.role) || 0, action, targetType, targetId, detail, ts)
      .run()
  } catch (err) {
    console.error('audit write failed:', err)
  }
}

/**
 * 清理**已过期**的会话。
 *
 * 🔴 为什么需要：`auth_codes` 与 `captchas` 都有过期清理，**`sessions` 漏了** ——
 * 过期行只被查询时的 `WHERE expires_at > ?` 过滤掉，**永远留在表里**。
 * 单用户时无感，但每次登录都插一行、从不清，长期会累积成垃圾。
 *
 * 挂在登录时顺手跑（那时本来就要写 sessions，多一条 DELETE 成本可忽略），
 * 不额外引入定时任务。
 */
async function pruneExpiredSessions(env, ts) {
  try {
    await env.DB.prepare(`DELETE FROM sessions WHERE expires_at <= ?1`).bind(ts * 1000).run()
  } catch (err) {
    console.error('session prune failed:', err)
  }
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
async function commentContext(env, url, myUserId = null) {
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
   * 🔴 这个 N **必须与前端实际请求的页大小一致**。
   * 起初这里写死 50，而 `fetchComments` 的默认 `limit` 是 **20** ——
   * 于是第 21~50 条会被错判成"在首页里"，界面不显示定位卡片，
   * 用户又回到"点了没反应"（因为列表里确实没有它）。
   * 统一从下面的 `COMMENT_PAGE_SIZE` 取，别再各写一份。
   *
   * 🔴 比较必须用**严格大于**：`OFFSET N` 取到的正是**第 N+1 条**，
   * 它本身就是"页外第一条"。用 `>=` 会把它算进页内 —— 边界差一条，
   * 症状是"第 21 条点不动"（只有那一条错，最难发现）。
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

  /*
   * 概览缓存失效：新评论会改变总数；若命中词表进待审（`status = 0`），
   * 「待审」计数也变。概览是只读仪表盘，滞后 30 秒本身可接受，
   * 但"刚发完就去后台看数字没动"是**可复现的困惑**，故主动失效。
   */
  invalidateAdminStatsCache()

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
  // 自删也是"评论少了一条" → 失效概览缓存
  invalidateAdminStatsCache()
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
async function adminList(env, url) {
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
     * 🔴 这里原先还有一条 `SELECT status, COUNT(*) … GROUP BY status`，
     * 供前台四个档位胶囊显示条数（待审(310) / 已显示(3051) / …）。
     * 2026-10-14 **已删除**，原因：
     *
     *   1. 它是"必须数一遍"的查询 —— SQLite 要数出每组行数，就得逐行扫过
     *      所有匹配行，借覆盖索引也只是扫得窄些，**行数一个都少不了**。
     *      实测放大 10 倍表后耗时增长 **8.38x**（对照：分页 `LIMIT 50` 是 0.50x，
     *      因为它能提前停止）。即它**随评论量线性变贵**。
     *   2. 它占单页成本的 **91%~99%**：分页本身只读 50 行，而这条要读全表
     *      （当前 3.6k 条评论 ≈ 3,648 行/页）。
     *   3. 它在 `isPageMode` 块内**无条件执行**，每翻一页都跑一遍 —— 而
     *      各组行数在翻页时根本不会变。旁边的 `total` 有"只在第 1 页算"的
     *      优化，这条却绕过了它。
     *   4. 收益极低：筛选档位不需要预先知道条数，点进去自然就看到有多少条。
     *
     * 保留 `total`：分页（`totalPages`）需要它，且它只在第 1 页算一次，
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

/** PATCH /api/admin/comments —— 改状态（放行 / 隐藏 / 打回待审）
 *
 * 支持**单条**（传 `id`）与**批量**（传 `ids` 数组）两种形态，语义完全相同：
 * 批量只是把同一件事对多条一起做，所以刻意不另开一个接口 ——
 * 分开会让人以为两者的规则不一样（其实锚点、备注、审计口径都一致）。
 */
async function adminPatch(env, request, actor, ts) {
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
  if (foundIds.length) invalidateAdminStatsCache()

  return json({ ok: true, changed: foundIds.length, missing })
}

/**
 * 规范化「备注」—— 评论的**转待审原因**与用户的**封禁理由**共用。
 *
 * 两者语义完全一致（都是"当前为什么被处理"、都由管理员手填、都可空、
 * 都在状态反转时清空），所以共用一份实现，避免两处规则漂移。
 *
 * - 空白 / 缺失 → `null`（本来就可空，不强制填）
 * - 去首尾空白、内部换行折成空格（它是**一行短备注**，不是正文）
 * - 超长 → `null`（由调用方按"超长"回 400，而不是悄悄截断：
 *   截断会让人以为自己写全了）
 */
function normalizeReviewNote(raw) {
  if (raw === undefined || raw === null) return null
  const text = String(raw).replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length > REVIEW_NOTE_MAX) return null
  return text
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
async function adminDelete(env, request, actor, ts) {
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

  // 彻底删除会同时改变总量与各状态计数 → 失效概览缓存
  invalidateAdminStatsCache()

  return json({ ok: true, deleted: foundIds.length, missing })
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
async function adminStats(env) {
  return json(await getAdminStats(() => computeAdminStats(env)))
}

/** `GET /api/admin/users` —— 用户列表（可按状态筛、按编号/昵称/邮箱搜）。 */
async function adminUsers(env, url) {
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
 * **进不去后台**（令牌通路已删），只能改数据库。
 */
async function adminUserPatch(env, request, actor, ts) {
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
async function adminUserDelete(env, request, actor, ts) {
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
async function adminUserSetRole(env, request, actor, ts) {
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
async function adminAuditList(env, url) {
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
 * 读超管维护的词表叠加层（`review_keywords` + `review_category_flags`）。
 *
 * 只在缓存过期时被调用（见 `getReviewMatcher`），所以两次查询的成本可以接受。
 * 表不存在时会让 `getReviewMatcher` 回落基线，不会把发评论打挂。
 */
async function loadReviewOverlay(env) {
  const [kw, flags] = await Promise.all([
    env.DB.prepare(`SELECT text, category FROM review_keywords`).all(),
    env.DB.prepare(`SELECT category FROM review_category_flags`).all()
  ])
  return {
    keywords: kw.results || [],
    disabled: (flags.results || []).map((r) => r.category)
  }
}

/**
 * `GET /api/admin/review-keywords` —— 生效中的审核词表总览。
 *
 * 返回**合并后的视图**（代码基线 + 库叠加），而不是原始表内容：
 * 管理员要判断"这条评论为什么进待审"，就得看到真正生效的那份。
 */
async function adminReviewKeywordsGet(env) {
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
async function adminReviewKeywordsPut(env, request, actor, ts) {
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
   * `disabled` 与 `keywords` **同等校验**。
   *
   * 🔴 原先这里只过滤空串、不限长也不限量 —— 而 `keywords` 是校验的（上面几行）。
   *    代码审查时发现的：能塞进 5000 字的类别名、或几万条停用项。
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
async function adminReviewPresetsGet(env) {
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
async function adminReviewPresetsPut(env, request, actor, ts) {
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

/**
 * 用户对外形状。🔴 **不暴露内部自增 id**，对外只用公开编号。
 *
 * `role` 会一并返回 —— 这是**安全的**，因为本函数的 5 个调用点
 * （注册 / 登录 / me / 改资料 / 改密码）**全都是"返回请求者本人"**，
 * 不存在"把别人的角色发给某人"的路径。前端据此决定顶栏显不显示后台入口。
 *
 * ⚠️ 若将来有人用本函数序列化**他人**信息，必须先把 `role` 摘掉。
 */
function toPublicUser(row) {
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
  // 新用户改变「注册用户 / 今日新增」计数 → 失效概览缓存
  invalidateAdminStatsCache()
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
  /*
   * 登录会**新建会话** → 改变「活跃会话数」与「今日活跃用户（DAU）」。
   * 这是原先漏掉的一处失效（2026-10-14 补）：30 秒 TTL 时几乎看不见，
   * 但 TTL 提到 5 分钟后，登录后概览的活跃数会滞后到最多 5 分钟。
   */
  invalidateAdminStatsCache()
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
async function authResetPassword(env, request, ts) {
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

/**
 * `GET /api/auth/comments` —— 「我的评论」跨设备列表（只按 `user_id` 查，不再用浏览器令牌）。
 *
 * 顺带返回 `moderatedUnread`：**有多少条评论被管理员处理后作者还没看过**。
 * 机制与「谁回复了我」完全对称 —— 只用一个时间戳当基准（`users.moderation_read_at`），
 * 不建通知表；两个 COUNT 合成一条 SQL。
 */
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
 * 为什么不能用秒：未读判定是 `moderated_at > moderation_read_at`。
 * 秒级时间戳下，"同一秒内先标已读、又被处理"会落到 `S > S`（假）——
 * **通知被静默吞掉**（实测确认：差值 0 → 未读数 0）。
 * 而若为了避开它把基准退 1 秒（`S-1`），又会变成 `S > S-1` 恒真 →
 * **红点清不掉**，用户第二次点进来才发现已经读过了。
 * 两个方向各错一半，根因都是**秒级精度不足以区分先后**。
 *
 * 毫秒把冲突窗口从 1 秒压到 1 毫秒 —— 两次请求相隔不到 1 毫秒几乎不可能，
 * 于是两个方向的错都不再出现。
 */
async function authMarkModerationRead(env, request, ts) {
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
async function authMyReplies(env, request, url, ts) {
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
    /*
     * 未读数的条件必须与列表**逐字一致**，否则会出现"红点显示 3、点进去只有 1 条"。
     *
     * 🔴 比较的是 `c.id > ?2`（**评论 id**），与列表的 `c.id < ?2` 游标是同一个键。
     *    早先用的是 `c.created_at > 时间戳`，两个键不是一回事 ——
     *    除了丢通知（同秒无法区分先后），还让"未读口径"与"分页口径"不一致。
     *    现在两者都按 id 走，"未读"＝"id 比基准大的那些"，语义精确且可核对。
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
 * 原实现存的是时间（`replies_read_at = ts`，秒），未读判定 `created_at > read_at`。
 * 两边都只有**秒**精度 → "标已读"与"收到回复"落在**同一秒**时，
 * 那条回复满足 `S > S`（假）→ **提醒被静默吞掉**，用户永远不知道有人回复了他。
 *
 * 为什么不用毫秒（那是「评论被处理通知」的做法）：
 *   · 那边 `moderated_at` / `moderation_read_at` 都是新列、都由本文件控制，可直接用毫秒；
 *   · 这边 `comments.created_at` 是既有的**秒**列，全站都在用（列表排序、时间显示、
 *     限流……）。改它会波及全站；而**只把基准改成毫秒更糟** ——
 *     `S > S_000` 恒真 → **红点永远清不掉**。两个方向各错一半。
 *
 * 改用 `comments.id` 后两个问题同时消失：
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
async function authMarkRepliesRead(env, request, ts) {
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

  // 注销把用户计入「已注销」并清空会话 → 用户构成与活跃数都变
  invalidateAdminStatsCache()

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
  if (path === '/api/auth/reset-password' && post) return authResetPassword(env, request, ts)
  if (path === '/api/auth/email' && post) return authChangeEmail(env, request, ts)
  if (path === '/api/auth/comments' && get) return authMyComments(env, request, url, ts)
  if (path === '/api/auth/comments/read' && post) return authMarkModerationRead(env, request, ts)
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
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-max-age': '86400'
      }
    })
  }

  if (!env.DB) return bad(ERR.server, 500)

  // 管理端用**前缀**匹配：新增管理端接口时不必再改这一行
  const isAdminPath = path.startsWith('/api/admin/')

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
     * 单条评论 + 上下文（「去看看」定位到很早的评论时用）。
     *
     * ⚠️ 放在 `/api/comments` **之后**匹配（那一段是等值比较，不会吞掉本路径）。
     * 这里用 `request.method === 'GET'` 而**不是** `get` 变量：`get` 是
     * `handleAuthRoutes` 里的局部变量，在 `onRequest` 作用域里**不存在** ——
     * 引用它会抛 `ReferenceError: get is not defined`，表现为整个接口 500。
     * （这个错是端到端测试抓出来的：单看代码很像是可用的。）
     */
    if (path === '/api/comments/context') {
      if (request.method !== 'GET') return bad(ERR.fallback, 405)
      const viewer = await loadSession(env, request, nowSec())
      return await commentContext(env, url, viewer?.row?.id ?? null)
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
      /*
       * 鉴权：必须是**已登录且 role >= 1** 的账号（见 adminSession）。
       * 未登录/非管理员一律 401 —— 与旧令牌实现同样"不区分原因"，
       * 避免把"这个账号是管理员吗"透给探测者。
       */
      const admin = await adminSession(env, request, nowSec())
      if (!admin) return bad(ERR.rejected, 401)
      const actor = admin.row

      if (path === '/api/admin/comments') {
        if (request.method === 'GET') return await adminList(env, url)
        if (request.method === 'PATCH') return await adminPatch(env, request, actor, nowSec())
        if (request.method === 'DELETE') return await adminDelete(env, request, actor, nowSec())
        return bad(ERR.fallback, 405)
      }

      if (path === '/api/admin/stats') {
        if (request.method !== 'GET') return bad(ERR.fallback, 405)
        return await adminStats(env)
      }

      /*
       * `GET /api/admin/ping` —— **权限探活**（2026-10-13 加）。
       *
       * 为什么需要它：后台的权限闸门（`AdminView.vue` 的 `recheck()`）原本靠
       * 调 `/api/admin/stats` 来判断"这个账号能不能进后台"。而 stats 为了渲染
       * 概览要跑 **9 条聚合查询**（含多次全表扫）——
       * 实测约 **2.4 万行 / 次**（本地 ~3.2k 评论、~2.3k 会话的规模）。
       *
       * 而闸门只关心一件事：**401 还是 200**。用整屏指标去换一个布尔值，
       * 在 D1 按 rows read 计费的额度下是纯浪费：每次进后台、每次权限重查
       * 都白烧一遍概览的聚合。
       *
       * 这条端点不做任何查询 —— `adminSession()` 已经把该查的会话与角色查完了，
       * 能走到这里就说明鉴权已通过（上方 `if (!admin) return 401`）。
       * 于是成本从「9 条查询 + 多次全表扫」降到 **0 条额外查询**。
       *
       * ⚠️ 返回体**刻意只给角色，不给任何统计数字**：它是权杖的验伪，不是数据接口。
       *    `role` 是调用者自己的角色，本就随登录态可见，不算泄漏。
       */
      if (path === '/api/admin/ping') {
        if (request.method !== 'GET') return bad(ERR.fallback, 405)
        return json({ ok: true, role: Number(actor.role) || 0 })
      }

      /*
       * 审计日志：**所有管理员都可读**（2026-10-14 从"仅超管"放开）。
       *
       * 原先只给超管，理由在旧注释里：「记录含其他管理员的操作痕迹，
       * 同级互相可见容易变成盯梢甚至报复」。用户评估后决定放开 ——
       * 管理动作本就该可追溯，透明优先于那点顾虑。
       *
       * 🔴 仍然**只读**：没有删除入口（非 GET → 405）。
       *    审计的价值就在于不可删；能删的话"谁删了记录"本身成了新缺口。
       *    要清理测试数据请走 SQL 脚本，不提供界面入口。
       */
      if (path === '/api/admin/audit') {
        if (request.method !== 'GET') return bad(ERR.fallback, 405)
        return await adminAuditList(env, url)
      }

      // 用户管理：GET 列表 / PATCH 封禁解封 / DELETE 彻底删除
      if (path === '/api/admin/users') {
        if (request.method === 'GET') return await adminUsers(env, url)
        if (request.method === 'PATCH') return await adminUserPatch(env, request, actor, nowSec())
        if (request.method === 'DELETE') return await adminUserDelete(env, request, actor, nowSec())
        return bad(ERR.fallback, 405)
      }

      // 角色管理：**仅超管**，且只能改角色严格低于自己的账号
      if (path === '/api/admin/users/role') {
        if (request.method !== 'PATCH') return bad(ERR.fallback, 405)
        return await adminUserSetRole(env, request, actor, nowSec())
      }

      /*
       * 转待审「常用选项」。
       *
       * GET  **所有管理员**都能读（他们要用来填原因）；
       * PUT  **仅超管**能改 —— 这些文案会出现在所有管理员的转待审界面里，
       *      属于"审核口径"的一部分，不该让每个管理员各改一套。
       */
      if (path === '/api/admin/review-presets') {
        if (request.method === 'GET') return await adminReviewPresetsGet(env)
        if (request.method === 'PUT') {
          if (Number(actor.role) < ROLE_SUPER) return bad(ERR.rejected, 403)
          return await adminReviewPresetsPut(env, request, actor, nowSec())
        }
        return bad(ERR.fallback, 405)
      }

      /*
       * 审核词表（超管维护）。
       *
       * GET  所有管理员都能读 —— 他们要在评论页判断"为什么这条进待审"；
       * PUT  仅超管 —— 它决定**什么内容会被拦**，是审核口径的根，不该各改一套。
       */
      if (path === '/api/admin/review-keywords') {
        if (request.method === 'GET') return await adminReviewKeywordsGet(env)
        if (request.method === 'PUT') {
          if (Number(actor.role) < ROLE_SUPER) return bad(ERR.rejected, 403)
          return await adminReviewKeywordsPut(env, request, actor, nowSec())
        }
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

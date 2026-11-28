/**
 * 评论 / 账号 / 后台 API 共享常量、错误契约、限流与基础工具。
 */
import { MAX_BODY_DISPLAY } from '../../src/config/emoticons.js'
import { NICK_MAX, NICK_MIN, PASSWORD_MIN } from '../../src/config/auth.js'

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
export const MAX_BODY = MAX_BODY_DISPLAY
export const MAX_LIMIT = 50

/**
 * 限流阈值的默认值。可用**环境变量**覆盖（`RATE_LIMIT_PER_HOUR` / `RATE_LIMIT_PER_DAY`），
 * **生产环境不要设置**，用默认值即可。
 *
 * 为什么做成可注入：端到端测试套件的 POST 数量（约 13 个）必然超过 5 条/小时，
 * 后半段会被 429 挡成假失败。本地用 `.dev.vars` 放大阈值就能稳定重复运行，
 * 不必在生产代码里塞"测试专用旁路"。非法值一律回落到默认值。
 */
export const RATE_DEFAULTS = { perHour: 5, perDay: 20 }

export function positiveInt(value, fallback) {
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
export const PAGE_KEY_RE =
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
export const AVATAR_ID_RE = /^[A-Za-z0-9_]{1,40}$/

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
export const REVIEW_NOTE_MAX = 80

/**
 * 一次批量改状态最多几条评论。
 *
 * 上限的理由不是"数据库扛不住"，而是**防手滑**：全选几百条一次性放行/隐藏
 * 很难复盘，出问题时也没法一条条看回来。100 条 ≈ 两页（每页 50），
 * 日常"扫一遍待审队列"足够用。
 */
export const BATCH_MAX = 100

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
export const KEYWORD_MAX = 30
export const KEYWORD_COUNT_MAX = 300

export const ERR = {
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

export const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*'
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

export function bad(message, status = 400) {
  return json({ ok: false, error: message }, status)
}

/*
 * `sha256Hex` 从 `src/utils/authCrypto.js` 统一导入 —— 那里有一份**与 Node 的
 * OpenSSL 逐字节比对过**的实现和单测。服务端只此一处，不另留本地副本。
 *
 * 恒定时间比较同样只在 `authCrypto.js` 的 `timingSafeEqualHex`
 * （用于验证码与 verifier 比对）。
 */

export function nowSec() {
  return Math.floor(Date.now() / 1000)
}

/** UTC 小时桶（与 D1 免费额度重置口径一致） */
export function hourBucket(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 13).replace(/[-T]/g, '')
}

export function dayBucket(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10).replace(/-/g, '')
}

/** 剥离控制字符、收敛换行、限长。不存 HTML —— 展示端一律当纯文本渲染 */
export function sanitize(text, maxLen) {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen)
}

export function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('X-Forwarded-For') || '').split(',')[0].trim() ||
    ''
  )
}

/**
 * 清理**过期**的限流桶。
 *
 * 🔴 为什么需要（2026-10-15 补）：`auth_codes` / `captchas` / `sessions` 都有
 * 过期清理，**`rate_limits` 漏了** —— 它是同一类缺陷的第三处。
 * 只靠 `WHERE bucket = ?` 精确读取，旧桶**永远留在表里**。
 *
 * 🔴 **两类桶要分开判**（第一版合并判断是错的，被单测抓出来）：
 *   · 小时桶：末尾 **10** 位 `YYYYMMDDHH`（`h:` / `authh:` / `loginfail:`）
 *   · 日桶：  末尾 **8** 位 `YYYYMMDD`（`d:` / `authd:`）
 *
 *   不能用同一个 `substr(bucket, -10)` 比：日桶只截到 8 位数字，
 *   比较时长短不同 → 字典序失效（实测 `'20261013' < '2026101412'` 为真看着对，
 *   但跨月份时 `'20261101' < '2026103112'` 为**假**，会漏清）。
 *
 * ⚠️ **不碰 `authcd:`**（发码冷却）：它末尾存的是"上次发码的秒数"，不是时间戳，
 *    按时间比会误删。它由发码流程覆盖写，不需要清理。
 *
 * 🔴 **节流**：不能每次 `bump()` 都跑一次 DELETE（评论提交是关键路径，
 *    那会变成"每发一条评论多一次全表扫"，正是本项目一直在避免的模式）。
 *    改为**每进程每 10 分钟最多一次**，用模块级时间戳记着。
 */
const RATE_PRUNE_INTERVAL_MS = 10 * 60 * 1000
let ratePrunedAt = 0

/** 仅供测试：重置节流（否则同一进程内第二次调用不会真的清理） */
export function resetRatePruneThrottleForTest() {
  ratePrunedAt = 0
}

export async function pruneExpiredRateLimits(env, ts) {
  const now = ts * 1000
  if (now - ratePrunedAt < RATE_PRUNE_INTERVAL_MS) return
  ratePrunedAt = now
  const curHour = hourBucket(ts) // YYYYMMDDHH，10 位
  const curDay = dayBucket(ts) // YYYYMMDD，8 位
  try {
    /* 小时桶：末尾 10 位是 YYYYMMDDHH，同长度比较，字典序 == 数值序 */
    await env.DB.prepare(
      `DELETE FROM rate_limits
        WHERE (bucket LIKE 'h:%' OR bucket LIKE 'authh:%' OR bucket LIKE 'loginfail:%')
          AND length(bucket) >= 10
          AND substr(bucket, -10) < ?1`
    )
      .bind(curHour)
      .run()

    /* 日桶：末尾 8 位是 YYYYMMDD；只清**严格早于今天**的（今天还要用） */
    await env.DB.prepare(
      `DELETE FROM rate_limits
        WHERE (bucket LIKE 'd:%' OR bucket LIKE 'authd:%')
          AND length(bucket) >= 8
          AND substr(bucket, -8) < ?1`
    )
      .bind(curDay)
      .run()
  } catch (err) {
    // 清理失败不该影响限流本身（与 pruneExpiredSessions 同样容错）
    console.error('rate_limits prune failed:', err)
  }
}

/** UPSERT 计数并返回自增后的值（1 行读 + 1~2 行写） */
export async function bump(env, bucket, ts) {
  /*
   * 顺手清过期桶（见 pruneExpiredRateLimits 的说明）。
   * 这里只对**小时/日桶**（`bump` 的全部调用点）触发，且内部有 10 分钟节流，
   * 所以绝大多数请求不会多这一次 DELETE。
   */
  await pruneExpiredRateLimits(env, ts)
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
export async function checkRateLimit(env, ipHash, ts) {
  const perHour = positiveInt(env.RATE_LIMIT_PER_HOUR, RATE_DEFAULTS.perHour)
  const perDay = positiveInt(env.RATE_LIMIT_PER_DAY, RATE_DEFAULTS.perDay)

  const hourCount = await bump(env, `h:${ipHash}:${hourBucket(ts)}`, ts)
  if (hourCount > perHour) return { message: ERR.rateLimited, status: 429 }

  const dayCount = await bump(env, `d:${ipHash}:${dayBucket(ts)}`, ts)
  if (dayCount > perDay) return { message: ERR.rateLimitedDay, status: 429 }

  return null
}

export async function verifyTurnstile(env, token, ip) {
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
export const ROLE_USER = 0
export const ROLE_ADMIN = 1
export const ROLE_SUPER = 2

/** 角色对外文案（审计与界面共用）。 */
export const ROLE_LABELS = { 0: '普通用户', 1: '管理员', 2: '超级管理员' }


export function canActOn(actorRole, targetRole, isSelf) {
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
export async function writeAudit(env, actor, { action, targetType, targetId, detail = null }, ts) {
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
export function normalizeReviewNote(raw) {
  if (raw === undefined || raw === null) return null
  const text = String(raw).replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length > REVIEW_NOTE_MAX) return null
  return text
}

// ============================================================
// 账号体系
//
// 设计依据：docs/context/technical/ACCOUNT_SYSTEM.md
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
export const AERR = {
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
export function cooldownMessage(retryAfter) {
  return `请 ${Math.max(1, Math.ceil(retryAfter))} 秒后再试`
}

// ---------- rate_limits 的两种用法 ----------
//
// `bump()` 是自增（用于"每小时几次"）；下面两个是"存一个值/读一个值"
// （用于"上次发送是第几秒"）。刻意分开，别混用 —— 混用会让冷却逻辑变成计数器。

export async function readBucket(env, bucket) {
  const row = await env.DB.prepare(`SELECT counter FROM rate_limits WHERE bucket = ?1`)
    .bind(bucket)
    .first()
  return row?.counter ?? null
}

export async function writeBucket(env, bucket, value) {
  await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, counter) VALUES (?1, ?2)
     ON CONFLICT(bucket) DO UPDATE SET counter = excluded.counter`
  )
    .bind(bucket, value)
    .run()
}

/** 读一个"正整数上限"环境变量覆盖值；未设或不合法则用代码里的默认值。 */
export function envLimit(raw, fallback) {
  if (raw === undefined) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * 右栏「最新讨论」常量与 isolate 内存缓存。
 * 放在 shared.js 以便 comments / admin / auth 写操作共享失效入口。
 */
export const RECENT_LIMIT = 8
export const RECENT_CACHE_SECONDS = 30
export const RECENT_ISOLATE_CACHE_MS = RECENT_CACHE_SECONDS * 1000
/** 站内总讨论区的归属键（与前端 SITE_PAGE_KEY 一致） */
export const SITE_PAGE_KEY = 'site:general'
let recentCache = null
let recentCacheAt = 0

export function getRecentCache(now = Date.now()) {
  if (recentCache && now - recentCacheAt < RECENT_ISOLATE_CACHE_MS) return recentCache
  return null
}

export function setRecentCache(comments, now = Date.now()) {
  recentCache = comments
  recentCacheAt = now
}

export function invalidateRecentCache() {
  recentCache = null
  recentCacheAt = 0
}

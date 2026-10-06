/**
 * 评论 API 客户端
 *
 * 为什么不用 `fetchWithFallback`：那是给**静态资源**用的（带 manifest SHA-256 校验与
 * 包内同版本回退），评论是动态写接口，没有也不该有内容哈希。
 *
 * 地址解析：
 *   - Web：同域相对路径 `/api/...`（走 EdgeOne → Cloudflare Pages Functions）
 *   - Android：必须用绝对地址。因为打包进 APK 后页面是 `https://localhost`，
 *     相对路径会打到 WebView 本地壳上，请求不到服务端。
 *     原生端优先云端（`CLOUD_URL`）；断网时明确报错，而不是静默失败。
 *
 * 相关设计：docs/technical/COMMENTS_BACKEND.md
 */
import { CLOUD_URL, isNative } from './env.js'
import { getToken, whenSessionReady } from './authSession.js'

const TIMEOUT_MS = 15000

/**
 * 面向用户的兜底文案。**这里只放中文短句，不出现状态码、字段名或任何技术名词**（用户明确要求）。
 * 正常情况下服务端会返回自己的中文文案（见 `functions/api/[[path]].js` 的 `ERR` 契约），
 * 这几个只用于"请求根本没到服务端"的情形。
 */
const CONNECT_ERROR = '无法连接评论服务器'
const NETWORK_ERROR = '网络连接异常'
const TIMEOUT_ERROR = '网络连接超时，请稍后再试'
const GENERIC_ERROR = '操作失败，请稍后再试'

/**
 * 各页面的评论归属前缀 → `page_key` = `<前缀>:<实体ID>`。
 *
 * **一处维护**，因为服务端的 `PAGE_KEY_RE` 白名单必须与此保持一致：
 * 新增页面时改这里 + 服务端白名单两处即可，不要在各视图里手写字符串。
 *
 * 几个容易混的点：
 * - **符石与菜谱的实体 ID 本身就是 `item_xxxxx` 形式**（`item_19310`、`item_30022`），
 *   但它们点卡片走的是全局物品详情，所以**不单独挂讨论区**、也不需要前缀，
 *   否则会和物品讨论串在一起或出现两个讨论区。
 * - 关卡用 `stage:` 而不是 `chapter:`——讨论的对象是具体关卡（含难度），不是整章。
 * - 副本用 `battle:`——详情是按 battle 打开的，同一副本下不同 battle 是不同页面。
 */
export const COMMENT_PAGE_PREFIX = {
  item: 'item',
  hero: 'hero',
  pet: 'pet',
  monster: 'monster',
  furniture: 'furniture',
  task: 'task',
  event: 'event',
  explore: 'explore',
  battle: 'battle',
  stage: 'stage'
}

/**
 * **站内总讨论区**的归属键。
 *
 * 它是网站自己的一个讨论（"站内讨论区"），与各图鉴页面的讨论（`item:xxx`、`hero:xxx`…）
 * **完全分开**：不聚合、不互相搬运。
 *
 * 右栏「最新讨论」**只镜像这一个 key**（服务端 `/api/recent` 也这么查，
 * 前端 `App.vue` 的 `addRecentComment` 发表后本地直插时也用它过滤）：
 * 右栏不是"全站各页面最新"的聚合入口，就是站内讨论区的预览 + 一个进入讨论区的按钮。
 */
export const SITE_PAGE_KEY = 'site:general'
export const SITE_PAGE_LABEL = '站内讨论区'

/**
 * 生成评论归属键。
 *
 * @param {string} prefix COMMENT_PAGE_PREFIX 里的值
 * @param {string|number} entityId 业务 ID（不要传页面路径）
 * @returns {string} 形如 `hero:hero_019`；参数不全时返回空串（调用方据此不渲染讨论区）
 */
export function buildPageKey(prefix, entityId) {
  if (!prefix || entityId === undefined || entityId === null || entityId === '') return ''
  return `${prefix}:${String(entityId)}`
}

function apiBase() {
  if (isNative) {
    // 原生端：断网时访问云端无意义，直接给出可读错误
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new CommentApiError(NETWORK_ERROR, 0)
    }
    return CLOUD_URL
  }
  return ''
}

export class CommentApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.name = 'CommentApiError'
    this.status = status
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8'

  /*
   * 🔴 **先等会话恢复完成，再取令牌**。
   *
   * `restoreSession()` 刻意不 await（不阻塞首屏），但评论列表加载得比它快 ——
   * 直接 `getToken()` 会拿到空串，请求就不带令牌，服务端算出的 `mine` 全是 false，
   * **登录用户永远看不到自己评论的「删除」按钮**（刷新也一样）。
   *
   * 所以这里统一 `await whenSessionReady()`；调用方**不要**自己传
   * `token: getToken()`（那正好绕开这个等待）。需要显式指定时才传 `token`。
   */
  let authToken = token
  if (authToken === undefined) {
    await whenSessionReady()
    authToken = getToken()
  }
  if (authToken) headers.Authorization = `Bearer ${authToken}`

  let response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    })
  } catch (err) {
    clearTimeout(timer)
    if (err?.name === 'AbortError') throw new CommentApiError(TIMEOUT_ERROR, 0)
    throw new CommentApiError(CONNECT_ERROR, 0)
  } finally {
    clearTimeout(timer)
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    // 响应不是 JSON。两种常见情形：
    //   1. 本地只跑了 `npm run dev` 没开 `npm run dev:api`，代理拿不到 API（502/504）；
    //   2. 线上 Functions 没生效，/api/* 被 SPA 兜底重写成了 index.html。
    // 对外只给用户能看懂的一句话，技术原因写控制台。
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      console.warn('[comments] API 不可达（本地请确认已运行 npm run dev:api）')
    } else {
      console.warn('[comments] 响应不是 JSON，可能被 SPA 兜底或边缘缓存改写')
    }
    throw new CommentApiError(CONNECT_ERROR, response.status)
  }

  if (!response.ok) {
    // 服务端已按"对外文案契约"返回可直接展示的中文；客户端不再拼技术细节。
    throw new CommentApiError(data?.error || GENERIC_ERROR, response.status)
  }
  return data
}

/**
 * 读取某页面（如 `item:30047`）的评论。
 *
 * `nested: true` 走**楼中楼**取法：服务端只按**顶层评论**分页，每条带出前几条回复
 * （`replies`）与总回复数（`replyCount`）——详情页用。默认（平铺）返回这一页的全部评论，
 * 站内讨论区的聊天式列表用；两种取法的形状差异见 [方案第五章「回复」]。
 */
export function fetchComments(pageKey, { cursor, limit = 20, nested = false } = {}) {
  const params = new URLSearchParams({ page: pageKey, limit: String(limit) })
  if (cursor) params.set('cursor', String(cursor))
  if (nested) params.set('nested', '1')
  /*
   * 🔴 **读评论也要带令牌**。
   *
   * 读本身不需要登录，但**登录了就必须带上**：服务端要按会话算出每条评论的
   * `mine`（"这条是不是你的"），界面据此决定显不显示「删除」。
   *
   * 这个漏了整整一轮：`postComment` / `deleteOwnComment` 都带了，
   * 偏偏三个读函数没带 —— 于是**登录用户永远看不到删除按钮**。
   * API 端到端没发现（它是直接用带 header 的请求测的），
   * **真机全流程才暴露**（"自己刚发的评论没有删除入口"）。
   */
  return request(`/api/comments?${params.toString()}`)
}

/**
 * 展开某一串回复（楼中楼的「全部 N 条回复」）。
 *
 * `parentId` 传**顶层评论**的 id（不是被直接回复的那条）：一串楼里的回复可能互相回复，
 * 但它们在界面上属于同一个楼主，服务端按 thread 的顶层 id 归拢。
 */
export function fetchCommentReplies(pageKey, parentId, { limit = 50 } = {}) {
  const params = new URLSearchParams({ page: pageKey, parent: String(parentId), limit: String(limit) })
  // 令牌交给 request 自己处理（它会先等会话恢复，见上面的说明）
  return request(`/api/comments?${params.toString()}`)
}

/**
 * 读取**站内讨论区（site:general）的最新讨论**（右栏预览用）。
 *
 * 服务端对这条做了 30 秒边缘共享缓存（避免"每开一页查一次库"）。
 *
 * `fresh: true` 用于"必须立刻看到最新"的场合（刚发表完、从后台切回、定时轮询）：
 * - 服务端会跳过共享缓存直接读库；
 * - 客户端再加一个时间戳参数，穿透浏览器与任何中间层缓存
 *   （CDN 默认忽略 query 的缓存策略不保证，显式不同 URL 才可靠）。
 */
export function fetchRecentComments({ fresh = false } = {}) {
  /*
   * 这条**也带令牌**：右栏那条列表要能标出"哪条是你发的"。
   * 服务端对 `/api/recent` 做了边缘共享缓存，而带 Authorization 的请求
   * 本来就不会命中共享缓存 —— 这是**可接受的代价**：右栏本来就有 30 秒轮询，
   * 少一层共享缓存不影响体感，但"自己那条显示不出来"会影响。
   * （`mine` 是逐请求算的，不缓存反而是对的。）
   */
  if (!fresh) return request('/api/recent')
  return request(`/api/recent?fresh=1&t=${Date.now()}`)
}

/**
 * 发表评论。
 *
 * 🔴 **昵称与头像不再由客户端传** —— 服务端从会话令牌解析出账号，一律用账号上的值。
 * 所以这里的 `body` 里没有 `nick` / `avatar`，传了也会被忽略。
 *
 * 令牌从 `authSession` 自动取，**调用方不可能忘记带**（带了才发得出去）。
 *
 * `pageLabel` 是评论所在页面的人话名字（如「银币」）。由调用方用它手上已有的
 * 业务数据传上来并存进这条评论——这样管理端与账号弹窗不必为每条评论反查物品表
 * （那要多加载约 190 KB 的 items.json），而写入时多一列不增加 D1 的行数计费。
 *
 * `parentId` 是**被回复那一条的 id**（可选，点列表里的「回复」才有）。
 * 服务端校验"存在 + 同一 page_key + 仍公开"，任一不满足就**静默降级成普通评论**，
 * 客户端不必为"对方刚好把那条删了"写特殊分支。
 */
export function postComment({ pageKey, pageLabel, body, hp, parentId, turnstileToken }) {
  return request('/api/comments', {
    method: 'POST',
    body: {
      page: pageKey,
      pageLabel,
      body,
      hp,
      parentId,
      /*
       * ⚠️ 请求体里的 `token` 是 **Turnstile 人机令牌**，与上面 `headers` 里的
       * **账号令牌**是两回事，别混。服务端读的是 `payload.token`（`verifyTurnstile`），
       * 未配 `TURNSTILE_SECRET` 时该函数直接放行，所以现在传不传都行 ——
       * 但接入点必须留着，否则将来一开开关所有人就发不出评论。
       */
      token: turnstileToken
    }
  })
}

/**
 * 删自己发的评论。
 *
 * 归属由服务端按 `comments.user_id` 判定，客户端只说"删哪一条"。
 * 因此**换设备也能删**（这是浏览器令牌时代做不到的）。
 */
export function deleteOwnComment(id) {
  return request('/api/comments', { method: 'DELETE', body: { id } })
}

/*
 * 管理端那三个接口（列评论 / 改状态 / 彻底删除）在后台改版时**整块搬到了
 * `utils/adminApi.js`**。搬的理由不是"文件太长"，而是两者的契约不一样：
 *
 *   · 鉴权：管理端用 `x-admin-token`（不过期、单人用），
 *     访客接口用 `Authorization: Bearer`（30 天滑动、可轮换）；
 *   · 错误语义：管理端的 404 意味着"服务端没配 ADMIN_TOKEN"，
 *     访客接口的 404 就是"没有这条"；
 *   · 调用方：一个只有后台页面用，一个全站评论区用。
 *
 * 留在这里会让每个读它的人都要先想一下"这个 request 到底带哪种令牌"。
 */


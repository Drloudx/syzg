/**
 * Cloudflare Pages Functions API 总入口（路由分发）。
 *
 * 业务逻辑按领域拆至 `server/api/`（不放在 `functions/` 内以免 Wrangler 暴露多余路由）：
 *   - shared.js   常量 / 错误契约 / 限流 / 审计 / 公共工具
 *   - session.js  会话加载 / 签发 / 管理员鉴权
 *   - comments.js 评论列表 / 楼中楼 / 发表 / 自删 / 右栏最新 / 评论管理
 *   - admin.js    概览统计 / 用户管理 / 审计日志 / 审核词表与常用选项
 *   - auth.js     账号注册 / 登录 / 验证码 / 个人评论与回复通知
 *   - home.js     首页配置与公告管理
 */
import { ERR, ROLE_SUPER, bad, json, nowSec, resetRatePruneThrottleForTest } from '../../server/api/shared.js'
import { adminSession, loadSession } from '../../server/api/session.js'
import {
  adminDelete, adminList, adminPatch, commentContext, createComment,
  deleteOwnComment, listComments, listRecent
} from '../../server/api/comments.js'
import {
  adminAuditList, adminReviewKeywordsGet, adminReviewKeywordsPut,
  adminReviewPresetsGet, adminReviewPresetsPut, adminStats,
  adminUserDelete, adminUserPatch, adminUserSetRole, adminUsers
} from '../../server/api/admin.js'
import {
  authCaptcha, authChangeEmail, authChangePassword, authDeleteAccount,
  authLogin, authLogout, authMarkModerationRead, authMarkRepliesRead,
  authMe, authMyComments, authMyReplies, authRegister, authRequestCode,
  authResetPassword, authSalt, authUpdateMe
} from '../../server/api/auth.js'
import {
  adminHomeGet, adminHomePut, adminNoticeSlotsPut, adminNoticeWrite,
  adminNoticesList, adminNoticesPick, getHomeConfig
} from '../../server/api/home.js'

export { resetRatePruneThrottleForTest }

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
      if (request.method === 'GET') {
        /*
         * 登录状态是**可选**的：读评论不需要登录，但登录了就要标出"哪条是我的"
         * （界面据此决定显不显示「删除」）。仅 GET 路径预先解析一次可选会话；
         * POST / DELETE 内部各自强制调用 loadSession，避免重复查询。
         */
        const viewer = await loadSession(env, request, nowSec())
        const myUserId = viewer?.row?.id ?? null
        return await listComments(env, url, myUserId)
      }
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

    /*
     * 首页内容（公开读）：一次请求拿全 5 块配置。
     * 60 秒 isolate 内存缓存；?fresh=1 强制回源（后台保存后核对用）。
     * 前端失败时必须回落到内置 DEFAULT_* 常量，不能整页白屏。
     */
    if (path === '/api/home-config') {
      if (request.method !== 'GET') return bad(ERR.fallback, 405)
      const fresh = url.searchParams.get('fresh') === '1'
      const data = await getHomeConfig(env, { fresh })
      return json({ ok: true, ...data })
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
       * `GET /api/admin/ping` —— **权限探活**。
       *
       * 为什么不用 `/api/admin/stats` 判权限：stats 为渲染概览要跑 **9 条聚合查询**
       * （含多次全表扫，实测约 **2.4 万行 / 次**），而闸门只关心 **401 还是 200**。
       * 用整屏指标换一个布尔值，在 D1 按 rows read 计费的额度下是纯浪费。
       *
       * 这条端点不做任何查询 —— `adminSession()` 已经把该查的会话与角色查完了，
       * 能走到这里就说明鉴权已通过（上方 `if (!admin) return 401`）。
       * 于是成本从「9 条查询 + 多次全表扫」降到 **0 条额外查询**。
       *
       * ⚠️ 返回体**刻意只给角色，不给任何统计数字**：它是权限验伪，不是数据接口。
       *    `role` 是调用者自己的角色，本就随登录态可见，不算泄漏。
       */
      if (path === '/api/admin/ping') {
        if (request.method !== 'GET') return bad(ERR.fallback, 405)
        return json({ ok: true, role: Number(actor.role) || 0 })
      }

      /*
       * 首页内容管理：**仅超管**（role >= 2），与「系统设置」同级。
       *
       * 为什么卡超管而非管理员：这些内容直接决定首页对外的第一印象，
       * 且「区块存在与否」本身就是站点结构决策，和审核词表一样属于口径的根，
       * 不该让多个管理员各改一套。
       *
       * 读管理端（含已停用项）也是超管 —— 普通管理员不需要看到草稿内容。
       */
      if (path === '/api/admin/home') {
        if (Number(actor.role) < ROLE_SUPER) return bad(ERR.rejected, 403)
        if (request.method !== 'GET') return bad(ERR.fallback, 405)
        return await adminHomeGet(env)
      }

      // 公告：单条 CRUD（可增减的流式内容）
      if (path === '/api/admin/home/notices') {
        if (Number(actor.role) < ROLE_SUPER) return bad(ERR.rejected, 403)
        if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return bad(ERR.fallback, 405)
        return await adminNoticeWrite(env, request, actor, request.method, nowSec())
      }

      // 首页公告插槽：PUT 整组替换（8 个位置的选择）
      if (path === '/api/admin/home/notice-slots') {
        if (Number(actor.role) < ROLE_SUPER) return bad(ERR.rejected, 403)
        if (request.method !== 'PUT') return bad(ERR.fallback, 405)
        return await adminNoticeSlotsPut(env, request, actor, nowSec())
      }

      /*
       * 公告管理（独立模块，2026-11-01）。
       *
       * 与 `/api/admin/home` 分开：那个端点一次返回 5 张表全量，
       * 公告管理只需公告，且要分页与搜索 —— 混用会让每次翻页都多拉首页配置。
       *
       *   GET    列表（分页 + 搜索）
       *   POST   新建（id 由后端按 site-N / official-N 生成）
       *   PATCH  修改
       *   DELETE 软删（is_active=0）
       */
      if (path === '/api/admin/notices') {
        if (Number(actor.role) < ROLE_SUPER) return bad(ERR.rejected, 403)
        if (request.method === 'GET') return await adminNoticesList(env, url)
        if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
          return await adminNoticeWrite(env, request, actor, request.method, nowSec())
        }
        return bad(ERR.fallback, 405)
      }

      // 首页选择器用的精简列表（默认最近 10 条，带 q 时放宽到 50）
      if (path === '/api/admin/notices/pick') {
        if (Number(actor.role) < ROLE_SUPER) return bad(ERR.rejected, 403)
        if (request.method !== 'GET') return bad(ERR.fallback, 405)
        return await adminNoticesPick(env, url)
      }

      // 四块固定/整组内容：PUT 整组替换
      if (path.startsWith('/api/admin/home/')) {
        if (Number(actor.role) < ROLE_SUPER) return bad(ERR.rejected, 403)
        if (request.method !== 'PUT') return bad(ERR.fallback, 405)
        const section = path.slice('/api/admin/home/'.length)
        return await adminHomePut(env, request, actor, section, nowSec())
      }

      /*
       * 审计日志：**所有管理员都可读**。
       *
       * 只给超管会让「管理动作可追溯」变成半截 —— 同级互相可见的那点顾虑
       * （盯梢、报复）优先度低于透明。
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

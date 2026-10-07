/**
 * 账号会话（前端唯一的状态源）。
 *
 * 把"密码 → verifier → 调接口 → 存令牌"这一整条编排收在这里，
 * 让 UI 只需要 `await loginWithPassword({ email, password })`。
 *
 * ## 密码去哪了
 *
 * **只在这个模块里存活一瞬间**：`deriveFor()` 把它交给 PBKDF2（跑在**用户设备**上），
 * 拿到 `verifier` 之后**密码本身就被丢弃**，往后只传 `verifier`。
 * 服务端永远收不到密码，也永远不存密码。
 *
 * ## 令牌存哪
 *
 * `localStorage`（键 `myrzg:auth`）。**这是有意为之的取舍**：
 * 账号体系只有这一个后端（Cloudflare Pages Functions + D1），没有独立的会话服务，
 * 存 localStorage 意味着 XSS 能偷走令牌 —— 但本站没有用户可控的 HTML 注入面
 * （评论一律按纯文本渲染），所以这个风险可以接受。
 * 详见 `docs/technical/ACCOUNT_SYSTEM.md` §九。
 */

import { computed, ref } from 'vue'

import {
  AuthApiError,
  changeEmail,
  changePassword,
  deleteAccount,
  fetchMe,
  fetchMyComments,
  fetchMyReplies,
  fetchPasswordSalt,
  login,
  logout,
  markRepliesRead,
  register,
  updateMe
} from './authApi.js'
import { deriveVerifier, isKdfAvailable, generatePasswordSalt } from './passwordKdf.js'

const STORAGE_KEY = 'myrzg:auth'

/** 当前登录用户（`null` = 未登录）。对外形状见服务端 `toPublicUser()`。 */
export const currentUser = ref(null)

/** 会话令牌。**不要绑到界面上**，只在本模块与 API 调用里流转。 */
let token = ''

/**
 * 启动恢复的进行中 Promise（`null` = 还没开始恢复）。
 *
 * 🔴 **存在的理由是一个真实的竞态**：`restoreSession()` 刻意不 await（不阻塞首屏），
 * 但**评论列表加载得比它快** —— 那一刻 `getToken()` 还是空串，请求就没带令牌，
 * 于是服务端算出的 `mine` 全是 false、**登录用户永远看不到自己评论的「删除」按钮**。
 * 刷新也一样（列表先到、会话后到），属于"看着像功能没做"的那类。
 *
 * 所以凡是"要按登录状态决定结果"的请求，都必须先 `await whenSessionReady()`。
 */
let restorePromise = null

/** 等会话恢复完成；没开始恢复时立即 resolve。 */
export function whenSessionReady() {
  return restorePromise ?? Promise.resolve()
}

export const isLoggedIn = computed(() => Boolean(currentUser.value && token))

/** 'idle' | 'restoring' | 'ready' —— 启动时恢复会话的进度，避免弹窗闪一下"未登录" */
export const sessionState = ref('idle')

/** 对外展示的编号（5 位）。未登录为 `null`。 */
export const publicNo = computed(() => currentUser.value?.id ?? null)

export function getToken() {
  return token
}

/** 让 UI 在"KDF 不可用"时给出明确提示（http 明文访问、老旧内核都会这样）。 */
export function isAuthSupported() {
  return isKdfAvailable()
}

// ---------- 本地持久化 ----------

function safeGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function persist() {
  if (!token || !currentUser.value) return safeRemove(STORAGE_KEY)
  return safeSet(STORAGE_KEY, JSON.stringify({ token, user: currentUser.value }))
}

/** 清空登录态（本地 + 内存）。**不会**通知服务端，需要的话先调 `signOut()`。 */
export function clearSession() {
  token = ''
  currentUser.value = null
  safeRemove(STORAGE_KEY)
  sessionState.value = 'ready'
}

function applySession(nextToken, user) {
  token = nextToken
  currentUser.value = user
  persist()
  sessionState.value = 'ready'
}

// ---------- 启动恢复 ----------

/**
 * 应用启动时调一次：把 localStorage 里的令牌拿去问服务端"这还算数吗"。
 *
 * 为什么必须**问一次**而不是直接信任本地：令牌可能已被服务端作废
 * （改了密码会踢掉其余会话、被管理员封禁会清空全部会话），
 * 本地直接信任会让用户"看着是登录的、一操作就 401"。
 */
export async function restoreSession() {
  const raw = safeGet(STORAGE_KEY)
  if (!raw) {
    sessionState.value = 'ready'
    restorePromise = Promise.resolve(null)
    return null
  }
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearSession()
    restorePromise = Promise.resolve(null)
    return null
  }
  if (!parsed?.token) {
    clearSession()
    restorePromise = Promise.resolve(null)
    return null
  }

  sessionState.value = 'restoring'
  // 先把本地用户挂上，界面不至于空一下；随后以服务端为准
  token = parsed.token
  currentUser.value = parsed.user || null

  restorePromise = (async () => {
    try {
      const data = await fetchMe(token)
      applySession(token, data.user)
      return data.user
    } catch (err) {
      if (err instanceof AuthApiError && err.isUnauthorized) {
        // 令牌已失效（过期 / 被踢 / 被封禁）：干净地回到未登录
        clearSession()
        return null
      }
      // 网络问题：**保留**本地登录态，别让用户因为一次断网就被登出
      console.warn('[auth] 恢复会话失败（保留本地状态）:', err?.message)
      sessionState.value = 'ready'
      return currentUser.value
    }
  })()

  return restorePromise
}

// ---------- 密码 → verifier ----------

/**
 * 取盐 + 跑 KDF。**每一步都要现取盐**，不可缓存。
 *
 * 用途：**登录 / 改密码 / 换邮箱** —— 这些场景用户已经注册过，
 * 服务端存着随机盐，取回来就能重算出同一个 `verifier`。
 */
async function deriveFor(email, password) {
  const { salt } = await fetchPasswordSalt(email)
  return deriveVerifier(password, salt)
}

/**
 * 注册专用：**本地随机生成盐**，再派生 verifier。
 *
 * 为什么注册不能走 `deriveFor`：盐是随机的，注册时服务端还没有这个用户、
 * 也就没有盐可给。所以由**客户端生成**，把 `(salt, verifier)` 一起提交，
 * 服务端校验格式后原样存下。之后登录就能用存下来的盐重算出同一个 verifier。
 *
 * ⚠️ 生成的盐必须是 64 位小写 hex —— 服务端会按这个形状校验，不符合直接拒。
 */
function deriveForNewAccount(password) {
  const salt = generatePasswordSalt()
  return deriveVerifier(password, salt).then((verifier) => ({ salt, verifier }))
}

/** 任何带令牌的调用都可能拿到 401 → 统一在这里清掉本地登录态。 */
async function withSession(fn) {
  try {
    return await fn(token)
  } catch (err) {
    if (err instanceof AuthApiError && err.isUnauthorized) clearSession()
    throw err
  }
}

// ---------- 对外动作 ----------

/**
 * 登录用盐的**预取缓存**。
 *
 * ## 为什么（2026-10-07）
 *
 * 登录原本是**两次串行往返**：先 `GET /api/auth/salt` 取盐，再 `POST /api/auth/login`。
 * 生产实测每次回源往返中位 **1.3 秒、最坏 6 秒**（边缘缓存对 `/api/*` 不生效），
 * 于是手机上"点登录"要等两三秒 —— 而其中 **PBKDF2 只占 0.1 秒**，剩下全是网络。
 *
 * 预取后：**在用户走到登录页时就把盐取好**，点登录时只剩一次往返。
 *
 * ## 为什么可以缓存（盐不是秘密）
 *
 * 盐本来就由公开接口返回，缓存它**不降低任何安全性** —— 攻击者本来就能查到。
 * 它只用于派生 verifier，且服务端会用**库里存的那个**盐复核。
 *
 * ## 失效怎么处理
 *
 * 盐只在"注册"与"换邮箱"时变化，两种情况都不会发生在登录流程里。
 * 但**缓存命中不代表一定对**（比如换了台设备换了账号）——
 * 所以登录失败时**清掉缓存并重试一次**，避免用户被一个过期盐卡住。
 */
const saltCache = new Map()

/** 预取某个邮箱的盐（失败静默：它只是优化，不是必需步骤） */
export function prefetchPasswordSalt(email) {
  const key = String(email || '').trim().toLowerCase()
  if (!key || saltCache.has(key)) return
  // 存 Promise 而不是值：并发调用（预取 + 提交）共用同一次请求
  const p = fetchPasswordSalt(key)
    .then((r) => r?.salt || '')
    .catch(() => '')
  saltCache.set(key, p)
}

async function takePasswordSalt(email) {
  const key = String(email || '').trim().toLowerCase()
  const hit = saltCache.get(key)
  if (hit) {
    saltCache.delete(key) // 一次性：用完就丢，避免长期持有过期值
    const salt = await hit
    if (salt) return salt
  }
  const { salt } = await fetchPasswordSalt(email)
  return salt
}

/**
 * 登录：取盐（优先用预取）→ 派生 verifier → 请求。
 *
 * ⚠️ **失败时不做"拿新盐重试"** —— 想过，但那是净亏：
 * 服务端对"密码错"与"盐过期"返回**同一个 401**（刻意如此，防账号枚举），
 * 所以无法区分。而"密码错"远比"盐过期"常见（盐只在注册与换邮箱时变化，
 * 那两种情况都不会落在登录流程里），于是重试等于**让每次输错密码都多花一次往返**
 * （生产实测每次 1.3 秒），换来一个几乎不存在的场景。
 *
 * 改为：失败就把缓存**清掉**，这样用户下次输入时用的是新鲜盐 —— 零成本。
 */
export async function loginWithPassword({ email, password }) {
  let salt
  try {
    salt = await takePasswordSalt(email)
  } catch (err) {
    saltCache.delete(String(email || '').trim().toLowerCase())
    throw err
  }
  const verifier = await deriveVerifier(password, salt)
  try {
    const data = await login({ email, verifier })
    applySession(data.token, data.user)
    return data.user
  } catch (err) {
    // 失败即清缓存：下次用新鲜盐，不必为可能过期的值付重试成本
    saltCache.delete(String(email || '').trim().toLowerCase())
    throw err
  }
}

export async function registerAccount({ email, code, password, nick, avatar }) {
  // 盐本地随机生成（注册时服务端还没有这个用户），与 verifier 一起提交
  const { salt, verifier } = await deriveForNewAccount(password)
  const data = await register({ email, code, verifier, salt, nick, avatar })
  applySession(data.token, data.user)
  return data.user
}

export async function changePasswordWithCode({ code, newPassword }) {
  const email = currentUser.value?.email
  if (!email) throw new AuthApiError('登录状态已过期，请重新登录', 401)
  const verifier = await deriveFor(email, newPassword)
  await withSession((t) => changePassword(t, { code, verifier }))
}

export async function changeEmailWithCodes({ newEmail, oldCode, newCode }) {
  const data = await withSession((t) => changeEmail(t, { newEmail, oldCode, newCode }))
  if (data?.user) {
    currentUser.value = data.user
    persist()
  }
  return data?.user
}

export async function updateProfile(patch) {
  const data = await withSession((t) => updateMe(t, patch))
  if (data?.user) {
    currentUser.value = data.user
    persist()
  }
  return data?.user
}

export async function refreshMe() {
  const data = await withSession((t) => fetchMe(t))
  if (data?.user) {
    currentUser.value = data.user
    persist()
  }
  return data?.user
}

/** 退出登录。即使服务端调用失败也**一定清掉本地态**（用户点了退出就该退出）。 */
export async function signOut() {
  const t = token
  clearSession()
  if (!t) return
  try {
    await logout(t)
  } catch (err) {
    console.warn('[auth] 退出登录的服务端调用失败（本地已清）:', err?.message)
  }
}

/** 注销账号（软删除）。成功后本地态一并清掉。 */
export async function deleteMyAccount() {
  await withSession((t) => deleteAccount(t))
  clearSession()
}

// ── 我的评论 / 谁回复了我 ────────────────────────────────────────────
//
// 这两个都**只认会话**，所以归属天然跨设备：换台手机登录同一账号，
// 看到的是同一份列表。这一点是本机身份时代做不到的 ——
// 那时"我的评论"靠每台设备各自存的自删令牌，换设备就查不到。

/**
 * 取回自己发表过的评论（含待审/已隐藏状态）。
 *
 * 与公开列表接口的区别：**这里能看到别人看不到的那些**
 * （待审 status=0、管理端隐藏 status=2），因为返回的是自己发的东西。
 *
 * @param {{cursor?: number, limit?: number}} options
 */
export async function loadMyComments({ cursor, limit = 20 } = {}) {
  return withSession((t) => fetchMyComments(t, { cursor, limit }))
}

/**
 * 取回"谁回复了我"。
 *
 * 返回体里带 `unread`：服务端用 `users.replies_read_at` 当基准算出来的条数，
 * 不建已读表（少一张表、少一次写入）。
 */
export async function loadMyReplies({ cursor, limit = 20 } = {}) {
  return withSession((t) => fetchMyReplies(t, { cursor, limit }))
}

/** 把"谁回复了我"标为已读（把基准时间推到此刻） */
export async function markMyRepliesRead() {
  return withSession((t) => markRepliesRead(t))
}

import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'

import { deriveVerifier } from '../../src/utils/passwordKdf.js'

/**
 * 账号会话层的守护测试。
 *
 * 这一层是**前端唯一的账号状态源**，也是"密码 → verifier → 令牌"的编排处。
 * 它出错的方式在真机上很难复现（比如"断网后被登出"、"改密码后本地 token 没换"），
 * 所以用 mock fetch 把每条分支钉死。
 *
 * 不打真实网络：`globalThis.fetch` 被替换成一个按 pathname 分发的假实现。
 */

// ---------- localStorage 桩 ----------
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear()
}

// ---------- fetch 桩 ----------
const calls = []
let routeHandler = null

globalThis.fetch = async (url, init = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, '')
  const entry = {
    path,
    method: init.method || 'GET',
    body: init.body ? JSON.parse(init.body) : undefined,
    auth: init.headers?.Authorization || init.headers?.authorization || ''
  }
  calls.push(entry)
  if (!routeHandler) throw new Error('测试没设置 routeHandler')
  return routeHandler(entry)
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}

const SALT = 'f'.repeat(64)
const TOKEN = 'a'.repeat(64)
const USER = { id: 10000, nick: '测试者', avatar: 'at001_0', email: 'test@example.com', status: 1, createdAt: 1, lastLoginAt: 1 }

/** 每个测试前重置模块状态。用动态 import + 查询串绕开 ESM 缓存。 */
let mod = null
let importSeq = 0

async function freshSession() {
  importSeq++
  mod = await import(`../../src/utils/authSession.js?t=${importSeq}`)
  store.clear()
  calls.length = 0
  routeHandler = null
  return mod
}

beforeEach(async () => {
  await freshSession()
})

afterEach(() => {
  routeHandler = null
})

// ============================================================

test('loginWithPassword：先取盐 → 用该盐推导 → 再登录', async () => {
  routeHandler = (req) => {
    if (req.path.startsWith('/api/auth/salt')) return jsonResponse({ ok: true, salt: SALT, iters: 600000 })
    if (req.path === '/api/auth/login') return jsonResponse({ ok: true, token: TOKEN, user: USER })
    throw new Error('意外请求 ' + req.path)
  }

  const user = await mod.loginWithPassword({ email: 'Test@Example.com', password: 'correct-horse' })

  assert.equal(calls.length, 2, '应该正好两次请求')
  assert.ok(calls[0].path.startsWith('/api/auth/salt?email='), '第一次应取盐')
  assert.equal(calls[1].path, '/api/auth/login', '第二次应登录')

  // 🔴 关键：发出去的 verifier 必须等于"用服务端返回的那个盐"推导出来的值
  const expected = await deriveVerifier('correct-horse', SALT)
  assert.equal(calls[1].body.verifier, expected, 'verifier 与按该盐推导的结果不一致')
  assert.equal(calls[1].body.email, 'Test@Example.com')
  // 🔴 密码绝不能出现在任何请求体里
  assert.equal(JSON.stringify(calls.map((c) => c.body)).includes('correct-horse'), false, '请求里出现了明文密码！')

  assert.equal(user.nick, '测试者')
  assert.equal(mod.isLoggedIn.value, true)
  assert.equal(mod.publicNo.value, 10000)
  assert.equal(mod.getToken(), TOKEN)
})

test('登录成功后令牌写入 localStorage，且不含密码', async () => {
  routeHandler = (req) =>
    req.path.startsWith('/api/auth/salt')
      ? jsonResponse({ ok: true, salt: SALT })
      : jsonResponse({ ok: true, token: TOKEN, user: USER })

  await mod.loginWithPassword({ email: 'a@b.com', password: 'long-enough-pass' })

  const raw = store.get('myrzg:auth')
  assert.ok(raw, '没有写入 localStorage')
  const parsed = JSON.parse(raw)
  assert.equal(parsed.token, TOKEN)
  assert.equal(parsed.user.id, 10000)
  assert.equal(/long-enough-pass/.test(raw), false, 'localStorage 里出现了密码！')
})

test('登录失败（401）不改变登录态，并把服务端中文原样抛出', async () => {
  routeHandler = (req) =>
    req.path.startsWith('/api/auth/salt')
      ? jsonResponse({ ok: true, salt: SALT })
      : jsonResponse({ ok: false, error: '邮箱或密码不对' }, 401)

  await assert.rejects(
    () => mod.loginWithPassword({ email: 'a@b.com', password: 'wrong-pass-here' }),
    (err) => {
      assert.equal(err.message, '邮箱或密码不对')
      assert.equal(err.status, 401)
      assert.equal(err.isUnauthorized, true)
      return true
    }
  )
  assert.equal(mod.isLoggedIn.value, false)
  assert.equal(store.has('myrzg:auth'), false)
})

test('restoreSession：本地有令牌时去问服务端，并以服务端为准', async () => {
  store.set('myrzg:auth', JSON.stringify({ token: TOKEN, user: { ...USER, nick: '旧昵称' } }))
  routeHandler = (req) => {
    if (req.path === '/api/auth/me') return jsonResponse({ ok: true, user: { ...USER, nick: '服务端昵称' } })
    throw new Error('意外请求 ' + req.path)
  }

  const user = await mod.restoreSession()
  assert.equal(user.nick, '服务端昵称', '应以服务端返回为准')
  assert.equal(mod.isLoggedIn.value, true)
  assert.equal(mod.sessionState.value, 'ready')
})

test('🔴 restoreSession：令牌已失效（401）→ 清掉本地登录态', async () => {
  store.set('myrzg:auth', JSON.stringify({ token: TOKEN, user: USER }))
  routeHandler = () => jsonResponse({ ok: false, error: '登录状态已过期，请重新登录' }, 401)

  const user = await mod.restoreSession()
  assert.equal(user, null)
  assert.equal(mod.isLoggedIn.value, false)
  assert.equal(store.has('myrzg:auth'), false, '失效令牌应被清掉')
})

test('🔴 restoreSession：断网（连不上）→ **保留**本地登录态，不把用户登出', async () => {
  store.set('myrzg:auth', JSON.stringify({ token: TOKEN, user: USER }))
  routeHandler = () => {
    throw new TypeError('fetch failed') // 模拟断网
  }

  const user = await mod.restoreSession()
  assert.ok(user, '断网不该清登录态')
  assert.equal(mod.isLoggedIn.value, true, '断网不该把用户登出')
  assert.equal(store.has('myrzg:auth'), true, '断网不该删本地令牌')
})

test('restoreSession：本地没有令牌 → 直接 ready，不发请求', async () => {
  const user = await mod.restoreSession()
  assert.equal(user, null)
  assert.equal(calls.length, 0)
  assert.equal(mod.sessionState.value, 'ready')
})

test('restoreSession：本地数据损坏 → 当作未登录，不抛异常', async () => {
  store.set('myrzg:auth', '{不是合法 JSON')
  const user = await mod.restoreSession()
  assert.equal(user, null)
  assert.equal(mod.isLoggedIn.value, false)
})

test('🔴 signOut：即使服务端调用失败，本地也一定要清干净', async () => {
  routeHandler = (req) => {
    if (req.path.startsWith('/api/auth/salt')) return jsonResponse({ ok: true, salt: SALT })
    if (req.path === '/api/auth/login') return jsonResponse({ ok: true, token: TOKEN, user: USER })
    throw new TypeError('fetch failed') // logout 时断网
  }

  await mod.loginWithPassword({ email: 'a@b.com', password: 'long-enough-pass' })
  assert.equal(mod.isLoggedIn.value, true)

  await mod.signOut() // 内部会捕获异常
  assert.equal(mod.isLoggedIn.value, false, '点了退出就必须退出')
  assert.equal(store.has('myrzg:auth'), false)
})

test('🔴 带令牌的调用拿到 401 → 自动清掉本地登录态', async () => {
  routeHandler = (req) => {
    if (req.path.startsWith('/api/auth/salt')) return jsonResponse({ ok: true, salt: SALT })
    if (req.path === '/api/auth/login') return jsonResponse({ ok: true, token: TOKEN, user: USER })
    // ⚠️ mock 必须**区分方法**：`updateProfile` 打的是 PATCH /api/auth/me，
    //    若不判方法，GET 的那条分支会把 PATCH 也接住，测试就永远看不到 401
    if (req.path === '/api/auth/me' && req.method === 'GET') return jsonResponse({ ok: true, user: USER })
    return jsonResponse({ ok: false, error: '登录状态已过期，请重新登录' }, 401)
  }

  await mod.loginWithPassword({ email: 'a@b.com', password: 'long-enough-pass' })
  assert.equal(mod.isLoggedIn.value, true)

  await assert.rejects(
    () => mod.updateProfile({ nick: '新昵称' }),
    (err) => {
      assert.equal(err.status, 401)
      return true
    }
  )

  assert.equal(mod.isLoggedIn.value, false, '401 后应自动登出')
  assert.equal(store.has('myrzg:auth'), false)
})

test('changePasswordWithCode：用**当前账号的邮箱**取盐，并提交新 verifier', async () => {
  routeHandler = (req) => {
    if (req.path.startsWith('/api/auth/salt')) return jsonResponse({ ok: true, salt: SALT })
    if (req.path === '/api/auth/login') return jsonResponse({ ok: true, token: TOKEN, user: USER })
    if (req.path === '/api/auth/password') return jsonResponse({ ok: true })
    throw new Error('意外请求 ' + req.path)
  }

  await mod.loginWithPassword({ email: 'test@example.com', password: 'old-password-x' })
  calls.length = 0

  await mod.changePasswordWithCode({ code: '123456', newPassword: 'brand-new-password' })

  assert.equal(calls.length, 2, '应先取盐再改密')
  assert.ok(decodeURIComponent(calls[0].path).includes('test@example.com'), '取盐应带上当前账号的邮箱')
  assert.equal(calls[1].path, '/api/auth/password')
  assert.equal(calls[1].body.code, '123456')
  assert.equal(calls[1].body.verifier, await deriveVerifier('brand-new-password', SALT))
  assert.equal(calls[1].auth, 'Bearer ' + TOKEN, '改密必须带令牌')
})

test('changePasswordWithCode：未登录时直接拒绝，不发请求', async () => {
  await assert.rejects(
    () => mod.changePasswordWithCode({ code: '123456', newPassword: 'brand-new-password' }),
    /登录状态已过期/
  )
  assert.equal(calls.length, 0)
})

test('changeEmailWithCodes：成功后本地用户信息同步更新', async () => {
  routeHandler = (req) => {
    if (req.path.startsWith('/api/auth/salt')) return jsonResponse({ ok: true, salt: SALT })
    if (req.path === '/api/auth/login') return jsonResponse({ ok: true, token: TOKEN, user: USER })
    if (req.path === '/api/auth/email')
      return jsonResponse({ ok: true, user: { ...USER, email: 'new@example.com' } })
    throw new Error('意外请求 ' + req.path)
  }

  await mod.loginWithPassword({ email: 'test@example.com', password: 'long-enough-pass' })
  await mod.changeEmailWithCodes({ newEmail: 'new@example.com', oldCode: '111111', newCode: '222222' })

  assert.equal(mod.currentUser.value.email, 'new@example.com')
  assert.equal(JSON.parse(store.get('myrzg:auth')).user.email, 'new@example.com', 'localStorage 也要同步')
})

test('deleteMyAccount：成功后本地清空', async () => {
  routeHandler = (req) => {
    if (req.path.startsWith('/api/auth/salt')) return jsonResponse({ ok: true, salt: SALT })
    if (req.path === '/api/auth/login') return jsonResponse({ ok: true, token: TOKEN, user: USER })
    if (req.path === '/api/auth/me' && (req.method || 'GET') === 'DELETE') return jsonResponse({ ok: true })
    throw new Error('意外请求 ' + req.path + ' ' + req.method)
  }

  await mod.loginWithPassword({ email: 'a@b.com', password: 'long-enough-pass' })
  await mod.deleteMyAccount()

  assert.equal(mod.isLoggedIn.value, false)
  assert.equal(store.has('myrzg:auth'), false)
})

test('isAuthSupported 在 Node 里为 true（crypto.subtle 可用）', () => {
  assert.equal(mod.isAuthSupported(), true)
})

test('恢复会话期间 sessionState 会经过 restoring', async () => {
  store.set('myrzg:auth', JSON.stringify({ token: TOKEN, user: USER }))
  let sawRestoring = false
  routeHandler = () => {
    sawRestoring = mod.sessionState.value === 'restoring'
    return jsonResponse({ ok: true, user: USER })
  }
  await mod.restoreSession()
  assert.equal(sawRestoring, true, '请求发出时应处于 restoring 状态')
  assert.equal(mod.sessionState.value, 'ready')
})

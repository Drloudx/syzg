/**
 * 后台角色权限 · **穷举矩阵测试**（需要本地 API 在 8788 运行）。
 *
 * ## 为什么必须穷举
 *
 * 层级校验的漏洞形态是"漏了一条分支"，而不是"整体写错"：
 * 比如管理员能封禁超管、或超管能把自己降级 —— 这类 bug 靠"我小心点写"防不住，
 * 因为代码看起来是对的。**唯一可靠的办法是把 (操作者角色 × 目标角色 × 操作)
 * 的所有组合都跑一遍**，断言只有该通过的通过。
 *
 * ## 它守的核心不变量
 *
 *   1. 只能操作**角色严格低于自己**的账号（`canActOn`）；
 *   2. **谁都不能操作自己**（防手滑自锁）；
 *   3. **只有超管**能设/撤管理员；
 *   4. 接口**不能造出超管**（`role=2` 只存在于数据库，见迁移文件）；
 *   5. 非管理员**一律 401**，且**所有管理接口**都如此（不是只有 stats）。
 *
 * 用法：`npm run dev:api` 起服务后 `node --no-warnings tests/api/admin-roles.mjs`
 */
import { createCodeReader, openLocalD1Writable } from '../helpers/localD1.mjs'
import { api, createAccount } from '../helpers/accountApi.mjs'

const BASE = process.env.MYRZG_API_BASE || 'http://127.0.0.1:8788'

let pass = 0
let fail = 0
const failures = []

function check(label, ok, extra = '') {
  if (ok) {
    pass++
    console.log(`  ✅ ${label}`)
  } else {
    fail++
    failures.push(label)
    console.log(`  ❌ ${label}${extra ? '  [' + extra + ']' : ''}`)
  }
}

/** 把某个账号的角色直接写进库 —— 生产上超管只能这样产生（没有接口） */
function setRoleDirect(email, role) {
  const db = openLocalD1Writable()
  try {
    const row = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email)
    if (!row) throw new Error(`找不到账号 ${email}`)
    db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, row.id)
    return row.id
  } finally {
    db.close()
  }
}

const stamp = Date.now().toString(36)

console.log('\n================ 后台角色权限 · 穷举矩阵 ================\n')

const reader = createCodeReader()
try {
  // ---------- 准备：四个账号，覆盖三种角色 ----------
  console.log('【0】建号并设定角色')
  const superAcc = await createAccount(BASE, reader, { nick: `超管${stamp.slice(-3)}` })
  const adminAcc = await createAccount(BASE, reader, { nick: `管理${stamp.slice(-3)}` })
  const admin2Acc = await createAccount(BASE, reader, { nick: `管理2${stamp.slice(-3)}` })
  const userAcc = await createAccount(BASE, reader, { nick: `普通${stamp.slice(-3)}` })

  const superId = setRoleDirect(superAcc.email, 2)
  const adminId = setRoleDirect(adminAcc.email, 1)
  const admin2Id = setRoleDirect(admin2Acc.email, 1)
  const userId = setRoleDirect(userAcc.email, 0)
  check('四个账号就位（超管 / 管理员×2 / 普通）', Boolean(superId && adminId && admin2Id && userId))

  /*
   * ⚠️ 角色是**直接改库**的，而会话行里没有角色缓存（每次请求 JOIN users 读实时值），
   * 所以不必重新登录 —— 这本身就是一条值得确认的性质。
   */

  // ---------- 1. 未登录 / 普通用户：全部管理接口都该 401 ----------
  console.log('\n【1】非管理员一律 401（不是只有 stats）')
  const ADMIN_PATHS = [
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/comments'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/audit']
  ]
  for (const [method, path] of ADMIN_PATHS) {
    const anon = await api(BASE, method, path)
    check(`未登录 ${method} ${path} → 401`, anon.status === 401, `实际 ${anon.status}`)
    const asUser = await api(BASE, method, path, { token: userAcc.token })
    check(`普通用户 ${method} ${path} → 401`, asUser.status === 401, `实际 ${asUser.status}`)
  }

  // 写接口同样要挡（读挡了、写没挡是最危险的漏法）
  const writeAsUser = await api(BASE, 'PATCH', '/api/admin/users', {
    token: userAcc.token, body: { id: userId, status: 2 }
  })
  check('普通用户封禁他人 → 401', writeAsUser.status === 401, `实际 ${writeAsUser.status}`)

  const roleAsUser = await api(BASE, 'PATCH', '/api/admin/users/role', {
    token: userAcc.token, body: { id: userId, role: 1 }
  })
  check('普通用户给自己提权 → 401', roleAsUser.status === 401, `实际 ${roleAsUser.status}`)

  // ---------- 2. 管理员可用的基本能力 ----------
  console.log('\n【2】管理员：能读、能管普通用户')
  const adminStats = await api(BASE, 'GET', '/api/admin/stats', { token: adminAcc.token })
  check('管理员 GET /api/admin/stats → 200', adminStats.status === 200, `实际 ${adminStats.status}`)

  const adminUsers = await api(BASE, 'GET', '/api/admin/users', { token: adminAcc.token })
  check('管理员 GET /api/admin/users → 200', adminUsers.status === 200, `实际 ${adminUsers.status}`)

  /*
   * ⚠️ 封禁/解封的**副作用**：封禁会 `DELETE FROM sessions`（立即踢下线），
   * 解封**不会**把会话还回来。所以这一步之后 `userAcc.token` 已经失效 ——
   * 后面凡是拿它调接口的地方都会 401，而那是**正确行为**，不是 bug。
   *
   * 为了不让这个副作用污染后续断言（尤其"被提权后立刻能进后台"那条），
   * 这里**另建一个普通用户**专门用来做封禁测试。
   */
  const banTarget = await createAccount(BASE, reader, { nick: `封禁目标${stamp.slice(-3)}` })
  /*
   * ⚠️ `setRoleDirect` 返回的是**内部 id**，而 `banTarget.user.id` 是**对外编号**
   * （`public_no`，如 10406）。管理端接口收的是内部 id —— 混用会得到 404
   * （"找不到这个用户"），而不是报错说"id 类型不对"。
   */
  const banTargetId = setRoleDirect(banTarget.email, 0)

  const banUser = await api(BASE, 'PATCH', '/api/admin/users', {
    token: adminAcc.token, body: { id: banTargetId, status: 2 }
  })
  check('🔴 管理员封禁普通用户 → 200（该通过的要通过）', banUser.status === 200, `实际 ${banUser.status}`)

  const bannedLogin = await api(BASE, 'GET', '/api/auth/me', { token: banTarget.token })
  check('🔴 被封禁者的会话**立即失效**（不是等他下次登录）', bannedLogin.status === 401, `实际 ${bannedLogin.status}`)

  const unbanUser = await api(BASE, 'PATCH', '/api/admin/users', {
    token: adminAcc.token, body: { id: banTargetId, status: 1 }
  })
  check('管理员解封普通用户 → 200', unbanUser.status === 200, `实际 ${unbanUser.status}`)

  // ---------- 3. 层级：管理员不能动同级与超管 ----------
  console.log('\n【3】🔴 层级校验：只能动角色严格低于自己的')
  const banSuper = await api(BASE, 'PATCH', '/api/admin/users', {
    token: adminAcc.token, body: { id: superId, status: 2 }
  })
  check('🔴 管理员封禁**超管** → 403', banSuper.status === 403, `实际 ${banSuper.status}`)

  const banPeer = await api(BASE, 'PATCH', '/api/admin/users', {
    token: adminAcc.token, body: { id: admin2Id, status: 2 }
  })
  check('🔴 管理员封禁**另一个管理员** → 403', banPeer.status === 403, `实际 ${banPeer.status}`)

  const delSuper = await api(BASE, 'DELETE', '/api/admin/users', {
    token: adminAcc.token, body: { id: superId }
  })
  check('🔴 管理员**彻底删除超管** → 403（最危险的一条）', delSuper.status === 403, `实际 ${delSuper.status}`)

  const delPeer = await api(BASE, 'DELETE', '/api/admin/users', {
    token: adminAcc.token, body: { id: admin2Id }
  })
  check('管理员彻底删除另一个管理员 → 403', delPeer.status === 403, `实际 ${delPeer.status}`)

  // ---------- 4. 谁都不能操作自己 ----------
  console.log('\n【4】🔴 谁都不能操作自己（防手滑自锁）')
  const selfBan = await api(BASE, 'PATCH', '/api/admin/users', {
    token: adminAcc.token, body: { id: adminId, status: 2 }
  })
  check('管理员封禁自己 → 403', selfBan.status === 403, `实际 ${selfBan.status}`)

  const selfDel = await api(BASE, 'DELETE', '/api/admin/users', {
    token: adminAcc.token, body: { id: adminId }
  })
  check('管理员删除自己 → 403', selfDel.status === 403, `实际 ${selfDel.status}`)

  const selfBanSuper = await api(BASE, 'PATCH', '/api/admin/users', {
    token: superAcc.token, body: { id: superId, status: 2 }
  })
  check('🔴 超管封禁自己 → 403（否则永久失去后台）', selfBanSuper.status === 403, `实际 ${selfBanSuper.status}`)

  // ---------- 5. 设/撤管理员：仅超管 ----------
  console.log('\n【5】🔴 设/撤管理员：仅超管可用')
  const adminSetRole = await api(BASE, 'PATCH', '/api/admin/users/role', {
    token: adminAcc.token, body: { id: userId, role: 1 }
  })
  check('🔴 管理员给自己人提权 → 403', adminSetRole.status === 403, `实际 ${adminSetRole.status}`)

  const adminSetSelf = await api(BASE, 'PATCH', '/api/admin/users/role', {
    token: adminAcc.token, body: { id: adminId, role: 2 }
  })
  check('管理员把自己提成超管 → 403', adminSetSelf.status === 403, `实际 ${adminSetSelf.status}`)

  const superPromote = await api(BASE, 'PATCH', '/api/admin/users/role', {
    token: superAcc.token, body: { id: userId, role: 1 }
  })
  check('🔴 超管把普通用户设为管理员 → 200', superPromote.status === 200, `实际 ${superPromote.status}`)

  // 验证真的生效（不只看状态码）
  const afterPromote = await api(BASE, 'GET', '/api/admin/users', { token: userAcc.token })
  check('🔴 被提权者**立刻**能进后台（会话无需重登）', afterPromote.status === 200, `实际 ${afterPromote.status}`)

  const superDemote = await api(BASE, 'PATCH', '/api/admin/users/role', {
    token: superAcc.token, body: { id: userId, role: 0 }
  })
  check('超管撤销管理员 → 200', superDemote.status === 200, `实际 ${superDemote.status}`)

  const afterDemote = await api(BASE, 'GET', '/api/admin/users', { token: userAcc.token })
  check('🔴 被降权者**立刻**失去后台（不靠重新登录）', afterDemote.status === 401, `实际 ${afterDemote.status}`)

  // ---------- 6. 接口不能造出超管 ----------
  console.log('\n【6】🔴 接口不能产生超管（只有数据库能）')
  const makeSuper = await api(BASE, 'PATCH', '/api/admin/users/role', {
    token: superAcc.token, body: { id: userId, role: 2 }
  })
  check('🔴 超管通过接口把别人设成超管 → 400（不允许）', makeSuper.status === 400, `实际 ${makeSuper.status}`)

  const badRole = await api(BASE, 'PATCH', '/api/admin/users/role', {
    token: superAcc.token, body: { id: userId, role: 99 }
  })
  check('非法角色值 → 400', badRole.status === 400, `实际 ${badRole.status}`)

  const superChangeSuper = await api(BASE, 'PATCH', '/api/admin/users/role', {
    token: superAcc.token, body: { id: adminId, role: 0 }
  })
  check('超管撤销**管理员** → 200（这是允许的方向）', superChangeSuper.status === 200, `实际 ${superChangeSuper.status}`)
  // 复原，避免影响后续断言
  await api(BASE, 'PATCH', '/api/admin/users/role', { token: superAcc.token, body: { id: adminId, role: 1 } })

  // ---------- 7. 审计：只给超管看，且动作被记下 ----------
  console.log('\n【7】审计日志')
  const auditAsAdmin = await api(BASE, 'GET', '/api/admin/audit', { token: adminAcc.token })
  check('🔴 普通管理员读审计 → 403（不让他盯同级）', auditAsAdmin.status === 403, `实际 ${auditAsAdmin.status}`)

  const auditAsSuper = await api(BASE, 'GET', '/api/admin/audit', { token: superAcc.token })
  check('超管读审计 → 200', auditAsSuper.status === 200, `实际 ${auditAsSuper.status}`)

  const entries = auditAsSuper.json?.entries || []
  const actions = entries.map((e) => e.action)
  check('审计里记下了封禁（ban）', actions.includes('ban'), actions.slice(0, 8).join(','))
  check('审计里记下了改角色（role_set）', actions.includes('role_set'), actions.slice(0, 8).join(','))
  check('审计条目带操作者昵称与角色快照', entries.every((e) => e.actorNick && typeof e.actorRole === 'number'))

  // 越权尝试**不该**留下"成功"的审计 —— 失败的操作不是操作
  const forbiddenEntry = entries.find((e) => e.detail && String(e.detail).includes('超管') && e.action === 'ban')
  check('🔴 被拒绝的越权操作没有写进审计（没发生的事不该记）', !forbiddenEntry)

  // ---------- 8. 页面类型筛选 ----------
  console.log('\n【8】评论按页面类型筛选')
  await api(BASE, 'POST', '/api/comments', {
    token: userAcc.token,
    body: { page: 'site:general', pageLabel: '站内讨论区', body: `讨论区留言${stamp}`, hp: '' }
  })
  await api(BASE, 'POST', '/api/comments', {
    token: userAcc.token,
    body: { page: 'item:30047', pageLabel: '某物品', body: `物品页留言${stamp}`, hp: '' }
  })

  const siteOnly = await api(BASE, 'GET', '/api/admin/comments?pageKind=site&status=1&limit=50', { token: superAcc.token })
  const siteKeys = (siteOnly.json?.comments || []).map((c) => c.pageKey)
  check(
    'pageKind=site 只返回站内讨论区',
    siteOnly.status === 200 && siteKeys.length > 0 && siteKeys.every((k) => k === 'site:general'),
    siteKeys.slice(0, 4).join(',')
  )

  const itemOnly = await api(BASE, 'GET', '/api/admin/comments?pageKind=item&status=1&limit=50', { token: superAcc.token })
  const itemKeys = (itemOnly.json?.comments || []).map((c) => c.pageKey)
  check(
    'pageKind=item 只返回 item: 开头的',
    itemOnly.status === 200 && itemKeys.every((k) => String(k).startsWith('item:')),
    itemKeys.slice(0, 4).join(',')
  )

  const badKind = await api(BASE, 'GET', '/api/admin/comments?pageKind=__nope__&status=1&limit=5', { token: superAcc.token })
  check('未知 pageKind 按"不筛"处理（不报错）', badKind.status === 200, `实际 ${badKind.status}`)

  // ---------- 9. 用户列表返回 role ----------
  console.log('\n【9】用户列表带 role 字段')
  const list = await api(BASE, 'GET', '/api/admin/users?limit=50', { token: superAcc.token })
  const rows = list.json?.users || []
  const superRow = rows.find((u) => u.id === superId)
  const adminRow = rows.find((u) => u.id === adminId)
  check('列表里超管的 role = 2', superRow?.role === 2, String(superRow?.role))
  check('列表里管理员的 role = 1', adminRow?.role === 1, String(adminRow?.role))
  check('role 字段在所有行都存在', rows.every((u) => typeof u.role === 'number'))
} finally {
  reader.close()
}

console.log('\n' + '─'.repeat(56))
console.log(`结果：通过 ${pass} / 失败 ${fail}`)
if (failures.length) {
  console.log('失败项：')
  failures.forEach((f) => console.log('  · ' + f))
}
process.exit(fail === 0 ? 0 : 1)

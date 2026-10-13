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

  /*
   * 【权限探活】`/api/admin/ping` —— 闸门专用，服务端**零额外查询**。
   *
   * 背景：后台权限闸门原先靠调 `stats` 判断"能不能进后台"，而 stats 为渲染
   * 概览要跑 9 条聚合查询（含多次全表扫，实测约 2.4 万行读/次）。
   * D1 按 rows read 计费 —— 每次进后台都用整屏指标换一个布尔值是纯浪费。
   *
   * 这里守两件事：
   *   ① 鉴权口径与其它管理接口**一致**（未登录/普通用户 401，管理员 200）；
   *   ② 返回体**只有 ok 与 role**，不带任何统计数字（它是验伪，不是数据接口）。
   *      —— 防止后来有人图省事把 stats 的内容塞进去，把"省额度"改回去。
   */
  const pingAnon = await api(BASE, 'GET', '/api/admin/ping')
  check('未登录 GET /api/admin/ping → 401', pingAnon.status === 401, `实际 ${pingAnon.status}`)
  const pingAsUser = await api(BASE, 'GET', '/api/admin/ping', { token: userAcc.token })
  check('普通用户 GET /api/admin/ping → 401', pingAsUser.status === 401, `实际 ${pingAsUser.status}`)
  const pingAsAdmin = await api(BASE, 'GET', '/api/admin/ping', { token: adminAcc.token })
  check('管理员 GET /api/admin/ping → 200', pingAsAdmin.status === 200, `实际 ${pingAsAdmin.status}`)
  check('ping 返回 ok=true', pingAsAdmin.json?.ok === true, JSON.stringify(pingAsAdmin.json))
  check(
    '🔴 ping 只回 role，不带任何统计字段（否则等于把 stats 的额度浪费捡回来）',
    pingAsAdmin.json && Object.keys(pingAsAdmin.json).sort().join(',') === 'ok,role',
    `实际字段 ${JSON.stringify(Object.keys(pingAsAdmin.json || {}))}`
  )
  console.log(`  · ping 成功响应体：${JSON.stringify(pingAsAdmin.json)}`)

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

  // ---------- 9b. 只看管理员 ----------
  console.log('\n【9b】用户列表「只看管理员」筛选')
  const adminOnly = await api(BASE, 'GET', '/api/admin/users?role=admin&limit=100', { token: superAcc.token })
  const adminRows = adminOnly.json?.users || []
  check('role=admin → 200', adminOnly.status === 200, `实际 ${adminOnly.status}`)
  check('🔴 返回的**全部**是管理员（role >= 1）', adminRows.length > 0 && adminRows.every((u) => u.role >= 1),
    adminRows.filter((u) => u.role < 1).map((u) => u.role).join(','))
  check('🔴 我们刚建的超管在里面', adminRows.some((u) => u.id === superId))
  check('🔴 我们刚建的普通用户**不在**里面', !adminRows.some((u) => u.id === userId))

  /*
   * 🔴 证明这个筛选**不是空转**（筛了但没筛掉任何东西）。
   *
   * ⚠️ 不能拿"结果数 < 全部数"来比：两个查询都被 `limit=100` 截断
   *    （本地库里 status=1 的用户超过 1000），两边都返回 100，永远相等 ——
   *    那样写的断言**必然失败**（实测踩过），而且失败原因和功能无关。
   *
   * 改用**点名核对**：拿刚建的普通用户昵称当关键词，
   * 不筛角色时找得到他，加上 role=admin 就找不到。这个对比不受分页上限影响。
   */
  const nickProbe = userAcc.nick
  const byNickAll = await api(BASE, 'GET', `/api/admin/users?q=${encodeURIComponent(nickProbe)}&limit=100`, { token: superAcc.token })
  const byNickAdmin = await api(BASE, 'GET', `/api/admin/users?q=${encodeURIComponent(nickProbe)}&role=admin&limit=100`, { token: superAcc.token })
  check(
    '🔴 不筛角色时能搜到该普通用户（证明关键词有效）',
    (byNickAll.json?.users || []).some((u) => u.id === userId),
    nickProbe
  )
  check(
    '🔴 加 role=admin 后同一个关键词搜不到他（筛选真的生效了）',
    !(byNickAdmin.json?.users || []).some((u) => u.id === userId),
    JSON.stringify((byNickAdmin.json?.users || []).map((u) => u.role))
  )

  // 未知 role 值按"不筛"处理（与 pageKind 同一约定）
  const badRoleParam = await api(BASE, 'GET', '/api/admin/users?role=__nope__&limit=5', { token: superAcc.token })
  check('未知 role 值按"不筛"处理（不报错）', badRoleParam.status === 200, `实际 ${badRoleParam.status}`)

  // 普通管理员也能读（看同事名单不需要超管）
  const adminReads = await api(BASE, 'GET', '/api/admin/users?role=admin&limit=10', { token: adminAcc.token })
  check('普通管理员也能用该筛选（看同事名单不需要超管）', adminReads.status === 200, `实际 ${adminReads.status}`)

  // ---------- 10. 转待审原因（review_note） ----------
  console.log('\n【10】转待审原因')
  const noteBody = `待审备注${stamp}`
  const posted = await api(BASE, 'POST', '/api/comments', {
    token: userAcc.token,
    body: { page: 'site:general', pageLabel: '站内讨论区', body: noteBody, hp: '' }
  })
  const noteCommentId = posted.json?.comment?.id
  check('待测评论已发出', Boolean(noteCommentId), JSON.stringify(posted.json).slice(0, 80))

  /** 读回单条评论的管理端表示 */
  async function readAdminComment(id) {
    const r = await api(BASE, 'GET', `/api/admin/comments?q=${encodeURIComponent(noteBody)}&limit=50`, { token: superAcc.token })
    return (r.json?.comments || []).find((c) => c.id === id) || null
  }

  // (a) 带原因转待审
  const toPending = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { id: noteCommentId, status: 0, note: '重复发帖，等作者确认' }
  })
  check('带原因转待审 → 200', toPending.status === 200, `实际 ${toPending.status} ${toPending.text.slice(0, 60)}`)
  const afterPending = await readAdminComment(noteCommentId)
  check('🔴 列表返回 reviewNote', afterPending?.reviewNote === '重复发帖，等作者确认', String(afterPending?.reviewNote))
  check('状态确实变成待审(0)', afterPending?.status === 0, String(afterPending?.status))

  /*
   * (b) 放行后原因**必须被清空**（状态已定论，留着旧备注会误导后来人）。
   *
   * 🔴 这里**故意连 note 一起传**：只传 `status=1` 的话，`normalizeReviewNote(undefined)`
   *    本来就返回 null，清不清空看起来一样 —— 那样这条测试是**弱测试**，
   *    反向验证时不会翻红（实测踩过）。带上 note 才能真正守住"放行时忽略备注"。
   */
  await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { id: noteCommentId, status: 1, note: '这条备注不该被存下' }
  })
  const afterShow = await readAdminComment(noteCommentId)
  check('🔴 放行后 reviewNote 被清空（即便请求里带了 note）', afterShow?.reviewNote === null, String(afterShow?.reviewNote))

  // (c) 原因可留空
  const emptyNote = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { id: noteCommentId, status: 0 }
  })
  const afterEmpty = await readAdminComment(noteCommentId)
  check('不传 note 也能转待审（可空）', emptyNote.status === 200 && afterEmpty?.reviewNote === null, String(afterEmpty?.reviewNote))

  // (d) 纯空白视同留空
  await api(BASE, 'PATCH', '/api/admin/comments', { token: superAcc.token, body: { id: noteCommentId, status: 0, note: '   ' } })
  const afterBlank = await readAdminComment(noteCommentId)
  check('纯空白 note 存成 NULL（不是空串）', afterBlank?.reviewNote === null, JSON.stringify(afterBlank?.reviewNote))

  // (e) 超长被拒
  const tooLong = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { id: noteCommentId, status: 0, note: 'x'.repeat(81) }
  })
  check('🔴 超长 note → 400', tooLong.status === 400, `实际 ${tooLong.status}`)

  // (f) 换行折成空格（它是一行短备注，不是第二段正文）
  await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { id: noteCommentId, status: 0, note: '第一行\n第二行' }
  })
  const afterNewline = await readAdminComment(noteCommentId)
  check('note 里的换行折成空格', afterNewline?.reviewNote === '第一行 第二行', JSON.stringify(afterNewline?.reviewNote))

  /*
   * (g) 🔴 最重要的一条：原因**绝不能泄漏给访客**。
   *     它是内部说明，作者/其他人从公开接口看到就等于把审核标准公开了。
   */
  await api(BASE, 'PATCH', '/api/admin/comments', { token: superAcc.token, body: { id: noteCommentId, status: 1 } })
  const publicView = await api(BASE, 'GET', `/api/comments?page=site:general&limit=50`)
  const publicRow = (publicView.json?.comments || []).find((c) => c.id === noteCommentId)
  check(
    '🔴 公开接口不含 reviewNote 字段',
    publicRow !== undefined && !('reviewNote' in publicRow),
    publicRow ? Object.keys(publicRow).join(',') : '未找到该评论'
  )

  // ---------- 11. 转待审常用选项 ----------
  console.log('\n【11】转待审常用选项')
  const presetsRead = await api(BASE, 'GET', '/api/admin/review-presets', { token: adminAcc.token })
  check('🔴 普通管理员**能读**常用选项（转待审要用）', presetsRead.status === 200, `实际 ${presetsRead.status}`)
  /*
   * ⚠️ 这里**不断言具体条数**：这份清单是可编辑的，跑到这一步时可能已被
   *    别的测试或人工改动过（实测因此翻红过）。"播种了 4 条默认项"
   *    由 `tests/migration/rehearse.mjs` 在干净库上守 —— 那才是它该待的地方。
   *    这里只验"接口返回了结构正确的数组"。
   */
  check(
    '返回的是对象数组（每项有 text）',
    Array.isArray(presetsRead.json?.presets) &&
      (presetsRead.json.presets.length === 0 || typeof presetsRead.json.presets[0]?.text === 'string'),
    JSON.stringify(presetsRead.json?.presets).slice(0, 80)
  )

  // 🔴 写操作只有超管能做
  const asAdmin = await api(BASE, 'PUT', '/api/admin/review-presets', {
    token: adminAcc.token,
    body: { presets: ['管理员不该能改'] }
  })
  check('🔴 普通管理员 PUT → 403', asAdmin.status === 403, `实际 ${asAdmin.status}`)

  const asUser = await api(BASE, 'PUT', '/api/admin/review-presets', {
    token: userAcc.token,
    body: { presets: ['普通用户更不该能改'] }
  })
  check('🔴 普通用户 PUT → 401', asUser.status === 401, `实际 ${asUser.status}`)

  // 超管整表替换
  const mine = [`重复发帖${stamp}`, `与主题无关${stamp}`, `外链待确认${stamp}`]
  const put = await api(BASE, 'PUT', '/api/admin/review-presets', { token: superAcc.token, body: { presets: mine } })
  check('超管 PUT → 200', put.status === 200, `实际 ${put.status} ${put.text.slice(0, 60)}`)

  const afterPut = await api(BASE, 'GET', '/api/admin/review-presets', { token: superAcc.token })
  const texts = (afterPut.json?.presets || []).map((p) => p.text)
  check('🔴 整表替换生效且顺序保持', JSON.stringify(texts) === JSON.stringify(mine), JSON.stringify(texts))

  // 空白行被丢弃、重复项被去重
  const messy = await api(BASE, 'PUT', '/api/admin/review-presets', {
    token: superAcc.token,
    body: { presets: [`  保留${stamp}  `, '', '   ', `保留${stamp}`, `第二条${stamp}`] }
  })
  check('空白项被丢弃', messy.status === 200, `实际 ${messy.status}`)
  const messyTexts = (messy.json?.presets || []).map((p) => p.text)
  check(
    '🔴 重复项去重 + 首尾空白清理',
    JSON.stringify(messyTexts) === JSON.stringify([`保留${stamp}`, `第二条${stamp}`]),
    JSON.stringify(messyTexts)
  )

  // 超长被拒
  const longPreset = await api(BASE, 'PUT', '/api/admin/review-presets', {
    token: superAcc.token,
    body: { presets: ['x'.repeat(81)] }
  })
  check('🔴 超长项 → 400', longPreset.status === 400, `实际 ${longPreset.status}`)

  // 条数上限
  const tooMany = await api(BASE, 'PUT', '/api/admin/review-presets', {
    token: superAcc.token,
    body: { presets: Array.from({ length: 21 }, (_, i) => `第${i}项${stamp}`) }
  })
  check('🔴 超过 20 条 → 400', tooMany.status === 400, `实际 ${tooMany.status}`)

  // 传 [] 合法（= 只用自由输入）
  const cleared = await api(BASE, 'PUT', '/api/admin/review-presets', { token: superAcc.token, body: { presets: [] } })
  const afterClear = await api(BASE, 'GET', '/api/admin/review-presets', { token: superAcc.token })
  check('🔴 传 [] 合法且清空', cleared.status === 200 && (afterClear.json?.presets || []).length === 0,
    JSON.stringify(afterClear.json?.presets))

  // 非数组被拒
  const notArray = await api(BASE, 'PUT', '/api/admin/review-presets', {
    token: superAcc.token,
    body: { presets: '不是数组' }
  })
  check('presets 非数组 → 400', notArray.status === 400, `实际 ${notArray.status}`)

  // 改常用选项要进审计（谁改的、改成了什么）
  const auditAfter = await api(BASE, 'GET', '/api/admin/audit?limit=50', { token: superAcc.token })
  const presetEntry = (auditAfter.json?.entries || []).find((e) => e.action === 'review_presets_set')
  check('🔴 改常用选项写进了审计', Boolean(presetEntry), '未找到 review_presets_set 条目')

  // 复原成默认 4 条，别把本地环境留在清空状态
  await api(BASE, 'PUT', '/api/admin/review-presets', {
    token: superAcc.token,
    body: { presets: ['重复发帖', '与主题无关', '外链待确认', '需要更多上下文'] }
  })

  // ---------- 12. 批量改状态 ----------
  console.log('\n【12】批量改状态')
  const batchTag = `批量${stamp}`
  const batchIds = []
  for (let i = 0; i < 4; i++) {
    const r = await api(BASE, 'POST', '/api/comments', {
      token: userAcc.token,
      body: { page: 'site:general', pageLabel: '站内讨论区', body: `${batchTag}-${i}`, hp: '' }
    })
    batchIds.push(r.json?.comment?.id)
  }
  check('造出 4 条待批量评论', batchIds.every(Boolean), JSON.stringify(batchIds))

  async function statusesOf(ids) {
    const r = await api(BASE, 'GET', `/api/admin/comments?q=${encodeURIComponent(batchTag)}&limit=50`, { token: superAcc.token })
    const map = new Map((r.json?.comments || []).map((c) => [c.id, c]))
    return ids.map((id) => map.get(id) || null)
  }

  // (a) 批量隐藏
  const batchHide = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { ids: batchIds, status: 2 }
  })
  check('批量隐藏 → 200', batchHide.status === 200, `实际 ${batchHide.status} ${batchHide.text.slice(0, 60)}`)
  check('🔴 返回 changed = 4', batchHide.json?.changed === 4, String(batchHide.json?.changed))
  let rowsNow = await statusesOf(batchIds)
  check('🔴 4 条状态全部变成已隐藏(2)', rowsNow.every((c) => c?.status === 2), JSON.stringify(rowsNow.map((c) => c?.status)))

  // 隐藏时不该留下待审原因
  check('🔴 批量隐藏后 reviewNote 为空', rowsNow.every((c) => c?.reviewNote === null))

  // (b) 批量转待审 + 统一原因
  const batchNote = `批量打回${stamp}`
  const batchPending = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { ids: batchIds, status: 0, note: batchNote }
  })
  check('批量转待审 → 200', batchPending.status === 200, `实际 ${batchPending.status}`)
  rowsNow = await statusesOf(batchIds)
  check('🔴 4 条都变成待审(0)', rowsNow.every((c) => c?.status === 0), JSON.stringify(rowsNow.map((c) => c?.status)))
  check('🔴 原因对整批生效', rowsNow.every((c) => c?.reviewNote === batchNote), JSON.stringify(rowsNow.map((c) => c?.reviewNote)))

  // (c) 批量放行
  const batchShow = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { ids: batchIds, status: 1 }
  })
  check('批量放行 → 200', batchShow.status === 200, `实际 ${batchShow.status}`)
  rowsNow = await statusesOf(batchIds)
  check('🔴 4 条都变成已显示(1)', rowsNow.every((c) => c?.status === 1), JSON.stringify(rowsNow.map((c) => c?.status)))

  // (d) 不存在的 id 被跳过并回报，而不是整个批次失败
  const mixed = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { ids: [...batchIds, 99999999], status: 2 }
  })
  check('🔴 含不存在的 id 仍成功', mixed.status === 200, `实际 ${mixed.status}`)
  check('🔴 changed=4 且 missing 回报了那条', mixed.json?.changed === 4 && (mixed.json?.missing || []).includes(99999999),
    JSON.stringify({ changed: mixed.json?.changed, missing: mixed.json?.missing }))

  // 全员不存在 → 404（与单条行为一致）
  const allMissing = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { ids: [99999998, 99999997], status: 1 }
  })
  check('全部 id 都不存在 → 404', allMissing.status === 404, `实际 ${allMissing.status}`)

  // (e) 空数组 / 非法 status → 400
  const emptyIds = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { ids: [], status: 1 }
  })
  check('id 列表为空 → 400', emptyIds.status === 400, `实际 ${emptyIds.status}`)
  const badStatus2 = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { ids: batchIds, status: 9 }
  })
  check('status 非法 → 400', badStatus2.status === 400, `实际 ${badStatus2.status}`)

  // (f) 🔴 批量上限：101 条被拒（防手滑全选）
  const overBatchCap = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { ids: Array.from({ length: 101 }, (_, i) => 90000000 + i), status: 2 }
  })
  check('🔴 一次 101 条 → 400（防手滑）', overBatchCap.status === 400, `实际 ${overBatchCap.status}`)

  /*
   * (g) 🔴 重复 id 去重。
   *
   * ⚠️ 不能拿 `changed` 来验：SQL 的 `IN (...)` 本身就隐式去重，
   *    去不去重 `changed` 都是 2 —— 那样写是**弱测试**，反向验证时不会翻红（实测踩过）。
   *
   * 去重真正起作用的地方有**两处**，分别用它们来验：
   *   ① `missing` 列表：重复的不存在 id 只该上报一次；
   *   ② 上限判定：去重发生在**计数之前**，所以"同一个 id 发 150 遍"应当通过
   *      （只有 1 个唯一目标），而不是撞上 100 条上限。
   */
  const dupMissing = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    // 必须**混一条存在的**：全部不存在会走 404 早退，根本不会返回 missing 列表
    body: { ids: [batchIds[0], 90000111, 90000111, 90000111], status: 1 }
  })
  check(
    '🔴 重复的不存在 id 在 missing 里只出现一次（去重生效）',
    dupMissing.status === 200 && dupMissing.json?.missing?.length === 1,
    `status=${dupMissing.status} missing=${JSON.stringify(dupMissing.json?.missing)}`
  )

  // 150 个**相同** id → 唯一目标只有 1 个，不该触发 100 条上限
  const manyDup = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { ids: Array.from({ length: 150 }, () => batchIds[0]), status: 1 }
  })
  check(
    '🔴 去重发生在计数之前（150 个相同 id → 不算超限）',
    manyDup.status === 200 && manyDup.json?.changed === 1,
    `实际 ${manyDup.status} changed=${manyDup.json?.changed}`
  )

  // (h) 🔴 批量也逐条写审计（能在账本里按单条追）
  const auditBatch = await api(BASE, 'GET', '/api/admin/audit?limit=100', { token: superAcc.token })
  const hideEntries = (auditBatch.json?.entries || []).filter(
    (e) => e.action === 'comment_hide' && batchIds.includes(e.targetId)
  )
  check(
    '🔴 批量为每条评论各写一条审计（不是一条摘要）',
    hideEntries.length >= 4,
    `找到 ${hideEntries.length} 条（预期 >= 4）`
  )

  // (i) 旧形态（单条 `id`）仍然可用 —— 批量改动不能把老调用打断
  const singleLegacy = await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { id: batchIds[0], status: 1 }
  })
  check('🔴 单条 id 形态仍然可用（向后兼容）', singleLegacy.status === 200, `实际 ${singleLegacy.status}`)

  // ---------- 13. 审核词表（超管可维护） ----------
  console.log('\n【13】审核词表超管可维护')
  const kwRead = await api(BASE, 'GET', '/api/admin/review-keywords', { token: adminAcc.token })
  check('🔴 普通管理员**能读**词表总览', kwRead.status === 200, `实际 ${kwRead.status}`)
  check(
    '返回内置类别（基线在代码里）',
    (kwRead.json?.categories || []).some((c) => c.name === '赌博' && c.baseline === true),
    JSON.stringify((kwRead.json?.categories || []).map((c) => c.name))
  )
  /*
   * 🔴 内置词**必须一并返回**。
   *
   * 只回"自定义 N 条"会让管理员以为类别是空的、以为必须自己加词
   * （用户实际就这么反馈过）。下面两条同时守住"合并后的违禁品含原违禁药的词"。
   */
  const gamblingCat = (kwRead.json?.categories || []).find((c) => c.name === '赌博')
  check(
    '🔴 每个内置类别都带 baselineWords（界面要展示内置词）',
    Array.isArray(gamblingCat?.baselineWords) && gamblingCat.baselineWords.includes('赌博'),
    JSON.stringify(gamblingCat?.baselineWords || []).slice(0, 80)
  )
  const bannedCat = (kwRead.json?.categories || []).find((c) => c.name === '违禁品')
  check(
    '🔴 违禁品已合并原违禁药的词（大麻 / 伟哥 / 毒品）',
    ['大麻', '伟哥', '毒品', '催情'].every((w) => (bannedCat?.baselineWords || []).includes(w)),
    JSON.stringify(bannedCat?.baselineWords || []).slice(0, 140)
  )
  check(
    '🔴 「违禁药」不再单独成类（已并入违禁品）',
    !(kwRead.json?.categories || []).some((c) => c.name === '违禁药'),
    JSON.stringify((kwRead.json?.categories || []).map((c) => c.name))
  )
  check('返回结构性规则说明（只读）', (kwRead.json?.structural || []).length >= 2)

  const kwAsAdmin = await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: adminAcc.token,
    body: { keywords: [{ text: '管理员不该能加', category: '赌博' }], disabled: [] }
  })
  check('🔴 普通管理员 PUT 词表 → 403', kwAsAdmin.status === 403, `实际 ${kwAsAdmin.status}`)

  const kwAsUser = await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: userAcc.token,
    body: { keywords: [], disabled: [] }
  })
  check('🔴 普通用户 PUT 词表 → 401', kwAsUser.status === 401, `实际 ${kwAsUser.status}`)

  // 🔴 核心：自定义词**真的会拦评论**（不只是存起来）
  const kwWord = `深渊绝密${stamp}`
  const kwPut = await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [{ text: kwWord, category: '赌博' }], disabled: [] }
  })
  check('超管 PUT 词表 → 200', kwPut.status === 200, `实际 ${kwPut.status} ${kwPut.text.slice(0, 60)}`)

  /*
   * ⚠️ 缓存 30 秒才过期，但 PUT 会清本实例缓存 —— 同一个 wrangler 实例应当**立刻生效**。
   * 这条同时验证了"改的人自己立刻看到效果"这个设计目标。
   */
  const hitComment = await api(BASE, 'POST', '/api/comments', {
    token: userAcc.token,
    body: { page: 'site:general', pageLabel: '站内讨论区', body: `这里提到${kwWord}的内容`, hp: '' }
  })
  /*
   * ⚠️ 发表评论成功是 **201 Created**，不是 200（见 `POST /api/comments` 的 `json(..., 201)`）。
   *    写成 200 会得到一条与功能无关的失败。
   */
  check('评论提交成功（进待审，不是被拒）', hitComment.status === 201, `实际 ${hitComment.status}`)
  check(
    '🔴 自定义词命中 → 自动进待审',
    hitComment.json?.pending === true,
    JSON.stringify({ pending: hitComment.json?.pending, notice: hitComment.json?.notice })
  )

  // 命中原因应当带上我们配的类别名
  const hitId = hitComment.json?.comment?.id
  const hitRow = await api(BASE, 'GET', `/api/admin/comments?q=${encodeURIComponent(kwWord)}&limit=20`, { token: superAcc.token })
  const hitCommentRow = (hitRow.json?.comments || []).find((c) => c.id === hitId)
  check(
    '🔴 命中原因是自定义词所属的类别',
    String(hitCommentRow?.reviewReason || '').includes('赌博'),
    String(hitCommentRow?.reviewReason)
  )

  // 干净评论仍然正常放行（自定义词没把一切都拦下）
  const cleanComment = await api(BASE, 'POST', '/api/comments', {
    token: userAcc.token,
    body: { page: 'site:general', pageLabel: '站内讨论区', body: `完全正常的图鉴讨论${stamp}`, hp: '' }
  })
  check('🔴 干净评论不误伤（不会因为词表存在就全进待审）', cleanComment.json?.pending === false,
    JSON.stringify({ pending: cleanComment.json?.pending }))

  // 🔴 停用类别 → 该类别的内置词与自定义词一起失效
  await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [{ text: kwWord, category: '赌博' }], disabled: ['赌博'] }
  })
  const afterDisable = await api(BASE, 'POST', '/api/comments', {
    token: userAcc.token,
    body: { page: 'site:general', pageLabel: '站内讨论区', body: `停用后再提${kwWord}`, hp: '' }
  })
  check(
    '🔴 停用「赌博」后自定义词不再命中',
    afterDisable.json?.pending === false,
    JSON.stringify({ pending: afterDisable.json?.pending })
  )

  // 复原：清空自定义词、不停用任何类别（别把环境留在改变状态）
  await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [], disabled: [] }
  })
  const restored = await api(BASE, 'GET', '/api/admin/review-keywords', { token: superAcc.token })
  check('词表已复原为空', (restored.json?.keywords || []).length === 0)

  // 校验：超长 / 超量 / 非数组
  const kwTooLong = await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [{ text: 'x'.repeat(31), category: '赌博' }], disabled: [] }
  })
  check('🔴 关键词超长 → 400', kwTooLong.status === 400, `实际 ${kwTooLong.status}`)

  const kwBadShape = await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: '不是数组', disabled: [] }
  })
  check('keywords 非数组 → 400', kwBadShape.status === 400, `实际 ${kwBadShape.status}`)

  const kwNoDisabled = await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [] }
  })
  check('缺 disabled 数组 → 400', kwNoDisabled.status === 400, `实际 ${kwNoDisabled.status}`)

  /*
   * 🔴 `disabled` 必须与 `keywords` **同等校验**（长度 + 条数）。
   *
   * 代码审查时发现的真实缺口：原先只过滤空串，而 `keywords` 是校验的。
   * 后果不是注入（值都走 bind），而是**库里存垃圾** ——
   * 永远匹配不到类别的停用行，还会被 loadReviewOverlay 每次读出来。
   */
  const disabledTooLong = await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [], disabled: ['x'.repeat(31)] }
  })
  check('🔴 disabled 含超长类别名 → 400', disabledTooLong.status === 400, `实际 ${disabledTooLong.status}`)

  const disabledTooMany = await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [], disabled: Array.from({ length: 301 }, (_, i) => `c${i}`) }
  })
  check('🔴 disabled 超量 → 400', disabledTooMany.status === 400, `实际 ${disabledTooMany.status}`)

  const disabledBoundary = await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [], disabled: ['y'.repeat(30)] }
  })
  check('disabled 边界长度 30 → 通过', disabledBoundary.status === 200, `实际 ${disabledBoundary.status}`)

  // 重复项去重（不该往库里塞同样三行）
  await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [], disabled: ['赌博', '赌博', '赌博'] }
  })
  const dupFlags = await api(BASE, 'GET', '/api/admin/review-keywords', { token: superAcc.token })
  const gambleCat = (dupFlags.json?.categories || []).find((c) => c.name === '赌博')
  check('🔴 重复停用只生效一次', gambleCat?.disabled === true, JSON.stringify(gambleCat))
  await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [], disabled: [] }
  })

  // 词表改动要进审计
  await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [{ text: '审计探针词', category: '测试' }], disabled: ['引流'] }
  })
  const kwAudit = await api(BASE, 'GET', '/api/admin/audit?limit=50', { token: superAcc.token })
  const kwEntry = (kwAudit.json?.entries || []).find((e) => e.action === 'review_keywords_set')
  check('🔴 改词表写进了审计', Boolean(kwEntry), '未找到 review_keywords_set')
  await api(BASE, 'PUT', '/api/admin/review-keywords', {
    token: superAcc.token,
    body: { keywords: [], disabled: [] }
  })

  // ---------- 14. 按命中原因 / 人工备注筛 ----------
  console.log('\n【14】评论按命中原因与人工备注筛')
  const reasonTag = `原因筛选${stamp}`
  // 造一条命中「外链」的评论（结构性规则，稳定可预期）
  const linkComment = await api(BASE, 'POST', '/api/comments', {
    token: userAcc.token,
    body: { page: 'site:general', pageLabel: '站内讨论区', body: `${reasonTag} 看 https://example.com/x`, hp: '' }
  })
  const linkId = linkComment.json?.comment?.id
  check('造出一条命中外链的待审评论', Boolean(linkId) && linkComment.json?.pending === true,
    JSON.stringify({ id: linkId, pending: linkComment.json?.pending }))

  const byReason = await api(BASE, 'GET', '/api/admin/comments?reason=外链&limit=50', { token: superAcc.token })
  const reasonRows = byReason.json?.comments || []
  check('reason=外链 → 200', byReason.status === 200, `实际 ${byReason.status}`)
  check(
    '🔴 返回的每一条都含该命中原因',
    reasonRows.length > 0 && reasonRows.every((c) => String(c.reviewReason || '').includes('外链')),
    reasonRows.filter((c) => !String(c.reviewReason || '').includes('外链')).map((c) => c.reviewReason).join('|')
  )
  check('🔴 刚造的那条在里面', reasonRows.some((c) => c.id === linkId))

  const byAny = await api(BASE, 'GET', '/api/admin/comments?reason=any&limit=50', { token: superAcc.token })
  const anyRows = byAny.json?.comments || []
  check(
    '🔴 reason=any 只返回**有**命中原因的',
    anyRows.length > 0 && anyRows.every((c) => c.reviewReason),
    `共 ${anyRows.length} 条`
  )

  // 人工备注筛：先把某条打回待审并写备注
  await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { id: linkId, status: 0, note: `备注筛选探针${stamp}` }
  })
  const withNote = await api(BASE, 'GET', '/api/admin/comments?hasNote=1&q=' + encodeURIComponent(reasonTag) + '&limit=20', { token: superAcc.token })
  check(
    '🔴 hasNote=1 只返回有备注的',
    (withNote.json?.comments || []).length > 0 && (withNote.json?.comments || []).every((c) => c.reviewNote),
    JSON.stringify((withNote.json?.comments || []).map((c) => c.reviewNote))
  )
  const noNote = await api(BASE, 'GET', '/api/admin/comments?hasNote=0&q=' + encodeURIComponent(reasonTag) + '&limit=20', { token: superAcc.token })
  check(
    '🔴 hasNote=0 只返回没备注的',
    (noNote.json?.comments || []).every((c) => !c.reviewNote),
    JSON.stringify((noNote.json?.comments || []).map((c) => c.reviewNote))
  )

  // 未知 reason 不报错（子串匹配，匹配不到就是空）
  const badReason = await api(BASE, 'GET', '/api/admin/comments?reason=__nope__&limit=5', { token: superAcc.token })
  check('未知 reason 不报错（只是筛不出）', badReason.status === 200, `实际 ${badReason.status}`)

  // ---------- 15. 封禁理由 ----------
  console.log('\n【15】封禁理由')
  const banAcc = await createAccount(BASE, reader, { nick: `待封${stamp.slice(-4)}` })
  const banId = setRoleDirect(banAcc.email, 0)

  /** 读回该用户在管理端列表里的表示 */
  async function readAdminUser(id) {
    const r = await api(BASE, 'GET', `/api/admin/users?q=${encodeURIComponent(banAcc.nick)}&limit=50`, { token: superAcc.token })
    return (r.json?.users || []).find((u) => u.id === id) || null
  }

  // (a) 带理由封禁
  const banNote = `连续发广告${stamp}`
  const banRes = await api(BASE, 'PATCH', '/api/admin/users', {
    token: superAcc.token,
    body: { id: banId, status: 2, note: banNote }
  })
  check('带理由封禁 → 200', banRes.status === 200, `实际 ${banRes.status} ${banRes.text.slice(0, 60)}`)
  let banRow = await readAdminUser(banId)
  check('🔴 列表返回 banNote', banRow?.banNote === banNote, String(banRow?.banNote))
  check('状态确实变成已停用(2)', banRow?.status === 2, String(banRow?.status))

  // (b) 封禁必须踢掉现有会话（这是既有关键行为，加理由不能破坏它）
  const afterBan = await api(BASE, 'GET', '/api/auth/me', { token: banAcc.token })
  check('🔴 封禁后原会话立即失效', afterBan.status === 401, `实际 ${afterBan.status}`)

  // (c) 解封后理由**必须清空**（状态已定论，留着旧理由会误导后来人）
  await api(BASE, 'PATCH', '/api/admin/users', {
    token: superAcc.token,
    // 故意连 note 一起传：不传的话 normalizeReviewNote(undefined) 本来就返回 null，
    // 那条断言是弱测试（与评论 review_note 踩过同一个坑）
    body: { id: banId, status: 1, note: '这条理由不该被存下' }
  })
  banRow = await readAdminUser(banId)
  check('🔴 解封后 banNote 被清空（即便请求里带了）', banRow?.banNote === null, String(banRow?.banNote))

  // (d) 理由可留空
  await api(BASE, 'PATCH', '/api/admin/users', { token: superAcc.token, body: { id: banId, status: 2 } })
  banRow = await readAdminUser(banId)
  check('不传 note 也能封禁（可空）', banRow?.status === 2 && banRow?.banNote === null, JSON.stringify({ s: banRow?.status, n: banRow?.banNote }))

  // (e) 纯空白视同留空
  await api(BASE, 'PATCH', '/api/admin/users', { token: superAcc.token, body: { id: banId, status: 2, note: '   \n  ' } })
  banRow = await readAdminUser(banId)
  check('纯空白理由存成 NULL', banRow?.banNote === null, JSON.stringify(banRow?.banNote))

  // (f) 超长被拒
  const longBan = await api(BASE, 'PATCH', '/api/admin/users', {
    token: superAcc.token,
    body: { id: banId, status: 2, note: 'x'.repeat(81) }
  })
  check('🔴 超长理由 → 400', longBan.status === 400, `实际 ${longBan.status}`)

  // (g) 换行折成空格
  await api(BASE, 'PATCH', '/api/admin/users', {
    token: superAcc.token,
    body: { id: banId, status: 2, note: '第一行\n第二行' }
  })
  banRow = await readAdminUser(banId)
  check('理由里的换行折成空格', banRow?.banNote === '第一行 第二行', JSON.stringify(banRow?.banNote))

  // (h) 🔴 理由**绝不能泄漏给用户本人**
  await api(BASE, 'PATCH', '/api/admin/users', { token: superAcc.token, body: { id: banId, status: 1 } })
  const other = await createAccount(BASE, reader, { nick: `旁观${stamp.slice(-4)}` })
  const meRes = await api(BASE, 'GET', '/api/auth/me', { token: other.token })
  check('🔴 /api/auth/me 不含 banNote 字段', meRes.status === 200 && !('banNote' in (meRes.json?.user || {})),
    Object.keys(meRes.json?.user || {}).join(','))

  // (i) 封禁理由进审计
  await api(BASE, 'PATCH', '/api/admin/users', {
    token: superAcc.token,
    body: { id: banId, status: 2, note: `审计探针${stamp}` }
  })
  const banAudit = await api(BASE, 'GET', '/api/admin/audit?limit=50', { token: superAcc.token })
  const banEntry = (banAudit.json?.entries || []).find(
    (e) => e.action === 'ban' && e.targetId === banId && String(e.detail || '').includes(`审计探针${stamp}`)
  )
  check('🔴 封禁理由写进了审计 detail', Boolean(banEntry), '未找到带理由的 ban 条目')

  // 复原：解封（把理由清掉，别留脏状态）
  await api(BASE, 'PATCH', '/api/admin/users', { token: superAcc.token, body: { id: banId, status: 1 } })

  // ---------- 16. 评论被处理 → 通知作者 ----------
  console.log('\n【16】评论被处理通知（未读数）')
  const authorAcc = await createAccount(BASE, reader, { nick: `作者${stamp.slice(-4)}` })
  const authorId = setRoleDirect(authorAcc.email, 0)

  /** 读该账号的「我的评论」未读数 */
  async function moderatedUnreadOf(acc) {
    const r = await api(BASE, 'GET', '/api/auth/comments?limit=1', { token: acc.token })
    return r.json?.moderatedUnread ?? null
  }

  // 先清零基准（新账号本来就是 0，这里显式确认）
  check('新账号未读数初始为 0', (await moderatedUnreadOf(authorAcc)) === 0, String(await moderatedUnreadOf(authorAcc)))

  // 作者发一条评论
  const noticeTag = `通知${stamp}`
  const posted2 = await api(BASE, 'POST', '/api/comments', {
    token: authorAcc.token,
    body: { page: 'site:general', pageLabel: '站内讨论区', body: `${noticeTag} 我的评论`, hp: '' }
  })
  const noticeCommentId = posted2.json?.comment?.id
  check('作者发出一条评论', Boolean(noticeCommentId) && posted2.status === 201, String(posted2.status))

  // 未被处理时不该有未读
  check('🔴 未被处理时未读数为 0', (await moderatedUnreadOf(authorAcc)) === 0, String(await moderatedUnreadOf(authorAcc)))

  // 管理员隐藏 → 作者应当变成 1 条未读
  await api(BASE, 'PATCH', '/api/admin/comments', { token: superAcc.token, body: { id: noticeCommentId, status: 2 } })
  check('🔴 被隐藏后作者未读数 = 1', (await moderatedUnreadOf(authorAcc)) === 1, String(await moderatedUnreadOf(authorAcc)))

  // 作者点进「我的评论」→ 标已读
  const markRead = await api(BASE, 'POST', '/api/auth/comments/read', { token: authorAcc.token, body: {} })
  check('标记已读 → 200', markRead.status === 200, `实际 ${markRead.status}`)
  check('🔴 标记后未读数归零', (await moderatedUnreadOf(authorAcc)) === 0, String(await moderatedUnreadOf(authorAcc)))

  // 🔴 重复提交同样状态不该再产生未读（否则会反复通知同一条）
  await api(BASE, 'PATCH', '/api/admin/comments', { token: superAcc.token, body: { id: noticeCommentId, status: 2 } })
  check(
    '🔴 重复隐藏同一状态不再产生未读（状态没真的变）',
    (await moderatedUnreadOf(authorAcc)) === 0,
    String(await moderatedUnreadOf(authorAcc))
  )

  // 状态真的再变一次 → 又该有未读
  await api(BASE, 'PATCH', '/api/admin/comments', { token: superAcc.token, body: { id: noticeCommentId, status: 1 } })
  check('🔴 放行（状态真变了）又产生未读', (await moderatedUnreadOf(authorAcc)) === 1, String(await moderatedUnreadOf(authorAcc)))

  /*
   * 🔴 **同一秒内**「标已读 → 又被处理」也必须产生未读。
   *
   * 这是秒级时间戳的经典边界：未读判定是 `moderated_at > moderation_read_at`。
   * 若标已读把基准就设成"当前那一秒"，同一秒发生的处理会满足
   * `moderated_at == read_at`（**不是** `>`）→ 通知被**静默吞掉**。
   * 真实后果：用户点开列表那一瞬间管理员处理了另一条，那条提醒永远不出现。
   *
   * 修法是基准退 1 秒。这条测试**不 sleep**，就是为了让两边落在同一秒 ——
   * 一 sleep 就测不到这个 bug 了（实测踩过）。
   */
  await api(BASE, 'POST', '/api/auth/comments/read', { token: authorAcc.token, body: {} })
  await api(BASE, 'PATCH', '/api/admin/comments', { token: superAcc.token, body: { id: noticeCommentId, status: 2 } })
  check(
    '🔴 同一秒内标已读后又被处理，仍能收到未读（秒级边界）',
    (await moderatedUnreadOf(authorAcc)) === 1,
    String(await moderatedUnreadOf(authorAcc))
  )
  await api(BASE, 'POST', '/api/auth/comments/read', { token: authorAcc.token, body: {} })

  /*
   * 批量处理也要能触发通知。
   *
   * 期望正好 **3**：未读用毫秒精度，上一步那条不会被"多算进来"。
   */
  const bulkIds = []
  for (let i = 0; i < 3; i++) {
    const r = await api(BASE, 'POST', '/api/comments', {
      token: authorAcc.token,
      body: { page: 'site:general', pageLabel: 'x', body: `${noticeTag} 批量${i}`, hp: '' }
    })
    bulkIds.push(r.json?.comment?.id)
  }
  await api(BASE, 'PATCH', '/api/admin/comments', { token: superAcc.token, body: { ids: bulkIds, status: 2 } })
  const afterBulk = await moderatedUnreadOf(authorAcc)
  check('🔴 批量处理 3 条 → 未读数 = 3', afterBulk === 3, String(afterBulk))

  // 🔴 最关键的一条：**别人**的处理不能算到该作者头上
  const bystander = await createAccount(BASE, reader, { nick: `无关${stamp.slice(-4)}` })
  const bystanderPost = await api(BASE, 'POST', '/api/comments', {
    token: bystander.token,
    body: { page: 'site:general', pageLabel: 'x', body: `${noticeTag} 别人的评论`, hp: '' }
  })
  await api(BASE, 'PATCH', '/api/admin/comments', {
    token: superAcc.token,
    body: { id: bystanderPost.json?.comment?.id, status: 2 }
  })
  const bystanderUnread = await moderatedUnreadOf(bystander)
  check('🔴 自己的评论被处理 → 该账号未读数 = 1', bystanderUnread === 1, String(bystanderUnread))
  check(
    '🔴 别人被处理**不会**算到该作者头上（仍是 3）',
    (await moderatedUnreadOf(authorAcc)) === 3,
    String(await moderatedUnreadOf(authorAcc))
  )

  // 未读数只在第一页算，翻页不该把它覆盖成 0
  const paged = await api(BASE, 'GET', '/api/auth/comments?limit=1&cursor=999999999', { token: authorAcc.token })
  check(
    '🔴 翻页请求不重算未读数（返回 0 而非真实值，前端只在第一页用它）',
    paged.json?.moderatedUnread === 0,
    String(paged.json?.moderatedUnread)
  )

  // 未登录/无令牌 → 401
  const noTok = await api(BASE, 'POST', '/api/auth/comments/read', { body: {} })
  check('无令牌标记已读 → 401', noTok.status === 401, `实际 ${noTok.status}`)

  // ---------- 17. 按 userId 只看某人的评论 ----------
  console.log('\n【17】只看某个账号的评论（用户列表点评论数进来）')
  const targetAcc = await createAccount(BASE, reader, { nick: `查询目标${stamp.slice(-4)}` })
  const targetId = setRoleDirect(targetAcc.email, 0)
  const otherAcc2 = await createAccount(BASE, reader, { nick: `查询他人${stamp.slice(-4)}` })
  const otherId = setRoleDirect(otherAcc2.email, 0)

  const mineTag = `目标评论${stamp}`
  const otherTag = `他人评论${stamp}`
  for (let i = 0; i < 2; i++) {
    await api(BASE, 'POST', '/api/comments', {
      token: targetAcc.token,
      body: { page: 'site:general', pageLabel: 'x', body: `${mineTag}-${i}`, hp: '' }
    })
  }
  await api(BASE, 'POST', '/api/comments', {
    token: otherAcc2.token,
    body: { page: 'site:general', pageLabel: 'x', body: otherTag, hp: '' }
  })

  const byUser = await api(BASE, 'GET', `/api/admin/comments?userId=${targetId}&limit=50`, { token: superAcc.token })
  const userRows = byUser.json?.comments || []
  check('userId 筛选 → 200', byUser.status === 200, `实际 ${byUser.status}`)
  check(
    '🔴 返回的**每一条都属于该账号**',
    userRows.length > 0 && userRows.every((c) => c.userId === targetId),
    JSON.stringify([...new Set(userRows.map((c) => c.userId))])
  )
  check(
    '🔴 恰好返回他的 2 条（不多不少）',
    userRows.filter((c) => c.userId === targetId).length === 2,
    String(userRows.filter((c) => c.userId === targetId).length)
  )
  check(
    '🔴 **别人的评论不会混进来**',
    !userRows.some((c) => c.userId === otherId),
    JSON.stringify(userRows.filter((c) => c.userId === otherId).map((c) => c.body))
  )

  // 未知 userId → 空列表（不是报错、也不是返回全部）
  const noSuchUser = await api(BASE, 'GET', '/api/admin/comments?userId=99999999&limit=50', { token: superAcc.token })
  check(
    '🔴 不存在的 userId 返回空列表（不是返回全部）',
    noSuchUser.status === 200 && (noSuchUser.json?.comments || []).length === 0,
    `status=${noSuchUser.status} n=${(noSuchUser.json?.comments || []).length}`
  )

  // 与其它筛选叠加（userId + q）
  const combined = await api(BASE, 'GET', `/api/admin/comments?userId=${targetId}&q=${encodeURIComponent(mineTag)}&limit=50`, {
    token: superAcc.token
  })
  check(
    '🔴 userId 可与搜索叠加',
    (combined.json?.comments || []).length === 2 &&
      (combined.json?.comments || []).every((c) => c.userId === targetId),
    String((combined.json?.comments || []).length)
  )
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

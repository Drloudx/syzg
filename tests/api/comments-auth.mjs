/**
 * M4 端到端：评论归属从"浏览器令牌"切到"账号"。
 *
 * 用法（需先跑 `npm run dev:api`）：
 *   npm run test:api          # 会连同 auth-flow.mjs 一起跑
 *   node --no-warnings tests/api/comments-auth.mjs
 *
 * 覆盖的核心契约：
 *   - 发表评论**必须登录**（读不需要）；
 *   - 昵称与头像**由服务端从账号接管**，客户端传什么都不算；
 *   - `mine` 只反映"是不是你自己的"，不泄漏别人的归属；
 *   - 只能删自己的，且删除是幂等的真删除；
 *   - `/api/my-comments` 已退役，「我的评论」改走 `/api/auth/comments`（跨设备可用）。
 */

import { CAPTCHA_EGGS } from '../../src/config/captchaEggs.js'
import { emailLookupHash } from '../../src/utils/authCrypto.js'
import { deriveVerifier } from '../../src/utils/passwordKdf.js'
import { createCodeReader } from '../helpers/localD1.mjs'

const BASE = 'http://127.0.0.1:8788'
const reader = createCodeReader()
const b64ToId = new Map(CAPTCHA_EGGS.map((e) => [e.b64, e.id]))

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? '  [' + detail + ']' : ''}`)
  }
}

async function api(method, p, body, token) {
  const init = { method, headers: {} }
  if (token) init.headers.authorization = 'Bearer ' + token
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(BASE + p, init)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, text }
}

async function solveCaptcha() {
  const c = await api('GET', '/api/auth/captcha')
  const images = [...c.json.svg.matchAll(/<image href="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((h) => h.startsWith('data:'))
  const prompt = images.slice(0, 3).map((b) => b64ToId.get(b))
  const canvas = images.slice(3).map((b) => b64ToId.get(b))
  return { captchaId: c.json.captchaId, picks: prompt.map((id) => canvas.indexOf(id)) }
}

async function makeAccount(tag) {
  const stamp = Date.now().toString(36) + tag
  const email = `m4-${stamp}@example.com`
  const nick = `测${tag}${stamp.slice(-3)}`.slice(0, 12)
  const password = 'Correct-Horse-Battery-9'

  const cap = await solveCaptcha()
  await api('POST', '/api/auth/code', { email, purpose: 'register', captchaId: cap.captchaId, picks: cap.picks })
  const code = reader.readCode(await emailLookupHash(email, reader.saltSecret), 'register')
  const salt = (await api('GET', `/api/auth/salt?email=${encodeURIComponent(email)}`)).json.salt
  const verifier = await deriveVerifier(password, salt)
  const reg = await api('POST', '/api/auth/register', { email, code, verifier, nick, avatar: 'at001_0' })
  if (reg.status !== 200) throw new Error('建号失败: ' + reg.text)
  return { token: reg.json.token, nick, userId: reg.json.user.id, email }
}

console.log('\n================ M4：评论挂账号 ================\n')

// ---- 1. 未登录不能发评论 ----
console.log('【1】未登录不能发评论（读仍不需要登录）')
{
  const post = await api('POST', '/api/comments', { page: 'site:general', body: '匿名尝试', hp: '' })
  check('POST /api/comments 不带令牌 → 401', post.status === 401, `实际 ${post.status} ${post.text.slice(0, 60)}`)

  const read = await api('GET', '/api/comments?page=site:general&limit=3')
  check('GET /api/comments 不带令牌 → 200（读不需登录）', read.status === 200, `实际 ${read.status}`)
  check('返回的评论都带 mine 字段', (read.json.comments || []).every((c) => 'mine' in c))
  check('未登录时 mine 全为 false', (read.json.comments || []).every((c) => c.mine === false))
}

// ---- 2. 登录后发评论 ----
console.log('\n【2】登录后发评论，服务端接管昵称与头像')
let alice = null
let bob = null
let commentId = null
{
  alice = await makeAccount('a')
  bob = await makeAccount('b')

  // 🔴 故意在请求体里塞别人的昵称与头像，服务端必须忽略
  const post = await api(
    'POST',
    '/api/comments',
    {
      page: 'site:general',
      body: '这是 M4 的测试评论',
      hp: '',
      nick: '我是假冒的昵称',
      avatar: 'hacked_avatar_id'
    },
    alice.token
  )
  check('带令牌发评论 → 201', post.status === 201, `实际 ${post.status} ${post.text.slice(0, 80)}`)
  check('🔴 响应里的昵称是**账号昵称**，不是请求体里那个', post.json?.comment?.nick === alice.nick, `实际 "${post.json?.comment?.nick}" / 账号 "${alice.nick}"`)
  check('🔴 头像也取自账号（请求体里的被忽略）', post.json?.comment?.avatar === 'at001_0', `实际 ${post.json?.comment?.avatar}`)
  check('自己刚发的评论 mine=true', post.json?.comment?.mine === true)
  check('🔴 响应里**不再有 deleteToken**', !('deleteToken' in (post.json || {})), JSON.stringify(Object.keys(post.json || {})))
  commentId = post.json?.comment?.id
}

// ---- 3. mine 标记随登录状态变化 ----
console.log('\n【3】mine 只反映"你自己的"')
{
  const asGuest = await api('GET', '/api/comments?page=site:general&limit=50')
  const guestMine = (asGuest.json.comments || []).filter((c) => c.mine)
  check('游客看到 mine=true 的条数为 0', guestMine.length === 0, `实际 ${guestMine.length}`)

  const asAlice = await api('GET', '/api/comments?page=site:general&limit=50', undefined, alice.token)
  const aliceMine = (asAlice.json.comments || []).filter((c) => c.mine)
  check('Alice 看到自己那条 mine=true', aliceMine.some((c) => c.id === commentId), `mine 数 ${aliceMine.length}`)

  const asBob = await api('GET', '/api/comments?page=site:general&limit=50', undefined, bob.token)
  const bobMine = (asBob.json.comments || []).filter((c) => c.mine)
  check('🔴 Bob 看 Alice 那条时 mine=false（不泄漏别人的归属）', !bobMine.some((c) => c.id === commentId))
}

// ---- 4. 归属校验 ----
console.log('\n【4】只能删自己的')
{
  const noAuth = await api('DELETE', '/api/comments', { id: commentId })
  check('不带令牌删 → 401', noAuth.status === 401, `实际 ${noAuth.status}`)

  const byBob = await api('DELETE', '/api/comments', { id: commentId }, bob.token)
  check('🔴 别人删 → 403', byBob.status === 403, `实际 ${byBob.status}`)

  const still = await api('GET', '/api/comments?page=site:general&limit=50')
  check('被拒后评论仍在', (still.json.comments || []).some((c) => c.id === commentId))

  const byAlice = await api('DELETE', '/api/comments', { id: commentId }, alice.token)
  check('本人删 → 200', byAlice.status === 200, `实际 ${byAlice.status} ${byAlice.text.slice(0, 60)}`)

  const gone = await api('GET', '/api/comments?page=site:general&limit=50')
  check('删掉了（真删除）', !(gone.json.comments || []).some((c) => c.id === commentId))

  const again = await api('DELETE', '/api/comments', { id: commentId }, alice.token)
  check('重复删 → 幂等返回 200', again.status === 200 && again.json?.alreadyGone === true, `实际 ${again.status} ${again.text.slice(0, 60)}`)
}

// ---- 5. 旧接口已退役 ----
console.log('\n【5】/api/my-comments 已退役')
{
  const old = await api('POST', '/api/my-comments', { items: [] })
  check('POST /api/my-comments → 404', old.status === 404, `实际 ${old.status}`)
}

// ---- 6. 我的评论走账号接口 ----
console.log('\n【6】「我的评论」改走账号接口（跨设备可用）')
{
  const post = await api('POST', '/api/comments', { page: 'site:general', body: '第二条测试评论', hp: '' }, alice.token)
  check('再发一条 → 201', post.status === 201, `实际 ${post.status}`)

  const mine = await api('GET', '/api/auth/comments', undefined, alice.token)
  check('GET /api/auth/comments → 200', mine.status === 200, `实际 ${mine.status}`)
  check('能查到自己的评论', (mine.json.comments || []).length >= 1, `实际 ${mine.json.comments?.length}`)
  check('按 user_id 归属，无需浏览器令牌', (mine.json.comments || []).every((c) => c.pageKey === 'site:general'))

  const bobMine = await api('GET', '/api/auth/comments', undefined, bob.token)
  check("Bob 的列表里没有 Alice 的评论", !(bobMine.json.comments || []).some((c) => c.id === post.json.comment.id))
}

// ---- 7. M6：谁回复了我 ----
console.log('\n【7】谁回复了我')
{
  // Alice 发一条，Bob 来回复
  const mine = await api('POST', '/api/comments', { page: 'site:general', pageLabel: '站内讨论区', body: 'M6 原评论', hp: '' }, alice.token)
  check('Alice 发原评论 → 201', mine.status === 201, `实际 ${mine.status}`)
  const rootId = mine.json.comment.id

  const reply = await api(
    'POST',
    '/api/comments',
    { page: 'site:general', pageLabel: '站内讨论区', body: 'M6 我来回复你', hp: '', parentId: rootId },
    bob.token
  )
  check('Bob 回复 → 201', reply.status === 201, `实际 ${reply.status} ${reply.text.slice(0, 60)}`)
  check('回复挂在原评论下面', reply.json?.comment?.parentId === rootId)

  const list = await api('GET', '/api/auth/replies', undefined, alice.token)
  check('GET /api/auth/replies → 200', list.status === 200, `实际 ${list.status}`)
  const hit = (list.json.replies || []).find((r) => r.id === reply.json.comment.id)
  check('🔴 能查到别人回复我的那一条', Boolean(hit), `共 ${list.json.replies?.length} 条`)
  check('带回复者昵称', hit?.nick === bob.nick, `实际 ${hit?.nick} / 期望 ${bob.nick}`)
  check('带正文', hit?.body === 'M6 我来回复你')
  check('带页面信息（用于「去看看」）', hit?.pageKey === 'site:general' && hit?.pageLabel === '站内讨论区')
  check('🔴 未读数 ≥ 1', list.json.unread >= 1, `实际 ${list.json.unread}`)

  // Bob 的"谁回复了我"里不该有这条（那是他发的，不是别人回复他）
  const bobList = await api('GET', '/api/auth/replies', undefined, bob.token)
  check("🔴 Bob 的列表里没有这条（回复是**他发的**，不是别人回复他）",
    !(bobList.json.replies || []).some((r) => r.id === reply.json.comment.id))

  // Alice 回复自己：也不算"别人回复我"
  const self = await api(
    'POST',
    '/api/comments',
    { page: 'site:general', body: '自己回自己', hp: '', parentId: rootId },
    alice.token
  )
  const afterSelf = await api('GET', '/api/auth/replies', undefined, alice.token)
  check('🔴 自己回复自己**不出现**在「谁回复了我」里',
    !(afterSelf.json.replies || []).some((r) => r.id === self.json.comment.id))

  // 标记已读
  const read = await api('POST', '/api/auth/replies/read', {}, alice.token)
  check('POST /api/auth/replies/read → 200', read.status === 200, `实际 ${read.status}`)
  const afterRead = await api('GET', '/api/auth/replies', undefined, alice.token)
  check('🔴 标已读后未读数归零', afterRead.json.unread === 0, `实际 ${afterRead.json.unread}`)
  check('标已读**不影响列表内容**（只是基准时间推后）',
    (afterRead.json.replies || []).some((r) => r.id === reply.json.comment.id))

  // Bob 删掉自己的回复 → 不再出现在 Alice 的列表里
  const del = await api('DELETE', '/api/comments', { id: reply.json.comment.id }, bob.token)
  check('Bob 删自己的回复 → 200', del.status === 200, `实际 ${del.status}`)
  const afterDel = await api('GET', '/api/auth/replies', undefined, alice.token)
  check('🔴 回复被删后从列表消失（不留点不进去的条目）',
    !(afterDel.json.replies || []).some((r) => r.id === reply.json.comment.id))
}

// ---- 8. 未登录一律 401 ----
console.log('\n【8】「谁回复了我」必须登录')
{
  const a = await api('GET', '/api/auth/replies')
  check('GET /api/auth/replies 不带令牌 → 401', a.status === 401, `实际 ${a.status}`)
  const b = await api('POST', '/api/auth/replies/read', {})
  check('POST /api/auth/replies/read 不带令牌 → 401', b.status === 401, `实际 ${b.status}`)
}

console.log(`\n================ 结果：通过 ${pass} / 失败 ${fail} ================`)
reader.close()
process.exit(fail ? 1 : 0)

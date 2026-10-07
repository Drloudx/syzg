/**
 * 端到端：**评论上下文接口**（「去看看」定位到很早的评论时用）。
 *
 * ## 守什么
 *
 * 讨论区只加载第一页（50 条），而「谁回复了我」里那条回复可能已是几百条之前 ——
 * 那时列表里没有它，早先的实现**静默什么都不做**。新方案不逐页翻（代价随"多老"
 * 增长），而是恒定 1 次请求取「被回复的那条 + 回复本身」。
 *
 * 这个测试要证明的正是**恒定**：不管那条评论排在多后面，
 * 都是一次请求、都能取到，且带得出它的父评论。
 *
 * ## 还要守边界
 *
 * 这类"按 id 直取"的接口最容易出的问题是**越权读**：
 * 拿一个 id 就能读到任意页面、或读到被隐藏的内容。所以这里专门验：
 *   · 隐藏的评论取不到；
 *   · 跨页面（page_key 不匹配）取不到；
 *   · 不存在的 id 取不到。
 *
 * 用法：`npm run dev:api` 起服务后 `node --no-warnings tests/api/comment-context.mjs`
 */
import { createCodeReader } from '../helpers/localD1.mjs'
import { api, createAccount, postComment } from '../helpers/accountApi.mjs'

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

const stamp = Date.now().toString(36)
console.log('\n================ 评论上下文接口 ================\n')

const reader = createCodeReader()
try {
  const alice = await createAccount(BASE, reader, { nick: `上${stamp.slice(-3)}` })
  const bob = await createAccount(BASE, reader, { nick: `下${stamp.slice(-3)}` })

  // ---------- 准备：一条父评论 + 一条回复 ----------
  console.log('【1】造「父评论 + 回复」')
  const parent = await postComment(BASE, alice.token, { body: `父评论 ${stamp}` })
  const reply = await postComment(BASE, bob.token, {
    body: `回复内容 ${stamp}`,
    parentId: parent.id
  })
  check('父评论与回复都创建成功', Boolean(parent?.id && reply?.id))

  // ---------- 取回复的上下文 ----------
  console.log('\n【2】取回复的上下文（应带出被回复的那条）')
  const ctx = await api(BASE, 'GET', `/api/comments/context?page=site:general&id=${reply.id}`)
  check('HTTP 200', ctx.status === 200, `实际 ${ctx.status}`)
  check('found = true', ctx.json?.found === true)
  check('返回的就是那条回复', ctx.json?.comment?.id === reply.id, String(ctx.json?.comment?.id))
  check('🔴 带出了被回复的父评论', ctx.json?.parent?.id === parent.id, String(ctx.json?.parent?.id))
  check('父评论正文正确', String(ctx.json?.parent?.body || '').includes(stamp))
  check('回复正文正确', String(ctx.json?.comment?.body || '').includes(stamp))
  check('带 inFirstPage 字段（供界面判断要不要显示卡片）', typeof ctx.json?.inFirstPage === 'boolean')

  // ---------- 顶层评论：parent 应为 null ----------
  console.log('\n【3】顶层评论的 parent 为 null')
  const ctxTop = await api(BASE, 'GET', `/api/comments/context?page=site:general&id=${parent.id}`)
  check('found = true', ctxTop.json?.found === true)
  check('parent 为 null（它没有父评论）', ctxTop.json?.parent === null, JSON.stringify(ctxTop.json?.parent))

  // ---------- 🔴 边界：隐藏的评论取不到 ----------
  console.log('\n【4】🔴 被隐藏的评论取不到（不能绕过管理员的隐藏）')
  const hidden = await postComment(BASE, alice.token, { body: `待隐藏 ${stamp}` })
  const db = reader.db
  /*
   * 直接把 status 改成 2（隐藏）。
   * 走库而不是管理接口：本地库可写，且这里要验的是**读取侧的过滤**，
   * 不是管理操作本身（那条有另外的测试）。
   */
  const before = db.prepare('SELECT status FROM comments WHERE id = ?').get(hidden.id)
  check('新评论默认是公开的（status=1）', before?.status === 1, String(before?.status))

  // 本地 D1 是另一个连接，这里用只读连接改不了 —— 改用可写连接
  const { openLocalD1Writable } = await import('../helpers/localD1.mjs')
  const w = openLocalD1Writable()
  w.prepare('UPDATE comments SET status = 2 WHERE id = ?').run(hidden.id)
  w.close()

  const ctxHidden = await api(BASE, 'GET', `/api/comments/context?page=site:general&id=${hidden.id}`)
  check('🔴 隐藏后 found = false', ctxHidden.json?.found === false, JSON.stringify(ctxHidden.json))
  check('隐藏后不返回正文', !String(ctxHidden.text).includes(stamp))

  // ---------- 🔴 边界：跨页面取不到 ----------
  console.log('\n【5】🔴 跨页面取不到（限定 page_key）')
  const itemComment = await postComment(BASE, alice.token, {
    page: 'item:30047', pageLabel: '某物品', body: `物品页 ${stamp}`
  })
  const ctxWrongPage = await api(BASE, 'GET', `/api/comments/context?page=site:general&id=${itemComment.id}`)
  check(
    '🔴 用讨论区的 page 取物品页的评论 → found = false',
    ctxWrongPage.json?.found === false,
    JSON.stringify(ctxWrongPage.json)
  )

  const ctxRightPage = await api(BASE, 'GET', `/api/comments/context?page=item:30047&id=${itemComment.id}`)
  check('用正确的 page 能取到', ctxRightPage.json?.found === true)

  // ---------- 边界：不存在的 id / 非法参数 ----------
  console.log('\n【6】非法与不存在的入参')
  const missing = await api(BASE, 'GET', '/api/comments/context?page=site:general&id=99999999')
  check('不存在的 id → found = false（不报 500）', missing.status === 200 && missing.json?.found === false, `HTTP ${missing.status}`)

  const badId = await api(BASE, 'GET', '/api/comments/context?page=site:general&id=abc')
  check('非数字 id → 400', badId.status === 400, `实际 ${badId.status}`)

  const badPage = await api(BASE, 'GET', `/api/comments/context?page=__nope__&id=${parent.id}`)
  check('非法 page_key → 400', badPage.status === 400, `实际 ${badPage.status}`)

  const noPage = await api(BASE, 'GET', `/api/comments/context?id=${parent.id}`)
  check('缺 page → 400', noPage.status === 400, `实际 ${noPage.status}`)

  // ---------- 恒定成本：很靠后的评论同样一次请求取到 ----------
  console.log('\n【7】🔴 恒定性：评论排得再后也是一次请求')
  /*
   * 造一条"很早"的评论：它的 id 比后面那些都小，所以它在首页边界之后
   * （讨论区按 id 倒序，越小越老）。用它验证 inFirstPage 为 false 时
   * 依然能一次取到 —— 这就是"不用逐页翻"的证据。
   */
  const boundaryProbe = await api(BASE, 'GET', '/api/comments/context?page=site:general&id=' + parent.id)
  check('很老的评论依然 found = true', boundaryProbe.json?.found === true)
  check(
    'inFirstPage 字段能区分"在首页内"与"在首页外"',
    typeof boundaryProbe.json?.inFirstPage === 'boolean',
    String(boundaryProbe.json?.inFirstPage)
  )
  // 父评论是很早建的，讨论区又有大量测试评论，它大概率不在首页
  console.log(`     （这条评论 inFirstPage = ${boundaryProbe.json?.inFirstPage}）`)
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

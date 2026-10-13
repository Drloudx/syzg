import { api, createAccount } from '../helpers/accountApi.mjs'
import { createCodeReader, openLocalD1Writable } from '../helpers/localD1.mjs'

const BASE = process.env.MYRZG_API_BASE || 'http://127.0.0.1:8788'
let pass = 0
let fail = 0
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✅ ${label}`) } else { fail++; console.log(`  ❌ ${label} ${extra}`) }
}

console.log('\n【概览缓存端到端】')

const reader = createCodeReader()
const acc = await createAccount(BASE, reader, { nick: `缓存${Math.random().toString(36).slice(2, 6)}` })
const db = openLocalD1Writable()
try { db.exec(`UPDATE users SET role = 2 WHERE email = '${acc.email}'`) } finally { db.close() }
const token = acc.token

// ① 连续两次：应当命中缓存 → ts 相同
const a = await api(BASE, 'GET', '/api/admin/stats', { token })
const b = await api(BASE, 'GET', '/api/admin/stats', { token })
check('连续两次 stats 都 200', a.status === 200 && b.status === 200, `${a.status}/${b.status}`)
check(
  '🔴 两次的 ts 相同 = 命中缓存（没有重算）',
  a.json?.ts === b.json?.ts,
  `ts ${a.json?.ts} vs ${b.json?.ts}`
)

// ② 写操作（发一条评论）后应当立刻失效 → 数字必须变
const beforeTotal = b.json?.comments?.total ?? 0
const beforeTs = b.json?.ts
const posted = await api(BASE, 'POST', '/api/comments', {
  token,
  body: { page: 'site:general', pageLabel: '站内讨论区', body: `缓存失效验证 ${Date.now()}`, hp: '' }
})
check('发评论成功（201）', posted.status === 201, `实际 ${posted.status} ${posted.text.slice(0, 60)}`)

const c = await api(BASE, 'GET', '/api/admin/stats', { token })
/*
 * 🔴 判据用 **total**，不能用 `ts`。
 *
 * `ts` 是 `nowSec()`，**秒级**：若"读缓存"与"写失效"落在同一秒，
 * 重算出来的 `ts` 与旧值相同，会被误判成"没失效"（实测踩过）。
 * `total` 才是真信号 —— 它是内容，不受时间分辨率影响。
 */
check(
  '🔴 发评论后 total +1 = 缓存被主动失效（不是等 30 秒）',
  (c.json?.comments?.total ?? 0) === beforeTotal + 1,
  `before ${beforeTotal} / after ${c.json?.comments?.total}`
)

// ts 只作辅助信息，不作判据（秒级分辨率，同秒内可能相同）
console.log(`  ℹ️ ts 参考：${beforeTs} → ${c.json?.ts}（秒级，不参与断言）`)

// ③ 缓存命中时数字不该"凭空跳" —— 连续读三次应完全一致
const d = await api(BASE, 'GET', '/api/admin/stats', { token })
const e = await api(BASE, 'GET', '/api/admin/stats', { token })
check(
  '连续三次读数完全一致（缓存期内数字稳定）',
  JSON.stringify(c.json) === JSON.stringify(d.json) && JSON.stringify(d.json) === JSON.stringify(e.json)
)

console.log(`\n结果：通过 ${pass} / 失败 ${fail}`)
if (fail) process.exitCode = 1

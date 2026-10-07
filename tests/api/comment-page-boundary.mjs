/**
 * 专门验证 `inFirstPage` 的**边界正确性**。
 *
 * 踩过的 bug：服务端写死 `FIRST_PAGE_SIZE = 50`，而前端默认 `limit = 20`。
 * 于是第 21~50 条被错判成"在首页里" → 不返回定位卡片 → 而列表里确实没有它
 * → 用户点「去看看」又是"没反应"（症状与修复前一样，只是范围缩小了）。
 *
 * 这里用**真实的 20 条页大小**验边界：
 *   · 最新第 1 条 → inFirstPage = true
 *   · 第 20 条     → inFirstPage = true（正好在页内）
 *   · 第 21 条     → inFirstPage = **false**（页外第一条，正是被错判的那条）
 *   · 第 50 条     → inFirstPage = false
 */
import { createCodeReader } from '../helpers/localD1.mjs'
import { api, createAccount, postComment } from '../helpers/accountApi.mjs'

const BASE = process.env.MYRZG_API_BASE || 'http://127.0.0.1:8788'
const PAGE = 20

let pass = 0
let fail = 0
const failures = []
function check(label, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; failures.push(label); console.log(`  ❌ ${label}${extra ? '  [' + extra + ']' : ''}`) }
}

const stamp = Date.now().toString(36)
console.log('\n================ inFirstPage 边界（页大小 ' + PAGE + '）================\n')

const reader = createCodeReader()
try {
  const who = await createAccount(BASE, reader, { nick: `边${stamp.slice(-3)}` })

  /*
   * 造 55 条：这样"第 21 条"与"第 50 条"都落在页外，
   * 足以覆盖旧 bug 的整个误判区间（21~50）。
   */
  const ids = []
  for (let i = 0; i < 55; i++) {
    const c = await postComment(BASE, who.token, { body: `边界 ${stamp} #${i}` })
    ids.push(c.id)
  }
  console.log(`  已造 55 条（id ${ids[0]} … ${ids[54]}）\n`)

  // 讨论区按 id 倒序：最新的是最后创建的那条
  const newest = ids[54]
  const asOrdered = [...ids].reverse() // [最新, ..., 最老]

  const probe = async (id) => {
    const r = await api(BASE, 'GET', `/api/comments/context?page=site:general&id=${id}`)
    return r.json?.inFirstPage
  }

  console.log('【1】页内（应为 true）')
  check(`最新第 1 条 inFirstPage = true`, (await probe(asOrdered[0])) === true)
  check(`第 10 条 inFirstPage = true`, (await probe(asOrdered[9])) === true)
  check(`第 ${PAGE} 条（页内最后一条）inFirstPage = true`, (await probe(asOrdered[PAGE - 1])) === true)

  console.log('\n【2】🔴 页外（应为 false）—— 旧 bug 的误判区')
  const p21 = await probe(asOrdered[PAGE])
  check(`🔴 第 ${PAGE + 1} 条 inFirstPage = false（旧 bug 会错判成 true）`, p21 === false, String(p21))

  const p30 = await probe(asOrdered[29])
  check(`第 30 条 inFirstPage = false`, p30 === false, String(p30))

  const p50 = await probe(asOrdered[49])
  check(`第 50 条 inFirstPage = false`, p50 === false, String(p50))

  console.log('\n【3】仍能一次取到（恒定性）')
  const far = await api(BASE, 'GET', `/api/comments/context?page=site:general&id=${asOrdered[50]}`)
  check('第 51 条 found = true', far.json?.found === true)
  check('第 51 条 inFirstPage = false', far.json?.inFirstPage === false)
} finally {
  reader.close()
}

console.log('\n' + '─'.repeat(56))
console.log(`结果：通过 ${pass} / 失败 ${fail}`)
if (failures.length) { console.log('失败项：'); failures.forEach((f) => console.log('  · ' + f)) }
process.exit(fail === 0 ? 0 : 1)

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const API_FILE = path.resolve('functions/api/[[path]].js')
const COMMENTS_API_FILE = path.resolve('server/api/comments.js')
const apiSource = readFileSync(API_FILE, 'utf8')
const commentsSource = readFileSync(COMMENTS_API_FILE, 'utf8')

function extractFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`)
  assert.ok(start >= 0, `缺少函数 ${name}`)
  const openParen = source.indexOf('(', start)
  let parenDepth = 0
  let paramEnd = openParen
  for (let i = openParen; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '(') parenDepth += 1
    else if (ch === ')') {
      parenDepth -= 1
      if (parenDepth === 0) {
        paramEnd = i + 1
        break
      }
    }
  }
  const openBrace = source.indexOf('{', paramEnd)
  let depth = 0
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`函数 ${name} 未闭合`)
}

test('楼中楼回复查询包含 r.user_id 且透传 myUserId 以便计算 mine', () => {
  const nestedFn = extractFunction(commentsSource, 'listNestedComments')
  assert.match(nestedFn, /SELECT\s+r\.id,\s*r\.user_id\b/, 'listNestedComments 回复查询必须包含 r.user_id')
  assert.match(nestedFn, /toPublic\(row,\s*myUserId\)/, 'listNestedComments 必须把 myUserId 传给 toPublic')

  const threadFn = extractFunction(commentsSource, 'listThreadReplies')
  assert.match(threadFn, /SELECT\s+r\.id,\s*r\.user_id\b/, 'listThreadReplies 回复查询必须包含 r.user_id')
  assert.doesNotMatch(threadFn, /page\.map\(\s*toPublic\s*\)/, 'listThreadReplies 禁止直接 page.map(toPublic) 漏传 myUserId')
  assert.match(threadFn, /page\.map\(\s*\(?r\)?\s*=>\s*toPublic\(r,\s*myUserId\)\s*\)/, 'listThreadReplies 必须向 toPublic 传递 myUserId')
})

test('/api/comments 路由仅在 GET 分支前置可选 loadSession，避免 POST/DELETE 重复鉴权查询', () => {
  const routeBlockMatch = apiSource.match(/if\s*\(path\s*===\s*'\/api\/comments'\)\s*\{[\s\S]*?return bad\(ERR\.fallback,\s*405\)\s*\}/)
  assert.ok(routeBlockMatch, '应存在 /api/comments 路由分支')
  const routeBlock = routeBlockMatch[0]
  const getIdx = routeBlock.indexOf("request.method === 'GET'")
  const sessionIdx = routeBlock.indexOf('loadSession(')
  assert.ok(getIdx >= 0 && sessionIdx > getIdx, 'loadSession 必须放在 GET 分支内，而非方法分发之前')
})

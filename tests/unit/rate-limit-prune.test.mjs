import { test } from 'node:test'
import assert from 'node:assert/strict'

/*
 * `rate_limits` 过期桶清理的**判据**测试（2026-10-15）。
 *
 * 背景：`auth_codes` / `captchas` / `sessions` 都有过期清理，`rate_limits` 漏了 ——
 * 旧桶永远留在表里。补上的清理靠 `substr(bucket, -10) < 当前小时桶` 判断过期。
 *
 * 🔴 这段逻辑**必须单独测**，因为它是纯字符串比较，且有两个易错点：
 *   1. 定长数字串的字典序 == 数值序 —— 若不成立，"<" 会跨年错乱；
 *   2. 桶名有多种前缀，其中 `authcd:`（发码冷却）**末尾不是时间戳**，
 *      必须被排除，否则会误删"冷却是第几秒"的记录。
 *
 * 本测试只验**判据**（字符串比较与前缀筛选），不连数据库 ——
 * 与 `functions/api/[[path]].js` 里的实现保持同一套规则。
 */

// —— 与实现同源的两个函数（保持逐字一致，改动时两边同步）——
function hourBucket(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 13).replace(/[-T]/g, '')
}
function dayBucket(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10).replace(/-/g, '')
}

/** 复刻实现里的 SQL 判据：**小时桶与日桶分开判**（长度不同，不能一起比） */
const HOUR_PREFIXES = ['h:', 'authh:', 'loginfail:']
const DAY_PREFIXES = ['d:', 'authd:']
function isExpired(bucket, ts) {
  if (HOUR_PREFIXES.some((p) => bucket.startsWith(p))) {
    if (bucket.length < 10) return false
    return bucket.slice(-10) < hourBucket(ts)
  }
  if (DAY_PREFIXES.some((p) => bucket.startsWith(p))) {
    if (bucket.length < 8) return false
    return bucket.slice(-8) < dayBucket(ts)
  }
  return false
}

const NOW = 1792000000 // 固定时间，避免秒级漂移

test('定长数字串的字典序等于数值序（跨年也成立）', () => {
  const a = hourBucket(Date.UTC(2026, 11, 31, 23, 0, 0) / 1000) // 2026123123
  const b = hourBucket(Date.UTC(2027, 0, 1, 0, 0, 0) / 1000) //  2027010100
  assert.equal(a, '2026123123')
  assert.equal(b, '2027010100')
  assert.ok(a < b, '跨年时字符串比较仍应正确（定长补零）')
})

test('🔴 v1 的 `substr(-10)` 对日桶会截到非数字字符 → 日桶永不清理', () => {
  /*
   * 第一版实现用**同一个** `substr(bucket, -10) < 当前小时桶` 判所有桶，
   * 被本测试抓出对日桶失效：
   *
   *   substr('d:ip:20261013', -10)  ===  'p:20261013'
   *                                        ↑ 含字母 'p' 与冒号，不是纯数字
   *
   * 字符串比较时 `'p'`(0x70) > `'2'`(0x32) → `'p:20261013' < '2026101412'` 为**假**
   * → 昨天的日桶**永远不会被删**。修正后按长度分开判（8 位 vs 10 位）。
   */
  const bucket = 'd:ip:20261013'
  const v1Slice = bucket.slice(-10)
  assert.equal(v1Slice, 'p:20261013', 'v1 会截到前缀里的非数字字符')
  assert.ok(!/^\d+$/.test(v1Slice), '截出来的不是纯数字 → 不能参与数值序比较')
  // v1 的判定（错）：拿含字母的串去比，结果为假 → 漏清
  assert.equal(v1Slice < hourBucket(NOW), false, 'v1 判据对日桶失败（这正是被修掉的 bug）')
  // 修正后：日桶按 8 位纯数字比较
  assert.equal(bucket.slice(-8), '20261013')
  assert.ok(/^\d+$/.test(bucket.slice(-8)), '8 位是纯数字 → 比较有效')
  assert.equal(isExpired(bucket, NOW), true, '修正后昨日日桶能被正确清理')
})

test('当前小时的桶必须保留（还在计数）', () => {
  const cur = hourBucket(NOW)
  assert.equal(isExpired(`h:abc:${cur}`, NOW), false, '当前小时桶不能被清')
})

test('上一小时的桶应被清理', () => {
  const prev = hourBucket(NOW - 3600)
  assert.equal(isExpired(`h:abc:${prev}`, NOW), true, '上一小时桶应清')
})

test('昨天的桶应被清理', () => {
  const y = dayBucket(NOW - 86400)
  assert.equal(isExpired(`d:abc:${y}`, NOW), true, '昨日桶应清')
})

test('今天的日桶必须保留（今天还要继续计数）', () => {
  const today = dayBucket(NOW)
  assert.equal(isExpired(`d:abc:${today}`, NOW), false, '今日日桶不能被清')
})

test('🔴 `authcd:`（发码冷却）绝不能被清 —— 末尾是"第几秒"不是时间戳', () => {
  // authcd 存的是上次发码的秒数，例如 1791999999 —— 末尾不是 YYYYMMDDHH
  const staleCooldown = `authcd:someemailhash:1791999999`
  assert.equal(isExpired(staleCooldown, NOW), false, 'authcd 前缀不在清理名单里')
  assert.ok(![...HOUR_PREFIXES, ...DAY_PREFIXES].some((p) => staleCooldown.startsWith(p)))
})

test('小时桶各类前缀都被覆盖到', () => {
  const prev = hourBucket(NOW - 3600)
  const cases = [
    [`h:ip:${prev}`, true, '评论限流小时桶'],
    [`authh:ip:${prev}`, true, '发码 IP 小时桶'],
    [`loginfail:mail:${prev}`, true, '登录失败邮箱桶'],
    [`loginfail:ip:ip:${prev}`, true, '登录失败 IP 桶']
  ]
  for (const [bucket, want, label] of cases) {
    assert.equal(isExpired(bucket, NOW), want, `${label} (${bucket})`)
  }
})

test('日桶各类前缀都被覆盖到', () => {
  const prevDay = dayBucket(NOW - 86400)
  const cases = [
    [`d:ip:${prevDay}`, true, '评论限流日桶'],
    [`authd:mail:${prevDay}`, true, '发码邮箱日桶'],
    [`authd:ip:ip:${prevDay}`, true, '发码 IP 日桶']
  ]
  for (const [bucket, want, label] of cases) {
    assert.equal(isExpired(bucket, NOW), want, `${label} (${bucket})`)
  }
})

test('未来时间的桶不会被清（时钟漂移保护）', () => {
  const future = hourBucket(NOW + 3600 * 5)
  assert.equal(isExpired(`h:abc:${future}`, NOW), false)
})

test('过短的畸形桶名不误清（length 守卫）', () => {
  assert.equal(isExpired('h:', NOW), false, '只有前缀没时间戳 → 不匹配')
  assert.equal(isExpired('d:x', NOW), false)
})

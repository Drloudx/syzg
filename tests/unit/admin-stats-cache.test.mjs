/**
 * 后台概览缓存（`src/config/adminStatsCache.js`）单测。
 *
 * 要守的四条语义：
 *   1. TTL 内**不重算**（这是省额度的唯一机制，破了就白做）
 *   2. 写操作调用 `invalidateAdminStatsCache()` 后**立刻重算**
 *   3. 并发请求**只算一次**（否则一波刷新各自跑 9 条聚合）
 *   4. **算失败不写缓存**（否则一次偶发故障被放大成半分钟持续不可用）
 *
 * 用 `setStatsCachedAtForTest` 拨时间戳来验 TTL，避免真等 30 秒。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getAdminStats,
  invalidateAdminStatsCache,
  setStatsCachedAtForTest,
  setStatsCachedDayForTest
} from '../../src/config/adminStatsCache.js'

/** 每个用例先清干净，避免模块级状态跨用例串味 */
function reset() {
  invalidateAdminStatsCache()
}

test('TTL 内不重算，命中缓存直接返回同一对象', async () => {
  reset()
  let calls = 0
  const compute = async () => {
    calls += 1
    return { ok: true, n: calls }
  }

  const first = await getAdminStats(compute)
  const second = await getAdminStats(compute)

  assert.equal(calls, 1, 'TTL 内第二次应当命中缓存，不重算')
  assert.equal(first, second, '应当返回同一个对象（不是重新构造的等值对象）')
  assert.equal(second.n, 1)
})

test('写操作失效后立刻重算', async () => {
  reset()
  let calls = 0
  const compute = async () => ({ ok: true, n: ++calls })

  const before = await getAdminStats(compute)
  assert.equal(before.n, 1)

  invalidateAdminStatsCache()

  const after = await getAdminStats(compute)
  assert.equal(calls, 2, '失效后必须重算')
  assert.equal(after.n, 2, '拿到的必须是新值（否则管理员"处理完看不到变化"）')
})

test('TTL 过期后自动重算（把时间戳往前拨来模拟）', async () => {
  reset()
  let calls = 0
  const compute = async () => ({ ok: true, n: ++calls })

  await getAdminStats(compute)
  assert.equal(calls, 1)

  // 拨到 1 小时前 → 远超 TTL(5 分钟)
  setStatsCachedAtForTest(Date.now() - 3_600_000)

  const after = await getAdminStats(compute)
  assert.equal(calls, 2, 'TTL 过期后应当重算')
  assert.equal(after.n, 2)
})

test('🔴 跨 UTC 日界线强制重算（长 TTL 的前提）', async () => {
  /*
   * 概览的「今日 / 昨日 / 今日新增 / 7 日趋势」都基于
   * `dayStart = 秒 - 秒 % 86400`，即 UTC 日界线（= 北京时间 08:00）。
   * 若跨过这条线还用旧缓存，「今日」会显示成昨天的数 ——
   * TTL 越长错得越久（30 秒时无感，5 分钟时就明显了）。
   *
   * 有了这条跨日判定，跨日**零滞后**，于是长 TTL 不再有可感知代价。
   */
  reset()
  let calls = 0
  const compute = async () => ({ ok: true, n: ++calls })

  await getAdminStats(compute)
  assert.equal(calls, 1)

  // 同一天内、TTL 内 → 命中，不该被跨日判定误伤
  await getAdminStats(compute)
  assert.equal(calls, 1, '同一天且 TTL 内应命中缓存')

  // 🔴 把「缓存是哪天算的」改成昨天 → 即使 TTL 还没到，也必须重算
  const nowSec = Math.floor(Date.now() / 1000)
  const todayStart = nowSec - (nowSec % 86400)
  setStatsCachedDayForTest(todayStart - 86400)

  await getAdminStats(compute)
  assert.equal(calls, 2, '跨日后必须强制重算（否则「今日」显示昨天的数）')
})

test('TTL 是 5 分钟（改值后旧断言会立刻发现）', async () => {
  /*
   * 这条守的是「TTL 的具体数值」这个决策本身。
   * 它容易被无意改小：改回 30 秒会让缓存几乎失效（见 adminStatsCache.js 的说明），
   * 而那是个**性能上静默退化**、功能上看不出来的问题。
   */
  reset()
  let calls = 0
  const compute = async () => ({ ok: true, n: ++calls })

  await getAdminStats(compute)

  // 4 分钟前 → 仍在 5 分钟窗口内 → 命中
  setStatsCachedAtForTest(Date.now() - 4 * 60 * 1000)
  await getAdminStats(compute)
  assert.equal(calls, 1, '4 分钟前算的应当仍在 TTL 内（TTL 至少 4 分钟）')

  // 6 分钟前 → 超出 → 重算
  setStatsCachedAtForTest(Date.now() - 6 * 60 * 1000)
  await getAdminStats(compute)
  assert.equal(calls, 2, '6 分钟前算的应已过期（TTL 不超过 6 分钟）')
})

test('并发请求只算一次（in-flight 合并）', async () => {
  reset()
  let calls = 0
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const compute = async () => {
    calls += 1
    await gate
    return { ok: true, n: calls }
  }

  // 同时发起 5 个：第一个进入计算并挂起，其余应当复用同一个 in-flight
  const all = Promise.all([
    getAdminStats(compute),
    getAdminStats(compute),
    getAdminStats(compute),
    getAdminStats(compute),
    getAdminStats(compute)
  ])
  release()
  const results = await all

  assert.equal(calls, 1, '并发 5 个请求只应触发 1 次计算')
  for (const r of results) assert.equal(r.n, 1)
})

test('算失败不写缓存，下次调用会重试', async () => {
  reset()
  let calls = 0
  const compute = async () => {
    calls += 1
    if (calls === 1) throw new Error('D1 暂时不可用')
    return { ok: true, n: calls }
  }

  await assert.rejects(() => getAdminStats(compute), /D1 暂时不可用/)

  // 关键：失败**没有**被缓存成"半分钟内的固定失败"
  const second = await getAdminStats(compute)
  assert.equal(calls, 2, '失败后下一次应当重新尝试')
  assert.equal(second.n, 2)

  // 且第二次成功后进入正常缓存
  const third = await getAdminStats(compute)
  assert.equal(calls, 2, '成功后应正常命中缓存')
  assert.equal(third.n, 2)
})

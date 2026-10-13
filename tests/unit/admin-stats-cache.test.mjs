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
  setStatsCachedAtForTest
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

  // 拨到 1 小时前 → 远超 TTL(30s)
  setStatsCachedAtForTest(Date.now() - 3_600_000)

  const after = await getAdminStats(compute)
  assert.equal(calls, 2, 'TTL 过期后应当重算')
  assert.equal(after.n, 2)
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

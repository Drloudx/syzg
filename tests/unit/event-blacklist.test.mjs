/**
 * 事件页黑名单回归：**隐藏地区的事件/探索区域必须被挡住**。
 *
 * ## 为什么需要这条
 *
 * 事件条目的地区信息**不在 `name` 里**，而在数组字段：
 *   · 随机事件 → `maps`（`c4_map`）+ `mapNames`（`黑森林`）
 *   · 探索区域 → `mapKey`（`c4_map`）+ `mapName`（`黑森林`）
 *
 * 而 `isBlacklisted` 只读固定一组字段名（`name`/`desc`/`tip`/`source`/`label`/`keywords`
 * 与数组型 `category`/`categories`/`place`/`mark`）—— **传 `maps` / `mapKey` 会被静默忽略**。
 *
 * 于是只传 `{ id, name }` 时：事件名（如「废弃的宝箱」）不含地区名 → 匹配不到 →
 * **筛选按钮被隐藏了、卡片却还在**（用户报告的现象）。
 *
 * ## 判据
 *
 * 「所属地区**全部**命中黑名单」才整条隐藏。只命中部分时保留 ——
 * 该条目在可见地区也能遇到（如「废弃的宝箱」c1~c5 都有），
 * 藏掉它会连可见地区的正常内容一起丢掉。详情里的「出现地图」标签单独过滤隐藏地区名。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { isBlacklisted } from '../../src/config/blacklist.js'
import { isHiddenRegionEvent, visibleEventMapNames } from '../../src/utils/eventData.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const parsed = JSON.parse(readFileSync(join(root, 'public/data/parsed/events.json'), 'utf8'))

test('🔴 随机事件：只属于隐藏地区的整条隐藏，跨地区的保留', () => {
  const events = parsed.events
  assert.ok(events.length > 0, '产物里应有随机事件')

  const kept = events.filter(e => !isHiddenRegionEvent(e))
  assert.ok(kept.length < events.length, '应当有事件被隐藏（否则说明判据没生效）')

  // 隐藏项：所属地图**全部**落在黑名单地区
  for (const e of events.filter(e => isHiddenRegionEvent(e))) {
    const labels = e.mapNames || []
    assert.ok(labels.length > 0, `${e.id} 被判隐藏，但没有任何地区标签`)
    assert.ok(
      labels.every(label => isBlacklisted(label)),
      `${e.id} 被判隐藏，但地区并非全部命中黑名单：${JSON.stringify(labels)}`
    )
  }

  // 保留项：至少有一个可见地区
  for (const e of kept) {
    const labels = e.mapNames || []
    if (!labels.length) continue
    assert.ok(
      labels.some(label => !isBlacklisted(label)),
      `${e.id} 被保留，但它的地区全在黑名单里：${JSON.stringify(labels)}`
    )
  }
})

test('🔴 探索区域：c4_map / c5_map 必须一条不剩', () => {
  const explores = parsed.explores
  assert.ok(explores.length > 0, '产物里应有探索区域')

  const kept = explores.filter(e => !isHiddenRegionEvent(e))
  const keptKeys = new Set(kept.map(e => e.mapKey))

  assert.ok(!keptKeys.has('c4_map'), '黑森林（c4_map）的探索区域仍漏出')
  assert.ok(!keptKeys.has('c5_map'), '霜烬平原（c5_map）的探索区域仍漏出')
  // 可见地区不受影响
  for (const key of ['c1_map', 'c2_map', 'c3_map']) {
    assert.ok(keptKeys.has(key), `可见地区 ${key} 的探索区域被误杀`)
  }
})

test('详情「出现地图」标签：不列出隐藏地区，也不误伤可见地区', () => {
  const sample = parsed.events.find(e => (e.mapNames || []).length >= 5)
  assert.ok(sample, '应有一个覆盖 5 个大地图的事件作为样本')

  const shown = visibleEventMapNames(sample)
  assert.ok(shown.length > 0, '可见地区标签不该为空')
  for (const label of shown) assert.ok(!isBlacklisted(label), `标签「${label}」属于隐藏地区`)
  assert.equal(shown.length, sample.mapNames.filter(n => !isBlacklisted(n)).length)
})

test('判据不依赖 name —— 事件名里没有地区名', () => {
  // 若哪天有人把判据改回只传 { id, name }，这条会红
  const hidden = parsed.events.filter(e => isHiddenRegionEvent(e))
  assert.ok(hidden.length > 0, '没有事件被判隐藏（判据可能退化成按名称匹配）')
  for (const e of hidden) {
    assert.ok(
      !isBlacklisted({ id: e.id, name: e.name }),
      `${e.id} 仅凭名称就命中黑名单，这条用例失去意义`
    )
  }
})

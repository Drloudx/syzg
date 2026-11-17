/**
 * 「最近使用」表情的本机偏好逻辑。
 *
 * 锁的都是**改坏了不会报错、只会静默出错**的点：
 *   - 上限：存多了「最近使用」会溢出一行（面板只有一行位置）；
 *   - 去重：同一个表情出现两次，会让"最近"里混进重复格子；
 *   - 失效 key：表情包被删/改名后渲染出**空白格**（不报错，只是看起来缺图）；
 *   - 脏存储：隐私模式/手改 localStorage 不该让表情面板崩掉。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RECENT_KIND,
  RECENT_MAX,
  RECENT_STORAGE_KEY,
  pushRecent,
  readRecentKeys,
  resolveRecent,
  writeRecentKeys
} from '../../src/utils/emoticonRecent.js'
import { EMOTICON_PACKS } from '../../src/config/emoticons.js'

/** 内存版 localStorage：本组测试不碰真实浏览器存储 */
function fakeStorage(initial) {
  const map = new Map(initial ? Object.entries(initial) : [])
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    raw: map
  }
}

test('一行放得下 7 个：上限就是 7（面板 352px / 列宽 36px / gap 4px 实测）', () => {
  assert.equal(RECENT_MAX, 7)
})

test('pushRecent：最新的排最前', () => {
  assert.deepEqual(pushRecent([], 'a'), ['a'])
  assert.deepEqual(pushRecent(['a'], 'b'), ['b', 'a'])
  assert.deepEqual(pushRecent(['b', 'a'], 'c'), ['c', 'b', 'a'])
})

test('pushRecent：重复选同一个只保留最前一个（去重）', () => {
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'])
  // 已经排在最前时结果不变
  assert.deepEqual(pushRecent(['a', 'b'], 'a'), ['a', 'b'])
})

test('pushRecent：超出上限时截掉最旧的', () => {
  const list = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']
  const next = pushRecent(list, 'k8')
  assert.equal(next.length, RECENT_MAX)
  assert.equal(next[0], 'k8')
  // 被挤掉的是最旧的那个
  assert.ok(!next.includes('k7'))
})

test('pushRecent：不改入参（响应式源不能被就地改）', () => {
  const list = ['a', 'b']
  pushRecent(list, 'c')
  assert.deepEqual(list, ['a', 'b'])
})

test('pushRecent：脏入参退化成空列表而不是抛错', () => {
  assert.deepEqual(pushRecent(null, 'a'), ['a'])
  assert.deepEqual(pushRecent('nope', 'a'), ['a'])
  assert.deepEqual(pushRecent(['a'], ''), ['a'])
})

test('resolveRecent：按 key 还原成目录项，并保持传入顺序', () => {
  const catalog = [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }, { key: 'c', name: 'C' }]
  const out = resolveRecent(['c', 'a'], catalog)
  assert.deepEqual(out.map(i => i.key), ['c', 'a'])
})

test('🔴 resolveRecent：目录里没有的 key 必须被过滤（否则渲染出空白格）', () => {
  const catalog = [{ key: 'a', name: 'A' }]
  const out = resolveRecent(['gone', 'a', 'also-gone'], catalog)
  assert.deepEqual(out.map(i => i.key), ['a'])
})

test('resolveRecent：支持 Map 索引，且结果不超过上限', () => {
  const map = new Map(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(k => [k, { key: k }]))
  const out = resolveRecent(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], map)
  assert.equal(out.length, RECENT_MAX)
})

test('resolveRecent：空/脏入参返回空数组', () => {
  assert.deepEqual(resolveRecent([], [{ key: 'a' }]), [])
  assert.deepEqual(resolveRecent(null, [{ key: 'a' }]), [])
})

test('readRecentKeys / writeRecentKeys 往返', () => {
  const storage = fakeStorage()
  writeRecentKeys(['a', 'b'], storage)
  assert.deepEqual(readRecentKeys(storage), ['a', 'b'])
})

test('readRecentKeys：脏数据（非 JSON / 非数组 / 混入非字符串）都退化成可用值', () => {
  assert.deepEqual(readRecentKeys(fakeStorage({ [RECENT_STORAGE_KEY]: 'not json{' })), [])
  assert.deepEqual(readRecentKeys(fakeStorage({ [RECENT_STORAGE_KEY]: '{"a":1}' })), [])
  assert.deepEqual(readRecentKeys(fakeStorage({ [RECENT_STORAGE_KEY]: '["a",1,null,"b"]' })), ['a', 'b'])
  assert.deepEqual(readRecentKeys(fakeStorage()), [])
})

test('存储抛异常（隐私模式 / 配额满）不影响使用', () => {
  const boom = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('quota') }
  }
  assert.deepEqual(readRecentKeys(boom), [])
  // 写入失败要静默：这只是一份本机偏好，不该影响发表评论
  assert.doesNotThrow(() => writeRecentKeys(['a'], boom))
})

test('🔴 真目录一致性：「最近使用」存的都是黄豆页签里真实存在的 key', () => {
  const tieba = EMOTICON_PACKS.find(p => p.kind === RECENT_KIND)
  assert.ok(tieba, '应当存在一个黄豆（kind=face）表情包')
  const keys = new Set(tieba.items.map(i => i.key))
  // 页面只用黄豆项写记录；任取目录里前几个验证它们能被还原
  const sample = tieba.items.slice(0, RECENT_MAX).map(i => i.key)
  const out = resolveRecent(sample, EMOTICON_PACKS.flatMap(p => p.items), { kind: RECENT_KIND })
  assert.equal(out.length, sample.length, '黄豆 key 必须都能从全目录还原')
  for (const item of out) assert.ok(keys.has(item.key))
})

/*
 * 以下三条锁的是**用户实际反馈过的一个 bug**（2026-10-09）：
 * 「最近使用」里混进了贴纸。根因是写入侧没有按 kind 过滤，而
 * `EMOTICON_ITEMS` 包含全部 93 项（黄豆 85 + 贴纸 8）。
 *
 * 两道防线都要有，缺任一条都会复发：
 *   ① 写入侧（组件 doPick）—— 只记黄豆；
 *   ② 读取侧（resolveRecent 的 kind 选项）—— 老记录里已有的贴纸也要滤掉，
 *      否则先前写进去的脏数据永远洗不掉。
 */

test('🔴 目录全量里既有黄豆也有贴纸（这正是当初漏判断的前提）', () => {
  const all = EMOTICON_PACKS.flatMap(p => p.items)
  const faces = all.filter(i => i.kind === RECENT_KIND)
  const others = all.filter(i => i.kind !== RECENT_KIND)
  assert.ok(faces.length > 0, '应当有黄豆项')
  assert.ok(others.length > 0, '应当有非黄豆项（贴纸），否则本组断言失去意义')
  // 每个项都带 kind —— 过滤才有依据
  assert.ok(all.every(i => typeof i.kind === 'string' && i.kind))
})

test('🔴 resolveRecent 必须滤掉贴纸（读取侧防线：老脏数据自愈）', () => {
  const all = EMOTICON_PACKS.flatMap(p => p.items)
  const face = all.find(i => i.kind === RECENT_KIND)
  const sticker = all.find(i => i.kind !== RECENT_KIND)

  // 模拟「早期版本写进去的混合记录」：贴纸排在最前
  const dirty = [sticker.key, face.key]
  const out = resolveRecent(dirty, all, { kind: RECENT_KIND })
  assert.deepEqual(out.map(i => i.key), [face.key], '贴纸应被滤掉，只剩黄豆')
})

test('resolveRecent 不传 kind 时保留原有行为（不做过滤）', () => {
  const all = EMOTICON_PACKS.flatMap(p => p.items)
  const sticker = all.find(i => i.kind !== RECENT_KIND)
  const out = resolveRecent([sticker.key], all)
  assert.deepEqual(out.map(i => i.key), [sticker.key])
})

test('只点贴纸时「最近使用」应当为空（模拟组件写入侧判据）', () => {
  const all = EMOTICON_PACKS.flatMap(p => p.items)
  const sticker = all.find(i => i.kind !== RECENT_KIND)
  // 组件的写入判据：非 RECENT_KIND 不入记录
  const keys = sticker.kind === RECENT_KIND ? pushRecent([], sticker.key) : []
  assert.deepEqual(resolveRecent(keys, all, { kind: RECENT_KIND }), [])
})

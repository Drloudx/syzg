/**
 * 评论区表情全生命周期测试：
 * 1. 目录表 ↔ 素材资源文件一致性与 token 语法；
 * 2. token 往返解析、字数统计与纯文本清洗；
 * 3. 「最近使用」本机偏好的增删、去重、上限截断与贴纸过滤。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  EMOTICON_ITEMS,
  EMOTICON_PACKS,
  EMOTICON_TOKEN_MAX_LENGTH,
  MAX_BODY_DISPLAY,
  MAX_BODY_RAW,
  buildEmoticonToken,
  countEmoticonDisplayChars,
  emoticonPlainText,
  findEmoticon,
  splitEmoticonSegments
} from '../../src/config/emoticons.js'
import {
  RECENT_KIND,
  RECENT_MAX,
  RECENT_STORAGE_KEY,
  pushRecent,
  readRecentKeys,
  resolveRecent,
  writeRecentKeys
} from '../../src/utils/emoticonRecent.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const PUBLIC = path.join(root, 'public')
const PACK_ID_RE = /^[a-z0-9]{2,12}$/
const KEY_RE = /^[a-z0-9_]{1,24}$/
const TIEBA = EMOTICON_PACKS.find(pack => pack.id === 'tieba')
const ABYSS = EMOTICON_PACKS.find(pack => pack.id === 'abyss1')
const TIEBA_A = TIEBA.items[0]
const ABYSS_A = ABYSS.items[0]

function fakeStorage(initial) {
  const map = new Map(initial ? Object.entries(initial) : [])
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    raw: map
  }
}

// ---------------- 目录表、语法与素材一致性 ----------------

test('目录表语法合法、无重复项，且与 public/images/emoticons 资源严格一一对应', () => {
  assert.ok(EMOTICON_ITEMS.length > 0)
  const seen = new Set()
  const expected = new Set()

  for (const pack of EMOTICON_PACKS) {
    assert.match(pack.id, PACK_ID_RE, `包 ID 不符合语法：${pack.id}`)
    assert.ok(pack.label.length > 0, `${pack.id} 缺 label`)
    assert.ok(['face', 'sticker'].includes(pack.kind), `${pack.id} 的 kind 只能是 face/sticker`)
    const names = pack.items.map(item => item.name)
    assert.equal(new Set(names).size, names.length, `${pack.id} 内有重名：${names.join(', ')}`)

    for (const item of pack.items) {
      assert.match(item.key, KEY_RE, `表情名不符合语法：${pack.id}:${item.key}`)
      assert.equal(typeof item.name, 'string', `${pack.id}:${item.key} 缺中文名`)
      assert.ok(item.name.trim().length > 0 && item.name.length <= 12)
      assert.equal(item.ariaName, `${pack.label} ${item.name}`)

      const id = `${item.packId}:${item.key}`
      assert.ok(!seen.has(id), `重复登记：${id}`)
      seen.add(id)

      const abs = path.join(PUBLIC, item.path.replace(/^\//, ''))
      assert.ok(existsSync(abs), `目录表里的表情缺素材：${item.path}`)
      assert.ok(item.path.endsWith('.webp'), `运行时素材应为 .webp：${item.path}`)
      expected.add(item.path)
    }
  }

  const longest = Math.max(...EMOTICON_ITEMS.map(i => buildEmoticonToken(i.packId, i.key).length))
  assert.ok(longest <= EMOTICON_TOKEN_MAX_LENGTH, `最长 token ${longest} 超过 ${EMOTICON_TOKEN_MAX_LENGTH}`)

  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) found.push(`/${path.relative(PUBLIC, full).replaceAll('\\', '/')}`)
    }
  }
  walk(path.join(PUBLIC, 'images/emoticons'))

  assert.equal(found.length, expected.size, `素材文件数与目录表不一致：${found.length} vs ${expected.size}`)
  for (const file of found) assert.ok(expected.has(file), `素材目录里有目录表未登记的文件：${file}`)
  assert.ok(existsSync(path.join(PUBLIC, 'ui/emoticon.svg')), '缺 public/ui/emoticon.svg')
})

test('每个表情都能 build → 解析回自己（token 往返）与 findEmoticon 检索', () => {
  for (const item of EMOTICON_ITEMS) {
    const token = buildEmoticonToken(item.packId, item.key)
    const segments = splitEmoticonSegments(token)
    assert.equal(segments.length, 1, `${token} 应恰好解析成一段`)
    assert.equal(segments[0].type, 'emoticon')
    assert.equal(segments[0].item, item, `${token} 解析出的目录项应与目录表同一对象`)
  }

  assert.ok(findEmoticon(TIEBA_A.packId, TIEBA_A.key))
  assert.ok(findEmoticon(ABYSS_A.packId, ABYSS_A.key))
  assert.equal(findEmoticon('tieba', 'syzg_ok'), null, '别包的 key 不应在本包命中')
  assert.equal(findEmoticon('nope', TIEBA_A.key), null)
})

test('显示字数计算：一个表情算 1 字且原始长度闸门覆盖极端输入', () => {
  const one = buildEmoticonToken(TIEBA_A.packId, TIEBA_A.key)
  const big = buildEmoticonToken(ABYSS_A.packId, ABYSS_A.key)

  assert.equal(countEmoticonDisplayChars(''), 0)
  assert.equal(countEmoticonDisplayChars('你好'), 2)
  assert.equal(countEmoticonDisplayChars(one), 1)
  assert.equal(countEmoticonDisplayChars(`v${one}你好`), 4)
  assert.equal(countEmoticonDisplayChars(`${one}${big}`), 2)
  assert.equal(countEmoticonDisplayChars(one.repeat(MAX_BODY_DISPLAY)), MAX_BODY_DISPLAY)
  assert.equal(countEmoticonDisplayChars(one.repeat(MAX_BODY_DISPLAY + 1)), MAX_BODY_DISPLAY + 1)

  assert.ok(MAX_BODY_RAW >= MAX_BODY_DISPLAY * EMOTICON_TOKEN_MAX_LENGTH)
  const longest = [...EMOTICON_ITEMS].map(i => buildEmoticonToken(i.packId, i.key)).sort((a, b) => b.length - a.length)[0]
  assert.ok(longest.repeat(MAX_BODY_DISPLAY).length <= MAX_BODY_RAW)
})

test('分段渲染、未知 token 容错与平文本摘录清洗', () => {
  const one = buildEmoticonToken(TIEBA_A.packId, TIEBA_A.key)
  const two = buildEmoticonToken(ABYSS_A.packId, ABYSS_A.key)
  const source = `第一行\n${one} 中间 ${two}\n\n结尾${one}`

  const segments = splitEmoticonSegments(source)
  const rebuilt = segments.map(s => (s.type === 'text' ? s.text : buildEmoticonToken(s.item.packId, s.item.key))).join('')
  assert.equal(rebuilt, source)
  assert.equal(segments.filter(s => s.type === 'emoticon').length, 3)

  // 未知 token 与语法错误
  const unknown = '[e:nope:whatever]'
  assert.deepEqual(splitEmoticonSegments(unknown), [{ type: 'text', text: unknown }])
  assert.equal(countEmoticonDisplayChars(unknown), unknown.length)

  // 纯文本导出
  assert.equal(emoticonPlainText(`前面 ${one} 后面`), `前面 [${TIEBA_A.name}] 后面`)
  assert.equal(emoticonPlainText('[e:nope:whatever] 与 [图片]'), '[e:nope:whatever] 与 [图片]')
  assert.equal(emoticonPlainText('纯文字'), '纯文字')
  assert.equal(emoticonPlainText(''), '')
})

// ---------------- 最近使用偏好逻辑 ----------------

test('pushRecent：前置插入、自动去重、上限截断与纯函数特性', () => {
  assert.equal(RECENT_MAX, 7)
  // 插入与排序
  assert.deepEqual(pushRecent([], 'a'), ['a'])
  assert.deepEqual(pushRecent(['a'], 'b'), ['b', 'a'])
  // 重复选保留最前
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'])
  assert.deepEqual(pushRecent(['a', 'b'], 'a'), ['a', 'b'])
  // 上限截断
  const list = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']
  const next = pushRecent(list, 'k8')
  assert.equal(next.length, RECENT_MAX)
  assert.equal(next[0], 'k8')
  assert.ok(!next.includes('k7'))
  // 不修改原数组
  const orig = ['a', 'b']
  pushRecent(orig, 'c')
  assert.deepEqual(orig, ['a', 'b'])
  // 脏入参容错
  assert.deepEqual(pushRecent(null, 'a'), ['a'])
  assert.deepEqual(pushRecent(['a'], ''), ['a'])
})

test('resolveRecent：还原目录项、过滤未知键、按 Map 索引与上限控制', () => {
  const catalog = [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }, { key: 'c', name: 'C' }]
  assert.deepEqual(resolveRecent(['c', 'a'], catalog).map(i => i.key), ['c', 'a'])

  // 过滤不存在的 key
  assert.deepEqual(resolveRecent(['gone', 'a', 'also-gone'], catalog).map(i => i.key), ['a'])

  // Map 索引与上限截断
  const map = new Map(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(k => [k, { key: k }]))
  const out = resolveRecent(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], map)
  assert.equal(out.length, RECENT_MAX)

  // 脏入参容错
  assert.deepEqual(resolveRecent([], [{ key: 'a' }]), [])
  assert.deepEqual(resolveRecent(null, [{ key: 'a' }]), [])
})

test('readRecentKeys / writeRecentKeys 存储往返、脏数据与异常容错', () => {
  const storage = fakeStorage()
  writeRecentKeys(['a', 'b'], storage)
  assert.deepEqual(readRecentKeys(storage), ['a', 'b'])

  // 脏数据解析兜底
  assert.deepEqual(readRecentKeys(fakeStorage({ [RECENT_STORAGE_KEY]: 'not json{' })), [])
  assert.deepEqual(readRecentKeys(fakeStorage({ [RECENT_STORAGE_KEY]: '{"a":1}' })), [])
  assert.deepEqual(readRecentKeys(fakeStorage({ [RECENT_STORAGE_KEY]: '["a",1,null,"b"]' })), ['a', 'b'])

  // 异常静默
  const boom = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('quota') }
  }
  assert.deepEqual(readRecentKeys(boom), [])
  assert.doesNotThrow(() => writeRecentKeys(['a'], boom))
})

test('resolveRecent 仅保留黄豆表情并过滤贴纸（老脏数据自愈）', () => {
  const all = EMOTICON_PACKS.flatMap(p => p.items)
  const face = all.find(i => i.kind === RECENT_KIND)
  const sticker = all.find(i => i.kind !== RECENT_KIND)
  assert.ok(face && sticker, '应当同时包含黄豆与非黄豆贴纸')

  const dirty = [sticker.key, face.key]
  const out = resolveRecent(dirty, all, { kind: RECENT_KIND })
  assert.deepEqual(out.map(i => i.key), [face.key], '贴纸应被滤掉，只剩黄豆')

  // 未传 kind 不做过滤
  assert.deepEqual(resolveRecent([sticker.key], all).map(i => i.key), [sticker.key])
})

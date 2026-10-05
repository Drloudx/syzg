/**
 * 聊天表情：token 语法、显示字数与「目录表 ↔ 素材文件」一致性。
 *
 * 这里锁的都是"改坏了不会报错、只会静默出错"的点：
 *   - token 解析丢字/多吃字（正文被改写）；
 *   - 显示字数前后端不一致（前端说没超、后端拒绝）；
 *   - 目录表里有、素材目录里没有（线上是一片破图，构建与 verify 都不会发现）。
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

const root = fileURLToPath(new URL('../../', import.meta.url))
const PUBLIC = path.join(root, 'public')
const PACK_ID_RE = /^[a-z0-9]{2,12}$/
const KEY_RE = /^[a-z0-9_]{1,24}$/
const TIEBA = EMOTICON_PACKS.find((pack) => pack.id === 'tieba')
const ABYSS = EMOTICON_PACKS.find((pack) => pack.id === 'abyss1')
/** 取目录表里真实存在的表情来构造 token（不写死会随素材更新失效的 key） */
const TIEBA_A = TIEBA.items[0]
const TIEBA_B = TIEBA.items[1]
const ABYSS_A = ABYSS.items[0]

test('每个表情都能 build → 解析回自己（token 往返）', () => {
  assert.ok(EMOTICON_ITEMS.length > 0)
  for (const item of EMOTICON_ITEMS) {
    const token = buildEmoticonToken(item.packId, item.key)
    const segments = splitEmoticonSegments(token)
    assert.equal(segments.length, 1, `${token} 应恰好解析成一段`)
    assert.equal(segments[0].type, 'emoticon')
    assert.equal(segments[0].item, item, `${token} 解析出的目录项应与目录表同一对象`)
  }
})

test('表情名与包 ID 符合语法上限（最长 token 不超过语法允许长度）', () => {
  for (const pack of EMOTICON_PACKS) {
    assert.match(pack.id, PACK_ID_RE, `包 ID 不符合语法：${pack.id}`)
    assert.ok(pack.label.length > 0, `${pack.id} 缺 label`)
    assert.ok(['face', 'sticker'].includes(pack.kind), `${pack.id} 的 kind 只能是 face/sticker`)
    for (const item of pack.items) {
      assert.match(item.key, KEY_RE, `表情名不符合语法：${pack.id}:${item.key}`)
    }
  }
  const longest = Math.max(...EMOTICON_ITEMS.map((i) => buildEmoticonToken(i.packId, i.key).length))
  assert.ok(longest <= EMOTICON_TOKEN_MAX_LENGTH, `最长 token ${longest} 超过 ${EMOTICON_TOKEN_MAX_LENGTH}`)
})

test('目录里没有重复的「包 ID + 表情名」', () => {
  const seen = new Set()
  for (const item of EMOTICON_ITEMS) {
    const id = `${item.packId}:${item.key}`
    assert.ok(!seen.has(id), `重复登记：${id}`)
    seen.add(id)
  }
})

test('显示字数：一个表情算 1 字', () => {
  const one = buildEmoticonToken(TIEBA_A.packId, TIEBA_A.key)
  const big = buildEmoticonToken(ABYSS_A.packId, ABYSS_A.key)

  assert.equal(countEmoticonDisplayChars(''), 0)
  assert.equal(countEmoticonDisplayChars('   '), 3)
  assert.equal(countEmoticonDisplayChars('你好'), 2)
  assert.equal(countEmoticonDisplayChars(one), 1)
  assert.equal(countEmoticonDisplayChars(big), 1)
  assert.equal(countEmoticonDisplayChars(`v${one}你好`), 4)
  assert.equal(countEmoticonDisplayChars(`${one}${big}`), 2)

  // 200 个表情正好到上限，201 个超限；原始长度远大于 200，但显示字数就是条数
  assert.equal(countEmoticonDisplayChars(one.repeat(MAX_BODY_DISPLAY)), MAX_BODY_DISPLAY)
  assert.equal(countEmoticonDisplayChars(one.repeat(MAX_BODY_DISPLAY + 1)), MAX_BODY_DISPLAY + 1)
  assert.ok(one.repeat(MAX_BODY_DISPLAY).length > MAX_BODY_DISPLAY)
})

test('原始长度闸门覆盖「全是最长 token」的极端输入', () => {
  // 否则 200 个合法表情会因为原始长度过长被判成超长请求
  assert.ok(MAX_BODY_RAW >= MAX_BODY_DISPLAY * EMOTICON_TOKEN_MAX_LENGTH)
  const longest = [...EMOTICON_ITEMS]
    .map((i) => buildEmoticonToken(i.packId, i.key))
    .sort((a, b) => b.length - a.length)[0]
  assert.ok(longest.repeat(MAX_BODY_DISPLAY).length <= MAX_BODY_RAW)
})

test('目录外的 token 当普通文字：不替换、不被吃掉、按原长度计', () => {
  const unknown = '[e:nope:whatever]'
  const segments = splitEmoticonSegments(unknown)
  assert.deepEqual(segments, [{ type: 'text', text: unknown }])
  assert.equal(countEmoticonDisplayChars(unknown), unknown.length)
  // 语法不合法的方括号也照旧是普通文字
  const malformed = '[e:tieba:25 缺右括号] 与 [图片]'
  assert.deepEqual(splitEmoticonSegments(malformed), [{ type: 'text', text: malformed }])
})

test('分段渲染与原文逐字等价（不发生丢字/多吃字）', () => {
  const one = buildEmoticonToken(TIEBA_A.packId, TIEBA_A.key)
  const two = buildEmoticonToken(ABYSS_A.packId, ABYSS_A.key)
  const source = `第一行\n${one} 中间 ${two}\n\n结尾${one}`

  const segments = splitEmoticonSegments(source)
  const rebuilt = segments
    .map((s) => (s.type === 'text' ? s.text : buildEmoticonToken(s.item.packId, s.item.key)))
    .join('')
  assert.equal(rebuilt, source)
  // 换行与连续空格原样保留在文字段里（父级 white-space: pre-wrap 才能继续生效）
  assert.equal(segments.filter((s) => s.type === 'emoticon').length, 3)
  assert.ok(segments.some((s) => s.type === 'text' && s.text.includes('\n\n')))
})

test('emoticonPlainText：认识的表情换成中文名，其余原样（回复条摘录用）', () => {
  const one = buildEmoticonToken(TIEBA_A.packId, TIEBA_A.key)
  assert.equal(emoticonPlainText(`前面 ${one} 后面`), `前面 [${TIEBA_A.name}] 后面`)
  // 目录外的 token 与不合语法的方括号都原样保留（不能悄悄吃掉用户写的东西）
  assert.equal(emoticonPlainText('[e:nope:whatever] 与 [图片]'), '[e:nope:whatever] 与 [图片]')
  // 没有表情时是恒等变换
  assert.equal(emoticonPlainText('纯文字'), '纯文字')
  assert.equal(emoticonPlainText(''), '')
  assert.equal(emoticonPlainText(null), '')
})

test('每个表情都有中文名，且同一包内不重名（选择器悬停提示要用）', () => {
  for (const pack of EMOTICON_PACKS) {
    const names = pack.items.map((item) => item.name)
    for (const item of pack.items) {
      assert.equal(typeof item.name, 'string', `${pack.id}:${item.key} 缺中文名`)
      assert.ok(item.name.trim().length > 0, `${pack.id}:${item.key} 中文名为空`)
      assert.ok(item.name.length <= 12, `${pack.id}:${item.key} 名字过长：${item.name}`)
      assert.equal(item.ariaName, `${pack.label} ${item.name}`)
    }
    assert.equal(new Set(names).size, names.length, `${pack.id} 内有重名：${names.join(', ')}`)
  }
})

test('findEmoticon 只在目录内命中', () => {
  assert.ok(findEmoticon(TIEBA_A.packId, TIEBA_A.key))
  assert.ok(findEmoticon(ABYSS_A.packId, ABYSS_A.key))
  assert.equal(findEmoticon('tieba', 'syzg_ok'), null, '别包的 key 不应在本包命中')
  assert.equal(findEmoticon('nope', TIEBA_A.key), null)
  assert.equal(findEmoticon('tieba', 'image_emoticon25'), null, '旧编号 token 已不在目录里')
})

test('目录表与 public/images/emoticons 双向一一对应（无缺图、无漏登记）', () => {
  const expected = new Set()
  for (const item of EMOTICON_ITEMS) {
    const abs = path.join(PUBLIC, item.path.replace(/^\//, ''))
    assert.ok(existsSync(abs), `目录表里的表情缺素材：${item.path}`)
    assert.ok(item.path.endsWith('.webp'), `运行时素材应为 .webp：${item.path}`)
    expected.add(item.path)
  }

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

  // 发表区的图标按钮（矢量笑脸，`CommentComposer` 以 CSS mask 上色）
  assert.ok(existsSync(path.join(PUBLIC, 'ui/emoticon.svg')), '缺 public/ui/emoticon.svg')
})

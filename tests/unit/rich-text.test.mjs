import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRichText, parseInline, richTextToPlain } from '../../src/utils/richText.js'

test('富文本多层嵌套：加粗 + 倾斜 + 颜色', () => {
  const input = '**{red}*加粗倾斜红字*{/red}**'
  const segs = parseInline(input)
  assert.equal(segs.length, 1)
  assert.equal(segs[0].type, 'bold')
  assert.equal(segs[0].children[0].type, 'color')
  assert.equal(segs[0].children[0].colorKey, 'red')
  assert.equal(segs[0].children[0].children[0].type, 'italic')
  assert.equal(segs[0].children[0].children[0].children[0].text, '加粗倾斜红字')
})

test('富文本粗斜体：***加粗倾斜***', () => {
  const input = '这是***加粗倾斜***内容'
  const segs = parseInline(input)
  assert.equal(segs.length, 3)
  assert.equal(segs[0].text, '这是')
  assert.equal(segs[1].type, 'bold')
  assert.equal(segs[1].children[0].type, 'italic')
  assert.equal(segs[1].children[0].children[0].text, '加粗倾斜')
  assert.equal(segs[2].text, '内容')
})

test('富文本块级元素：标题、引用、分割线、列表', () => {
  const input = `### 大标题
> 这是引用提示
---
- 列表项1
- 列表项2`
  const blocks = parseRichText(input)
  assert.equal(blocks[0].type, 'heading')
  assert.equal(blocks[0].level, 3)
  assert.equal(blocks[1].type, 'quote')
  assert.equal(blocks[2].type, 'hr')
  assert.equal(blocks[3].type, 'list')
  assert.equal(blocks[3].items.length, 2)
})

test('richTextToPlain 抽取纯文本无污染', () => {
  const input = `### 大标题
**{red}加粗红字{/red}** 还有普通文本
- 项1
- 项2`
  const plain = richTextToPlain(input)
  assert.ok(plain.includes('大标题'))
  assert.ok(plain.includes('加粗红字 还有普通文本'))
  assert.ok(!plain.includes('**'))
  assert.ok(!plain.includes('{red}'))
})

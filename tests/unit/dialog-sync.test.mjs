import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pruneDialogScript } from '../../scripts/dev/sync-dialogs.mjs'
import { buildDungeonRoutes } from '../../scripts/parse/extractDungeonRoutes.mjs'

test('pruneDialogScript 只保留页面读取的 text/option，其余字段不动', () => {
  const obj = {
    des: '描述',
    script: 'sid',
    exps: [
      { key: 'tag', para: { tag: 'tag_1' } },
      { key: 'text', para: { text: '你好', charaName: 'A' } },
      { key: 'moveLayer', para: { layer: 'chara2' } },
      { key: 'option', para: { options: [{ text: '走' }] } },
      { key: 'wait', para: { t: 1 } }
    ]
  }
  const out = pruneDialogScript(obj)
  assert.equal(out.des, '描述')
  assert.equal(out.script, 'sid')
  assert.deepEqual(out.exps.map(e => e.key), ['text', 'option'])
})

test('pruneDialogScript 对非剧本结构原样返回', () => {
  assert.equal(pruneDialogScript(null), null)
  const plain = { foo: 1 }
  assert.deepEqual(pruneDialogScript(plain), plain)
  const noExps = { des: 'x', exps: 'not-an-array' }
  assert.deepEqual(pruneDialogScript(noExps), noExps)
})

test('dungeon routes 生成是纯函数（不写盘、可重复调用结果一致）', () => {
  const src = { datas: { d: { category: ['副本'], layers: [{ layerDatas: [{ rooms: { r: { typeId: 'r', roomTypeId: 'x' } } }] }] } } }
  assert.equal(buildDungeonRoutes(src), buildDungeonRoutes(src))
})

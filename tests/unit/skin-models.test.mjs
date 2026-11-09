import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadSkinModelImages } from '../../scripts/parse/skin-models.mjs'

test('skin previews require the exact configured skeleton and skin, not a matching name', () => {
  const skins = JSON.parse(readFileSync(new URL('../../raw/skin.json', import.meta.url), 'utf8'))
  const images = loadSkinModelImages(skins)
  assert.ok(images.hero_005_skin01?.endsWith('/hero_005_skin01.webp'))
  assert.ok(images.hero_036_skin01?.endsWith('/hero_036_skin01.webp'))
  /*
   * 核心判据：skeletonName / skinName 任一不匹配，预览必须被拒。
   * 先记录当前命中的全部条目，再把这两项改错，验证「整批都消失」——
   * 断言不依赖具体有几个皮肤（模型图数量随导出进度变化）。
   */
  const before = Object.keys(images).length
  assert.ok(before >= 2, `至少应命中 2 个皮肤预览，实际 ${before}`)
  skins.datas.hero_005_skin01.skeletonName = 'Npc_005'
  skins.datas.hero_036_skin01.skinName = 'different'
  const after = loadSkinModelImages(skins)
  assert.ok(!after.hero_005_skin01, 'skeletonName 不匹配应被拒')
  assert.ok(!after.hero_036_skin01, 'skinName 不匹配应被拒')
})

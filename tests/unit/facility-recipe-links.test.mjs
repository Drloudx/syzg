/**
 * 设施/锻造死链回归。
 *
 * 背景（2026-10-06）：物品详情里的「查看锻造台 / 查看设施」是无条件渲染的，
 * 而设施页渲染前会过滤黑名单配方与被隐藏品阶（`HIDDEN_EQUIP_TIERS = [4, 5]`）。
 * 于是 4/5 阶装备会生成一个 `level=4` 的链接，点过去**一条都不显示**。
 *
 * 这里直接用**随包发布的产物**断言「凡是被设施页隐藏的配方，都不应被当成可达目标」，
 * 而不是只在组件里加判断——判据一旦和设施页的过滤逻辑分叉，这条测试就会红。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  HIDDEN_EQUIP_TIERS,
  isFacilityRecipeHidden,
  visibleEquipTiers
} from '../../src/config/blacklist.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = name => JSON.parse(readFileSync(join(root, 'public/data/parsed', name), 'utf8'))

const items = read('items.json').items
const facilities = read('facilities.json')

/** 设施页实际会渲染出来的配方 key（`facility|level|outputTypeId`），复刻 FacilitiesView 的过滤。 */
const reachableFacilityRecipes = () => {
  const keys = new Set()
  for (const facility of facilities) {
    if (facility.key === 'camp') continue
    for (const mode of facility.modes || []) {
      for (const recipe of mode.recipes || []) {
        if (isFacilityRecipeHidden({ ...recipe, mode: mode.key })) continue
        keys.add(`${facility.key}|${Number(recipe.level)}|${recipe.output?.typeId}`)
      }
    }
  }
  return keys
}

test('物品详情的「查看设施」不会指向设施页隐藏的配方', () => {
  const reachable = reachableFacilityRecipes()
  const dead = []
  for (const item of items) {
    for (const recipe of item.facilityCrafting || []) {
      if (isFacilityRecipeHidden({ ...recipe, mode: recipe.mode || 'crafting' })) continue // 已判为不可达，不渲染按钮
      const key = `${recipe.facility}|${Number(recipe.level)}|${item.typeId}`
      if (!reachable.has(key)) dead.push(`${item.typeId} ${item.name} -> ${key}`)
    }
  }
  assert.deepEqual(dead, [], `以下物品的「查看设施」会落到空列表：\n${dead.join('\n')}`)
})

test('物品详情的「查看锻造台」不会指向被隐藏的装备品阶', () => {
  const dead = []
  for (const item of items) {
    for (const recipe of item.smithing?.recipes || []) {
      if (isFacilityRecipeHidden({ ...recipe, mode: 'equipment' })) continue
      if (!visibleEquipTiers().map(Number).includes(Number(recipe.equipLevel))) {
        dead.push(`${item.typeId} ${item.name} -> 第 ${recipe.equipLevel} 阶`)
      }
    }
  }
  assert.deepEqual(dead, [], `以下物品的「查看锻造台」会落到空列表：\n${dead.join('\n')}`)
})

test('隐藏品阶的装备确实仍存在于产物里（说明过滤发生在展示层，不是数据缺失）', () => {
  const hiddenTiers = HIDDEN_EQUIP_TIERS.map(Number)
  const stillPresent = items.filter(item =>
    hiddenTiers.includes(Number(item.equip?.equipLevel)))
  assert.ok(stillPresent.length > 0, '隐藏品阶的装备不应从产物中被删除，只应在展示层隐藏')
})

test('isFacilityRecipeHidden 同时覆盖黑名单与隐藏品阶两条判据', () => {
  // 4 阶装备：命中隐藏品阶
  assert.equal(isFacilityRecipeHidden({
    mode: 'equipment', equipLevel: 4, output: { typeId: 'x', name: '普通装备' }, materials: []
  }), true)
  // 3 阶装备：可见
  assert.equal(isFacilityRecipeHidden({
    mode: 'equipment', equipLevel: 3, output: { typeId: 'x', name: '普通装备' }, materials: []
  }), false)
  // 产出物命中黑名单
  assert.equal(isFacilityRecipeHidden({
    level: 7, output: { typeId: 'item_31012', name: '熔火护盾' }, materials: []
  }), true)
  // 材料命中黑名单
  assert.equal(isFacilityRecipeHidden({
    level: 7, output: { typeId: 'ok', name: '正常产物' }, materials: [{ typeId: 'item_10115', name: '熔火结晶' }]
  }), true)
  assert.equal(isFacilityRecipeHidden(null), true)
})

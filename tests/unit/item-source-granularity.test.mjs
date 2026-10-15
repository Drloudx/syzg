/**
 * 物品来源的展示粒度：**材料收敛、装备保留明细**。
 *
 * ## 为什么需要
 *
 * 三处曾经都过度膨胀或缺失（用户报告）：
 *   1. 材料在副本里按 `battle.name` 逐难度/逐房间列 —— 「黑涧浴池 · 浴池·噩梦 / · 转化部 /
 *      · 净化部 / · 溶洞部」是同一个副本的四条分支，一件常见素材能堆出十几行；
 *   2. 关卡只有「首次通关」来源，没有普通掉落。
 *
 * ## 口径（改动后）
 *
 * | 物品 | 副本掉落 | 关卡掉落 |
 * | --- | --- | --- |
 * | **材料**（`category` 不含 4） | 每个副本一行，`des` 统一「副本掉落」 | `x-x 关卡名`，无难度无房间 |
 * | **装备**（`category` 含 4） | **保持逐条**：结算/首通/金·银·铜宝箱/房间各一条 | 同左（含首通） |
 *
 * 🔴 装备**不能**跟着收敛：「哪一档、哪个宝箱出这件装备」是装备图鉴的核心信息。
 * 判据是 `category` 含 `4`，**不看品质** —— 低阶装备同样是装备。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { buildDungeonItemSources } from '../../src/utils/dungeonData.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const sources = JSON.parse(readFileSync(join(root, 'public/data/parsed/item-sources.json'), 'utf8'))
const itemsJson = JSON.parse(readFileSync(join(root, 'public/data/parsed/items.json'), 'utf8'))
const itemArr = Array.isArray(itemsJson.items) ? itemsJson.items : Object.values(itemsJson.items || itemsJson.datas || itemsJson)
const itemById = Object.fromEntries(itemArr.filter(x => x?.typeId).map(x => [x.typeId, x]))

const isEquip = id => (itemById[id]?.category || []).map(String).includes('4')
const byType = type => Object.values(sources).flat().filter(s => s.type === type)

test('🔴 材料：副本掉落每个副本只留一行，说明统一为「副本掉落」', () => {
  const materialDungeon = Object.entries(sources)
    .filter(([id]) => !isEquip(id))
    .flatMap(([, list]) => list.filter(s => s.type === 'dungeon'))
  assert.ok(materialDungeon.length > 0, '产物里应有材料副本来源')

  for (const s of materialDungeon) {
    assert.ok(!s.name.includes(' · '), `材料副本名不应带难度：${s.name}`)
    assert.equal(s.des, '副本掉落', `材料副本说明应为「副本掉落」：${s.name} | ${s.des}`)
  }

  // 同一物品内，同一副本不得出现两次
  const dup = []
  for (const [itemId, list] of Object.entries(sources)) {
    if (isEquip(itemId)) continue
    const seen = new Set()
    for (const s of list) {
      if (s.type !== 'dungeon') continue
      if (seen.has(s.name)) dup.push(`${itemId}: ${s.name}`)
      seen.add(s.name)
    }
  }
  assert.equal(dup.length, 0, `材料副本来源重复：${dup.slice(0, 5).join('、')}`)
})

test('🔴 装备：副本掉落**保持逐条明细**，不被收敛', () => {
  const equipDungeon = Object.entries(sources)
    .filter(([id]) => isEquip(id))
    .flatMap(([, list]) => list.filter(s => s.type === 'dungeon'))
  assert.ok(equipDungeon.length > 0, '产物里应有装备副本来源')

  // 装备仍带「副本名 · 难度」，且同一件装备在同一副本下**允许多条**
  const multi = new Map()
  for (const [itemId, list] of Object.entries(sources)) {
    if (!isEquip(itemId)) continue
    const byDungeon = new Map()
    for (const s of list) {
      if (s.type !== 'dungeon') continue
      const dungeon = s.name.split(' · ')[0]
      byDungeon.set(dungeon, (byDungeon.get(dungeon) || 0) + 1)
    }
    for (const [dungeon, n] of byDungeon) if (n > 1) multi.set(`${itemId}|${dungeon}`, n)
  }
  assert.ok(multi.size > 0, '装备逐条明细应存在同副本多行（如噩梦/深层各有金银箱）')

  // 装备的宝箱来源要保留概率文案（逐条明细的意义就在于能比较哪档概率高）
  const chest = equipDungeon.filter(s => s.dropTab === 'chest')
  assert.ok(chest.length > 0, '装备应有宝箱来源')
  for (const s of chest.slice(0, 200)) {
    assert.match(s.des, /箱内综合概率/, `装备宝箱来源丢了概率文案：${s.name} | ${s.des}`)
  }
})

test('🔴 关卡掉落：名字是 `x-x 关卡名`，不带难度、不带房间', () => {
  const stage = byType('stage')
  assert.ok(stage.length > 0, '产物里应有新的关卡来源')

  for (const s of stage) {
    assert.match(s.name, /^\d+-\d+ .+/, `关卡来源名格式不对：${s.name}`)
    assert.ok(!/简单|普通|困难/.test(s.name), `关卡来源名不应带难度：${s.name}`)
    assert.ok(!s.name.includes(' · '), `关卡来源名不应带房间/分区：${s.name}`)
    assert.match(s.id, /^c\d+_\d+$/, `关卡来源 id 不是 stage id：${s.id}`)
    assert.ok(['关卡掉落', '关卡首通奖励'].includes(s.des), `关卡来源 des 意外：${s.des}`)
  }
})

test('关卡首通：材料不带、装备保留', () => {
  for (const [itemId, list] of Object.entries(sources)) {
    const first = list.filter(s => s.type === 'stage' && /首通/.test(s.des))
    if (!first.length) continue
    assert.ok(isEquip(itemId), `非装备不该有关卡首通来源：${itemId} ${itemById[itemId]?.name}`)
  }
  // 反向：装备首通确实存在（否则这条测试空转）
  const equipFirst = Object.entries(sources).filter(([id, l]) => isEquip(id) && l.some(s => /首通/.test(s.des)))
  assert.ok(equipFirst.length > 0, '应存在带首通来源的装备')
})

test('buildDungeonItemSources：材料收敛为一条、装备逐条保留', () => {
  const drop = typeId => ({ typeId, name: typeId, min: 1, max: 1, actualProb: 1, ruleMode: 'item' })
  const itemJson = { datas: {
    item_mat: { typeId: 'item_mat', name: '材料', category: [1] },
    item_equ: { typeId: 'item_equ', name: '装备', category: [4, 41] }
  } }
  const built = buildDungeonItemSources([{
    name: '黑涧浴池',
    id: 'c3_d2',
    // 真实形态：battles[0] 是噩梦（id 带 `_d`），battles[1] 是它的前一难度（id 去掉 `_d`）
    battles: [
      { id: 'xg_d', name: '浴池·噩梦', reward: [drop('item_mat'), drop('item_equ')] },
      { id: 'xg', name: '浴池·转化部', reward: [drop('item_mat'), drop('item_equ')] },
      { id: 'xg2', name: '浴池·净化部', reward: [drop('item_mat'), drop('item_equ')] }
    ]
  }], itemJson)

  // 材料：3 个难度 → 1 条，id 指向噩梦的前一难度
  assert.equal(built.item_mat.length, 1, '材料应收敛为一条')
  assert.equal(built.item_mat[0].name, '黑涧浴池')
  assert.equal(built.item_mat[0].id, 'xg', '材料应指向噩梦(_d)的前一难度')

  // 装备：3 个难度 → 3 条，各自带难度名与自己的 id
  assert.equal(built.item_equ.length, 3, '装备应逐条保留')
  assert.deepEqual(built.item_equ.map(x => x.name).sort(),
    ['黑涧浴池 · 浴池·噩梦', '黑涧浴池 · 浴池·转化部', '黑涧浴池 · 浴池·净化部'].sort())
  assert.deepEqual(built.item_equ.map(x => x.id).sort(), ['xg', 'xg2', 'xg_d'].sort())
})

test('buildDungeonItemSources：规律不成立时回退首项，不产生死链', () => {
  const drop = typeId => ({ typeId, name: typeId, min: 1, max: 1, actualProb: 1, ruleMode: 'item' })
  const built = buildDungeonItemSources([{
    name: '普通副本',
    id: 'pd',
    battles: [{ id: 'only', name: '唯一难度', reward: [drop('item_c')] }]
  }], { datas: { item_c: { typeId: 'item_c', name: '材料', category: [1] } } })
  assert.equal(built.item_c[0].id, 'only')
})

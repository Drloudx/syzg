import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildEquipAttributeItems, buildSmithingData } from '../../src/utils/itemParser.js'
import { translateStatName } from '../../src/utils/gameMappings.js'

/**
 * 锻造数据 fixture。
 *
 * 2026-11-10 起锻造台以 `itemExchange`（装备兑换）为主数据源，`itemExchangeRandom`
 * 只提供全局品质概率 `ruleTeam.equipMake`。旧 fixture 只给 random 表，已不适用。
 */
const fixture = () => ({
  // 只提供全局品质概率（蓝 25 / 紫 60 / 橙 15）
  itemExchangeRandomRes: {
    datas: {},
    ruleTeam: { equipMake: [
      { value: '3', chance: 25 }, { value: '4', chance: 60 }, { value: '5', chance: 15 }
    ] }
  },
  // 装备兑换表：武器走 equipGroup（池子），头盔走 equip（单件）
  itemExchangeRes: {
    itemExchange: {
      1001: { consume: 'make_sword', category: ['装备兑换', 'c1', '蓝'], reward: 'equip_sword', team: 'forge_c1' },
      1001_1: { consume: 'make_sword_1', category: ['装备兑换', 'c1', '紫'], reward: 'equip_sword_1', team: 'forge_c1_1' },
      1002: { consume: 'make_helmet', category: ['装备兑换', 'c1', '蓝'], reward: 'equip_helmet', team: 'forge_c1' },
      // 非装备兑换类应被忽略
      9001: { consume: 'make_sword', category: ['道具兑换'], reward: 'equip_sword', team: 'forge_c1' }
    }
  },
  exchangeTeamRes: { blacksmith: [{ randomTeamList: ['forge_c1', 'forge_c1_1'], equipLevel: 1 }] },
  consumeRes: { datas: {
    make_sword: { items: [{ typeId: 'ore', num: 2 }] },
    make_sword_1: { items: [{ typeId: 'ore', num: 3 }] },
    make_helmet: { items: [{ typeId: 'cloth', num: 3 }] }
  } },
  rewardRes: { datas: {
    equip_sword: { items: [{ rules: [{ mode: 'equipGroup', equipTypeGroup: 'swords', qualityGroup: 'blue' }] }] },
    equip_sword_1: { items: [{ rules: [{ mode: 'equipGroup', equipTypeGroup: 'swords', qualityGroup: 'purple' }] }] },
    equip_helmet: { items: [{ rules: [{ mode: 'equip', typeId: 'helmet', quality: 3 }] }] }
  } },
  equipGroupRes: {
    equipGroups: { swords: { type: [{ typeId: 'sword', chance: 1 }] } },
    qualityGroups: {
      blue: [{ quality: 3, chance: 1 }],
      purple: [{ quality: 4, chance: 1 }],
      orange: [{ quality: 5, chance: 1 }]
    }
  },
  itemRes: { datas: {
    sword: { typeId: 'sword', equip: { equipLevel: 1, position: 1 } },
    helmet: { typeId: 'helmet', equip: { equipLevel: 1, position: 2 } },
    ore: { typeId: 'ore', name: '铜锭', img: 'ore_icon', quality: 2 },
    cloth: { typeId: 'cloth', name: '粗布', img: 'cloth_icon', quality: 1 },
    potion: { typeId: 'potion', name: '药水' }
  } }
})

test('smithing binds exact and grouped equipment with consume materials', () => {
  const data = buildSmithingData(fixture())
  // 武器来自 equipGroup 池，头盔来自 equip 单件
  assert.ok(data.sword, '武器应能从 equipGroup 池解析出来')
  assert.ok(data.helmet, '头盔应能从 equip 单件解析出来')
  assert.equal(data.sword[0].entryQuality, 3)
  assert.equal(data.helmet[0].entryQuality, 3)
  assert.deepEqual(data.sword[0].materials, [{
    typeId: 'ore', name: '铜锭', img: '/images/Common_ItemIcon/ore_icon.webp', quality: 2, num: 2
  }])
  // 非装备兑换条目、非装备物品都不应出现在结果里
  assert.equal(data.potion, undefined)
})

test('smithing quality chance follows global equipMake ruleTeam', () => {
  const data = buildSmithingData(fixture())
  assert.deepEqual(data.sword[0].qualityChances.map(entry => [entry.quality, entry.chance]), [
    [3, 0.25], [4, 0.6], [5, 0.15]
  ])
})

test('smithing merges multi-quality exchange entries for the same equipment', () => {
  const data = buildSmithingData(fixture())
  // 1001 蓝 + 1001_1 紫 是同款武器的两档兑换，应合并成一条配方并记录两档品质
  assert.equal(data.sword.length, 1)
  assert.deepEqual(data.sword[0].obtainableQualities, [3, 4])
})

test('equipment attributes hide zero values, put enhanceable stats first and map cirtDam', () => {
  const attributes = buildEquipAttributeItems({
    crit: { min: 0, max: 0, grows: false },
    cirtDam: { min: 4, max: 4, grows: false },
    maxHp: { min: 775, max: 805, grows: true },
    magicDef: { min: 114, max: 118, grows: true }
  })
  assert.deepEqual(attributes.map(attribute => attribute.key), ['magicDef', 'maxHp', 'cirtDam'])
  assert.equal(translateStatName('cirtDam'), '暴击伤害')
})

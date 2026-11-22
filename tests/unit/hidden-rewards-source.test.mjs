import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildHiddenRewards } from '../../src/utils/hiddenRewardsData.js'

/**
 * 隐藏点位（检视类采集物）判定规则：
 * 源码 `BattleManager.GetCollectUIText` 里 collectType 1=对话 2=采集 3=挖掘 4=伐 5=检视。
 * 场景宝箱、书籍、聆听偶遇都是 collectType=5，靠 reward.category 中文名判定会漏。
 */
function makeMaps(rewardCategory, collectType = 5) {
  return {
    rewardRes: {
      datas: {
        r1: {
          typeId: 'r1',
          category: rewardCategory,
          items: [{ rules: [{ typeId: 'item_book', min: 1, max: 1 }] }]
        }
      }
    },
    collectTypeRes: { datas: { ct1: { collectTypeId: 'ct1', collectType, reward: 'r1', name: '隐藏物品' } } },
    collectRes: { datas: { c1: { typeId: 'c1', collectTypeId: 'ct1' } } },
    roomRes: { datas: { stage_x: { typeId: 'stage_x', battleData: { spObj: [{ caijiTypeId: 'c1' }] } } } },
    levelRoomRes: { datas: { 'stage_x-1': { typeId: 'stage_x-1', roomTypeId: 'stage_x', areaId: 'c1_area1', name: '某房间' } } },
    areaRes: { datas: { c1_area1: { name: '某区域' }, c1_map: { name: '某大地图' } } }
  }
}

test('书籍类（category 大地图采集/书籍）也应生成隐藏点位', () => {
  const { hidden, sources } = buildHiddenRewards(makeMaps(['大地图采集', 'c1', '书籍']))
  assert.equal(hidden.length, 1)
  assert.equal(hidden[0].sourceLabel, '书籍')
  assert.ok(sources.item_book, '书籍物品应获得来源')
  assert.equal(sources.item_book[0].name, '书籍')
})

test('场景宝箱（旧分类）仍按原逻辑收录，标签为场景宝箱', () => {
  const { hidden, sources } = buildHiddenRewards(makeMaps(['采集', '场景宝箱']))
  assert.equal(hidden.length, 1)
  assert.equal(hidden[0].sourceLabel, '场景宝箱')
  assert.ok(sources.item_book)
})

test('聆听偶遇（category 采集/聆听偶遇）标签为偶遇', () => {
  const { hidden } = buildHiddenRewards(makeMaps(['采集', '聆听偶遇']))
  assert.equal(hidden.length, 1)
  assert.equal(hidden[0].sourceLabel, '偶遇')
})

test('非 collectType=5（如普通采集 collectType=2）不进隐藏点位', () => {
  const { hidden } = buildHiddenRewards(makeMaps(['采集', 'green'], 2))
  assert.equal(hidden.length, 0)
})

test('判据不依赖 category 文案：同样 collectType=5 换任意分类都能命中', () => {
  for (const cat of [['大地图采集', 'c3', '书籍'], ['采集', '场景宝箱'], ['采集', '聆听偶遇'], ['随便', '什么分类']]) {
    const { hidden } = buildHiddenRewards(makeMaps(cat))
    assert.equal(hidden.length, 1, `分类 ${cat.join('/')} 应命中`)
  }
})

test('聆听偶遇与带货币点位应正确提取固定货币与计算抽取概率', () => {
  const maps = makeMaps(['采集', '聆听偶遇'])
  maps.rewardRes.datas.r1.money = 500
  maps.rewardRes.datas.r1.items = [
    {
      rate: 1,
      num: 1,
      rules: [
        { typeId: 'item_a', min: 1, max: 1, chance: 1 },
        { typeId: 'item_b', min: 1, max: 1, chance: 1 }
      ]
    }
  ]
  const { hidden } = buildHiddenRewards(maps)
  assert.equal(hidden.length, 1)
  const items = hidden[0].rewardItems
  assert.equal(items.length, 2, '应包含固定货币组与随机组')
  assert.equal(items[0].kind, 'fixed')
  assert.equal(items[0].rules[0].typeId, 'item_00001')
  assert.equal(items[0].rules[0].min, 500)
  assert.equal(items[1].kind, 'random')
  assert.equal(items[1].rules.length, 2)
  assert.equal(items[1].rules[0].actualProb, 0.5)
  assert.equal(items[1].rules[1].actualProb, 0.5)
})

test('大地图野外魔物蛋巢应收录进隐藏点位且不重复写入 hidden 来源，排除副本蛋巢', () => {
  const { hidden, sources } = buildHiddenRewards({
    rewardRes: {
      datas: {
        yeWaiPet_c1: {
          typeId: 'yeWaiPet_c1',
          category: ['采集', '魔物蛋'],
          items: [
            { rate: 1, num: 1, rules: [{ typeId: 'pet_007', min: 1, max: 1, chance: 1 }] },
            { rate: 0.02, num: 1, rules: [{ typeId: 'pet_071', min: 1, max: 1, chance: 1 }] }
          ]
        }
      }
    },
    collectTypeRes: {
      datas: {
        yeWaiPet_c1: { collectTypeId: 'yeWaiPet_c1', collectType: 2, crossDay: 1, reward: 'yeWaiPet_c1', name: '魔物蛋巢' },
        dungeonEgg_c1: { collectTypeId: 'dungeonEgg_c1', collectType: 2, reward: 'yeWaiPet_c1', name: '魔物蛋巢' }
      }
    },
    collectRes: {
      datas: {
        c1yeWaiPet01: { typeId: 'c1yeWaiPet01', collectTypeId: 'yeWaiPet_c1' },
        dungeonEgg_c1: { typeId: 'dungeonEgg_c1', collectTypeId: 'dungeonEgg_c1' }
      }
    },
    roomRes: {
      datas: {
        stage_c1_area1_8: { typeId: 'stage_c1_area1_8', battleData: { spObj: [{ caijiTypeId: 'c1yeWaiPet01' }] } },
        dg_egg_room: { typeId: 'dg_egg_room', battleData: { spObj: [{ caijiTypeId: 'dungeonEgg_c1' }] } }
      }
    },
    levelRoomRes: {
      datas: {
        c1_area1_8: { typeId: 'c1_area1_8', roomTypeId: 'stage_c1_area1_8', areaId: 'c1_area1', name: '枯草小径' }
      }
    },
    areaRes: { datas: { c1_area1: { name: '驿站住民区' }, c1_map: { name: '秋日荒野' } } }
  })

  assert.equal(hidden.length, 1)
  assert.equal(hidden[0].collectName, '魔物蛋巢')
  assert.equal(hidden[0].sourceLabel, '魔物蛋')
  assert.equal(hidden[0].rewardItems[1].kind, 'random')
  assert.equal(hidden[0].rewardItems[1].rules[0].actualProb, 0.02)
  assert.equal(sources.pet_007, undefined, '魔物蛋巢由 supplementalItemSources 生成 collect 来源，不重复进 hidden 来源')
  assert.equal(sources.pet_071, undefined)
})


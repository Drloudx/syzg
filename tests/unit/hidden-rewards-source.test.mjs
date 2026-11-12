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

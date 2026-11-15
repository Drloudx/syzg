import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { parseExploreRewardEntries } from '../../src/utils/eventData.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const rewardJson = JSON.parse(readFileSync(join(root, 'raw/reward.json'), 'utf8'))
const itemJson = JSON.parse(readFileSync(join(root, 'raw/item.json'), 'utf8'))
const rDatas = rewardJson.datas || rewardJson
const iDatas = itemJson.datas || itemJson

test('探索主材组计算独立抽取累计区间（num * [min, max]）', () => {
  const parsed12 = parseExploreRewardEntries(rDatas, iDatas, 'explore1_2')
  const wood = parsed12.entries.find(e => e.typeId === 'item_10001')
  assert.ok(wood, '应有木材奖励')
  assert.equal(wood.countMin, 80)
  assert.equal(wood.countMax, 120)
  assert.equal(wood.rawMin, 40, '明细应保留单次原始下界 40')
  assert.equal(wood.rawMax, 60, '明细应保留单次原始上界 60')
  assert.equal(wood.probText, '必定获得')

  const parsed14 = parseExploreRewardEntries(rDatas, iDatas, 'explore1_4')
  const stone = parsed14.entries.find(e => e.typeId === 'item_10002')
  assert.ok(stone, '应有石料奖励')
  assert.equal(stone.countMin, 80)
  assert.equal(stone.countMax, 120)
})

test('探索候选池按物品 ID 聚合且适配 RewardPools 契约（方案A预估数量范围与精确概率）', () => {
  const parsed12 = parseExploreRewardEntries(rDatas, iDatas, 'explore1_2')
  const wheatList = parsed12.entries.filter(e => e.typeId === 'item_10023')
  assert.equal(wheatList.length, 1, '小麦不应在候选池中生成重复卡片')

  const wheat = wheatList[0]
  assert.equal(wheat.probText, '单次 50%')
  assert.equal(wheat.detail, '', '不写有歧义的小数期望')
  assert.equal(wheat.groupCount, 10)
  assert.equal(wheat.actualProb, 0.5)
  assert.equal(wheat.min, 3, '小麦预估数量下界为 3')
  assert.equal(wheat.max, 7, '小麦预估数量上界为 7')
  assert.ok(wheat.cumulativeProb > 0.99, '综合概率约 99.9%')

  const flax = parsed12.entries.find(e => e.typeId === 'item_10082')
  assert.equal(flax.probText, '单次 25%')
  assert.equal(flax.groupCount, 10)
  assert.equal(flax.actualProb, 0.25)
  assert.equal(flax.min, 1, '亚麻预估数量下界为 1')
  assert.equal(flax.max, 4, '亚麻预估数量上界为 4')
  assert.ok(flax.cumulativeProb > 0.94, '综合概率约 94.4%')
})

test('探索点位与遭遇敌人包裹了 flex tags 容器且标题使用「预估探索奖励」', () => {
  const eventsView = readFileSync(join(root, 'src/views/EventsView.vue'), 'utf8')
  assert.ok(
    eventsView.includes('label="探索点位">\n            <div class="event-map-tags">'),
    '探索点位标签应有 event-map-tags 包裹'
  )
  assert.ok(
    eventsView.includes('label="遭遇敌人">\n            <div class="event-map-tags">'),
    '遭遇敌人标签应有 event-map-tags 包裹'
  )
  assert.ok(
    eventsView.includes('预估探索奖励'),
    '探索奖励标题应展示为预估探索奖励'
  )
  assert.ok(
    eventsView.includes('<RewardPools'),
    '事件/探索奖励应使用 RewardPools 统一货架组件'
  )
  assert.ok(
    eventsView.includes('hide-prob'),
    '探索货架应隐藏右上角概率角标保持清爽'
  )
  assert.ok(
    eventsView.includes('prob-detail-btn'),
    '事件/探索奖励应配备「概率明细」弹窗按钮'
  )
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildPetEggsData,
  calcPetDisposalRecommendation,
  PET_DISPOSAL_RULE
} from '../../src/utils/petEggsData.js'

const petJson = JSON.parse(readFileSync(new URL('../../raw/pet.json', import.meta.url), 'utf8'))

test('处置建议边界保持唯一且明确', () => {
  assert.deepEqual(PET_DISPOSAL_RULE, { feedBelow: 2.2, sellAbove: 3 })
  assert.equal(calcPetDisposalRecommendation(219, 100).text, '喂')
  assert.equal(calcPetDisposalRecommendation(220, 100).text, '按需选择')
  assert.equal(calcPetDisposalRecommendation(300, 100).text, '按需选择')
  assert.equal(calcPetDisposalRecommendation(301, 100).text, '卖')
  assert.equal(calcPetDisposalRecommendation(100, 0).text, '卖')
})

test('全量魔物收益按当前数据自然断层分为 5 喂、13 按需、25 卖', () => {
  const { pets } = buildPetEggsData({ petJson })
  const counts = pets.reduce((result, pet) => {
    result[pet.recommendationKey] = (result[pet.recommendationKey] || 0) + 1
    return result
  }, {})

  // 2026-11-09（1.7.15 数据更新）：魔物 32 → 44；随后按可见性收口再减 1（43）。
  // 断言「总数 = 各档之和」与三条代表性判断，具体档位数随配置与可见性名单走。
  assert.equal(pets.length, 43)
  assert.deepEqual(counts, { optional: 13, feed: 5, sell: 25 })
  assert.equal(pets.length, counts.optional + counts.feed + counts.sell)
  assert.equal(pets.find(pet => pet.name === '秋风妖精').recommendationText, '喂')
  assert.equal(pets.find(pet => pet.name === '角布林').recommendationText, '按需选择')
  assert.equal(pets.find(pet => pet.name === '掘地芙洛波').recommendationText, '卖')
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildPetEggsData,
  calcPetDisposalRecommendation,
  PET_DISPOSAL_RULE
} from '../../src/utils/petEggsData.js'

const readRaw = (file) => JSON.parse(readFileSync(new URL(`../../raw/${file}`, import.meta.url), 'utf8'))
const petJson = readRaw('pet.json')
const petPoolJson = readRaw('petPool.json')
const petPoolTimeJson = readRaw('petPoolTime.json')
const consumeJson = readRaw('consume.json')
const petsEggsViewSource = readFileSync(new URL('../../src/views/PetsEggsView.vue', import.meta.url), 'utf8')

test('处置建议边界保持唯一且明确', () => {
  assert.deepEqual(PET_DISPOSAL_RULE, { feedBelow: 2.2, sellAbove: 3 })
  assert.equal(calcPetDisposalRecommendation(219, 100).text, '喂')
  assert.equal(calcPetDisposalRecommendation(220, 100).text, '按需选择')
  assert.equal(calcPetDisposalRecommendation(300, 100).text, '按需选择')
  assert.equal(calcPetDisposalRecommendation(301, 100).text, '卖')
  assert.equal(calcPetDisposalRecommendation(100, 0).text, '卖')
})

test('全量魔物收益按当前数据自然断层分为 5 喂、13 按需、25 卖', () => {
  const { pets } = buildPetEggsData({ petJson, petPoolJson, petPoolTimeJson, consumeJson })
  const counts = pets.reduce((result, pet) => {
    result[pet.recommendationKey] = (result[pet.recommendationKey] || 0) + 1
    return result
  }, {})

  // 2026-11-09（1.7.15 数据更新）：魔物 32 → 44；随后按可见性收口再减 1（43）。
  // 2026-11-14：官方 pet.json 将 pet_097 格里芬标 hide=true，按「所有出口统一」原则
  //   加入 HIDDEN_PET_IDS，故再减 1（43 → 42，sell 25 → 24）。
  // 断言「总数 = 各档之和」与三条代表性判断，具体档位数随配置与可见性名单走。
  assert.equal(pets.length, 42)
  assert.deepEqual(counts, { optional: 13, feed: 5, sell: 24 })
  assert.equal(pets.length, counts.optional + counts.feed + counts.sell)
  assert.equal(pets.find(pet => pet.name === '秋风妖精').recommendationText, '喂')
  assert.equal(pets.find(pet => pet.name === '角布林').recommendationText, '按需选择')
  assert.equal(pets.find(pet => pet.name === '掘地芙洛波').recommendationText, '卖')
})

test('卡池分类按原表消耗生成：银币池与除银币外全氪金池合并去重', () => {
  const { pets } = buildPetEggsData({ petJson, petPoolJson, petPoolTimeJson, consumeJson })
  const silver = pets.filter(pet => pet.pools.includes('silver'))
  const premium = pets.filter(pet => pet.pools.includes('premium'))
  const nonPool = pets.filter(pet => pet.pools.length === 0)

  // 无重复 id 与重复 pools 标签
  assert.equal(new Set(pets.map(pet => pet.id)).size, pets.length)
  for (const pet of pets) {
    assert.equal(new Set(pet.pools).size, pet.pools.length)
  }

  // 与当前 raw/petPool.json 对齐：常规贩售 20 只；特别(38) ∪ 御卫(39) ∪ 古堡(39) 去重 40 只；
  // 非卡池 3 只 → 格里芬已按 HIDDEN_PET_IDS 隐藏（2026-11-14），剩 2 只
  assert.equal(silver.length, 20)
  assert.equal(premium.length, 40)
  assert.deepEqual(nonPool.map(p => p.name).sort(), ['彩虹史莱姆', '纯白史莱姆'].sort())
  assert.ok(silver.every(pet => pet.pools.includes('premium')))
  assert.ok(premium.some(pet => pet.name === '圣骑士史莱姆'), '御卫贩售独有应合并进氪金池')
  assert.ok(premium.some(pet => pet.name === '洛莉安的眷属'), '古堡贩售独有应合并进氪金池')

  // 页面不再使用「金币池」或手写名单，且兼容 ?pool=gold 旧链接
  assert.ok(!petsEggsViewSource.includes('金币池'))
  assert.ok(!petsEggsViewSource.includes('goldPoolNames'))
  assert.ok(!petsEggsViewSource.includes('premiumPoolNames'))
  assert.ok(petsEggsViewSource.includes("route.query.pool === 'silver' || route.query.pool === 'gold'"))
})
